import { safeApiGet } from "./api.js";
import { formatNumber } from "./utils.js";

export async function renderWmsWarehouses() {
  const warehouses = await safeApiGet("/api/wms/warehouses", []);
  const html = `
    <section class="wms-panel">
      <div class="panel-header">
        <h3>Entrepôts</h3>
        <p>Capacité et activité par entrepôt.</p>
      </div>
      <div class="wms-table">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Nom</th>
              <th>Site</th>
              <th>Zones</th>
              <th>Stock</th>
            </tr>
          </thead>
          <tbody>
            ${warehouses
              .map(
                (warehouse) => `
                  <tr>
                    <td>${warehouse.code}</td>
                    <td>${warehouse.name}</td>
                    <td>${warehouse.site_name || "-"}</td>
                    <td>${formatNumber(warehouse.locations || 0)}</td>
                    <td><span class="status-badge ok">${formatNumber(warehouse.stock_quantity || 0)} u</span></td>
                  </tr>`
              )
              .join("") || `<tr><td colspan="5" class="empty-state">Aucun entrepôt accessible.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
  return {
    title: "Entrepôts",
    subtitle: "Détails des entrepôts et capacité de stockage.",
    html
  };
}
