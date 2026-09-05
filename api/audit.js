// GET /api/audit
import { state } from "./_store.js";
import { readTrail } from "../src/audit.js";

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ ok: false, message: "Method not allowed" });

  const trail = readTrail(state.session.sessionId);
  const allTrail = readTrail();
  res.json({ ok: true, sessionTrail: trail, fullTrail: allTrail });
}
