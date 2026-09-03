/**
 * The engine the buyer-agent and upsell-agent both call into. This is
 * where "every money action explainable, bounded and gated" is actually
 * enforced in code, not just claimed in a pitch deck.
 */

import { getProduct, upsellCandidates } from "./catalog.js";
import { checkAction } from "./mandate.js";
import { logEvent } from "./audit.js";
import { createOrder } from "./razorpayClient.js";

export class Session {
  constructor(sessionId, mandate) {
    this.sessionId = sessionId;
    this.mandate = mandate;
    this.cart = []; // [{ productId, quantity }]
  }
}

/**
 * Adding to cart is gate-checked too (not just checkout) so the buyer
 * gets told immediately if an item would blow the mandate, rather than
 * finding out only at payment time.
 */
export function addToCart(session, productId, quantity = 1) {
  const product = getProduct(productId);
  if (!product) {
    return { ok: false, message: `No such product: ${productId}` };
  }

  const result = checkAction(session.mandate, product, quantity);
  logEvent({
    sessionId: session.sessionId,
    actor: "buyer_agent",
    action: "add_to_cart_check",
    productId,
    quantity,
    amountPaise: product.pricePaise * quantity,
    gateAllowed: result.allowed,
    gateReason: result.reason,
  });

  if (!result.allowed) {
    return { ok: false, message: result.reason };
  }

  session.cart.push({ productId, quantity });
  return { ok: true, message: `Added ${quantity}x ${product.name} to cart.` };
}

/**
 * Checks the FULL cart against remaining mandate headroom, then, only if
 * allowed, calls Razorpay. A failed Razorpay call never touches
 * mandate.spentPaise, and both outcomes are written to the audit log.
 */
export async function checkout(session, simulateFailure = false) {
  if (session.cart.length === 0) {
    return { ok: false, message: "Cart is empty." };
  }

  const totalPaise = session.cart.reduce(
    (sum, item) => sum + getProduct(item.productId).pricePaise * item.quantity,
    0
  );

  if (totalPaise > session.mandate.remainingPaise()) {
    const reason = `Cart total ₹${(totalPaise / 100).toFixed(2)} exceeds remaining mandate headroom of ₹${(session.mandate.remainingPaise() / 100).toFixed(2)}.`;
    logEvent({
      sessionId: session.sessionId,
      actor: "buyer_agent",
      action: "checkout",
      amountPaise: totalPaise,
      gateAllowed: false,
      gateReason: reason,
    });
    return { ok: false, message: reason };
  }

  const order = await createOrder({
    amountPaise: totalPaise,
    currency: "INR",
    receipt: `${session.sessionId}-${session.cart.length}`,
    notes: { cart: session.cart },
    simulateFailure,
  });

  const success = order.status === "created";
  if (success) {
    session.mandate.spentPaise += totalPaise;
  }

  logEvent({
    sessionId: session.sessionId,
    actor: "buyer_agent",
    action: "checkout",
    amountPaise: totalPaise,
    gateAllowed: true,
    gateReason: "Cart within mandate headroom; sent to Razorpay.",
    razorpayOrderId: order.id,
    razorpayStatus: order.status,
    extra: { failureReason: order.failureReason ?? null },
  });

  if (!success) {
    return {
      ok: false,
      message: `Payment failed at Razorpay (${order.failureReason ?? "unknown reason"}). Nothing was charged and your mandate headroom is unchanged.`,
      order,
    };
  }

  session.cart = [];
  return {
    ok: true,
    message: `Payment successful. Order ${order.id}, ₹${(totalPaise / 100).toFixed(2)} charged.`,
    order,
  };
}

/**
 * Suggests exactly ONE bounded, explainable add-on: it must (a) pair with
 * something already in the cart, and (b) itself pass the gate given
 * remaining headroom. If nothing qualifies, say so plainly instead of
 * forcing a pitch.
 */
export function proposeUpsell(session) {
  const cartIds = session.cart.map((i) => i.productId);
  if (cartIds.length === 0) {
    return { ok: false, message: "Nothing in cart to build an upsell around." };
  }

  for (const candidate of upsellCandidates(cartIds)) {
    const result = checkAction(session.mandate, candidate, 1);
    if (result.allowed) {
      logEvent({
        sessionId: session.sessionId,
        actor: "upsell_agent",
        action: "upsell_offer",
        productId: candidate.id,
        quantity: 1,
        amountPaise: candidate.pricePaise,
        gateAllowed: true,
        gateReason: `Pairs with item(s) already in cart; ₹${(candidate.pricePaise / 100).toFixed(2)} fits remaining headroom of ₹${(session.mandate.remainingPaise() / 100).toFixed(2)}.`,
      });
      return {
        ok: true,
        product: candidate,
        message: `Since you're getting that, want to add ${candidate.name} for ₹${(candidate.pricePaise / 100).toFixed(2)}? Still within your ₹${(session.mandate.remainingPaise() / 100).toFixed(2)} remaining budget.`,
      };
    }
  }

  logEvent({
    sessionId: session.sessionId,
    actor: "upsell_agent",
    action: "upsell_offer",
    gateAllowed: false,
    gateReason: "No paired add-on both exists and fits remaining mandate headroom.",
  });
  return { ok: false, message: "No upsell fits within the remaining budget right now." };
}
