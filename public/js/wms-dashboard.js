import { safeApiGet } from "./api.js";
import { formatNumber, formatDate } from "./utils.js";

function renderSiteCard(site) {
  return `
    <article class="wms-site-card">
      <header>
        <h4>${site.name}</h4>
        <span class="badge ${site.is_remote ? "outline" : "solid"}">${site.code}</span>
      </header>
      <div class="wms-site-metrics">
        <div>
          <small>Stock</small>
          <strong>${formatNumber(site.stock_quantity || 0)}</strong>
        </div>
        <div>
          <small>Réceptions</small>
          <strong>${formatNumber(site.open_inbounds || 0)}</strong>
        </div>
        <div>
          <small>Préparations</small>
          <strong>${formatNumber(site.open_outbounds || 0)}</strong>
        </div>
      </div>
    </article>
  `;
}

function renderFlowRow(flow) {
  const dateLabel = formatDate(flow.day);
  return `
    <div class="wms-flow-row">
      <span>${dateLabel}</span>
      <div class="bar">
        <div class="in" style="width:${Math.min(flow.receipts || 0, 20) * 5}%"></div>
        <div class="out" style="width:${Math.min(flow.issues || 0, 20) * 5}%"></div>
      </div>
      <small>${formatNumber(flow.receipts || 0)} in / ${formatNumber(flow.issues || 0)} out</small>
    </div>
  `;
}

export async function renderWmsDashboard({ siteContext }) {
  const [hqData, siteDetails] = await Promise.all([
    safeApiGet("/api/wms/dashboard", {
      open_inbounds: 0,
      open_outbounds: 0,
      stock_quantity: 0,
      pending_tasks: 0,
      site_breakdown: [],
      daily_flows: []
    }),
    siteContext?.activeSiteId
      ? safeApiGet(`/api/wms/sites/${siteContext.activeSiteId}/dashboard`, { stats: {}, receipts: [], inventories: [] })
      : { stats: {}, receipts: [], inventories: [] }
  ]);

  const siteStats = siteDetails?.stats || {};
  const kpis = [
    { label: "Réceptions ouvertes", value: hqData.open_inbounds },
    { label: "Préparations ouvertes", value: hqData.open_outbounds },
    { label: "Stock global", value: hqData.stock_quantity, suffix: "u" },
    { label: "Tâches en attente", value: hqData.pending_tasks }
  ];

  const focusCards = [
    { label: "Stock site", value: siteStats.stock_quantity, suffix: "u" },
    { label: "Réceptions", value: siteStats.open_inbounds },
    { label: "Préparations", value: siteStats.open_outbounds },
    { label: "Inventaires", value: siteStats.open_inventories }
  ];

  const html = `
    <div class="wms-dashboard-grid">
      <section class="wms-panel">
        <div class="panel-header">
          <h3>Vue multi-sites</h3>
          <p>Surveillez l'engagement opérationnel de chaque site.</p>
        </div>
        <div class="wms-site-grid">
          ${(hqData.site_breakdown || []).map((site) => renderSiteCard(site)).join("") || `<p class="empty-state">Aucun site disponible.</p>`}
        </div>
      </section>
      <section class="wms-panel">
        <div class="panel-header">
          <h3>Flux journaliers</h3>
          <p>Receipts vs sorties sur 7 jours.</p>
        </div>
        <div class="wms-flow-panel">
          ${(hqData.daily_flows || []).map((flow) => renderFlowRow(flow)).join("") || `<p class="empty-state">Pas de mouvement récent.</p>`}
        </div>
      </section>
      <section class="wms-panel">
        <div class="panel-header">
          <h3>Focus ${siteContext?.activeSite?.name || "site"}</h3>
          <p>Vue synthétique du site sélectionné.</p>
        </div>
        <div class="wms-focus-grid">
          ${focusCards
            .map(
              (card) => `
                <article class="wms-focus-card">
                  <span>${card.label}</span>
                  <strong>${formatNumber(card.value || 0)}${card.suffix ? `<small>${card.suffix}</small>` : ""}</strong>
                </article>`
            )
            .join("")}
        </div>
        <div class="wms-mini-columns">
          <div>
            <h4>Réceptions en attente</h4>
            ${(siteDetails.receipts || [])
              .map((receipt) => `<p><strong>${receipt.reference}</strong><br/><small>${receipt.supplier_name || "-"}</small> · ${formatDate(receipt.expected_date)}</p>`)
              .join("") || `<p class="empty-state">RAS</p>`}
          </div>
          <div>
            <h4>Inventaires</h4>
            ${(siteDetails.inventories || [])
              .map((inventory) => `<p><strong>${inventory.warehouse_name}</strong><br/><small>${inventory.status}</small></p>`)
              .join("") || `<p class="empty-state">Aucun inventaire programmé</p>`}
          </div>
        </div>
      </section>
    </div>
  `;

  return {
    title: "Pilotage central",
    subtitle: "Indicateurs multi-sites et focus site distant.",
    kpis,
    html
  };
}
