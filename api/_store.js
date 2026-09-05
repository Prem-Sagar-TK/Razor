/**
 * Shared in-memory store for all Vercel serverless functions.
 *
 * Vercel bundles all files under api/ into the same Lambda, so a
 * module-level singleton lives as long as the function is warm —
 * giving the same ephemeral-session behaviour as the local Express server.
 *
 * On a cold-start (or new deploy) the session is reset, exactly like
 * restarting `node server.js` locally.
 *
 * We use a single `state` object (rather than individual `export let`
 * bindings) so all consumers that destructure from this module always
 * read the current value even after `resetStore()` reassigns fields.
 */
import crypto from "node:crypto";
import { Mandate } from "../src/mandate.js";
import { Session } from "../src/engine.js";
import { getProduct } from "../src/catalog.js";

function buildSession() {
  const sessionId = `web-${crypto.randomBytes(3).toString("hex")}`;
  const mandate = new Mandate({
    sessionId,
    maxSessionAmountPaise: 300000,
    maxSingleItemPaise: 250000,
    allowedCategories: ["electronics", "accessories"],
  });
  return new Session(sessionId, mandate);
}

// Single mutable state object — all consumers read props from here.
export const state = {
  session: buildSession(),
  chatHistory: [],
  browseTiming: { searchedAt: null, cartUpdatedAt: null },
};

export function resetStore() {
  state.session = buildSession();
  state.chatHistory = [];
  state.browseTiming = { searchedAt: null, cartUpdatedAt: null };
}

/** Helper used by every route to build the session payload sent to the client. */
export function getSessionPayload(session) {
  const enrichedCart = session.cart.map((item) => {
    const product = getProduct(item.productId);
    return {
      ...item,
      product,
      lineTotalPaise: (product?.pricePaise || 0) * item.quantity,
    };
  });

  const cartTotalPaise = enrichedCart.reduce(
    (sum, i) => sum + i.lineTotalPaise,
    0
  );

  return {
    sessionId: session.sessionId,
    mandate: {
      maxSessionAmountPaise: session.mandate.maxSessionAmountPaise,
      maxSingleItemPaise: session.mandate.maxSingleItemPaise,
      allowedCategories: session.mandate.allowedCategories,
      spentPaise: session.mandate.spentPaise,
      remainingPaise: session.mandate.remainingPaise(),
    },
    cart: enrichedCart,
    cartTotalPaise,
    hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
  };
}
