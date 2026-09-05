export class Mandate {
  constructor({ sessionId, maxSessionAmountPaise, maxSingleItemPaise, allowedCategories }) {
    this.sessionId = sessionId;
    this.maxSessionAmountPaise = maxSessionAmountPaise;
    this.maxSingleItemPaise = maxSingleItemPaise;
    this.allowedCategories = allowedCategories;
    this.spentPaise = 0;
  }

  remainingPaise() {
    return Math.max(0, this.maxSessionAmountPaise - this.spentPaise);
  }
}

export function checkAction(mandate, product, quantity = 1) {
  if (!mandate.allowedCategories.includes(product.category)) {
    return {
      allowed: false,
      reason: `Category '${product.category}' is not in the allowed list [${mandate.allowedCategories.join(", ")}] for this mandate.`,
    };
  }

  const lineTotal = product.pricePaise * quantity;

  if (lineTotal > mandate.maxSingleItemPaise) {
    return {
      allowed: false,
      reason: `Line item ₹${(lineTotal / 100).toFixed(2)} exceeds the per-item ceiling of ₹${(mandate.maxSingleItemPaise / 100).toFixed(2)}.`,
    };
  }

  if (lineTotal > mandate.remainingPaise()) {
    return {
      allowed: false,
      reason: `₹${(lineTotal / 100).toFixed(2)} exceeds remaining mandate headroom of ₹${(mandate.remainingPaise() / 100).toFixed(2)} (session cap ₹${(mandate.maxSessionAmountPaise / 100).toFixed(2)}, already spent ₹${(mandate.spentPaise / 100).toFixed(2)}).`,
    };
  }

  return {
    allowed: true,
    reason: "Within mandate: category allowed, item and session caps respected.",
  };
}
