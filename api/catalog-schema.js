// GET /api/catalog/schema
import { CATALOG } from "../src/catalog.js";

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ ok: false, message: "Method not allowed" });

  const categories = [...new Set(CATALOG.map((p) => p.category))];
  const prices = CATALOG.map((p) => p.pricePaise);
  res.json({
    ok: true,
    schema: {
      currency: "INR",
      priceUnit: "paise",
      priceMin: Math.min(...prices),
      priceMax: Math.max(...prices),
      categories,
      fields: [
        { name: "id",          type: "string",   description: "Stable product SKU" },
        { name: "name",        type: "string",   description: "Human-readable product name" },
        { name: "category",    type: "string",   description: `One of: ${categories.join(", ")}` },
        { name: "pricePaise",  type: "integer",  description: "Price in Indian paise (divide by 100 for INR)" },
        { name: "currency",    type: "string",   description: "Always INR" },
        { name: "description", type: "string",   description: "Short product description" },
        { name: "pairsWith",   type: "string[]", description: "Product IDs that pair well with this item" },
      ],
      endpoints: {
        search:    "GET /api/catalog?q=<keyword>",
        addToCart: "POST /api/cart/add  { productId, quantity }",
        checkout:  "POST /api/checkout  { simulateFailure? }",
      },
    },
  });
}
