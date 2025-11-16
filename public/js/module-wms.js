import { renderWmsShell } from "./wms-shell.js";
import { renderWmsDashboard } from "./wms-dashboard.js";
import { renderWmsSites } from "./wms-sites.js";
import { renderWmsWarehouses } from "./wms-warehouses.js";
import { renderWmsItems } from "./wms-items.js";
import { renderWmsInbound } from "./wms-inbound.js";
import { renderWmsTransfers } from "./wms-transfers.js";
import { renderWmsInventory } from "./wms-inventory.js";
import { safeApiGet } from "./api.js";
import { filterSectionsForUser } from "./wms-permissions.js";

const SECTION_DEFINITIONS = [
  { id: "dashboard", label: "Dashboard siège", permissions: ["WMS_STOCK_VIEW"], component: renderWmsDashboard },
  { id: "sites", label: "Sites distants", permissions: ["WMS_STOCK_VIEW"], component: renderWmsSites },
  { id: "warehouses", label: "Entrepôts", permissions: ["WMS_STOCK_VIEW", "WMS_WAREHOUSE_MANAGE"], component: renderWmsWarehouses },
  { id: "items", label: "Articles", permissions: ["WMS_ITEM_VIEW", "WMS_ITEM_MANAGE"], component: renderWmsItems },
  { id: "inbound", label: "Réceptions", permissions: ["WMS_INBOUND_RECEIVE", "WMS_INBOUND_MANAGE"], component: renderWmsInbound },
  { id: "transfers", label: "Transferts inter-sites", permissions: ["WMS_TRANSFER_MANAGE"], component: renderWmsTransfers },
  { id: "inventories", label: "Inventaires", permissions: ["WMS_INVENTORY_COUNT", "WMS_INVENTORY_MANAGE"], component: renderWmsInventory }
];

const navigation = SECTION_DEFINITIONS.map(({ id, label, permissions }) => ({ id, label, permissions }));

let cachedSites = [];
let activeSiteId = null;

async function ensureSites(forceRefresh = false) {
  if (!cachedSites.length || forceRefresh) {
    cachedSites = await safeApiGet("/api/wms/sites", []);
    if (!activeSiteId && cachedSites.length) {
      activeSiteId = cachedSites[0].id;
    }
  }
  const activeSite = cachedSites.find((site) => Number(site.id) === Number(activeSiteId)) || cachedSites[0] || null;
  activeSiteId = activeSite?.id || null;
  return {
    sites: cachedSites,
    activeSiteId: activeSite?.id || null,
    activeSite
  };
}

export const wmsModule = {
  id: "wms",
  label: "Logistique & WMS",
  shortLabel: "WMS",
  description: "Pilotage complet des flux logistiques Orion.",
  icon: "🚚",
  accent: "var(--module-wms)",
  permissions: ["WMS_ACCESS"],
  defaultSection: "dashboard",
  navigation,
  async render(sectionId, context = {}) {
    const availableSections = (context.navigation?.length
      ? SECTION_DEFINITIONS.filter((section) => context.navigation.some((entry) => entry.id === section.id))
      : filterSectionsForUser(SECTION_DEFINITIONS, context.user)).filter(Boolean);
    const target = availableSections.find((section) => section.id === sectionId) || availableSections[0] || SECTION_DEFINITIONS[0];
    const siteContext = await ensureSites();
    const renderer = target.component || renderWmsDashboard;
    const content = await renderer({ user: context.user, siteContext });
    return renderWmsShell({
      section: target,
      siteContext,
      content,
      onSiteChange: (nextSiteId) => {
        activeSiteId = Number(nextSiteId) || null;
        context.rerender?.();
      }
    });
  }
};
