import readline from "node:readline/promises";
import crypto from "node:crypto";

import { Session, addToCart, checkout, proposeUpsell } from "./src/engine.js";
import { Mandate } from "./src/mandate.js";
import { readTrail } from "./src/audit.js";
import { chatTurn } from "./src/agents/buyerAgent.js";

function newSession(sessionId) {
  const mandate = new Mandate({
    sessionId,
    maxSessionAmountPaise: 300000,
    maxSingleItemPaise: 250000,
    allowedCategories: ["electronics", "accessories"],
  });
  return new Session(sessionId, mandate);
}

function printTrail(sessionId) {
  console.log("\n--- AUDIT TRAIL ---");
  for (const e of readTrail(sessionId)) {
    const status = e.gateAllowed ? "ALLOWED" : "BLOCKED";
    const amt = e.amountPaise != null ? `₹${(e.amountPaise / 100).toFixed(2)}` : "-";
    console.log(
      `[${e.ts}] ${e.actor.padEnd(12)} ${e.action.padEnd(18)} ${status.padEnd(8)} ${amt.padStart(10)}  ${e.gateReason}`
    );
  }
}

async function scriptedDemo() {
  const session = newSession(`demo-${crypto.randomBytes(3).toString("hex")}`);
  console.log(
    `Session ${session.sessionId} | mandate: ₹${(session.mandate.maxSessionAmountPaise / 100).toFixed(2)} cap, categories=${JSON.stringify(session.mandate.allowedCategories)}\n`
  );

  console.log("1) Buyer adds earbuds");
  console.log(" ", addToCart(session, "sku_001", 1).message);
  const up = proposeUpsell(session);
  console.log("   upsell:", up.message);
  if (up.ok) {
    addToCart(session, up.product.id, 1);
    console.log(`   buyer accepts -> added ${up.product.name}`);
  }

  console.log("\n2) Buyer checks out, but Razorpay declines this time (simulated)");
  let result = await checkout(session, true);
  console.log(" ", result.message, "  <-- graceful failure: explained, mandate untouched, no crash");

  console.log("\n3) Buyer retries the same checkout -- this time it goes through");
  result = await checkout(session);
  console.log(" ", result.message);

  console.log("\n4) Buyer now tries to add the keyboard (₹3,499) -- exceeds the per-item ceiling");
  result = addToCart(session, "sku_003", 1);
  console.log(" ", result.message, "  <-- gate blocks it before Razorpay is ever called");

  console.log("\n5) Buyer adds something cheaper instead and checks out");
  console.log(" ", addToCart(session, "sku_007", 1).message);
  console.log(" ", (await checkout(session)).message);

  printTrail(session.sessionId);
}

async function interactiveChat() {
  const session = newSession(`chat-${crypto.randomBytes(3).toString("hex")}`);
  let history = [];
  console.log(
    `Session ${session.sessionId} | mandate ₹${(session.mandate.maxSessionAmountPaise / 100).toFixed(2)}. Type 'quit' to exit, 'trail' to see the audit log.\n`
  );
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  while (true) {
    const userMessage = (await rl.question("you> ")).trim();
    if (userMessage.toLowerCase() === "quit") break;
    if (userMessage.toLowerCase() === "trail") {
      printTrail(session.sessionId);
      continue;
    }
    const { text, history: newHistory } = await chatTurn(session, history, userMessage);
    history = newHistory;
    console.log("agent>", text);
  }
  rl.close();
}

const args = process.argv.slice(2);
if (args.includes("--chat")) {
  await interactiveChat();
} else {
  await scriptedDemo();
}
