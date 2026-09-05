// POST /api/session/reset
import { state, resetStore, getSessionPayload } from "./_store.js";

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "POST") return res.status(405).json({ ok: false, message: "Method not allowed" });

  resetStore();
  // state.session now points to the newly created session after resetStore()
  res.json({ ok: true, message: "Session reset successfully", session: getSessionPayload(state.session) });
}
