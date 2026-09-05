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

export async function createOrder({ amountPaise, currency, receipt, notes, simulateFailure = false }) {
  if (MOCK_MODE) {
    await sleep(200);
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
