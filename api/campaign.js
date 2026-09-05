// POST /api/campaign
import { state, getSessionPayload } from "./_store.js";
import { evaluateCampaigns } from "../src/agents/campaignAgent.js";

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "POST") return res.status(405).json({ ok: false, message: "Method not allowed" });

  const { campaign, product, reason } = evaluateCampaigns(state.session, state.browseTiming);
  res.json({
    ok: true,
    hasCampaign: campaign !== null,
    campaign,
    product,
    reason,
    session: getSessionPayload(state.session),
  });
}
