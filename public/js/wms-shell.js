import { formatNumber } from "./utils.js";

function renderKpiCard(kpi) {
  return `
    <article class="wms-kpi-card">
      <div>
        <span class="wms-kpi-label">${kpi.label}</span>
        ${kpi.trend ? `<small class="wms-kpi-trend ${kpi.trend >= 0 ? "up" : "down"}">${kpi.trend >= 0 ? "▲" : "▼"} ${Math.abs(kpi.trend)}%</small>` : ""}
      </div>
      <strong>${formatNumber(kpi.value || 0)}${kpi.suffix ? `<span>${kpi.suffix}</span>` : ""}</strong>
    </article>
  `;
}

export function renderWmsShell({ section, siteContext, content, onSiteChange }) {
  const activeSiteId = siteContext?.activeSiteId || null;
  const sites = siteContext?.sites || [];
  const siteSelect = sites.length
    ? `
        <label class="wms-site-selector">
          <span>Site actif</span>
          <select data-site-selector>
            ${sites
              .map((site) => `<option value="${site.id}" ${Number(activeSiteId) === Number(site.id) ? "selected" : ""}>${site.name}</option>`)
              .join("")}
          </select>
        </label>
      `
    : "";
  const kpiRow = content.kpis?.length
    ? `<div class="wms-kpi-grid">${content.kpis.map((kpi) => renderKpiCard(kpi)).join("")}</div>`
    : "";
  return {
    title: content.title || section.label,
    subtitle: content.subtitle || "",
    html: `
      <div class="wms-shell">
        <header class="wms-shell-header">
          <div>
            <p class="wms-breadcrumb">Orion WMS / ${section.label}</p>
            <h2>${content.title || section.label}</h2>
            ${content.subtitle ? `<p>${content.subtitle}</p>` : ""}
          </div>
          <div class="wms-shell-actions">
            ${siteSelect}
            ${content.actions || ""}
          </div>
        </header>
        ${kpiRow}
        <div class="wms-section-body">
          ${content.html || ""}
        </div>
      </div>
    `,
    onMount: (root) => {
      const selector = root.querySelector("[data-site-selector]");
      if (selector && typeof onSiteChange === "function") {
        selector.addEventListener("change", (event) => onSiteChange(event.target.value));
      }
      if (typeof content.onMount === "function") {
        const target = root.querySelector(".wms-section-body") || root;
        content.onMount(target);
      }
    }
  };
}
