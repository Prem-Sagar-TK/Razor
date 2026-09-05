// POST /api/cart/add
import { state, getSessionPayload } from "./_store.js";
import { addToCart, proposeUpsell } from "../src/engine.js";

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "POST") return res.status(405).json({ ok: false, message: "Method not allowed" });

  const { productId, quantity = 1 } = req.body ?? {};
  const result = addToCart(state.session, productId, Number(quantity));

  let upsell = null;
  if (result.ok) {
    state.browseTiming.cartUpdatedAt = Date.now();
    const up = proposeUpsell(state.session);
    if (up.ok) upsell = up;
  }

  res.json({ ...result, upsell, session: getSessionPayload(state.session) });
}
