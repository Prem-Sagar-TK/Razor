let state = {
  session: null,
  products: [],
  auditTrail: [],
  auditFilter: "all",
  activeUpsell: null,
  activeTab: "catalog",
};

const elements = {
  headerHeadroomText: document.getElementById("header-headroom-text"),
  spentText: document.getElementById("spent-text"),
  llmModeBadge: document.getElementById("llm-mode-badge"),
  btnResetSession: document.getElementById("btn-reset-session"),
  catalogSearch: document.getElementById("catalog-search"),
  catalogGrid: document.getElementById("catalog-grid"),
  catalogCount: document.getElementById("catalog-count"),
  cartCountBadge: document.getElementById("cart-count-badge"),
  cartItems: document.getElementById("cart-items"),
  cartTotalText: document.getElementById("cart-total-text"),
  cartGateStatus: document.getElementById("cart-gate-status"),
  upsellBanner: document.getElementById("upsell-banner"),
  upsellText: document.getElementById("upsell-text"),
  btnAcceptUpsell: document.getElementById("btn-accept-upsell"),
  toggleSimulateFailure: document.getElementById("toggle-simulate-failure"),
  btnCheckout: document.getElementById("btn-checkout"),
  chatMessages: document.getElementById("chat-messages"),
  chatForm: document.getElementById("chat-form"),
  chatInput: document.getElementById("chat-input"),
  spentDetail: document.getElementById("spent-detail"),
  headroomDetail: document.getElementById("headroom-detail"),
  headroomProgressFill: document.getElementById("headroom-progress-fill"),
  inputSessionCap: document.getElementById("input-session-cap"),
  inputItemCeiling: document.getElementById("input-item-ceiling"),
  catElectronics: document.getElementById("cat-electronics"),
  catAccessories: document.getElementById("cat-accessories"),
  btnUpdateMandate: document.getElementById("btn-update-mandate"),
  auditTbody: document.getElementById("audit-tbody"),
  countAll: document.getElementById("count-all"),
  countAllowed: document.getElementById("count-allowed"),
  countBlocked: document.getElementById("count-blocked"),
  paymentModal: document.getElementById("payment-modal"),
  modalBodyContent: document.getElementById("modal-body-content"),
  btnCloseModal: document.getElementById("btn-close-modal"),
  campaignStatusPill: document.getElementById("campaign-status-pill"),
  campaignCard: document.getElementById("campaign-card"),
  campaignHeadline: document.getElementById("campaign-headline"),
  campaignBody: document.getElementById("campaign-body"),
  campaignProductInfo: document.getElementById("campaign-product-info"),
  btnAcceptCampaign: document.getElementById("btn-accept-campaign"),
  btnEvaluateCampaign: document.getElementById("btn-evaluate-campaign"),
};

function formatINR(paise) {
  return `₹${(paise / 100).toFixed(2)}`;
}

async function fetchSession() {
  try {
    const res = await fetch("/api/session");
    const data = await res.json();
    if (data.ok) {
      state.session = data.session;
      updateUI();
    }
  } catch (err) {
    console.error("Failed to fetch session:", err);
  }
}

async function fetchCatalog(query = "") {
  try {
    const res = await fetch(`/api/catalog?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (data.ok) {
      state.products = data.products;
      renderCatalog();
    }
  } catch (err) {
    console.error("Failed to fetch catalog:", err);
  }
}

async function evaluateCampaign() {
  try {
    const res = await fetch("/api/campaign", { method: "POST" });
    const data = await res.json();
    if (data.ok) {
      renderCampaign(data);
    }
  } catch (err) {
    console.error("Failed to evaluate campaign:", err);
  }
}

async function fetchAuditTrail() {
  try {
    const res = await fetch("/api/audit");
    const data = await res.json();
    if (data.ok) {
      state.auditTrail = data.sessionTrail;
      renderAuditTrail();
    }
  } catch (err) {
    console.error("Failed to fetch audit trail:", err);
  }
}

async function updateMandate() {
  const capPaise = Math.round(parseFloat(elements.inputSessionCap.value) * 100);
  const ceilingPaise = Math.round(parseFloat(elements.inputItemCeiling.value) * 100);

  const allowedCategories = [];
  if (elements.catElectronics.checked) allowedCategories.push("electronics");
  if (elements.catAccessories.checked) allowedCategories.push("accessories");

  const res = await fetch("/api/mandate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      maxSessionAmountPaise: capPaise,
      maxSingleItemPaise: ceilingPaise,
      allowedCategories,
    }),
  });

  const data = await res.json();
  if (data.ok) {
    state.session = data.session;
    updateUI();
    fetchAuditTrail();
  }
}

async function resetSession() {
  const res = await fetch("/api/session/reset", { method: "POST" });
  const data = await res.json();
  if (data.ok) {
    state.session = data.session;
    state.activeUpsell = null;
    elements.chatMessages.innerHTML = `
      <div class="chat-bubble agent">
        <p>Session reset! Clean mandate initialized.</p>
        <div class="quick-prompts">
          <button class="prompt-pill" data-prompt="Search earbuds">Earbuds</button>
          <button class="prompt-pill" data-prompt="Add Wireless Earbuds Pro">Buy Earbuds Pro</button>
          <button class="prompt-pill" data-prompt="Add Mechanical Keyboard">Buy Keyboard</button>
          <button class="prompt-pill" data-prompt="Checkout">Checkout</button>
        </div>
      </div>
    `;
    updateUI();
    fetchAuditTrail();
  }
}

async function addToCartAPI(productId, quantity = 1) {
  const res = await fetch("/api/cart/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId, quantity }),
  });
  const data = await res.json();

  state.session = data.session;
  if (data.upsell) {
    state.activeUpsell = data.upsell;
  }
  updateUI();
  fetchAuditTrail();

  appendChatMessage(
    "agent",
    data.ok
      ? `✅ ${data.message}`
      : `🛡️ **Mandate Gate Blocked**: ${data.message}`
  );
}

async function removeFromCart(productId) {
  const res = await fetch("/api/cart/item", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId }),
  });
  const data = await res.json();
  if (data.ok) {
    state.session = data.session;
    updateUI();
    fetchAuditTrail();
  }
}

async function checkoutAPI() {
  const simulateFailure = elements.toggleSimulateFailure.checked;
  showModalLoading();

  const res = await fetch("/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ simulateFailure }),
  });

  const data = await res.json();
  state.session = data.session;
  updateUI();
  fetchAuditTrail();
  showModalResult(data);
}

async function sendChatMessage(message) {
  if (!message.trim()) return;

  appendChatMessage("user", message);
  elements.chatInput.value = "";

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  const data = await res.json();
  if (data.ok) {
    state.session = data.session;
    if (data.upsell) {
      state.activeUpsell = data.upsell;
    }
    appendChatMessage("agent", data.text);
    updateUI();
    fetchAuditTrail();
  } else {
    appendChatMessage("agent", `⚠️ ${data.message}`);
  }
}

function updateUI() {
  if (!state.session) return;
  const { mandate, cart, cartTotalPaise, hasAnthropicKey } = state.session;

  elements.headerHeadroomText.textContent = formatINR(mandate.remainingPaise);
  elements.spentText.textContent = formatINR(mandate.spentPaise);
  elements.llmModeBadge.textContent = hasAnthropicKey ? "Claude Sonnet 4.6" : "Rule Engine";

  elements.cartCountBadge.textContent = cart.length;
  elements.cartTotalText.textContent = formatINR(cartTotalPaise);

  elements.spentDetail.textContent = formatINR(mandate.spentPaise);
  elements.headroomDetail.textContent = formatINR(mandate.remainingPaise);

  const percentSpent = Math.min(100, (mandate.spentPaise / mandate.maxSessionAmountPaise) * 100);
  elements.headroomProgressFill.style.width = `${percentSpent}%`;

  if (document.activeElement !== elements.inputSessionCap) {
    elements.inputSessionCap.value = mandate.maxSessionAmountPaise / 100;
  }
  if (document.activeElement !== elements.inputItemCeiling) {
    elements.inputItemCeiling.value = mandate.maxSingleItemPaise / 100;
  }

  const headroom = mandate.remainingPaise;
  if (cart.length === 0) {
    elements.cartGateStatus.className = "gate-status-pill";
    elements.cartGateStatus.textContent = "Cart Empty";
    elements.btnCheckout.disabled = true;
  } else if (cartTotalPaise <= headroom) {
    elements.cartGateStatus.className = "gate-status-pill allowed";
    elements.cartGateStatus.textContent = `✓ Mandate Check: ALLOWED (Fits budget)`;
    elements.btnCheckout.disabled = false;
  } else {
    elements.cartGateStatus.className = "gate-status-pill blocked";
    elements.cartGateStatus.textContent = `✕ Mandate Gate: BLOCKED (Exceeds budget)`;
    elements.btnCheckout.disabled = true;
  }

  if (state.activeUpsell && state.activeUpsell.product) {
    elements.upsellBanner.style.display = "flex";
    elements.upsellText.textContent = state.activeUpsell.message;
  } else {
    elements.upsellBanner.style.display = "none";
  }

  renderCart();
  renderCatalog();
}

function renderCatalog() {
  if (!state.session) return;
  const { mandate } = state.session;

  elements.catalogCount.textContent = state.products.length;

  if (state.products.length === 0) {
    elements.catalogGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 40px 0; font-size: 0.88rem;">
        No products found in catalog.
      </div>
    `;
    return;
  }

  elements.catalogGrid.innerHTML = state.products
    .map((p) => {
      const categoryAllowed = mandate.allowedCategories.includes(p.category);
      const underCeiling = p.pricePaise <= mandate.maxSingleItemPaise;
      const fitsHeadroom = p.pricePaise <= mandate.remainingPaise;
      const isAllowed = categoryAllowed && underCeiling && fitsHeadroom;

      let gateTag = "✓ Fits Mandate";
      if (!categoryAllowed) gateTag = "✕ Category Blocked";
      else if (!underCeiling) gateTag = "✕ Exceeds Ceiling";
      else if (!fitsHeadroom) gateTag = "✕ Exceeds Budget";

      return `
        <div class="product-card">
          <div class="card-top">
            <span class="category-tag">${p.category}</span>
            <span class="price-tag">${formatINR(p.pricePaise)}</span>
          </div>
          <h4 class="card-title">${p.name}</h4>
          <p class="card-desc">${p.description}</p>
          <div class="gate-pill ${isAllowed ? "allowed" : "blocked"}">${gateTag}</div>
          <div class="card-btns">
            <button class="btn-sm-action btn-add-cart" data-id="${p.id}">+ Cart</button>
            <button class="btn-sm-action btn-agent-buy" data-name="${p.name}">🤖 Ask Agent</button>
          </div>
        </div>
      `;
    })
    .join("");

  document.querySelectorAll(".btn-add-cart").forEach((btn) => {
    btn.addEventListener("click", () => addToCartAPI(btn.dataset.id, 1));
  });

  document.querySelectorAll(".btn-agent-buy").forEach((btn) => {
    btn.addEventListener("click", () => sendChatMessage(`Add ${btn.dataset.name} to cart`));
  });
}

function renderCart() {
  if (!state.session || state.session.cart.length === 0) {
    elements.cartItems.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 40px 0; font-size: 0.88rem;">
        Cart is empty
      </div>
    `;
    return;
  }

  elements.cartItems.innerHTML = state.session.cart
    .map(
      (item) => `
      <div class="cart-line-item">
        <div>
          <div class="cart-line-title">${item.product.name} (x${item.quantity})</div>
          <div class="cart-line-sub">${formatINR(item.lineTotalPaise)}</div>
        </div>
        <button class="btn-del" data-id="${item.productId}">&times;</button>
      </div>
    `
    )
    .join("");

  document.querySelectorAll(".btn-del").forEach((btn) => {
    btn.addEventListener("click", () => removeFromCart(btn.dataset.id));
  });
}

function appendChatMessage(role, text) {
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${role}`;
  bubble.innerHTML = `<p>${text.replace(/\n/g, "<br/>")}</p>`;

  elements.chatMessages.appendChild(bubble);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function renderAuditTrail() {
  const events = state.auditTrail;

  elements.countAll.textContent = events.length;
  elements.countAllowed.textContent = events.filter((e) => e.gateAllowed).length;
  elements.countBlocked.textContent = events.filter((e) => !e.gateAllowed).length;

  let filtered = events;
  if (state.auditFilter === "ALLOWED") filtered = events.filter((e) => e.gateAllowed);
  if (state.auditFilter === "BLOCKED") filtered = events.filter((e) => !e.gateAllowed);

  if (filtered.length === 0) {
    elements.auditTbody.innerHTML = `
      <tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">No audit events recorded.</td></tr>
    `;
    return;
  }

  elements.auditTbody.innerHTML = filtered
    .slice()
    .reverse()
    .map((e) => {
      const badge = e.gateAllowed
        ? `<span class="badge-tag allowed">ALLOWED</span>`
        : `<span class="badge-tag blocked">BLOCKED</span>`;
      const time = new Date(e.ts).toLocaleTimeString();
      const amt = e.amountPaise != null ? formatINR(e.amountPaise) : "-";

      return `
        <tr>
          <td>${time}</td>
          <td>${e.actor}</td>
          <td>${e.action}</td>
          <td>${badge}</td>
          <td>${amt}</td>
          <td>${e.gateReason}</td>
        </tr>
      `;
    })
    .join("");
}

function showModalLoading() {
  elements.paymentModal.style.display = "flex";
  elements.modalBodyContent.innerHTML = `
    <div style="padding: 20px;">
      <h3>Processing payment...</h3>
      <p style="color: var(--text-sub); font-size: 0.85rem; margin-top: 6px;">Verifying mandate gate rules with Razorpay test mode API.</p>
    </div>
  `;
}

function showModalResult(result) {
  if (result.ok) {
    elements.modalBodyContent.innerHTML = `
      <div>
        <h3 style="color: var(--success);">Payment Successful!</h3>
        <p style="font-size: 0.88rem; margin-top: 8px;">${result.message}</p>
        <button class="btn-primary btn-block" style="margin-top: 20px;" onclick="document.getElementById('payment-modal').style.display='none'">Done</button>
      </div>
    `;
  } else {
    elements.modalBodyContent.innerHTML = `
      <div>
        <h3 style="color: var(--error);">Payment Failed / Gate Blocked</h3>
        <p style="font-size: 0.88rem; margin-top: 8px;">${result.message}</p>
        <button class="btn-sm-action btn-block" style="margin-top: 20px;" onclick="document.getElementById('payment-modal').style.display='none'">Close</button>
      </div>
    `;
  }
}

function initTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));

      btn.classList.add("active");
      const targetPane = document.getElementById(`pane-${btn.dataset.tab}`);
      if (targetPane) targetPane.classList.add("active");
    });
  });
}

function renderCampaign(data) {
  if (!data.hasCampaign || !data.campaign) {
    elements.campaignStatusPill.className = "gate-status-pill";
    elements.campaignStatusPill.textContent = "No active campaign";
    elements.campaignCard.style.display = "none";
    return;
  }

  const { campaign, product } = data;
  elements.campaignStatusPill.className = "gate-status-pill allowed";
  elements.campaignStatusPill.textContent = `✓ Campaign Active: ${campaign.trigger}`;

  elements.campaignHeadline.textContent = campaign.headline;
  elements.campaignBody.textContent = campaign.body;

  if (product) {
    elements.campaignProductInfo.textContent =
      `Product: ${product.name} — ${formatINR(product.pricePaise)} (${product.category})`;
    elements.btnAcceptCampaign.style.display = "inline-block";
    elements.btnAcceptCampaign.dataset.id = product.id;
  } else {
    elements.campaignProductInfo.textContent = "";
    elements.btnAcceptCampaign.style.display = "none";
  }

  elements.campaignCard.style.display = "block";
}

function initEventListeners() {
  initTabs();

  elements.btnUpdateMandate.addEventListener("click", updateMandate);
  elements.btnResetSession.addEventListener("click", resetSession);

  elements.catalogSearch.addEventListener("input", (e) => fetchCatalog(e.target.value));

  elements.chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    sendChatMessage(elements.chatInput.value);
  });

  elements.btnCheckout.addEventListener("click", checkoutAPI);

  elements.btnAcceptUpsell.addEventListener("click", () => {
    if (state.activeUpsell?.product) {
      addToCartAPI(state.activeUpsell.product.id, 1);
      state.activeUpsell = null;
      updateUI();
    }
  });

  elements.btnEvaluateCampaign.addEventListener("click", evaluateCampaign);

  elements.btnAcceptCampaign.addEventListener("click", () => {
    const id = elements.btnAcceptCampaign.dataset.id;
    if (id) {
      addToCartAPI(id, 1);
      elements.campaignCard.style.display = "none";
      elements.campaignStatusPill.className = "gate-status-pill";
      elements.campaignStatusPill.textContent = "Campaign product added to cart";
    }
  });

  elements.btnCloseModal.addEventListener("click", () => {
    elements.paymentModal.style.display = "none";
  });

  elements.chatMessages.addEventListener("click", (e) => {
    if (e.target.classList.contains("prompt-pill")) {
      sendChatMessage(e.target.dataset.prompt);
    }
  });

  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.auditFilter = btn.dataset.filter;
      renderAuditTrail();
    });
  });
}

async function init() {
  initEventListeners();
  await Promise.all([fetchSession(), fetchCatalog(), fetchAuditTrail()]);
  // Re-render catalog after both session and products are guaranteed to be loaded.
  // renderCatalog() guards on state.session, so if fetchCatalog() resolved first
  // (before fetchSession()) the catalog would silently stay empty.
  renderCatalog();
  await evaluateCampaign();
  setInterval(fetchAuditTrail, 3000);
  setInterval(evaluateCampaign, 10000);
}

init();
