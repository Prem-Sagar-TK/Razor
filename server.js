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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());

// In-memory active session & chat history
function createDefaultSession() {
  const sessionId = `web-${crypto.randomBytes(3).toString("hex")}`;
  const mandate = new Mandate({
    sessionId,
    maxSessionAmountPaise: 300000, // ₹3,000
    maxSingleItemPaise: 250000,   // ₹2,500
    allowedCategories: ["electronics", "accessories"],
  });
  return new Session(sessionId, mandate);
}

let activeSession = createDefaultSession();
let chatHistory = [];

// Helper to serialize session state for UI
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

// REST API Endpoints

app.get("/api/catalog", (req, res) => {
  const query = req.query.q || "";
  const products = searchCatalog(query);
  res.json({ ok: true, products });
});

app.get("/api/session", (req, res) => {
  res.json({ ok: true, session: getSessionPayload(activeSession) });
});

app.post("/api/session/reset", (req, res) => {
  activeSession = createDefaultSession();
  chatHistory = [];
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
    const { text, history: updatedHistory } = await chatTurn(activeSession, chatHistory, message);
    chatHistory = updatedHistory;

    // Check if an upsell is available for current cart state
    const upsell = proposeUpsell(activeSession);

    res.json({
      ok: true,
      text,
      upsell: upsell.ok ? upsell : null,
      session: getSessionPayload(activeSession),
    });
  } catch (err) {
    console.error("Chat turn error:", err);
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.get("/api/audit", (req, res) => {
  const trail = readTrail(activeSession.sessionId);
  const allTrail = readTrail();
  res.json({ ok: true, sessionTrail: trail, fullTrail: allTrail });
});

// Setup Vite dev server or static middleware
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
