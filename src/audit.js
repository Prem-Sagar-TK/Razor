import { appendFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Vercel's project root is read-only; only /tmp is writable at runtime.
// VERCEL is automatically set to "1" by the Vercel runtime.
export const LOG_PATH = process.env.VERCEL
  ? "/tmp/audit_log.jsonl"
  : path.join(__dirname, "..", "audit_log.jsonl");


export function logEvent({
  sessionId,
  actor,
  action,
  productId = null,
  quantity = null,
  amountPaise = null,
  gateAllowed,
  gateReason,
  razorpayOrderId = null,
  razorpayStatus = null,
  extra = {},
}) {
  const event = {
    ts: new Date().toISOString(),
    sessionId,
    actor,
    action,
    productId,
    quantity,
    amountPaise,
    gateAllowed,
    gateReason,
    razorpayOrderId,
    razorpayStatus,
    extra,
  };
  appendFileSync(LOG_PATH, JSON.stringify(event) + "\n");
  return event;
}

export function readTrail(sessionId = null) {
  if (!existsSync(LOG_PATH)) return [];
  const events = readFileSync(LOG_PATH, "utf-8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
  return sessionId ? events.filter((e) => e.sessionId === sessionId) : events;
}

export function clearTrail() {
  if (existsSync(LOG_PATH)) {
    appendFileSync(LOG_PATH, "", { flag: "w" });
  }
}
