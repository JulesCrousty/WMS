import { safeApiGet } from "./api.js";
import { formatNumber, formatDate } from "./utils.js";

export async function renderWmsInventory() {
  const [inventories, stock] = await Promise.all([
    safeApiGet("/api/wms/inventories", []),
    safeApiGet("/api/wms/stock/by-item", [])
  ]);

  const topSkus = stock.slice(0, 5);
  const html = `
    <div class="wms-panel-grid">
      <section class="wms-panel">
        <div class="panel-header">
          <h3>Inventaires</h3>
          <p>Campagnes récentes et statut.</p>
        </div>
        <div class="wms-table">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Entrepôt</th>
                <th>Site</th>
                <th>Ouverture</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              ${inventories
                .map(
                  (inventory) => `
                    <tr>
                      <td>${inventory.id}</td>
                      <td>${inventory.warehouse_name || "-"}</td>
                      <td>${inventory.site_name || "-"}</td>
                      <td>${formatDate(inventory.started_at)}</td>
                      <td><span class="status-badge ${inventory.status === "CLOSED" ? "ok" : "warning"}">${inventory.status}</span></td>
                    </tr>`
                )
                .join("") || `<tr><td colspan="5" class="empty-state">Aucun inventaire actif.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
      <section class="wms-panel">
        <div class="panel-header">
          <h3>Top SKU</h3>
          <p>Volumes prioritaires pour les inventaires tournants.</p>
        </div>
        <div class="wms-mini-columns">
          ${topSkus
            .map(
              (item) => `
                <article class="wms-mini-card">
                  <header>
                    <strong>${item.sku}</strong>
                    <span>${item.unit || "u"}</span>
                  </header>
                  <p>${item.name}</p>
                  <p class="muted">${formatNumber(item.quantity || 0)} u</p>
                </article>`
            )
            .join("") || `<p class="empty-state">Pas de SKU prioritaire.</p>`}
        </div>
      </section>
    </div>
  `;

  return {
    title: "Inventaires",
    subtitle: "Suivi des campagnes et des priorités de comptage.",
    html
  };
}
