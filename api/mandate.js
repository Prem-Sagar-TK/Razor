// POST /api/mandate
import { state, getSessionPayload } from "./_store.js";

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "POST") return res.status(405).json({ ok: false, message: "Method not allowed" });

  const { maxSessionAmountPaise, maxSingleItemPaise, allowedCategories } = req.body ?? {};

  if (typeof maxSessionAmountPaise === "number" && maxSessionAmountPaise > 0) {
    state.session.mandate.maxSessionAmountPaise = maxSessionAmountPaise;
  }
  if (typeof maxSingleItemPaise === "number" && maxSingleItemPaise > 0) {
    state.session.mandate.maxSingleItemPaise = maxSingleItemPaise;
  }
  if (Array.isArray(allowedCategories)) {
    state.session.mandate.allowedCategories = allowedCategories;
  }

  res.json({ ok: true, message: "Mandate rules updated", session: getSessionPayload(state.session) });
}
