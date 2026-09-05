import { checkAction } from "../mandate.js";
import { logEvent } from "../audit.js";
import { CATALOG, upsellCandidates } from "../catalog.js";

export const CAMPAIGNS = [
  {
    id: "camp_bestseller",
    trigger: "FIRST_PURCHASE",
    headline: "🎉 Start Shopping",
    body: "Our best-seller this week: Wireless Earbuds Pro. Rated 4.8★ by buyers.",
    productId: "sku_001",
    discountPct: 0,
  },
  {
    id: "camp_browse_nudge",
    trigger: "BROWSE_WITHOUT_BUY",
    headline: "👀 Still deciding?",
    body: "Add anything to your cart and the AI assistant will suggest the perfect companion item.",
    productId: null,
    discountPct: 0,
  },
  {
    id: "camp_cart_abandon",
    trigger: "CART_ABANDON_RISK",
    headline: "🛒 Your cart is waiting",
    body: "Complete your purchase — your mandate still has headroom and everything is in stock.",
    productId: null,
    discountPct: 0,
  },
  {
    id: "camp_low_headroom",
    trigger: "LOW_HEADROOM_NUDGE",
    headline: "💡 One more thing fits",
    body: "You still have budget left. Add a small accessory before you check out.",
    productId: null,
    discountPct: 0,
  },
];

export function evaluateCampaigns(session, timing = {}) {
  const { mandate, cart } = session;
  const now = Date.now();

  if (mandate.spentPaise === 0 && cart.length === 0) {
    const camp = CAMPAIGNS.find((c) => c.trigger === "FIRST_PURCHASE");
    const product = CATALOG.find((p) => p.id === camp.productId);
    const gateResult = product ? checkAction(mandate, product, 1) : { allowed: false, reason: "No product" };

    _auditCampaign(session, camp, product, gateResult);
    if (gateResult.allowed) {
      return { campaign: camp, product, reason: gateResult.reason };
    }
  }

  const { searchedAt } = timing;
  if (searchedAt && cart.length === 0) {
    const secondsSinceSearch = (now - searchedAt) / 1000;
    if (secondsSinceSearch >= 5) {
      const camp = CAMPAIGNS.find((c) => c.trigger === "BROWSE_WITHOUT_BUY");
      const gateResult = { allowed: true, reason: "Informational campaign; no money action." };
      _auditCampaign(session, camp, null, gateResult);
      return { campaign: camp, product: null, reason: gateResult.reason };
    }
  }

  const { cartUpdatedAt } = timing;
  if (cart.length > 0 && cartUpdatedAt) {
    const secondsSinceCartUpdate = (now - cartUpdatedAt) / 1000;
    if (secondsSinceCartUpdate >= 30) {
      const camp = CAMPAIGNS.find((c) => c.trigger === "CART_ABANDON_RISK");
      const gateResult = { allowed: true, reason: "Informational campaign; no money action." };
      _auditCampaign(session, camp, null, gateResult);
      return { campaign: camp, product: null, reason: gateResult.reason };
    }
  }

  const headroomRatio = mandate.remainingPaise() / mandate.maxSessionAmountPaise;
  if (cart.length > 0 && headroomRatio < 0.2 && headroomRatio > 0) {
    const camp = CAMPAIGNS.find((c) => c.trigger === "LOW_HEADROOM_NUDGE");

    const cartIds = new Set(cart.map((i) => i.productId));
    const candidate = CATALOG
      .filter((p) => !cartIds.has(p.id))
      .sort((a, b) => a.pricePaise - b.pricePaise)
      .find((p) => checkAction(mandate, p, 1).allowed);

    const gateResult = candidate
      ? checkAction(mandate, candidate, 1)
      : { allowed: false, reason: "No item fits remaining mandate headroom." };

    _auditCampaign(session, camp, candidate ?? null, gateResult);

    if (gateResult.allowed && candidate) {
      return {
        campaign: { ...camp, productId: candidate.id },
        product: candidate,
        reason: gateResult.reason,
      };
    }
  }

  return { campaign: null, product: null, reason: "No campaign triggers matched." };
}

function _auditCampaign(session, campaign, product, gateResult) {
  logEvent({
    sessionId: session.sessionId,
    actor: "campaign_agent",
    action: `campaign_eval:${campaign.id}`,
    productId: product?.id ?? null,
    quantity: product ? 1 : null,
    amountPaise: product ? product.pricePaise : null,
    gateAllowed: gateResult.allowed,
    gateReason: gateResult.reason,
  });
}
