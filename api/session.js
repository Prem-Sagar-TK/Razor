// GET /api/session
import { state, getSessionPayload } from "./_store.js";

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ ok: false, message: "Method not allowed" });

  res.json({ ok: true, session: getSessionPayload(state.session) });
}
