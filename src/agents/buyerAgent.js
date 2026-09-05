import Anthropic from "@anthropic-ai/sdk";
import { searchCatalog, getProduct } from "../catalog.js";
import { addToCart, checkout, proposeUpsell } from "../engine.js";

const TOOLS = [
  {
    name: "search_catalog",
    description: "Search the merchant's product catalog by keyword.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "add_to_cart",
    description: "Add a product to the cart. Subject to the buyer's spending mandate.",
    input_schema: {
      type: "object",
      properties: {
        product_id: { type: "string" },
        quantity: { type: "integer", default: 1 },
      },
      required: ["product_id"],
    },
  },
  {
    name: "checkout",
    description: "Pay for everything currently in the cart via Razorpay (test mode).",
    input_schema: { type: "object", properties: {} },
  },
];

const SYSTEM_PROMPT = `You are a merchant's shopping assistant talking to a buyer.
You can search the catalog, add items to cart, and check out. You never see
or reason about spending limits directly -- if a tool call is blocked, it
will tell you why in plain language; relay that faithfully to the buyer and
suggest a compliant alternative (e.g. a cheaper item, or a smaller quantity).
Be concise and transactional, not chatty.`;

async function runTool(session, name, input) {
  if (name === "search_catalog") {
    return { results: searchCatalog(input.query ?? "") };
  }
  if (name === "add_to_cart") {
    return addToCart(session, input.product_id, input.quantity ?? 1);
  }
  if (name === "checkout") {
    return await checkout(session);
  }
  return { ok: false, message: `Unknown tool ${name}` };
}

export async function chatTurnLLM(session, history, userMessage) {
  const client = new Anthropic();
  let messages = [...history, { role: "user", content: userMessage }];

  while (true) {
    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });
    messages = [...messages, { role: "assistant", content: resp.content }];

    const toolUses = resp.content.filter((b) => b.type === "tool_use");
    if (toolUses.length === 0) {
      const text = resp.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      return { text, history: messages };
    }

    const toolResults = [];
    for (const tu of toolUses) {
      let result = await runTool(session, tu.name, tu.input);
      if (tu.name === "add_to_cart" && result.ok) {
        const up = proposeUpsell(session);
        if (up.ok) result = { ...result, upsellSuggestion: up.message };
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(result),
      });
    }
    messages = [...messages, { role: "user", content: toolResults }];
  }
}

export async function chatTurnFallback(session, userMessage) {
  const msg = userMessage.trim().toLowerCase();

  if (msg.startsWith("search ")) {
    const results = searchCatalog(msg.slice("search ".length));
    if (results.length === 0) return "No matching products.";
    return results
      .map((p) => `${p.id}: ${p.name} — ₹${(p.pricePaise / 100).toFixed(2)}`)
      .join("\n");
  }

  if (msg.startsWith("add ")) {
    const raw = msg.slice("add ".length).trim();

    const parts = raw.split(/\s+/);
    let qty = 1;
    let productQuery = raw;

    if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) {
      qty = parseInt(parts.pop(), 10);
      productQuery = parts.join(" ");
    }

    let product = getProduct(productQuery);

    if (!product) {
      const matches = searchCatalog(productQuery);
      if (matches.length > 0) product = matches[0];
    }

    if (!product) {
      return `❌ Couldn't find a product matching "${productQuery}". Try 'search <keyword>' first.`;
    }

    const result = addToCart(session, product.id, qty);
    let out = result.ok ? `✅ ${result.message}` : `🛡️ Mandate Gate Blocked: ${result.message}`;
    if (result.ok) {
      const up = proposeUpsell(session);
      if (up.ok) out += "\n\n💡 " + up.message;
    }
    return out;
  }

  if (msg === "checkout") {
    const result = await checkout(session);
    return result.ok ? `✅ ${result.message}` : `❌ ${result.message}`;
  }

  return "Try: 'search earbuds', 'add Wireless Earbuds Pro', 'add sku_001 2', or 'checkout'.";
}

export async function chatTurn(session, history, userMessage) {
  if (process.env.ANTHROPIC_API_KEY) {
    return await chatTurnLLM(session, history, userMessage);
  }
  return { text: await chatTurnFallback(session, userMessage), history };
}
