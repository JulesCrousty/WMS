import { safeApiGet } from "./api.js";
import { formatNumber, formatDate } from "./utils.js";

export async function renderWmsTransfers() {
  const transfers = await safeApiGet("/api/wms/transfers", []);
  const html = `
    <section class="wms-panel">
      <div class="panel-header">
        <h3>Transferts & préparations</h3>
        <p>Commandes inter-sites en cours.</p>
      </div>
      <div class="wms-table">
        <table>
          <thead>
            <tr>
              <th>Référence</th>
              <th>Client / Site</th>
              <th>Entrepôt</th>
              <th>Expédition</th>
              <th>Progression</th>
            </tr>
          </thead>
          <tbody>
            ${transfers
              .map((transfer) => {
                const progress = Number(transfer.ordered_qty || 0) === 0
                  ? 0
                  : Math.min(100, Math.round((Number(transfer.picked_qty || 0) / Number(transfer.ordered_qty || 1)) * 100));
                return `
                  <tr>
                    <td>${transfer.reference}</td>
                    <td>${transfer.customer_name || "Site"}</td>
                    <td>${transfer.warehouse_name || "-"}</td>
                    <td>${formatDate(transfer.shipping_date)}</td>
                    <td>
                      <div class="progress">
                        <div style="width:${progress}%"></div>
                      </div>
                      <small>${formatNumber(transfer.picked_qty || 0)} / ${formatNumber(transfer.ordered_qty || 0)} u</small>
                    </td>
                  </tr>`;
              })
              .join("") || `<tr><td colspan="5" class="empty-state">Pas de transfert en attente.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
  return {
    title: "Transferts inter-sites",
    subtitle: "Préparations et missions inter-sites.",
    html
  };
}
