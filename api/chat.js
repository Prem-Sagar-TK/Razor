// POST /api/chat
import { state, getSessionPayload } from "./_store.js";
import { proposeUpsell } from "../src/engine.js";
import { chatTurn } from "../src/agents/buyerAgent.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "POST") return res.status(405).json({ ok: false, message: "Method not allowed" });

  const { message } = req.body ?? {};
  if (!message || !message.trim()) {
    return res.status(400).json({ ok: false, message: "Message is required." });
  }

  try {
    const cartSizeBefore = state.session.cart.length;
    const { text, history: updatedHistory } = await chatTurn(state.session, state.chatHistory, message);
    // Mutate in place so the module-level array stays in sync
    state.chatHistory.splice(0, state.chatHistory.length, ...updatedHistory);

    let upsell = null;
    const cartChanged = state.session.cart.length !== cartSizeBefore;
    if (cartChanged) {
      state.browseTiming.cartUpdatedAt = Date.now();
      const up = proposeUpsell(state.session);
      if (up.ok) upsell = up;
    }

    res.json({ ok: true, text, upsell, session: getSessionPayload(state.session) });
  } catch (err) {
    console.error("Chat turn error:", err);
    res.status(500).json({ ok: false, message: err.message });
  }
}
