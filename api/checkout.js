// POST /api/checkout
import { state, getSessionPayload } from "./_store.js";
import { checkout } from "../src/engine.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "POST") return res.status(405).json({ ok: false, message: "Method not allowed" });

  const { simulateFailure = false } = req.body ?? {};
  const result = await checkout(state.session, Boolean(simulateFailure));
  res.json({ ...result, session: getSessionPayload(state.session) });
}
