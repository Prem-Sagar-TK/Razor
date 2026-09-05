export const CATALOG = [
  {
    id: "sku_001",
    name: "Wireless Earbuds Pro",
    category: "electronics",
    pricePaise: 249900,
    currency: "INR",
    description: "Bluetooth 5.3 earbuds, 30hr battery, ANC.",
    pairsWith: ["sku_004", "sku_005"],
  },
  {
    id: "sku_002",
    name: "Everyday Backpack",
    category: "accessories",
    pricePaise: 179900,
    currency: "INR",
    description: "20L water-resistant backpack, laptop sleeve.",
    pairsWith: ["sku_006"],
  },
  {
    id: "sku_003",
    name: "Mechanical Keyboard",
    category: "electronics",
    pricePaise: 349900,
    currency: "INR",
    description: "Hot-swappable mechanical keyboard, RGB.",
    pairsWith: ["sku_007"],
  },
  {
    id: "sku_004",
    name: "Earbuds Silicone Tips (3 pairs)",
    category: "accessories",
    pricePaise: 29900,
    currency: "INR",
    description: "Replacement ear tips, S/M/L.",
    pairsWith: [],
  },
  {
    id: "sku_005",
    name: "Earbuds Charging Case",
    category: "accessories",
    pricePaise: 99900,
    currency: "INR",
    description: "Spare USB-C charging case.",
    pairsWith: [],
  },
  {
    id: "sku_006",
    name: "Rain Cover for Backpack",
    category: "accessories",
    pricePaise: 49900,
    currency: "INR",
    description: "Packable waterproof cover.",
    pairsWith: [],
  },
  {
    id: "sku_007",
    name: "Wrist Rest Pad",
    category: "accessories",
    pricePaise: 39900,
    currency: "INR",
    description: "Memory foam wrist rest for keyboards.",
    pairsWith: [],
  },
];

export function getProduct(productId) {
  return CATALOG.find((p) => p.id === productId) ?? null;
}

export function searchCatalog(query) {
  const q = (query ?? "").toLowerCase().trim();
  if (!q) return CATALOG;
  return CATALOG.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
  );
}

export function upsellCandidates(productIds) {
  const seen = new Set(productIds);
  const out = [];
  const outIds = new Set();
  for (const pid of productIds) {
    const p = getProduct(pid);
    if (!p) continue;
    for (const candId of p.pairsWith) {
      if (seen.has(candId) || outIds.has(candId)) continue;
      const cand = getProduct(candId);
      if (cand) {
        out.push(cand);
        outIds.add(candId);
      }
    }
  }
  return out;
}
