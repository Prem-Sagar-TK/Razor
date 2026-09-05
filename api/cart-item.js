// DELETE /api/cart/item
import { state, getSessionPayload } from "./_store.js";

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "DELETE") return res.status(405).json({ ok: false, message: "Method not allowed" });

  const { productId } = req.body ?? {};
  state.session.cart = state.session.cart.filter((item) => item.productId !== productId);
  res.json({ ok: true, message: `Removed item ${productId}`, session: getSessionPayload(state.session) });
}
