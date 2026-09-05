# Mandate Gate

Built for the **AI Growth & Agentic Commerce** track: grow merchant revenue
*and* make the merchant transactable by an AI buyer, end to end, on
Razorpay test-mode APIs.

## Why this shape

Razorpay already has in-app agentic checkout live with Zomato/Swiggy/Zepto
via NPCI, and UPI Reserve Pay lets a buyer set a spending mandate once
instead of re-authenticating every purchase. NPCI is separately building
the **Unified Agent Protocol (UAP)** — a registry to verify which AI agents
are authorized to spend on a user's behalf, and how much. That
authorization layer is the open problem right now, more than the checkout
mechanics themselves. This project builds a minimal, working version of
exactly that layer, plus the two revenue/transactability pieces around it:

1. **Agent-readable catalog** (`src/catalog.js`) — structured product data
   a buyer-agent can query directly, instead of scraping a storefront.
2. **Conversational checkout** (`src/agents/buyerAgent.js`) — a Claude
   tool-calling agent that searches, adds to cart, and checks out via
   Razorpay's test-mode Orders API.
3. **Upsell agent** (`proposeUpsell` in `src/engine.js`) — fires once per
   add-to-cart, offers exactly one bounded, explainable add-on (must both
   pair with the cart and pass the mandate check). This is the revenue lever.
4. **The gate** (`src/mandate.js`) — a pure, deterministic function that
   checks every proposed money action against a spending mandate
   (per-item ceiling, category allow-list, session cap) *before* Razorpay
   is ever called. The LLM never decides whether money moves — it only
   decides intent and tool calls.
5. **Audit trail** (`src/audit.js`, → `audit_log.jsonl`) — one line per
   decision, allowed or blocked, with the reason. This is what makes the
   system's behavior explainable after the fact, not just in a demo.

## Run it

```bash
npm install

# scripted demo: happy path, an upsell, a deterministic declined payment
# handled gracefully, and two gate blocks -- prints the full audit trail
npm run demo
# (equivalent to: node demo.js)

# interactive chat (rule-based fallback with zero setup)
node demo.js --chat

# interactive chat with the real Claude agent
export ANTHROPIC_API_KEY=sk-ant-...
node demo.js --chat

# to hit real Razorpay test mode instead of the built-in mock:
export RAZORPAY_KEY_ID=rzp_test_...
export RAZORPAY_KEY_SECRET=...
npm run demo
```

Without Razorpay keys set, `src/razorpayClient.js` runs in mock mode so the
rest of the pipeline can be judged without handing out credentials. Switch
it off by exporting real test-mode keys — no code changes needed.

## What to point judges at

- `src/mandate.js` — the entire authorization model in ~40 lines,
  deliberately not LLM-judged.
- `audit_log.jsonl` after running `npm run demo` — every decision, in
  order, self-explaining.
- Step 2 → 3 in the demo output — a payment declines, the mandate is
  provably untouched (`spentPaise` only updates on Razorpay success), and
  the same cart checks out cleanly on retry.

## Project layout

```
demo.js                    scripted + interactive entry point
src/catalog.js              agent-readable product catalog
src/mandate.js               the gate (deterministic authorization)
src/audit.js                 append-only audit trail
src/razorpayClient.js        Razorpay test-mode wrapper (+ mock fallback)
src/engine.js                 cart, gated checkout, upsell logic
src/agents/buyerAgent.js       Claude tool-calling conversational layer
```

## Extending

- Swap `searchCatalog`'s keyword match for embeddings if the catalog grows.
- Replace the mock in `razorpayClient.js` with the real SDK call (already
  wired, just needs test keys) and switch `createOrder` to Payment Links
  if you want a shareable checkout URL instead of a server-side charge.
- The `Mandate` class maps almost directly onto what NPCI's UAP is
  expected to standardize (cap, categories, agent identity) — if UAP ships
  an API, `mandate.js` is the file to swap for a real registry call.
