import { safeApiGet } from "./api.js";
import { formatNumber } from "./utils.js";

export async function renderWmsItems() {
  const [items, stock] = await Promise.all([
    safeApiGet("/items", []),
    safeApiGet("/api/wms/stock/by-item", [])
  ]);
  const quantities = new Map(stock.map((row) => [row.id || row.item_id, row.quantity]));
  const rows = items.map((item) => ({
    ...item,
    quantity: quantities.get(item.id) || 0
  }));

  const html = `
    <section class="wms-panel">
      <div class="panel-header">
        <h3>Catalogue articles</h3>
        <p>Référentiel et niveaux de stock par site.</p>
      </div>
      <div class="wms-table">
        <div class="wms-table-toolbar">
          <input type="search" placeholder="Rechercher un SKU" data-filter-input />
        </div>
        <table data-filter-table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Libellé</th>
              <th>Unité</th>
              <th>Stock</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (item) => `
                  <tr>
                    <td>${item.sku}</td>
                    <td>${item.name}</td>
                    <td>${item.unit || "-"}</td>
                    <td>${formatNumber(item.quantity || 0)}</td>
                    <td><span class="status-badge ${item.is_active ? "ok" : "warning"}">${item.is_active ? "Actif" : "Inactif"}</span></td>
                  </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;

  return {
    title: "Articles",
    subtitle: "Référentiel articles et quantités disponibles.",
    html,
    onMount: (node) => {
      const input = node.querySelector("[data-filter-input]");
      const table = node.querySelector("[data-filter-table]");
      if (!input || !table) return;
      input.addEventListener("input", () => {
        const value = input.value.toLowerCase();
        table.querySelectorAll("tbody tr").forEach((row) => {
          const text = row.textContent.toLowerCase();
          row.style.display = text.includes(value) ? "" : "none";
        });
      });
    }
  };
}
