// GET /api/catalog?q=<query>
import { searchCatalog } from "../src/catalog.js";
import { state } from "./_store.js";

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ ok: false, message: "Method not allowed" });

  const query = req.query.q || "";
  if (query) state.browseTiming.searchedAt = Date.now();
  const products = searchCatalog(query);
  res.json({ ok: true, products });
}
