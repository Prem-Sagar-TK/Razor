/**
 * Thin wrapper around Razorpay's test-mode Orders API.
 *
 * If RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET aren't set, falls back to a mock
 * that mimics the Razorpay response shape, so the rest of the pipeline
 * (gate -> audit -> upsell) can be demoed and judged without requiring the
 * audience to hand over API keys. Swap MOCK_MODE off the moment real test
 * keys are exported.
 */

import Razorpay from "razorpay";
import crypto from "node:crypto";

export const MOCK_MODE = !(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

const client = MOCK_MODE
  ? null
  : new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates a Razorpay Order (test mode). Returns an object with at least
 * `id` and `status`. In mock mode, pass simulateFailure=true to
 * deterministically reproduce a Razorpay-side decline for demo purposes.
 */
export async function createOrder({ amountPaise, currency, receipt, notes, simulateFailure = false }) {
  if (MOCK_MODE) {
    await sleep(200); // simulate network latency
    const succeeded = !simulateFailure;
    return {
      id: `order_mock_${crypto.randomBytes(7).toString("hex")}`,
      amount: amountPaise,
      currency,
      status: succeeded ? "created" : "failed",
      receipt,
      notes,
      mock: true,
      failureReason: succeeded ? null : "card_declined_simulated",
    };
  }

  const order = await client.orders.create({
    amount: amountPaise,
    currency,
    receipt,
    notes,
    payment_capture: 1,
  });
  return order;
}
