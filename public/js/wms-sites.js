import { safeApiGet } from "./api.js";
import { formatNumber, formatDate } from "./utils.js";

export async function renderWmsSites({ siteContext }) {
  const sites = siteContext?.sites || [];
  const activeSiteId = siteContext?.activeSiteId;
  const siteDashboard = activeSiteId
    ? await safeApiGet(`/api/wms/sites/${activeSiteId}/dashboard`, { stats: {}, receipts: [], inventories: [] })
    : { stats: {}, receipts: [], inventories: [] };

  const cards = sites.length
    ? sites
        .map(
          (site) => `
            <article class="wms-site-card">
              <header>
                <h4>${site.name}</h4>
                <span class="badge ${site.is_remote ? "outline" : "solid"}">${site.code}</span>
              </header>
              <p class="muted">${site.type}</p>
              <div class="wms-site-metrics">
                <div>
                  <small>Stock</small>
                  <strong>${formatNumber(site.stock_quantity || 0)}</strong>
                </div>
                <div>
                  <small>Entrepôts</small>
                  <strong>${formatNumber(site.warehouses || 0)}</strong>
                </div>
                <div>
                  <small>Réceptions</small>
                  <strong>${formatNumber(site.open_inbounds || 0)}</strong>
                </div>
              </div>
            </article>`
        )
        .join("")
    : `<p class="empty-state">Aucun site disponible.</p>`;

  const html = `
    <div class="wms-site-layout">
      <section class="wms-panel">
        <div class="panel-header">
          <h3>Sites distants</h3>
          <p>Visualisez l'activité de chaque site Orion.</p>
        </div>
        <div class="wms-site-grid">${cards}</div>
      </section>
      <section class="wms-panel">
        <div class="panel-header">
          <h3>Opérations du site sélectionné</h3>
          <p>Actions rapides pour le site actif.</p>
        </div>
        <div class="wms-focus-grid">
          <article class="wms-focus-card">
            <span>Stock total</span>
            <strong>${formatNumber(siteDashboard.stats?.stock_quantity || 0)}<small>u</small></strong>
          </article>
          <article class="wms-focus-card">
            <span>Réceptions en attente</span>
            <strong>${formatNumber(siteDashboard.stats?.open_inbounds || 0)}</strong>
          </article>
          <article class="wms-focus-card">
            <span>Préparations en cours</span>
            <strong>${formatNumber(siteDashboard.stats?.open_outbounds || 0)}</strong>
          </article>
          <article class="wms-focus-card">
            <span>Inventaires ouverts</span>
            <strong>${formatNumber(siteDashboard.stats?.open_inventories || 0)}</strong>
          </article>
        </div>
        <div class="wms-mini-columns">
          <div>
            <h4>Réceptions</h4>
            ${(siteDashboard.receipts || [])
              .map((receipt) => `<p><strong>${receipt.reference}</strong><br/><small>${receipt.supplier_name || "-"}</small> · ${formatDate(receipt.expected_date)}</p>`)
              .join("") || `<p class="empty-state">Aucune réception attendue.</p>`}
          </div>
          <div>
            <h4>Inventaires</h4>
            ${(siteDashboard.inventories || [])
              .map((inventory) => `<p><strong>${inventory.warehouse_name}</strong><br/><small>${inventory.status}</small></p>`)
              .join("") || `<p class="empty-state">Pas d'inventaire planifié.</p>`}
          </div>
        </div>
      </section>
    </div>
  `;

  return {
    title: "Sites & dépôts",
    subtitle: "Suivi des sites distants et focus opérationnel.",
    html
  };
}
