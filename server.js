import express from "express";
import cors from "cors";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";

import { CATALOG, searchCatalog, getProduct } from "./src/catalog.js";
import { Mandate } from "./src/mandate.js";
import { Session, addToCart, checkout, proposeUpsell } from "./src/engine.js";
import { readTrail, clearTrail } from "./src/audit.js";
import { chatTurn } from "./src/agents/buyerAgent.js";
import { evaluateCampaigns } from "./src/agents/campaignAgent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());

function createDefaultSession() {
  const sessionId = `web-${crypto.randomBytes(3).toString("hex")}`;
  const mandate = new Mandate({
    sessionId,
    maxSessionAmountPaise: 300000,
    maxSingleItemPaise: 250000,
    allowedCategories: ["electronics", "accessories"],
  });
  return new Session(sessionId, mandate);
}

let activeSession = createDefaultSession();
let chatHistory = [];

let browseTiming = { searchedAt: null, cartUpdatedAt: null };

function getSessionPayload(session) {
  const enrichedCart = session.cart.map((item) => {
    const product = getProduct(item.productId);
    return {
      ...item,
      product,
      lineTotalPaise: (product?.pricePaise || 0) * item.quantity,
    };
  });

  const cartTotalPaise = enrichedCart.reduce((sum, i) => sum + i.lineTotalPaise, 0);

  return {
    sessionId: session.sessionId,
    mandate: {
      maxSessionAmountPaise: session.mandate.maxSessionAmountPaise,
      maxSingleItemPaise: session.mandate.maxSingleItemPaise,
      allowedCategories: session.mandate.allowedCategories,
      spentPaise: session.mandate.spentPaise,
      remainingPaise: session.mandate.remainingPaise(),
    },
    cart: enrichedCart,
    cartTotalPaise,
    hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
  };
}

app.get("/api/catalog", (req, res) => {
  const query = req.query.q || "";
  if (query) browseTiming.searchedAt = Date.now();
  const products = searchCatalog(query);
  res.json({ ok: true, products });
});

app.get("/api/catalog/schema", (req, res) => {
  const categories = [...new Set(CATALOG.map((p) => p.category))];
  const prices = CATALOG.map((p) => p.pricePaise);
  res.json({
    ok: true,
    schema: {
      currency: "INR",
      priceUnit: "paise",
      priceMin: Math.min(...prices),
      priceMax: Math.max(...prices),
      categories,
      fields: [
        { name: "id",          type: "string",   description: "Stable product SKU" },
        { name: "name",        type: "string",   description: "Human-readable product name" },
        { name: "category",   type: "string",   description: `One of: ${categories.join(", ")}` },
        { name: "pricePaise", type: "integer",  description: "Price in Indian paise (divide by 100 for INR)" },
        { name: "currency",   type: "string",   description: "Always INR" },
        { name: "description",type: "string",   description: "Short product description" },
        { name: "pairsWith",  type: "string[]", description: "Product IDs that pair well with this item" },
      ],
      endpoints: {
        search: "GET /api/catalog?q=<keyword>",
        addToCart: "POST /api/cart/add  { productId, quantity }",
        checkout: "POST /api/checkout  { simulateFailure? }",
      },
    },
  });
});

app.get("/api/session", (req, res) => {
  res.json({ ok: true, session: getSessionPayload(activeSession) });
});

app.post("/api/session/reset", (req, res) => {
  activeSession = createDefaultSession();
  chatHistory = [];
  browseTiming = { searchedAt: null, cartUpdatedAt: null };
  res.json({ ok: true, message: "Session reset successfully", session: getSessionPayload(activeSession) });
});

app.post("/api/mandate", (req, res) => {
  const { maxSessionAmountPaise, maxSingleItemPaise, allowedCategories } = req.body;

  if (typeof maxSessionAmountPaise === "number" && maxSessionAmountPaise > 0) {
    activeSession.mandate.maxSessionAmountPaise = maxSessionAmountPaise;
  }
  if (typeof maxSingleItemPaise === "number" && maxSingleItemPaise > 0) {
    activeSession.mandate.maxSingleItemPaise = maxSingleItemPaise;
  }
  if (Array.isArray(allowedCategories)) {
    activeSession.mandate.allowedCategories = allowedCategories;
  }

  res.json({ ok: true, message: "Mandate rules updated", session: getSessionPayload(activeSession) });
});

app.post("/api/cart/add", (req, res) => {
  const { productId, quantity = 1 } = req.body;
  const result = addToCart(activeSession, productId, Number(quantity));

  let upsell = null;
  if (result.ok) {
    browseTiming.cartUpdatedAt = Date.now();
    const up = proposeUpsell(activeSession);
    if (up.ok) {
      upsell = up;
    }
  }

  res.json({
    ...result,
    upsell,
    session: getSessionPayload(activeSession),
  });
});

app.delete("/api/cart/item", (req, res) => {
  const { productId } = req.body;
  activeSession.cart = activeSession.cart.filter((item) => item.productId !== productId);
  res.json({ ok: true, message: `Removed item ${productId}`, session: getSessionPayload(activeSession) });
});

app.post("/api/cart/clear", (req, res) => {
  activeSession.cart = [];
  res.json({ ok: true, message: "Cart cleared", session: getSessionPayload(activeSession) });
});

app.post("/api/checkout", async (req, res) => {
  const { simulateFailure = false } = req.body;
  const result = await checkout(activeSession, Boolean(simulateFailure));
  res.json({
    ...result,
    session: getSessionPayload(activeSession),
  });
});

app.post("/api/chat", async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ ok: false, message: "Message is required." });
  }

  try {
    const cartSizeBefore = activeSession.cart.length;
    const { text, history: updatedHistory } = await chatTurn(activeSession, chatHistory, message);
    chatHistory = updatedHistory;

    let upsell = null;
    const cartChanged = activeSession.cart.length !== cartSizeBefore;
    if (cartChanged) {
      browseTiming.cartUpdatedAt = Date.now();
      const up = proposeUpsell(activeSession);
      if (up.ok) upsell = up;
    }

    res.json({
      ok: true,
      text,
      upsell,
      session: getSessionPayload(activeSession),
    });
  } catch (err) {
    console.error("Chat turn error:", err);
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.post("/api/campaign", (req, res) => {
  const { campaign, product, reason } = evaluateCampaigns(activeSession, browseTiming);
  res.json({
    ok: true,
    hasCampaign: campaign !== null,
    campaign,
    product,
    reason,
    session: getSessionPayload(activeSession),
  });
});

app.get("/api/audit", (req, res) => {
  const trail = readTrail(activeSession.sessionId);
  const allTrail = readTrail();
  res.json({ ok: true, sessionTrail: trail, fullTrail: allTrail });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 Agentic Commerce Server running at http://localhost:${PORT}`);
    console.log(`⚡ Mode: ${process.env.NODE_ENV || "development"}`);
    console.log(`🤖 Anthropic LLM API Key: ${process.env.ANTHROPIC_API_KEY ? "CONFIGURED ✅" : "FALLBACK RULE-BASED ENGINE ⚠️"}\n`);
  });
}

startServer();
