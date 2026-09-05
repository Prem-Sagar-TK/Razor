// POST /api/cart/clear
import { state, getSessionPayload } from "./_store.js";

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "POST") return res.status(405).json({ ok: false, message: "Method not allowed" });

  state.session.cart = [];
  res.json({ ok: true, message: "Cart cleared", session: getSessionPayload(state.session) });
}
