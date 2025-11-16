import { safeApiGet } from "./api.js";
import { formatNumber, formatDate } from "./utils.js";

export async function renderWmsInbound() {
  const orders = await safeApiGet("/api/wms/inbound-orders", []);
  const html = `
    <div class="wms-panel-grid">
      <section class="wms-panel">
        <div class="panel-header">
          <h3>Ordres entrants</h3>
          <p>Réceptions ouvertes et priorités fournisseurs.</p>
        </div>
        <div class="wms-table">
          <table>
            <thead>
              <tr>
                <th>Référence</th>
                <th>Fournisseur</th>
                <th>Entrepôt</th>
                <th>Date prévue</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              ${orders
                .map(
                  (order) => `
                    <tr>
                      <td>${order.reference}</td>
                      <td>${order.supplier_name || "-"}</td>
                      <td>${order.warehouse_name || "-"}</td>
                      <td>${formatDate(order.expected_date)}</td>
                      <td><span class="status-badge ${order.status === "CLOSED" ? "ok" : order.status === "IN_PROGRESS" ? "warning" : "info"}">${order.status}</span></td>
                    </tr>`
                )
                .join("") || `<tr><td colspan="5" class="empty-state">Aucun ordre en cours.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
      <section class="wms-panel">
        <div class="panel-header">
          <h3>Charges détaillées</h3>
          <p>Top commandes avec lignes détaillées.</p>
        </div>
        <div class="wms-mini-columns">
          ${orders.slice(0, 4)
            .map(
              (order) => `
                <article class="wms-mini-card">
                  <header>
                    <strong>${order.reference}</strong>
                    <span>${order.lines?.length || 0} lignes</span>
                  </header>
                  <div>
                    ${(order.lines || [])
                      .map((line) => `<p>${line.item_id} · ${formatNumber(line.expected_qty || 0)} u</p>`)
                      .join("") || `<p class="empty-state">Aucune ligne</p>`}
                  </div>
                </article>`
            )
            .join("") || `<p class="empty-state">Sélectionnez un ordre pour voir le détail.</p>`}
        </div>
      </section>
    </div>
  `;

  return {
    title: "Réceptions",
    subtitle: "Ordres entrants et détails fournisseurs.",
    html
  };
}
