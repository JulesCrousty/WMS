import { safeApiGet } from "./api.js";
import { formatNumber, formatDate } from "./utils.js";

const navigation = [
  { id: "dashboard", label: "Dashboard" },
  { id: "receptions", label: "Réceptions" },
  { id: "preparations", label: "Préparations" },
  { id: "stock", label: "Stock" },
  { id: "inventaires", label: "Inventaires" }
];

export const wmsModule = {
  id: "wms",
  label: "Logistique & WMS",
  shortLabel: "WMS",
  description: "Supervisez l'exécution des flux logistiques en temps réel.",
  icon: "🚚",
  accent: "var(--module-wms)",
  permissions: ["WMS_ACCESS"],
  defaultSection: "dashboard",
  navigation,
  async render(section) {
    switch (section) {
      case "receptions":
        return renderReceptions();
      case "preparations":
        return renderPreparations();
      case "stock":
        return renderStock();
      case "inventaires":
        return renderInventories();
      default:
        return renderDashboard();
    }
  }
};

function renderTable(rows, columns) {
  if (!rows || rows.length === 0) {
    return `<p class="empty-state">Aucune donnée disponible.</p>`;
  }
  return `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            ${columns.map((column) => `<th>${column.label}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => `
              <tr>
                ${columns
                  .map((column) => {
                    const value = row[column.key];
                    if (column.type === "date") {
                      return `<td>${formatDate(value)}</td>`;
                    }
                    if (column.type === "number") {
                      return `<td>${formatNumber(value)}</td>`;
                    }
                    if (column.render) {
                      return `<td>${column.render(row)}</td>`;
                    }
                    return `<td>${value ?? "-"}</td>`;
                  })
                  .join("")}
              </tr>
            `)
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function renderDashboard() {
  const [overview, pendingInbounds, openOutbounds, stockByItem] = await Promise.all([
    safeApiGet("/erp/overview", { modules: {} }),
    safeApiGet("/reports/pending-inbounds", []),
    safeApiGet("/reports/open-outbounds", []),
    safeApiGet("/reports/stock-by-item", [])
  ]);
  const wmsData = overview.modules?.wms || {};
  const kpis = [
    { label: "Réceptions ouvertes", value: wmsData.open_inbounds },
    { label: "Préparations ouvertes", value: wmsData.open_outbounds },
    { label: "Stock total", value: wmsData.stock_quantity, suffix: "u" },
    { label: "Tâches en attente", value: wmsData.pending_tasks }
  ];
  return {
    title: "Pilotage des opérations",
    subtitle: "Vue synthétique des flux WMS.",
    html: `
      <div class="panel">
        <h2>Indicateurs clés</h2>
        <div class="kpi-grid">
          ${kpis
            .map(
              (kpi) => `
                <div class="kpi-card">
                  <span>${kpi.label}</span>
                  <strong>${formatNumber(kpi.value || 0)}</strong>
                  ${kpi.suffix ? `<small>${kpi.suffix}</small>` : ""}
                </div>`
            )
            .join("")}
        </div>
      </div>
      <div class="panel-grid">
        <section class="panel">
          <h3>Réceptions prioritaires</h3>
          ${renderTable(pendingInbounds, [
            { key: "reference", label: "Référence" },
            { key: "supplier_name", label: "Fournisseur" },
            { key: "status", label: "Statut" },
            { key: "expected_date", label: "Date prévue", type: "date" }
          ])}
        </section>
        <section class="panel">
          <h3>Préparations à expédier</h3>
          ${renderTable(openOutbounds, [
            { key: "reference", label: "Référence" },
            { key: "customer_name", label: "Client" },
            { key: "status", label: "Statut" },
            { key: "shipping_date", label: "Expédition", type: "date" }
          ])}
        </section>
        <section class="panel">
          <h3>Top 5 articles en stock</h3>
          ${renderTable((stockByItem || []).slice(0, 5), [
            { key: "sku", label: "SKU" },
            { key: "name", label: "Libellé" },
            { key: "quantity", label: "Stock", type: "number" }
          ])}
        </section>
      </div>
    `
  };
}

async function renderReceptions() {
  const pendingInbounds = await safeApiGet("/reports/pending-inbounds", []);
  const supplierList = Array.from(
    new Map(pendingInbounds.map((order) => [order.supplier_name, order])).values()
  ).slice(0, 6);
  return {
    title: "Flux entrants",
    subtitle: "Suivi des ordres de réception et fournisseurs.",
    html: `
      <div class="panel-grid">
        <section class="panel">
          <h3>Ordres entrants</h3>
          ${renderTable(pendingInbounds, [
            { key: "reference", label: "Référence" },
            { key: "supplier_name", label: "Fournisseur" },
            { key: "expected_date", label: "Date prévue", type: "date" },
            { key: "status", label: "Statut" }
          ])}
        </section>
        <section class="panel">
          <h3>Fournisseurs actifs</h3>
          <ul>
            ${supplierList
              .map((supplier) => `<li><strong>${supplier.supplier_name || "-"}</strong></li>`)
              .join("")}
          </ul>
        </section>
      </div>
    `
  };
}

async function renderPreparations() {
  const orders = await safeApiGet("/reports/open-outbounds", []);
  return {
    title: "Flux sortants",
    subtitle: "Préparations et commandes clients.",
    html: `
      <section class="panel">
        <h3>Commandes ouvertes</h3>
        ${renderTable(orders, [
          { key: "reference", label: "Référence" },
          { key: "customer_name", label: "Client" },
          { key: "status", label: "Statut" },
          { key: "shipping_date", label: "Expédition", type: "date" }
        ])}
      </section>
    `
  };
}

async function renderStock() {
  const stock = await safeApiGet("/reports/stock-by-item", []);
  return {
    title: "Inventaire permanent",
    subtitle: "Vision consolidée des stocks.",
    html: `
      <section class="panel">
        <h3>Articles</h3>
        ${renderTable(stock, [
          { key: "sku", label: "SKU" },
          { key: "name", label: "Libellé" },
          { key: "quantity", label: "Quantité", type: "number" }
        ])}
      </section>
    `
  };
}

async function renderInventories() {
  const inventories = await safeApiGet("/inventory-counts", []);
  return {
    title: "Inventaires & cycles",
    subtitle: "Suivi des campagnes de comptage.",
    html: `
      <section class="panel">
        <h3>Inventaires récents</h3>
        ${renderTable(inventories, [
          { key: "id", label: "#" },
          { key: "warehouse_name", label: "Entrepôt" },
          { key: "status", label: "Statut" },
          { key: "started_at", label: "Ouverture", type: "date" }
        ])}
      </section>
    `
  };
}
