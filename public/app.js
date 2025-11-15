const appRoot = document.getElementById("app");

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "🏠" },
  { id: "inbound", label: "Flux entrants", icon: "📥", permissions: ["WMS_ACCESS"] },
  { id: "outbound", label: "Flux sortants", icon: "📦", permissions: ["WMS_ACCESS"] },
  { id: "stock", label: "Stock", icon: "📊", permissions: ["WMS_ACCESS"] },
  { id: "locations", label: "Emplacements", icon: "📍", permissions: ["WMS_ACCESS"] },
  { id: "movements", label: "Mouvements internes", icon: "🔁", permissions: ["WMS_ACCESS"] },
  { id: "inventory", label: "Inventaires", icon: "✅", permissions: ["WMS_ACCESS"] },
  { id: "finance", label: "Finance / Comptabilité", icon: "💶", permissions: ["FINANCE_ACCESS"] },
  { id: "hr", label: "RH & Personnel", icon: "👥", permissions: ["HR_ACCESS"] },
  { id: "payroll", label: "Paie", icon: "💼", permissions: ["PAYROLL_ACCESS"] },
  { id: "reporting", label: "Reporting transverse", icon: "📈", permissions: ["REPORTING_ACCESS"] },
  { id: "admin", label: "Administration", icon: "⚙️", permissions: ["CAN_MANAGE_USERS", "CAN_MANAGE_RULES", "CORE_SETTINGS"] },
  { id: "operator", label: "Mode opérateur", icon: "🤖", permissions: ["CAN_EXECUTE_TASKS"] }
];

const state = {
  token: localStorage.getItem("wms_token"),
  user: (() => {
    const raw = localStorage.getItem("wms_user");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  })(),
  currentView: "dashboard",
  viewParams: {},
  sidebarCollapsed: localStorage.getItem("wms_sidebar_collapsed") === "true"
};

if (state.user && !Array.isArray(state.user.permissions)) {
  state.user.permissions = [];
}

if (!state.token || !state.user) {
  state.currentView = "login";
}

let shellBuilt = false;
let mainViewEl = null;
let messageEl = null;

window.addEventListener("hashchange", () => {
  const target = window.location.hash.replace("#", "") || "dashboard";
  if (!state.token) {
    if (target !== "login") {
      window.location.hash = "login";
    }
    renderLogin();
    return;
  }
  if (target !== state.currentView) {
    setView(target, {});
  }
});

function persistSession() {
  if (state.token && state.user) {
    localStorage.setItem("wms_token", state.token);
    localStorage.setItem("wms_user", JSON.stringify(state.user));
  }
}

function clearSession() {
  localStorage.removeItem("wms_token");
  localStorage.removeItem("wms_user");
  state.token = null;
  state.user = null;
  state.currentView = "login";
  state.viewParams = {};
  state.sidebarCollapsed = false;
  shellBuilt = false;
}

function persistLayout() {
  localStorage.setItem("wms_sidebar_collapsed", state.sidebarCollapsed ? "true" : "false");
}

function hasPermission(permission) {
  return state.user?.permissions?.includes(permission);
}

const ADMIN_ROLES = ["ADMIN_SYSTEME"];
const OPERATOR_ROLES = ["ADMIN_SYSTEME", "RESP_LOGISTIQUE", "OPERATEUR_ENTREPOT"];
const READ_ONLY_ROLES = ["VIEWER_GLOBAL"];

function isAdmin() {
  return state.user ? ADMIN_ROLES.includes(state.user.role) : false;
}

function canOperate() {
  return state.user ? OPERATOR_ROLES.includes(state.user.role) : false;
}

function canEditItems() {
  if (!state.user) return false;
  return !READ_ONLY_ROLES.includes(state.user.role);
}

function authHeaders() {
  return state.token ? { Authorization: `Bearer ${state.token}` } : {};
}

async function apiFetch(path, options = {}) {
  const config = { ...options };
  config.headers = {
    "Content-Type": options.body ? "application/json" : undefined,
    ...authHeaders(),
    ...options.headers
  };
  if (!options.body) {
    delete config.headers["Content-Type"];
  }
  const response = await fetch(path, config);
  if (response.status === 401 || response.status === 403) {
    clearSession();
    renderLogin();
    showInlineMessage("error", "Session expirée. Veuillez vous reconnecter.");
    throw new Error("Unauthorized");
  }
  if (!response.ok) {
    let message = "Une erreur est survenue";
    try {
      const data = await response.json();
      if (data?.error) {
        message = data.error;
      }
    } catch (err) {
      // ignore json parse errors
    }
    throw new Error(message);
  }
  if (response.status === 204) {
    return null;
  }
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch (err) {
    return text;
  }
}

async function safeApiFetch(path, fallback = null, options = {}) {
  try {
    return await apiFetch(path, options);
  } catch (error) {
    console.warn("API warning", path, error.message);
    return fallback;
  }
}

function showInlineMessage(type, text) {
  if (!messageEl) return;
  messageEl.innerHTML = `<div class="alert ${type}">${text}</div>`;
}

function clearMessage() {
  if (messageEl) {
    messageEl.innerHTML = "";
  }
}

function renderLogin() {
  if (window.location.hash !== "#login") {
    window.location.hash = "login";
  }
  appRoot.innerHTML = `
    <div class="login-wrapper">
      <h1>ERP</h1>
      <p>Connectez-vous pour piloter la logistique, la finance et le capital humain.</p>
      <form id="login-form">
        <div class="form-group">
          <label for="username">Identifiant</label>
          <input id="username" name="username" type="text" autocomplete="username" required />
        </div>
        <div class="form-group">
          <label for="password">Mot de passe</label>
          <input id="password" name="password" type="password" autocomplete="current-password" required />
        </div>
        <button class="primary" type="submit">Se connecter</button>
      </form>
    </div>
  `;
  shellBuilt = false;
  const form = document.getElementById("login-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();
    form.querySelector("button").disabled = true;
    const formData = new FormData(form);
    const payload = {
      username: formData.get("username"),
      password: formData.get("password")
    };
    try {
      const result = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      state.token = result.token;
      state.user = result.user;
      persistSession();
      setTimeout(() => {
        buildShell();
        setView("dashboard", {}, { skipHash: false });
        showInlineMessage("success", "Bienvenue !");
      }, 50);
    } catch (err) {
      showInlineMessage("error", err.message);
    } finally {
      form.querySelector("button").disabled = false;
    }
  });
}

function buildShell() {
  shellBuilt = true;
  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.permissions || item.permissions.some((permission) => hasPermission(permission))
  );
  const canUseOperator = hasPermission("CAN_EXECUTE_TASKS");
  appRoot.innerHTML = `
    <div class="app-shell ${state.sidebarCollapsed ? "sidebar-collapsed" : ""}">
      <aside class="sidebar ${state.sidebarCollapsed ? "collapsed" : ""}">
        <div class="sidebar-header">
          <div class="sidebar-brand">
            <span class="logo">ERP</span>
            <span class="subtitle">Modules</span>
          </div>
          <button id="sidebar-collapse" class="icon-button" aria-label="Basculer le menu">☰</button>
        </div>
        <nav id="sidebar-nav">
          ${visibleNavItems
            .map(
              (item) => `
                <a class="nav-link" data-view="${item.id}" href="#${item.id}">
                  <span class="nav-icon">${item.icon || ""}</span>
                  <span class="nav-label">${item.label}</span>
                </a>`
            )
            .join("")}
        </nav>
        <div class="sidebar-footer">
          Ultra WMS — ${new Date().getFullYear()}
        </div>
      </aside>
      <div class="content-area">
        <header class="app-header">
          <div class="header-left">
            <button id="header-menu-toggle" class="icon-button" aria-label="Menu">☰</button>
            <div>
              <div class="user-name">${state.user?.username || ""}</div>
              <div class="badge">${state.user?.role || ""}</div>
            </div>
          </div>
          <div class="header-actions">
            ${canUseOperator ? `<button id="operator-shortcut" class="accent ghost">Mode opérateur</button>` : ""}
            <button id="logout-button" class="ghost">Déconnexion</button>
          </div>
        </header>
        <section id="message-area"></section>
        <main id="main-view"></main>
      </div>
    </div>
  `;
  mainViewEl = document.getElementById("main-view");
  messageEl = document.getElementById("message-area");
  document.getElementById("logout-button").addEventListener("click", () => {
    clearSession();
    renderLogin();
  });
  const operatorButton = document.getElementById("operator-shortcut");
  operatorButton?.addEventListener("click", () => setView("operator"));
  document.getElementById("sidebar-collapse").addEventListener("click", toggleSidebar);
  document.getElementById("header-menu-toggle").addEventListener("click", toggleSidebar);
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const view = link.dataset.view;
      setView(view);
    });
  });
}

function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  persistLayout();
  if (shellBuilt) {
    document.querySelector(".app-shell").classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
    document.querySelector(".sidebar").classList.toggle("collapsed", state.sidebarCollapsed);
  }
}

function setView(view, params = {}, options = {}) {
  if (!state.token) {
    renderLogin();
    return;
  }
  if (!shellBuilt) {
    buildShell();
  }
  const targetNav = NAV_ITEMS.find((item) => item.id === view);
  if (targetNav && targetNav.permissions && !targetNav.permissions.some((permission) => hasPermission(permission))) {
    showInlineMessage("error", "Vous n'avez pas accès à ce module.");
    if (view !== "dashboard") {
      setView("dashboard", {}, { skipHash: false });
    }
    return;
  }
  state.currentView = view;
  state.viewParams = params || {};
  if (!options.skipHash) {
    window.location.hash = `#${view}`;
  }
  updateActiveNav();
  renderView();
}

function updateActiveNav() {
  document.querySelectorAll(".nav-link").forEach((link) => {
    if (link.dataset.view === state.currentView) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return date.toLocaleDateString("fr-FR");
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  return date.toLocaleString("fr-FR");
}

function formatQuantity(value) {
  if (value === null || value === undefined) return "0";
  return Number(value).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

function formatAuditDetails(details) {
  if (!details || (typeof details === "object" && Object.keys(details).length === 0)) {
    return "-";
  }
  let data = details;
  if (typeof details === "string") {
    try {
      data = JSON.parse(details);
    } catch (err) {
      return details;
    }
  }
  if (Array.isArray(data)) {
    return data.join(", ");
  }
  if (typeof data === "object") {
    return Object.entries(data)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => `${key}: ${value}`)
      .join(", ");
  }
  return String(data);
}

const TABLE_LABELS = {
  reference: "Référence",
  supplier_name: "Fournisseur",
  customer_name: "Client",
  status: "Statut",
  expected_date: "Date prévue",
  shipping_date: "Expédition",
  quantity: "Quantité"
};

function renderSimpleTable(rows = [], columns = []) {
  if (!rows || rows.length === 0) {
    return `<p class="empty-state">Aucune donnée.</p>`;
  }
  return `
    <div class="table-wrapper compact">
      <table>
        <thead>
          <tr>
            ${columns.map((col) => `<th>${TABLE_LABELS[col] || col}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => `
              <tr>
                ${columns
                  .map((col) => {
                    if (col === "status") {
                      return `<td>${renderStatusBadge(row[col])}</td>`;
                    }
                    if (col.includes("date")) {
                      return `<td>${formatDate(row[col])}</td>`;
                    }
                    return `<td>${row[col] || "-"}</td>`;
                  })
                  .join("")}
              </tr>`)
            .join("")}
        </tbody>
      </table>
    </div>`;
}

function renderHeatmapPreview(warehouses = []) {
  if (!warehouses.length) {
    return `<p class="empty-state">Cartographie non disponible.</p>`;
  }
  return `
    <div class="heatmap">
      ${warehouses
        .map((warehouse) => {
          const locations = Array.isArray(warehouse.locations)
            ? warehouse.locations
            : [];
          return `
            <div class="heatmap-warehouse">
              <h3>${warehouse.name}</h3>
              <div class="heatmap-grid">
                ${locations
                  .map((loc) => {
                    const capacity = Number(loc.capacity || 100);
                    const quantity = Number(loc.quantity || 0);
                    const fill = Math.min(100, Math.round((quantity / capacity) * 100));
                    return `<span class="heatmap-cell" title="${loc.code} — ${formatQuantity(quantity)}">${fill}%</span>`;
                  })
                  .join("")}
              </div>
            </div>`;
        })
        .join("")}
    </div>`;
}

function renderView() {
  clearMessage();
  if (!mainViewEl) return;
  switch (state.currentView) {
    case "dashboard":
      renderDashboard();
      break;
    case "items":
      renderItems(state.viewParams);
      break;
    case "warehouses":
    case "locations":
      renderWarehouses(state.viewParams);
      break;
    case "inbound":
      renderInbound(state.viewParams);
      break;
    case "outbound":
      renderOutbound(state.viewParams);
      break;
    case "stock":
      renderStock(state.viewParams);
      break;
    case "movements":
      renderMovements();
      break;
    case "inventory":
      renderInventory(state.viewParams);
      break;
    case "reporting":
    case "reports":
      renderReporting();
      break;
    case "finance":
      renderFinance();
      break;
    case "hr":
      renderHumanResources();
      break;
    case "payroll":
      renderPayroll();
      break;
    case "admin":
      renderAdministration();
      break;
    case "operator":
      renderOperatorView();
      break;
    default:
      renderDashboard();
      break;
  }
}

async function renderDashboard() {
  mainViewEl.innerHTML = `<div class="loader">Chargement du tableau de bord...</div>`;
  try {
    const [overview, pendingInbounds, openOutbounds, stockByItem, tasks, heatmapData, operatorActivity] = await Promise.all([
      safeApiFetch("/erp/overview", { modules: {} }),
      safeApiFetch("/reports/pending-inbounds", []),
      safeApiFetch("/reports/open-outbounds", []),
      safeApiFetch("/reports/stock-by-item", []),
      safeApiFetch("/tasks", []),
      safeApiFetch("/warehouse-map", []),
      safeApiFetch("/reports/operator-activity", { tasks: [], movements: [] })
    ]);
    const modules = overview?.modules || {};
    const financeModule = modules.finance || null;
    const hrModule = modules.hr || null;
    const payrollModule = modules.payroll || null;
    const totalStock = stockByItem.reduce((sum, row) => sum + Number(row.total_quantity || 0), 0);
    const pendingTasks = tasks.filter((task) => task.status === "PENDING");
    const replenishments = pendingTasks.filter((task) => task.type === "REPLENISHMENT");
    const cycleCounts = pendingTasks.filter((task) => task.type === "CYCLE_COUNT");
    const heatmapPreview = renderHeatmapPreview(heatmapData || []);
    mainViewEl.innerHTML = `
      <div class="view-header">
        <h1>ERP — cockpit temps réel</h1>
        <p>Navigation ultra rapide, 1 clic vers chaque module.</p>
      </div>
      <div class="metrics-grid">
        <div class="metric">
          <span>Réceptions ouvertes</span>
          <strong>${pendingInbounds.length}</strong>
        </div>
        <div class="metric">
          <span>Commandes à expédier</span>
          <strong>${openOutbounds.length}</strong>
        </div>
        <div class="metric">
          <span>Tâches internes actives</span>
          <strong>${pendingTasks.length}</strong>
        </div>
        <div class="metric">
          <span>Stock global</span>
          <strong>${formatQuantity(totalStock)}</strong>
        </div>
        ${financeModule
          ? `<div class="metric emphasis">
              <span>Factures brouillon</span>
              <strong>${financeModule.draft_invoices}</strong>
              <small>${financeModule.overdue_invoices} en retard</small>
            </div>`
          : ""}
        ${hrModule
          ? `<div class="metric emphasis">
              <span>Effectif actif</span>
              <strong>${hrModule.active_employees}</strong>
              <small>${hrModule.pending_leaves} congés à valider</small>
            </div>`
          : ""}
        ${payrollModule
          ? `<div class="metric emphasis">
              <span>Campagnes de paie ouvertes</span>
              <strong>${payrollModule.open_runs}</strong>
              <small>${payrollModule.payslips_current_month} bulletins ce mois</small>
            </div>`
          : ""}
      </div>
      <div class="grid-responsive">
        <section class="panel">
          <div class="panel-title">
            <h2>Ruptures imminentes</h2>
            <span>${replenishments.length} réappros</span>
          </div>
          ${replenishments.length
            ? `<ul class="simple-list">${replenishments
                .slice(0, 5)
                .map((task) => `<li><strong>${task.metadata?.location_code || task.metadata?.location_id}</strong><span>Min ${formatQuantity(task.metadata?.min_qty || 0)}</span></li>`)
                .join("")}</ul>`
            : `<p class="empty-state">Aucune alerte.</p>`}
        </section>
        <section class="panel">
          <div class="panel-title">
            <h2>Inventaires tournants</h2>
            <span>${cycleCounts.length} à effectuer</span>
          </div>
          ${cycleCounts.length
            ? `<ul class="simple-list">${cycleCounts
                .slice(0, 5)
                .map((task) => `<li>${task.metadata?.location_id ? `Emplacement ${task.metadata.location_id}` : task.type}</li>`)
                .join("")}</ul>`
            : `<p class="empty-state">Aucune mission en attente.</p>`}
        </section>
        <section class="panel">
          <div class="panel-title">
            <h2>Heatmap instantanée</h2>
            <span>Visualisez les zones pleines</span>
          </div>
          ${heatmapPreview}
        </section>
      </div>
      <div class="quick-links">
        <button class="primary" data-link="operator">Mode opérateur</button>
        <button class="secondary" data-link="inbound">Lancer une réception</button>
        <button class="secondary" data-link="outbound">Optimiser le picking</button>
        <button class="secondary" data-link="reporting">Reporting avancé</button>
      </div>
    `;
    mainViewEl.querySelectorAll("[data-link]").forEach((btn) => {
      btn.addEventListener("click", () => setView(btn.dataset.link));
    });
  } catch (err) {
    showInlineMessage("error", err.message);
    mainViewEl.innerHTML = `<div class="empty-state">Impossible de charger les données.</div>`;
  }
}

async function renderItems(params = {}) {
  const search = params.search || "";
  mainViewEl.innerHTML = `<div class="loader">Chargement des articles...</div>`;
  try {
    const query = search ? `?search=${encodeURIComponent(search)}` : "";
    const items = await apiFetch(`/items${query}`);
    const hasItems = items.length > 0;
    mainViewEl.innerHTML = `
      <div class="view-header">
        <h1>Articles</h1>
      </div>
      <section class="panel">
        <form id="item-search" class="inline-form">
          <input type="text" name="search" placeholder="Rechercher (SKU, libellé, code-barres)" value="${search}" />
          <button class="primary" type="submit">Rechercher</button>
          <button class="ghost" type="reset">Réinitialiser</button>
        </form>
      </section>
      <section class="panel">
        <h2>Catalogue</h2>
        ${hasItems
          ? `<div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Libellé</th>
                    <th>Code-barres</th>
                    <th>Unité</th>
                    <th>Statut</th>
                    ${canEditItems() ? "<th>Actions</th>" : ""}
                  </tr>
                </thead>
                <tbody>
                  ${items
                    .map((item) => `
                      <tr>
                        <td>${item.sku}</td>
                        <td>${item.name}</td>
                        <td>${item.barcode || "-"}</td>
                        <td>${item.unit}</td>
                        <td>${item.is_active ? '<span class="badge success">Actif</span>' : '<span class="badge">Inactif</span>'}</td>
                        ${canEditItems()
                          ? `<td class="table-actions">
                              <button class="secondary" data-edit-item='${JSON.stringify(item)}'>Modifier</button>
                              <button class="danger" data-deactivate="${item.id}" ${
                                !isAdmin() || !item.is_active ? "disabled" : ""
                              }>Désactiver</button>
                            </td>`
                          : ""}
                      </tr>
                    `)
                    .join("")}
                </tbody>
              </table>
            </div>`
          : `<p class="empty-state">Aucun article trouvé.</p>`}
      </section>
      ${canEditItems()
        ? `<section class="panel" id="item-form-panel">
            <h2 id="item-form-title">Créer un article</h2>
            <form id="item-form">
              <input type="hidden" name="id" />
              <div class="grid-two">
                <div class="form-group">
                  <label>SKU</label>
                  <input name="sku" type="text" required />
                </div>
                <div class="form-group">
                  <label>Libellé</label>
                  <input name="name" type="text" required />
                </div>
                <div class="form-group">
                  <label>Unité</label>
                  <input name="unit" type="text" value="PCS" required />
                </div>
                <div class="form-group">
                  <label>Code-barres</label>
                  <input name="barcode" type="text" />
                </div>
              </div>
              <div class="form-group">
                <label>Description</label>
                <textarea name="description" placeholder="Caractéristiques, usage..."></textarea>
              </div>
              <div class="inline-form">
                <button class="primary" type="submit">Enregistrer</button>
                <button class="ghost" type="button" id="reset-item-form">Annuler</button>
              </div>
            </form>
          </section>`
        : ""}
    `;

    const searchForm = document.getElementById("item-search");
    searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const term = new FormData(searchForm).get("search") || "";
      setView("items", { search: term });
    });
    searchForm.addEventListener("reset", (event) => {
      event.preventDefault();
      searchForm.querySelector("input[name='search']").value = "";
      setView("items", { search: "" });
    });

    if (canEditItems()) {
      const itemForm = document.getElementById("item-form");
      const resetButton = document.getElementById("reset-item-form");
      resetButton.addEventListener("click", () => {
        itemForm.reset();
        itemForm.querySelector("input[name='unit']").value = "PCS";
        itemForm.querySelector("input[name='id']").value = "";
        document.getElementById("item-form-title").textContent = "Créer un article";
      });
      itemForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(itemForm).entries());
        const payload = {
          sku: data.sku,
          name: data.name,
          unit: data.unit,
          barcode: data.barcode || null,
          description: data.description || null
        };
        const id = data.id;
        try {
          if (id) {
            await apiFetch(`/items/${id}`, {
              method: "PUT",
              body: JSON.stringify(payload)
            });
            showInlineMessage("success", "Article mis à jour");
          } else {
            await apiFetch("/items", {
              method: "POST",
              body: JSON.stringify(payload)
            });
            showInlineMessage("success", "Article créé");
          }
          setView("items", { search: state.viewParams.search || "" }, { skipHash: true });
        } catch (err) {
          showInlineMessage("error", err.message);
        }
      });

      document.querySelectorAll("[data-edit-item]").forEach((button) => {
        button.addEventListener("click", () => {
          const item = JSON.parse(button.dataset.editItem);
          itemForm.querySelector("input[name='id']").value = item.id;
          itemForm.querySelector("input[name='sku']").value = item.sku;
          itemForm.querySelector("input[name='name']").value = item.name;
          itemForm.querySelector("input[name='unit']").value = item.unit;
          itemForm.querySelector("input[name='barcode']").value = item.barcode || "";
          itemForm.querySelector("textarea[name='description']").value = item.description || "";
          document.getElementById("item-form-title").textContent = `Modifier l'article ${item.sku}`;
          window.scrollTo({ top: itemForm.offsetTop - 80, behavior: "smooth" });
        });
      });

      document.querySelectorAll("[data-deactivate]").forEach((button) => {
        button.addEventListener("click", async () => {
          const id = button.dataset.deactivate;
          if (!confirm("Confirmer la désactivation de cet article ?")) {
            return;
          }
          try {
            await apiFetch(`/items/${id}/deactivate`, { method: "POST" });
            showInlineMessage("success", "Article désactivé");
            setView("items", { search: state.viewParams.search || "" }, { skipHash: true });
          } catch (err) {
            showInlineMessage("error", err.message);
          }
        });
      });
    }
  } catch (err) {
    showInlineMessage("error", err.message);
    mainViewEl.innerHTML = `<div class="empty-state">Impossible de charger les articles.</div>`;
  }
}

async function renderWarehouses(params = {}) {
  mainViewEl.innerHTML = `<div class="loader">Chargement des entrepôts...</div>`;
  try {
    const warehouses = await apiFetch("/warehouses");
    const selectedId = params.warehouseId ? Number(params.warehouseId) : null;
    let locations = [];
    if (selectedId) {
      locations = await apiFetch(`/warehouses/${selectedId}/locations`);
    }
    mainViewEl.innerHTML = `
      <div class="view-header">
        <h1>Entrepôts</h1>
      </div>
      <section class="panel">
        <h2>Liste des entrepôts</h2>
        ${warehouses.length
          ? `<div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Nom</th>
                    <th>Adresse</th>
                    <th>Créé le</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${warehouses
                    .map(
                      (warehouse) => `
                        <tr>
                          <td>${warehouse.code}</td>
                          <td>${warehouse.name}</td>
                          <td>${warehouse.address || "-"}</td>
                          <td>${formatDate(warehouse.created_at)}</td>
                          <td>
                            <button class="secondary" data-view-locations="${warehouse.id}">Emplacements</button>
                          </td>
                        </tr>
                      `
                    )
                    .join("")}
                </tbody>
              </table>
            </div>`
          : `<p class="empty-state">Aucun entrepôt enregistré.</p>`}
      </section>
      ${isAdmin()
        ? `<section class="panel">
            <h2>Créer un entrepôt</h2>
            <form id="warehouse-form">
              <div class="grid-two">
                <div class="form-group">
                  <label>Code</label>
                  <input name="code" type="text" required />
                </div>
                <div class="form-group">
                  <label>Nom</label>
                  <input name="name" type="text" required />
                </div>
              </div>
              <div class="form-group">
                <label>Adresse</label>
                <textarea name="address" placeholder="Adresse complète"></textarea>
              </div>
              <button class="primary" type="submit">Créer</button>
            </form>
          </section>`
        : ""}
      ${selectedId
        ? `<section class="panel" id="locations-panel">
            <div class="view-header">
              <h2>Emplacements - ${warehouses.find((w) => w.id === selectedId)?.name || ""}</h2>
              <button class="ghost" id="close-locations">Fermer</button>
            </div>
            ${locations.length
              ? `<div class="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Type</th>
                        <th>Capacité</th>
                        <th>Créé le</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${locations
                        .map(
                          (loc) => `
                            <tr>
                              <td>${loc.code}</td>
                              <td>${loc.type}</td>
                              <td>${loc.capacity || "-"}</td>
                              <td>${formatDate(loc.created_at)}</td>
                            </tr>
                          `
                        )
                        .join("")}
                    </tbody>
                  </table>
                </div>`
              : `<p class="empty-state">Aucun emplacement pour cet entrepôt.</p>`}
            ${isAdmin()
              ? `<form id="location-form" class="section">
                  <h3>Ajouter un emplacement</h3>
                  <input type="hidden" name="warehouse_id" value="${selectedId}" />
                  <div class="grid-two">
                    <div class="form-group">
                      <label>Code</label>
                      <input name="code" type="text" required />
                    </div>
                    <div class="form-group">
                      <label>Type</label>
                      <select name="type" required>
                        <option value="STORAGE">Stockage</option>
                        <option value="PICKING">Picking</option>
                        <option value="RECEIVING">Quai réception</option>
                        <option value="SHIPPING">Quai expédition</option>
                        <option value="QUARANTINE">Quarantaine</option>
                      </select>
                    </div>
                  </div>
                  <div class="form-group">
                    <label>Capacité théorique</label>
                    <input name="capacity" type="number" min="0" step="1" />
                  </div>
                  <button class="primary" type="submit">Ajouter</button>
                </form>`
              : ""}
          </section>`
        : ""}
    `;

    document.querySelectorAll("[data-view-locations]").forEach((btn) => {
      btn.addEventListener("click", () => {
        setView("locations", { warehouseId: btn.dataset.viewLocations }, { skipHash: true });
      });
    });

    const closeBtn = document.getElementById("close-locations");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => setView("locations", {}, { skipHash: true }));
    }

    if (isAdmin()) {
      const warehouseForm = document.getElementById("warehouse-form");
      if (warehouseForm) {
        warehouseForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const data = Object.fromEntries(new FormData(warehouseForm).entries());
          try {
            await apiFetch("/warehouses", {
              method: "POST",
              body: JSON.stringify({
                code: data.code,
                name: data.name,
                address: data.address || null
              })
            });
            showInlineMessage("success", "Entrepôt créé");
            setView("locations", {}, { skipHash: true });
          } catch (err) {
            showInlineMessage("error", err.message);
          }
        });
      }

      const locationForm = document.getElementById("location-form");
      if (locationForm) {
        locationForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const formData = new FormData(locationForm);
          const payload = {
            warehouse_id: Number(formData.get("warehouse_id")),
            code: formData.get("code"),
            type: formData.get("type"),
            capacity: formData.get("capacity") ? Number(formData.get("capacity")) : null
          };
          try {
            await apiFetch("/locations", {
              method: "POST",
              body: JSON.stringify(payload)
            });
            showInlineMessage("success", "Emplacement créé");
            setView("locations", { warehouseId: payload.warehouse_id }, { skipHash: true });
          } catch (err) {
            showInlineMessage("error", err.message);
          }
        });
      }
    }
  } catch (err) {
    showInlineMessage("error", err.message);
    mainViewEl.innerHTML = `<div class="empty-state">Impossible de charger les entrepôts.</div>`;
  }
}

function createLineRow({ items, includeLocation = false, locations = [] }) {
  const row = document.createElement("div");
  row.className = "line-row";
  const itemOptions = items
    .map((item) => `<option value="${item.id}">${item.sku} — ${item.name}</option>`)
    .join("");
  const locationColumn = includeLocation
    ? `<select name="location_id" required>
        <option value="">Sélectionner...</option>
        ${locations.map((loc) => `<option value="${loc.id}">${loc.code}</option>`).join("")}
      </select>`
    : "<span></span>";
  row.innerHTML = `
    <select name="item_id" required>
      <option value="">Sélectionner...</option>
      ${itemOptions}
    </select>
    <input name="quantity" type="number" min="0" step="0.001" required />
    ${locationColumn}
    <button type="button" class="ghost" aria-label="Supprimer">✕</button>
  `;
  row.querySelector("button").addEventListener("click", () => row.remove());
  return row;
}

async function renderInbound(params = {}) {
  mainViewEl.innerHTML = `<div class="loader">Chargement des réceptions...</div>`;
  try {
    const [orders, warehouses, items] = await Promise.all([
      apiFetch("/inbound-orders"),
      apiFetch("/warehouses"),
      apiFetch("/items")
    ]);
    const selectedOrderId = params.orderId ? Number(params.orderId) : null;
    let selectedOrder = null;
    let locations = [];
    if (selectedOrderId) {
      selectedOrder = orders.find((order) => order.id === selectedOrderId) || null;
      if (selectedOrder) {
        locations = await apiFetch(`/warehouses/${selectedOrder.warehouse_id}/locations`);
      }
    }

    mainViewEl.innerHTML = `
      <div class="view-header">
        <h1>Réceptions</h1>
      </div>
      ${selectedOrder
        ? renderInboundDetail(selectedOrder, locations)
        : `
        <section class="panel">
          <h2>Ordres de réception</h2>
          ${orders.length
            ? `<div class="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Référence</th>
                      <th>Fournisseur</th>
                      <th>Entrepôt</th>
                      <th>Statut</th>
                      <th>Date prévue</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${orders
                      .map((order) => {
                        const warehouse = warehouses.find((w) => w.id === order.warehouse_id);
                        return `
                          <tr>
                            <td>${order.reference}</td>
                            <td>${order.supplier_name || "-"}</td>
                            <td>${warehouse ? warehouse.name : order.warehouse_id}</td>
                            <td>${renderStatusBadge(order.status)}</td>
                            <td>${formatDate(order.expected_date)}</td>
                            <td><button class="secondary" data-receive="${order.id}">Traiter</button></td>
                          </tr>
                        `;
                      })
                      .join("")}
                  </tbody>
                </table>
              </div>`
            : `<p class="empty-state">Aucun ordre de réception pour le moment.</p>`}
        </section>
        ${canOperate()
          ? `<section class="panel">
              <h2>Créer un ordre de réception</h2>
              <form id="inbound-form">
                <div class="grid-two">
                  <div class="form-group">
                    <label>Référence</label>
                    <input name="reference" type="text" required />
                  </div>
                  <div class="form-group">
                    <label>Fournisseur</label>
                    <input name="supplier_name" type="text" />
                  </div>
                  <div class="form-group">
                    <label>Entrepôt</label>
                    <select name="warehouse_id" required>
                      <option value="">Sélectionner...</option>
                      ${warehouses.map((w) => `<option value="${w.id}">${w.name}</option>`).join("")}
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Date prévue</label>
                    <input name="expected_date" type="date" />
                  </div>
                </div>
                <div class="form-group">
                  <label>Lignes de réception</label>
                  <div class="lines-container" id="inbound-lines"></div>
                  <button class="secondary" type="button" id="add-inbound-line">Ajouter une ligne</button>
                </div>
                <button class="primary" type="submit">Créer la réception</button>
              </form>
            </section>`
          : ""}
        `}
    `;

    document.querySelectorAll("[data-receive]").forEach((button) => {
      button.addEventListener("click", () => setView("inbound", { orderId: button.dataset.receive }, { skipHash: true }));
    });

    if (!selectedOrder && canOperate()) {
      const linesContainer = document.getElementById("inbound-lines");
      const addLineButton = document.getElementById("add-inbound-line");
      const inboundForm = document.getElementById("inbound-form");
      const addLine = () => {
        if (!items.length) {
          showInlineMessage("error", "Créer un article avant d'ajouter une ligne");
          return;
        }
        const row = createLineRow({ items });
        linesContainer.appendChild(row);
      };
      addLineButton.addEventListener("click", addLine);
      if (linesContainer.children.length === 0) {
        addLine();
      }
      inboundForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(inboundForm);
        const lines = Array.from(linesContainer.children).map((row) => {
          const itemId = row.querySelector("select[name='item_id']").value;
          const qty = row.querySelector("input[name='quantity']").value;
          return { item_id: Number(itemId), expected_qty: Number(qty) };
        }).filter((line) => line.item_id && line.expected_qty > 0);
        if (!lines.length) {
          showInlineMessage("error", "Ajouter au moins une ligne valide");
          return;
        }
        const payload = {
          reference: formData.get("reference"),
          supplier_name: formData.get("supplier_name") || null,
          warehouse_id: Number(formData.get("warehouse_id")),
          expected_date: formData.get("expected_date") || null,
          lines
        };
        try {
          await apiFetch("/inbound-orders", {
            method: "POST",
            body: JSON.stringify(payload)
          });
          showInlineMessage("success", "Réception créée");
          setView("inbound", {}, { skipHash: true });
        } catch (err) {
          showInlineMessage("error", err.message);
        }
      });
    }

    if (selectedOrder) {
      attachInboundDetailHandlers(selectedOrder, locations);
    }
  } catch (err) {
    showInlineMessage("error", err.message);
    mainViewEl.innerHTML = `<div class="empty-state">Impossible de charger les réceptions.</div>`;
  }
}

async function renderAdministration() {
  if (!hasPermission("CAN_MANAGE_USERS") && !hasPermission("CAN_MANAGE_RULES")) {
    mainViewEl.innerHTML = `<div class="empty-state">Accès restreint à l'administration.</div>`;
    return;
  }
  mainViewEl.innerHTML = `<div class="loader">Chargement de l'administration...</div>`;
  try {
    const canManageUsers = hasPermission("CAN_MANAGE_USERS");
    const canManageRules = hasPermission("CAN_MANAGE_RULES");
    const [users, roles, auditEntries, putawayRules, pickingRules] = await Promise.all([
      canManageUsers ? safeApiFetch("/users", []) : [],
      canManageUsers ? safeApiFetch("/users/roles", []) : [],
      canManageUsers ? safeApiFetch("/admin/audit-log", []) : [],
      canManageRules ? safeApiFetch("/rules/putaway", []) : [],
      canManageRules ? safeApiFetch("/rules/picking", []) : []
    ]);
    const availableRoles = roles.length
      ? roles
      : Array.from(new Set(users.map((user) => user.role))).map((role) => ({ name: role, label: role, permissions: [] }));
    mainViewEl.innerHTML = `
      <div class="view-header">
        <h1>Administration & RBAC</h1>
        <p>Contrôlez les rôles, permissions et règles d'automatisation.</p>
      </div>
      <div class="quick-links">
        <button class="secondary" data-link="items">Catalogue articles</button>
      </div>
      ${canManageUsers
        ? `<div class="grid-two">
            <section class="panel form-panel">
              <div class="panel-title"><h2>Créer un utilisateur</h2></div>
              <form id="user-create-form">
                <div class="form-group">
                  <label>Identifiant
                    <input name="username" required placeholder="jsmith" />
                  </label>
                </div>
                <div class="form-group">
                  <label>Email
                    <input name="email" type="email" placeholder="user@erp.local" />
                  </label>
                </div>
                <div class="form-group">
                  <label>Mot de passe initial
                    <input name="password" type="password" required minlength="6" placeholder="••••••" />
                  </label>
                </div>
                <div class="form-group">
                  <label>Rôle
                    <select name="role" required>
                      ${availableRoles
                        .map((role) => `<option value="${role.name}">${role.label || role.name}</option>`)
                        .join("")}
                    </select>
                  </label>
                </div>
                <button class="primary" type="submit">Créer</button>
              </form>
            </section>
            <section class="panel">
              <h2>Utilisateurs</h2>
              ${users.length
                ? `<div class="table-wrapper compact">
                    <table class="admin-table">
                      <thead>
                        <tr>
                          <th>Compte</th>
                          <th>Email</th>
                          <th>Rôle</th>
                          <th>Statut</th>
                          <th>Historique</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${users
                          .map(
                            (user) => `
                              <tr data-user-id="${user.id}">
                                <td>
                                  <strong>${user.username}</strong>
                                  <div class="text-muted">ID ${user.id}</div>
                                </td>
                                <td>
                                  <div>${user.email || "-"}</div>
                                  <button class="ghost user-email" type="button" data-id="${user.id}" data-email="${user.email || ""}">Modifier</button>
                                </td>
                                <td>
                                  <select class="user-role-select" data-id="${user.id}">
                                    ${availableRoles
                                      .map((role) => `<option value="${role.name}" ${role.name === user.role ? "selected" : ""}>${role.label || role.name}</option>`)
                                      .join("")}
                                  </select>
                                </td>
                                <td>${renderUserStatus(user.is_active)}</td>
                                <td>
                                  <div class="text-muted">Créé : ${formatDateTime(user.created_at)}</div>
                                  <div class="text-muted">Dernier login : ${formatDateTime(user.last_login_at)}</div>
                                </td>
                                <td>
                                  <div class="user-actions">
                                    <button class="ghost user-reset" type="button" data-id="${user.id}">Réinitialiser</button>
                                    <button class="ghost user-toggle" type="button" data-id="${user.id}" data-active="${user.is_active ? "true" : "false"}">${user.is_active ? "Désactiver" : "Réactiver"}</button>
                                  </div>
                                </td>
                              </tr>`
                          )
                          .join("")}
                      </tbody>
                    </table>
                  </div>`
                : `<p class="empty-state">Aucun utilisateur.</p>`}
            </section>
          </div>
          <section class="panel">
            <h2>Rôles standard</h2>
            ${roles.length
              ? `<div class="table-wrapper compact">
                  <table>
                    <thead>
                      <tr><th>Rôle</th><th>Permissions</th></tr>
                    </thead>
                    <tbody>
                      ${roles
                        .map(
                          (role) => `
                            <tr>
                              <td>
                                <strong>${role.label}</strong>
                                <div class="text-muted">${role.description || role.name}</div>
                              </td>
                              <td>${role.permissions?.join(", ") || "-"}</td>
                            </tr>`
                        )
                        .join("")}
                    </tbody>
                  </table>
                </div>`
              : `<p class="empty-state">Permissions non disponibles.</p>`}
          </section>
          <section class="panel">
            <h2>Journal d'audit</h2>
            ${auditEntries.length
              ? `<div class="table-wrapper compact">
                  <table>
                    <thead>
                      <tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Cible</th><th>Détails</th></tr>
                    </thead>
                    <tbody>
                      ${auditEntries
                        .map(
                          (entry) => `
                            <tr>
                              <td>${formatDateTime(entry.created_at)}</td>
                              <td>${entry.actor || "Système"}</td>
                              <td>${entry.action}</td>
                              <td>${entry.entity}${entry.entity_id ? ` #${entry.entity_id}` : ""}</td>
                              <td>${formatAuditDetails(entry.details)}</td>
                            </tr>`
                        )
                        .join("")}
                    </tbody>
                  </table>
                </div>`
              : `<p class="empty-state">Aucun événement récent.</p>`}
          </section>`
        : ""}
      ${canManageRules
        ? `<div class="grid-two">
            <section class="panel">
              <h2>Règles de putaway</h2>
              ${putawayRules.length
                ? `<ul class="rule-list">
                    ${putawayRules
                      .map(
                        (rule) => `
                          <li>
                            <div>
                              <strong>${rule.name}</strong>
                              <span>${rule.strategy}</span>
                            </div>
                            <small>Cible: ${JSON.stringify(rule.destination)}</small>
                          </li>`
                      )
                      .join("")}
                  </ul>`
                : `<p class="empty-state">Aucune règle définie.</p>`}
            </section>
            <section class="panel">
              <h2>Smart Picking</h2>
              ${pickingRules.length
                ? `<ul class="rule-list">
                    ${pickingRules
                      .map((rule) => `
                        <li>
                          <div>
                            <strong>${rule.name}</strong>
                            <span>${rule.grouping}</span>
                          </div>
                          <small>Heuristiques: ${JSON.stringify(rule.heuristics)}</small>
                        </li>`)
                      .join("")}
                  </ul>`
                : `<p class="empty-state">Aucune règle de picking.</p>`}
            </section>
          </div>`
        : ""}
    `;
    mainViewEl.querySelectorAll("[data-link]").forEach((btn) => {
      btn.addEventListener("click", () => setView(btn.dataset.link));
    });
    if (canManageUsers) {
      const createForm = document.getElementById("user-create-form");
      if (createForm) {
        createForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const formData = new FormData(createForm);
          const payload = {
            username: formData.get("username"),
            email: formData.get("email") || null,
            password: formData.get("password"),
            role: formData.get("role")
          };
          try {
            await apiFetch("/users", { method: "POST", body: JSON.stringify(payload) });
            showInlineMessage("success", "Utilisateur créé");
            renderAdministration();
          } catch (err) {
            showInlineMessage("error", err.message);
          }
        });
      }
      mainViewEl.querySelectorAll(".user-role-select").forEach((select) => {
        select.addEventListener("change", async (event) => {
          const userId = event.target.dataset.id;
          try {
            await apiFetch(`/users/${userId}`, {
              method: "PATCH",
              body: JSON.stringify({ role: event.target.value })
            });
            showInlineMessage("success", "Rôle mis à jour");
            renderAdministration();
          } catch (err) {
            showInlineMessage("error", err.message);
          }
        });
      });
      mainViewEl.querySelectorAll(".user-toggle").forEach((button) => {
        button.addEventListener("click", async () => {
          const userId = button.dataset.id;
          const currentActive = button.dataset.active === "true";
          try {
            await apiFetch(`/users/${userId}`, {
              method: "PATCH",
              body: JSON.stringify({ is_active: !currentActive })
            });
            showInlineMessage("success", currentActive ? "Utilisateur désactivé" : "Utilisateur réactivé");
            renderAdministration();
          } catch (err) {
            showInlineMessage("error", err.message);
          }
        });
      });
      mainViewEl.querySelectorAll(".user-reset").forEach((button) => {
        button.addEventListener("click", async () => {
          const userId = button.dataset.id;
          const password = window.prompt("Nouveau mot de passe (minimum 6 caractères)");
          if (!password) {
            return;
          }
          if (password.length < 6) {
            showInlineMessage("error", "Mot de passe trop court");
            return;
          }
          try {
            await apiFetch(`/users/${userId}/reset-password`, {
              method: "POST",
              body: JSON.stringify({ password })
            });
            showInlineMessage("success", "Mot de passe réinitialisé");
            renderAdministration();
          } catch (err) {
            showInlineMessage("error", err.message);
          }
        });
      });
      mainViewEl.querySelectorAll(".user-email").forEach((button) => {
        button.addEventListener("click", async () => {
          const userId = button.dataset.id;
          const nextEmail = window.prompt("Nouvelle adresse email", button.dataset.email || "");
          if (nextEmail === null) {
            return;
          }
          try {
            await apiFetch(`/users/${userId}`, {
              method: "PATCH",
              body: JSON.stringify({ email: nextEmail || null })
            });
            showInlineMessage("success", "Email mis à jour");
            renderAdministration();
          } catch (err) {
            showInlineMessage("error", err.message);
          }
        });
      });
    }
  } catch (err) {
    showInlineMessage("error", err.message);
    mainViewEl.innerHTML = `<div class="empty-state">Impossible de charger l'administration.</div>`;
  }
}

async function renderFinance() {
  if (!hasPermission("FINANCE_ACCESS")) {
    mainViewEl.innerHTML = `<div class="empty-state">Accès refusé au module Finance.</div>`;
    return;
  }
  mainViewEl.innerHTML = `<div class="loader">Chargement du module Finance...</div>`;
  try {
    const [accounts, journals, fiscalYears, entries, invoices, parties] = await Promise.all([
      safeApiFetch("/finance/accounts", []),
      safeApiFetch("/finance/journals", []),
      safeApiFetch("/finance/fiscal-years", []),
      safeApiFetch("/finance/entries", []),
      safeApiFetch("/finance/invoices", []),
      safeApiFetch("/finance/parties", [])
    ]);
    mainViewEl.innerHTML = `
      <div class="view-header">
        <h1>Finance & Comptabilité</h1>
        <p>Plan comptable, journaux et factures unifiés.</p>
      </div>
      <div class="grid-two">
        ${hasPermission("FINANCE_CONFIGURE")
          ? `<section class="panel form-panel">
              <div class="panel-title"><h2>Nouveau compte</h2></div>
              <form id="finance-account-form">
                <div class="form-group">
                  <label>Code
                    <input name="code" required placeholder="401000" />
                  </label>
                </div>
                <div class="form-group">
                  <label>Intitulé
                    <input name="label" required placeholder="Libellé" />
                  </label>
                </div>
                <div class="form-group">
                  <label>Type
                    <select name="type" required>
                      <option value="ASSET">Actif</option>
                      <option value="LIABILITY">Passif</option>
                      <option value="EXPENSE">Charge</option>
                      <option value="INCOME">Produit</option>
                    </select>
                  </label>
                </div>
                <button class="primary" type="submit">Ajouter</button>
              </form>
            </section>`
          : ""}
        ${hasPermission("FINANCE_INVOICE")
          ? `<section class="panel form-panel">
              <div class="panel-title"><h2>Nouvelle facture</h2></div>
              <form id="finance-invoice-form">
                <div class="form-group">
                  <label>Client / Fournisseur
                    <select name="party_id" required>
                      <option value="">Choisir...</option>
                      ${parties
                        .map((party) => `<option value="${party.id}">${party.name} (${party.type})</option>`)
                        .join("")}
                    </select>
                  </label>
                </div>
                <div class="form-group">
                  <label>Numéro
                    <input name="number" required placeholder="INV-0002" />
                  </label>
                </div>
                <div class="form-group">
                  <label>Date facture
                    <input type="date" name="invoice_date" required />
                  </label>
                </div>
                <div class="form-group">
                  <label>Échéance
                    <input type="date" name="due_date" />
                  </label>
                </div>
                <div class="form-group">
                  <label>Total HT
                    <input type="number" step="0.01" name="total_ht" value="0" />
                  </label>
                </div>
                <div class="form-group">
                  <label>TVA
                    <input type="number" step="0.01" name="total_tva" value="0" />
                  </label>
                </div>
                <button class="primary" type="submit">Enregistrer</button>
              </form>
            </section>`
          : ""}
      </div>
      ${hasPermission("FINANCE_OPERATE")
        ? `<section class="panel form-panel">
            <div class="panel-title"><h2>Saisie rapide d'écriture</h2></div>
            <form id="finance-entry-form">
              <div class="form-group">
                <label>Journal
                  <select name="journal_id" required>
                    ${journals.map((journal) => `<option value="${journal.id}">${journal.code} - ${journal.label}</option>`).join("")}
                  </select>
                </label>
              </div>
              <div class="form-group">
                <label>Exercice
                  <select name="fiscal_year_id" required>
                    ${fiscalYears.map((fy) => `<option value="${fy.id}">${fy.label}</option>`).join("")}
                  </select>
                </label>
              </div>
              <div class="form-group">
                <label>Date d'écriture
                  <input type="date" name="entry_date" required />
                </label>
              </div>
              <div class="form-group">
                <label>Référence
                  <input name="reference" placeholder="PIECE-001" />
                </label>
              </div>
              <div class="form-group">
                <label>Libellé
                  <input name="label" placeholder="Libellé" />
                </label>
              </div>
              <div class="form-inline">
                <label>Compte débit
                  <select name="debit_account" required>
                    ${accounts.map((acc) => `<option value="${acc.id}">${acc.code} - ${acc.label}</option>`).join("")}
                  </select>
                </label>
                <label>Montant débit
                  <input type="number" step="0.01" name="debit_amount" required />
                </label>
              </div>
              <div class="form-inline">
                <label>Compte crédit
                  <select name="credit_account" required>
                    ${accounts.map((acc) => `<option value="${acc.id}">${acc.code} - ${acc.label}</option>`).join("")}
                  </select>
                </label>
                <label>Montant crédit
                  <input type="number" step="0.01" name="credit_amount" required />
                </label>
              </div>
              <button class="secondary" type="submit">Enregistrer l'écriture</button>
            </form>
          </section>`
        : ""}
      <div class="grid-two">
        <section class="panel">
          <div class="panel-title"><h2>Factures récentes</h2></div>
          ${invoices.length
            ? `<div class="table-wrapper compact">
                <table>
                  <thead><tr><th>Numéro</th><th>Partie</th><th>Montant</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    ${invoices
                      .slice(0, 8)
                      .map(
                        (invoice) => `
                          <tr>
                            <td>${invoice.number}</td>
                            <td>${invoice.party_name}</td>
                            <td>${formatCurrency(invoice.total_ttc)}</td>
                            <td>${invoice.status}</td>
                            <td>
                              ${invoice.status === "DRAFT" && hasPermission("FINANCE_OPERATE")
                                ? `<button class="ghost" data-validate-invoice="${invoice.id}">Valider</button>`
                                : ""}
                            </td>
                          </tr>`
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>`
            : `<p class="empty-state">Aucune facture pour le moment.</p>`}
        </section>
        <section class="panel">
          <div class="panel-title"><h2>Écritures récentes</h2></div>
          ${entries.length
            ? `<ul class="simple-list">
                ${entries
                  .slice(0, 8)
                  .map(
                    (entry) => `
                      <li>
                        <div>
                          <strong>${entry.reference || entry.id}</strong>
                          <span>${formatDate(entry.entry_date)} · ${entry.status}</span>
                        </div>
                        <span>${entry.lines?.length || 0} lignes</span>
                      </li>`
                  )
                  .join("")}
              </ul>`
            : `<p class="empty-state">Aucune écriture.</p>`}
        </section>
      </div>
    `;

    if (hasPermission("FINANCE_CONFIGURE")) {
      const accountForm = document.getElementById("finance-account-form");
      accountForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(accountForm);
        try {
          await apiFetch("/finance/accounts", {
            method: "POST",
            body: JSON.stringify({
              code: formData.get("code"),
              label: formData.get("label"),
              type: formData.get("type"),
              is_active: true
            })
          });
          showInlineMessage("success", "Compte ajouté");
          renderFinance();
        } catch (err) {
          showInlineMessage("error", err.message);
        }
      });
    }

    if (hasPermission("FINANCE_INVOICE")) {
      const invoiceForm = document.getElementById("finance-invoice-form");
      invoiceForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(invoiceForm);
        try {
          await apiFetch("/finance/invoices", {
            method: "POST",
            body: JSON.stringify({
              party_id: Number(formData.get("party_id")),
              number: formData.get("number"),
              invoice_date: formData.get("invoice_date"),
              due_date: formData.get("due_date") || null,
              total_ht: Number(formData.get("total_ht")),
              total_tva: Number(formData.get("total_tva"))
            })
          });
          showInlineMessage("success", "Facture enregistrée");
          renderFinance();
        } catch (err) {
          showInlineMessage("error", err.message);
        }
      });
    }

    if (hasPermission("FINANCE_OPERATE")) {
      const entryForm = document.getElementById("finance-entry-form");
      entryForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(entryForm);
        const payload = {
          journal_id: Number(formData.get("journal_id")),
          fiscal_year_id: Number(formData.get("fiscal_year_id")),
          entry_date: formData.get("entry_date"),
          reference: formData.get("reference") || null,
          label: formData.get("label") || null,
          lines: [
            {
              account_id: Number(formData.get("debit_account")),
              debit: Number(formData.get("debit_amount")),
              credit: 0
            },
            {
              account_id: Number(formData.get("credit_account")),
              debit: 0,
              credit: Number(formData.get("credit_amount"))
            }
          ]
        };
        try {
          await apiFetch("/finance/entries", {
            method: "POST",
            body: JSON.stringify(payload)
          });
          showInlineMessage("success", "Écriture sauvegardée");
          renderFinance();
        } catch (err) {
          showInlineMessage("error", err.message);
        }
      });

      document.querySelectorAll("[data-validate-invoice]").forEach((button) => {
        button.addEventListener("click", async () => {
          const invoiceId = button.getAttribute("data-validate-invoice");
          button.disabled = true;
          try {
            await apiFetch(`/finance/invoices/${invoiceId}/validate`, { method: "POST" });
            showInlineMessage("success", "Facture validée");
            renderFinance();
          } catch (err) {
            showInlineMessage("error", err.message);
            button.disabled = false;
          }
        });
      });
    }
  } catch (err) {
    showInlineMessage("error", err.message);
    mainViewEl.innerHTML = `<div class="empty-state">Impossible de charger le module Finance.</div>`;
  }
}

async function renderHumanResources() {
  if (!hasPermission("HR_ACCESS")) {
    mainViewEl.innerHTML = `<div class="empty-state">Accès refusé au module RH.</div>`;
    return;
  }
  mainViewEl.innerHTML = `<div class="loader">Chargement du module RH...</div>`;
  try {
    const [employees, leaveTypes, leaves] = await Promise.all([
      safeApiFetch("/hr/employees", []),
      safeApiFetch("/hr/leave-types", []),
      safeApiFetch("/hr/leaves", [])
    ]);
    mainViewEl.innerHTML = `
      <div class="view-header">
        <h1>Ressources Humaines</h1>
        <p>Dossiers salariés, contrats et demandes d'absence.</p>
      </div>
      <div class="grid-two">
        ${hasPermission("HR_MANAGE_EMPLOYEES")
          ? `<section class="panel form-panel">
              <div class="panel-title"><h2>Nouveau salarié</h2></div>
              <form id="hr-employee-form">
                <div class="form-group">
                  <label>Matricule
                    <input name="employee_number" required placeholder="EMP-002" />
                  </label>
                </div>
                <div class="form-group">
                  <label>Prénom
                    <input name="first_name" required />
                  </label>
                </div>
                <div class="form-group">
                  <label>Nom
                    <input name="last_name" required />
                  </label>
                </div>
                <div class="form-group">
                  <label>Email
                    <input type="email" name="email" />
                  </label>
                </div>
                <div class="form-group">
                  <label>Téléphone
                    <input name="phone" />
                  </label>
                </div>
                <div class="form-group">
                  <label>Date d'entrée
                    <input type="date" name="hire_date" required />
                  </label>
                </div>
                <div class="form-group">
                  <label>Poste
                    <input name="job_title" />
                  </label>
                </div>
                <div class="form-group">
                  <label>Département
                    <input name="department" />
                  </label>
                </div>
                <button class="primary" type="submit">Créer</button>
              </form>
            </section>`
          : ""}
        ${hasPermission("HR_MANAGE_CONTRACTS")
          ? `<section class="panel form-panel">
              <div class="panel-title"><h2>Nouveau contrat</h2></div>
              <form id="hr-contract-form">
                <div class="form-group">
                  <label>Salarié
                    <select name="employee_id" required>
                      <option value="">Choisir...</option>
                      ${employees
                        .map((employee) => `<option value="${employee.id}">${employee.first_name} ${employee.last_name}</option>`)
                        .join("")}
                    </select>
                  </label>
                </div>
                <div class="form-group">
                  <label>Type
                    <select name="type" required>
                      <option value="CDI">CDI</option>
                      <option value="CDD">CDD</option>
                      <option value="INTERIM">Intérim</option>
                    </select>
                  </label>
                </div>
                <div class="form-group">
                  <label>Date début
                    <input type="date" name="start_date" required />
                  </label>
                </div>
                <div class="form-group">
                  <label>Date fin
                    <input type="date" name="end_date" />
                  </label>
                </div>
                <div class="form-group">
                  <label>Salaire de base
                    <input type="number" step="0.01" name="base_salary" required />
                  </label>
                </div>
                <div class="form-group">
                  <label>Taux activité (%)
                    <input type="number" step="0.1" name="work_time_pct" value="100" />
                  </label>
                </div>
                <button class="primary" type="submit">Ajouter</button>
              </form>
            </section>`
          : ""}
      </div>
      <section class="panel form-panel">
        <div class="panel-title"><h2>Demande de congé</h2></div>
        <form id="hr-leave-form">
          <div class="form-group">
            <label>Salarié
              <select name="employee_id" required>
                <option value="">Choisir...</option>
                ${employees
                  .map((employee) => `<option value="${employee.id}">${employee.first_name} ${employee.last_name}</option>`)
                  .join("")}
              </select>
            </label>
          </div>
          <div class="form-group">
            <label>Type
              <select name="leave_type_id" required>
                ${leaveTypes.map((type) => `<option value="${type.id}">${type.label}</option>`).join("")}
              </select>
            </label>
          </div>
          <div class="form-group">
            <label>Début
              <input type="date" name="start_date" required />
            </label>
          </div>
          <div class="form-group">
            <label>Fin
              <input type="date" name="end_date" required />
            </label>
          </div>
          <button class="secondary" type="submit">Soumettre</button>
        </form>
      </section>
      <div class="grid-two">
        <section class="panel">
          <div class="panel-title"><h2>Salariés (${employees.length})</h2></div>
          ${employees.length
            ? `<div class="table-wrapper compact">
                <table>
                  <thead><tr><th>Nom</th><th>Département</th><th>Poste</th><th>Statut</th></tr></thead>
                  <tbody>
                    ${employees
                      .map((employee) => `
                        <tr>
                          <td>${employee.first_name} ${employee.last_name}</td>
                          <td>${employee.department || "-"}</td>
                          <td>${employee.job_title || "-"}</td>
                          <td>${employee.status}</td>
                        </tr>`)
                      .join("")}
                  </tbody>
                </table>
              </div>`
            : `<p class="empty-state">Aucun salarié enregistré.</p>`}
        </section>
        <section class="panel">
          <div class="panel-title"><h2>Congés & absences</h2></div>
          ${leaves.length
            ? `<div class="table-wrapper compact">
                <table>
                  <thead><tr><th>Salarié</th><th>Période</th><th>Type</th><th>Statut</th><th></th></tr></thead>
                  <tbody>
                    ${leaves
                      .slice(0, 10)
                      .map(
                        (leave) => `
                          <tr>
                            <td>${leave.first_name} ${leave.last_name}</td>
                            <td>${formatDate(leave.start_date)} → ${formatDate(leave.end_date)}</td>
                            <td>${leave.leave_type}</td>
                            <td>${leave.status}</td>
                            <td>
                              ${leave.status === "PENDING" && hasPermission("HR_APPROVE_LEAVES")
                                ? `<div class="button-group">
                                    <button class="ghost" data-approve-leave="${leave.id}">Valider</button>
                                    <button class="ghost danger" data-reject-leave="${leave.id}">Refuser</button>
                                  </div>`
                                : ""}
                            </td>
                          </tr>`
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>`
            : `<p class="empty-state">Aucune demande.</p>`}
        </section>
      </div>
    `;

    if (hasPermission("HR_MANAGE_EMPLOYEES")) {
      const employeeForm = document.getElementById("hr-employee-form");
      employeeForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(employeeForm);
        try {
          await apiFetch("/hr/employees", {
            method: "POST",
            body: JSON.stringify({
              employee_number: formData.get("employee_number"),
              first_name: formData.get("first_name"),
              last_name: formData.get("last_name"),
              email: formData.get("email") || null,
              phone: formData.get("phone") || null,
              hire_date: formData.get("hire_date"),
              job_title: formData.get("job_title") || null,
              department: formData.get("department") || null
            })
          });
          showInlineMessage("success", "Salarié créé");
          renderHumanResources();
        } catch (err) {
          showInlineMessage("error", err.message);
        }
      });
    }

    if (hasPermission("HR_MANAGE_CONTRACTS")) {
      const contractForm = document.getElementById("hr-contract-form");
      contractForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(contractForm);
        try {
          await apiFetch(`/hr/employees/${formData.get("employee_id")}/contracts`, {
            method: "POST",
            body: JSON.stringify({
              type: formData.get("type"),
              start_date: formData.get("start_date"),
              end_date: formData.get("end_date") || null,
              base_salary: Number(formData.get("base_salary")),
              work_time_pct: Number(formData.get("work_time_pct"))
            })
          });
          showInlineMessage("success", "Contrat ajouté");
          renderHumanResources();
        } catch (err) {
          showInlineMessage("error", err.message);
        }
      });
    }

    const leaveForm = document.getElementById("hr-leave-form");
    leaveForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(leaveForm);
      try {
        await apiFetch("/hr/leaves", {
          method: "POST",
          body: JSON.stringify({
            employee_id: Number(formData.get("employee_id")),
            leave_type_id: Number(formData.get("leave_type_id")),
            start_date: formData.get("start_date"),
            end_date: formData.get("end_date")
          })
        });
        showInlineMessage("success", "Demande envoyée");
        renderHumanResources();
      } catch (err) {
        showInlineMessage("error", err.message);
      }
    });

    if (hasPermission("HR_APPROVE_LEAVES")) {
      document.querySelectorAll("[data-approve-leave]").forEach((button) => {
        button.addEventListener("click", async () => {
          const leaveId = button.getAttribute("data-approve-leave");
          try {
            await apiFetch(`/hr/leaves/${leaveId}/approve`, { method: "POST" });
            renderHumanResources();
          } catch (err) {
            showInlineMessage("error", err.message);
          }
        });
      });
      document.querySelectorAll("[data-reject-leave]").forEach((button) => {
        button.addEventListener("click", async () => {
          const leaveId = button.getAttribute("data-reject-leave");
          try {
            await apiFetch(`/hr/leaves/${leaveId}/reject`, { method: "POST" });
            renderHumanResources();
          } catch (err) {
            showInlineMessage("error", err.message);
          }
        });
      });
    }
  } catch (err) {
    showInlineMessage("error", err.message);
    mainViewEl.innerHTML = `<div class="empty-state">Impossible de charger le module RH.</div>`;
  }
}

async function renderPayroll() {
  if (!hasPermission("PAYROLL_ACCESS")) {
    mainViewEl.innerHTML = `<div class="empty-state">Accès refusé au module Paie.</div>`;
    return;
  }
  mainViewEl.innerHTML = `<div class="loader">Chargement de la paie...</div>`;
  try {
    const [runs, payslips, payrollItems, employees, contracts] = await Promise.all([
      safeApiFetch("/payroll/runs", []),
      safeApiFetch("/payroll/payslips", []),
      safeApiFetch("/payroll/items", []),
      safeApiFetch("/hr/employees", []),
      safeApiFetch("/hr/contracts", [])
    ]);
    const earningItems = payrollItems.filter((item) => item.type === "EARNING");
    const deductionItems = payrollItems.filter((item) => item.type === "DEDUCTION");
    mainViewEl.innerHTML = `
      <div class="view-header">
        <h1>Module Paie</h1>
        <p>Campagnes de paie, rubriques et bulletins.</p>
      </div>
      <div class="grid-two">
        ${hasPermission("PAYROLL_CONFIGURE")
          ? `<section class="panel form-panel">
              <div class="panel-title"><h2>Nouvelle campagne</h2></div>
              <form id="payroll-run-form">
                <div class="form-group">
                  <label>Libellé
                    <input name="label" required placeholder="Paie Mai 2024" />
                  </label>
                </div>
                <div class="form-group">
                  <label>Début
                    <input type="date" name="period_start" required />
                  </label>
                </div>
                <div class="form-group">
                  <label>Fin
                    <input type="date" name="period_end" required />
                  </label>
                </div>
                <button class="primary" type="submit">Créer la campagne</button>
              </form>
            </section>`
          : ""}
        ${hasPermission("PAYROLL_RUN")
          ? `<section class="panel form-panel">
              <div class="panel-title"><h2>Bulletin rapide</h2></div>
              <form id="payroll-payslip-form">
                <div class="form-group">
                  <label>Campagne
                    <select name="payroll_run_id" ${runs.length ? "" : "disabled"} required>
                      ${runs.length
                        ? runs.map((run) => `<option value="${run.id}">${run.label} (${run.status})</option>`).join("")
                        : `<option value="">Aucune campagne ouverte</option>`}
                    </select>
                  </label>
                </div>
                <div class="form-group">
                  <label>Salarié
                    <select name="employee_id" required>
                      ${employees.map((emp) => `<option value="${emp.id}">${emp.first_name} ${emp.last_name}</option>`).join("")}
                    </select>
                  </label>
                </div>
                <div class="form-group">
                  <label>Contrat (optionnel)
                    <select name="contract_id">
                      <option value="">-</option>
                      ${contracts
                        .map((contract) => `<option value="${contract.id}">${contract.first_name || ""} ${contract.last_name || ""} - ${contract.type}</option>`)
                        .join("")}
                    </select>
                  </label>
                </div>
                <div class="form-group">
                  <label>Rubrique principale
                    <select name="base_item_id" required>
                      ${earningItems.map((item) => `<option value="${item.id}">${item.code} - ${item.label}</option>`).join("")}
                    </select>
                  </label>
                </div>
                <div class="form-group">
                  <label>Montant brut
                    <input type="number" step="0.01" name="base_amount" required />
                  </label>
                </div>
                <div class="form-group">
                  <label>Prime (optionnel)
                    <select name="bonus_item_id">
                      <option value="">-</option>
                      ${earningItems.map((item) => `<option value="${item.id}">${item.code} - ${item.label}</option>`).join("")}
                    </select>
                  </label>
                </div>
                <div class="form-group">
                  <label>Montant prime
                    <input type="number" step="0.01" name="bonus_amount" />
                  </label>
                </div>
                <div class="form-group">
                  <label>Retenue (optionnel)
                    <select name="deduction_item_id">
                      <option value="">-</option>
                      ${deductionItems.map((item) => `<option value="${item.id}">${item.code} - ${item.label}</option>`).join("")}
                    </select>
                  </label>
                </div>
                <div class="form-group">
                  <label>Montant retenue
                    <input type="number" step="0.01" name="deduction_amount" />
                  </label>
                </div>
                <button class="secondary" type="submit" ${runs.length ? "" : "disabled"}>Générer le bulletin</button>
              </form>
            </section>`
          : ""}
      </div>
      <div class="grid-two">
        <section class="panel">
          <div class="panel-title"><h2>Campagnes (${runs.length})</h2></div>
          ${runs.length
            ? `<ul class="simple-list">
                ${runs
                  .map((run) => `<li><strong>${run.label}</strong><span>${formatDate(run.period_start)} → ${formatDate(run.period_end)}</span><span class="badge">${run.status}</span></li>`)
                  .join("")}
              </ul>`
            : `<p class="empty-state">Aucune campagne.</p>`}
        </section>
        <section class="panel">
          <div class="panel-title"><h2>Bulletins (${payslips.length})</h2></div>
          ${payslips.length
            ? `<div class="table-wrapper compact">
                <table>
                  <thead><tr><th>Salarié</th><th>Campagne</th><th>Brut</th><th>Net</th></tr></thead>
                  <tbody>
                    ${payslips
                      .slice(0, 10)
                      .map(
                        (slip) => `
                          <tr>
                            <td>${slip.first_name} ${slip.last_name}</td>
                            <td>${slip.run_label}</td>
                            <td>${formatCurrency(slip.gross_amount)}</td>
                            <td>${formatCurrency(slip.net_amount)}</td>
                          </tr>`
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>`
            : `<p class="empty-state">Aucun bulletin généré.</p>`}
        </section>
      </div>
    `;

    if (hasPermission("PAYROLL_CONFIGURE")) {
      const runForm = document.getElementById("payroll-run-form");
      runForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(runForm);
        try {
          await apiFetch("/payroll/runs", {
            method: "POST",
            body: JSON.stringify({
              label: formData.get("label"),
              period_start: formData.get("period_start"),
              period_end: formData.get("period_end"),
              status: "OPEN"
            })
          });
          showInlineMessage("success", "Campagne créée");
          renderPayroll();
        } catch (err) {
          showInlineMessage("error", err.message);
        }
      });
    }

    if (hasPermission("PAYROLL_RUN")) {
      const payslipForm = document.getElementById("payroll-payslip-form");
      payslipForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(payslipForm);
        const lines = [];
        const baseAmount = Number(formData.get("base_amount"));
        if (baseAmount) {
          lines.push({ payroll_item_id: Number(formData.get("base_item_id")), base_amount: baseAmount, amount: baseAmount });
        }
        const bonusAmount = Number(formData.get("bonus_amount"));
        if (bonusAmount && formData.get("bonus_item_id")) {
          lines.push({ payroll_item_id: Number(formData.get("bonus_item_id")), base_amount: bonusAmount, amount: bonusAmount });
        }
        const deductionAmount = Number(formData.get("deduction_amount"));
        if (deductionAmount && formData.get("deduction_item_id")) {
          lines.push({ payroll_item_id: Number(formData.get("deduction_item_id")), base_amount: deductionAmount, amount: deductionAmount });
        }
        if (lines.length === 0) {
          showInlineMessage("error", "Veuillez saisir au moins une ligne de paie");
          return;
        }
        try {
          await apiFetch("/payroll/payslips", {
            method: "POST",
            body: JSON.stringify({
              payroll_run_id: Number(formData.get("payroll_run_id")),
              employee_id: Number(formData.get("employee_id")),
              contract_id: formData.get("contract_id") ? Number(formData.get("contract_id")) : null,
              lines
            })
          });
          showInlineMessage("success", "Bulletin généré");
          renderPayroll();
        } catch (err) {
          showInlineMessage("error", err.message);
        }
      });
    }
  } catch (err) {
    showInlineMessage("error", err.message);
    mainViewEl.innerHTML = `<div class="empty-state">Impossible de charger le module Paie.</div>`;
  }
}

async function renderOperatorView() {
  if (!hasPermission("CAN_EXECUTE_TASKS")) {
    mainViewEl.innerHTML = `<div class="empty-state">Le mode opérateur nécessite des droits d'exécution.</div>`;
    return;
  }
  mainViewEl.innerHTML = `<div class="loader">Préparation du mode opérateur...</div>`;
  try {
    const tasks = await safeApiFetch("/tasks", []);
    const myTasks = tasks.filter(
      (task) => !task.assigned_to || task.assigned_to === state.user?.id
    );
    const nextTask = myTasks[0] || null;
    mainViewEl.innerHTML = `
      <div class="operator-hero">
        <h1>Mode opérateur</h1>
        <p>Grandes zones tactiles, validation en un geste.</p>
      </div>
      <div class="operator-grid">
        ${[
          { id: "inbound", label: "Réception", color: "blue" },
          { id: "outbound", label: "Picking", color: "green" },
          { id: "stock", label: "Mise en stock", color: "purple" }
        ]
          .map(
            (action) => `
              <button class="operator-action ${action.color}" data-go="${action.id}">
                ${action.label}
              </button>`
          )
          .join("")}
      </div>
      <section class="panel">
        <div class="panel-title">
          <h2>Tâche à exécuter</h2>
          <span>${nextTask ? `#${nextTask.id}` : "Libre"}</span>
        </div>
        ${nextTask
          ? `<div class="operator-task">
              <div>
                <strong>${nextTask.type}</strong>
                <p>${nextTask.metadata?.location_code || nextTask.metadata?.location_id || ""}</p>
              </div>
              <div class="operator-task-actions">
                <button id="operator-start" class="secondary">Commencer</button>
                <button id="operator-finish" class="primary">Terminer</button>
              </div>
            </div>`
          : `<p class="empty-state">Aucune tâche attribuée.</p>`}
      </section>
      <section class="panel">
        <h2>File d'attente</h2>
        ${myTasks.length
          ? `<ul class="simple-list">
              ${myTasks
                .slice(0, 8)
                .map((task) => `<li>${task.type} — ${task.metadata?.location_code || task.metadata?.location_id || ""}</li>`)
                .join("")}
            </ul>`
          : `<p class="empty-state">File vide.</p>`}
      </section>
    `;
    document.querySelectorAll("[data-go]").forEach((btn) => {
      btn.addEventListener("click", () => setView(btn.dataset.go));
    });
    if (nextTask) {
      const startBtn = document.getElementById("operator-start");
      const finishBtn = document.getElementById("operator-finish");
      const payloadBase = nextTask.assigned_to ? {} : { assigned_to: state.user.id };
      startBtn.addEventListener("click", async () => {
        try {
          await apiFetch(`/tasks/${nextTask.id}`, {
            method: "PATCH",
            body: JSON.stringify({ ...payloadBase, status: "IN_PROGRESS" })
          });
          showInlineMessage("success", "Tâche démarrée");
          renderOperatorView();
        } catch (err) {
          showInlineMessage("error", err.message);
        }
      });
      finishBtn.addEventListener("click", async () => {
        try {
          await apiFetch(`/tasks/${nextTask.id}`, {
            method: "PATCH",
            body: JSON.stringify({ ...payloadBase, status: "DONE" })
          });
          showInlineMessage("success", "Tâche clôturée");
          renderOperatorView();
        } catch (err) {
          showInlineMessage("error", err.message);
        }
      });
    }
  } catch (err) {
    showInlineMessage("error", err.message);
    mainViewEl.innerHTML = `<div class="empty-state">Impossible de charger le mode opérateur.</div>`;
  }
}

function renderStatusBadge(status) {
  const normalized = (status || "").toUpperCase();
  const className =
    normalized === "CLOSED" || normalized === "SHIPPED"
      ? "success"
      : normalized === "OPEN" || normalized === "IN_PROGRESS" || normalized === "PICKING"
      ? "warning"
      : "";
  return `<span class="badge ${className}">${normalized || "-"}</span>`;
}

function renderUserStatus(isActive) {
  return `<span class="badge ${isActive ? "success" : "warning"}">${isActive ? "Actif" : "Inactif"}</span>`;
}

function renderInboundDetail(order, locations) {
  const lines = order.lines || [];
  return `
    <section class="panel">
      <div class="view-header">
        <div>
          <h2>Réception ${order.reference}</h2>
          <p>Statut : ${renderStatusBadge(order.status)}</p>
        </div>
        <button class="ghost" id="back-to-inbound">Retour</button>
      </div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Ligne</th>
              <th>Prévu</th>
              <th>Reçu</th>
              <th>Restant</th>
            </tr>
          </thead>
          <tbody>
            ${lines
              .map((line) => {
                const remaining = Number(line.expected_qty) - Number(line.received_qty || 0);
                return `
                  <tr>
                    <td>${line.item_id}</td>
                    <td>${formatQuantity(line.expected_qty)}</td>
                    <td>${formatQuantity(line.received_qty)}</td>
                    <td>${remaining > 0 ? formatQuantity(remaining) : "-"}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
      ${canOperate()
        ? `<form id="receive-form" class="section">
            <h3>Enregistrer la réception</h3>
            <div class="lines-container">
              ${lines
                .map((line) => {
                  const remaining = Number(line.expected_qty) - Number(line.received_qty || 0);
                  return `
                    <div class="line-row" data-line="${line.id}">
                      <span>Ligne #${line.id}</span>
                      <input type="number" name="received_qty" min="0" step="0.001" max="${remaining}" placeholder="Quantité" ${
                        remaining <= 0 ? "disabled" : ""
                      } />
                      <select name="location_id" ${remaining <= 0 ? "disabled" : ""}>
                        <option value="">Emplacement</option>
                        ${locations
                          .map((loc) => `<option value="${loc.id}">${loc.code}</option>`)
                          .join("")}
                      </select>
                      <span></span>
                    </div>
                  `;
                })
                .join("")}
            </div>
            <button class="primary" type="submit">Enregistrer</button>
          </form>`
        : ""}
    </section>
  `;
}

function attachInboundDetailHandlers(order, locations) {
  document.getElementById("back-to-inbound").addEventListener("click", () => setView("inbound", {}, { skipHash: true }));
  if (!canOperate()) return;
  const form = document.getElementById("receive-form");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const rows = Array.from(form.querySelectorAll(".line-row"));
    const receipts = rows
      .map((row) => {
        const lineId = Number(row.dataset.line);
        const qty = parseFloat(row.querySelector("input[name='received_qty']").value);
        const locationId = Number(row.querySelector("select[name='location_id']").value);
        return qty > 0 && locationId
          ? { line_id: lineId, received_qty: qty, to_location_id: locationId }
          : null;
      })
      .filter(Boolean);
    if (!receipts.length) {
      showInlineMessage("error", "Renseigner au moins une ligne valide");
      return;
    }
    try {
      await apiFetch(`/inbound-orders/${order.id}/receive`, {
        method: "POST",
        body: JSON.stringify({ receipts })
      });
      showInlineMessage("success", "Réception enregistrée");
      setView("inbound", {}, { skipHash: true });
    } catch (err) {
      showInlineMessage("error", err.message);
    }
  });
}

async function renderOutbound(params = {}) {
  mainViewEl.innerHTML = `<div class="loader">Chargement des commandes...</div>`;
  try {
    const [orders, warehouses, items] = await Promise.all([
      apiFetch("/outbound-orders"),
      apiFetch("/warehouses"),
      apiFetch("/items")
    ]);
    const selectedOrderId = params.orderId ? Number(params.orderId) : null;
    let selectedOrder = null;
    let locations = [];
    if (selectedOrderId) {
      selectedOrder = orders.find((order) => order.id === selectedOrderId) || null;
      if (selectedOrder) {
        locations = await apiFetch(`/warehouses/${selectedOrder.warehouse_id}/locations`);
      }
    }

    mainViewEl.innerHTML = `
      <div class="view-header">
        <h1>Commandes clients</h1>
      </div>
      ${selectedOrder
        ? renderOutboundDetail(selectedOrder, locations)
        : `
          <section class="panel">
            <h2>Commandes</h2>
            ${orders.length
              ? `<div class="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Référence</th>
                        <th>Client</th>
                        <th>Entrepôt</th>
                        <th>Statut</th>
                        <th>Expédition prévue</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${orders
                        .map((order) => {
                          const warehouse = warehouses.find((w) => w.id === order.warehouse_id);
                          return `
                            <tr>
                              <td>${order.reference}</td>
                              <td>${order.customer_name || "-"}</td>
                              <td>${warehouse ? warehouse.name : order.warehouse_id}</td>
                              <td>${renderStatusBadge(order.status)}</td>
                              <td>${formatDate(order.shipping_date)}</td>
                              <td><button class="secondary" data-pick="${order.id}">Préparer</button></td>
                            </tr>
                          `;
                        })
                        .join("")}
                    </tbody>
                  </table>
                </div>`
              : `<p class="empty-state">Aucune commande à préparer.</p>`}
          </section>
          ${canOperate()
            ? `<section class="panel">
                <h2>Créer une commande</h2>
                <form id="outbound-form">
                  <div class="grid-two">
                    <div class="form-group">
                      <label>Référence</label>
                      <input name="reference" type="text" required />
                    </div>
                    <div class="form-group">
                      <label>Client</label>
                      <input name="customer_name" type="text" />
                    </div>
                    <div class="form-group">
                      <label>Entrepôt</label>
                      <select name="warehouse_id" required>
                        <option value="">Sélectionner...</option>
                        ${warehouses.map((w) => `<option value="${w.id}">${w.name}</option>`).join("")}
                      </select>
                    </div>
                    <div class="form-group">
                      <label>Date d'expédition</label>
                      <input name="shipping_date" type="date" />
                    </div>
                  </div>
                  <div class="form-group">
                    <label>Lignes de commande</label>
                    <div class="lines-container" id="outbound-lines"></div>
                    <button class="secondary" type="button" id="add-outbound-line">Ajouter une ligne</button>
                  </div>
                  <button class="primary" type="submit">Créer la commande</button>
                </form>
              </section>`
            : ""}
        `}
    `;

    document.querySelectorAll("[data-pick]").forEach((button) => {
      button.addEventListener("click", () => setView("outbound", { orderId: button.dataset.pick }, { skipHash: true }));
    });

    if (!selectedOrder && canOperate()) {
      const linesContainer = document.getElementById("outbound-lines");
      const addLineButton = document.getElementById("add-outbound-line");
      const outboundForm = document.getElementById("outbound-form");
      const addLine = () => {
        if (!items.length) {
          showInlineMessage("error", "Créer un article avant d'ajouter une ligne");
          return;
        }
        const row = createLineRow({ items });
        linesContainer.appendChild(row);
      };
      addLineButton.addEventListener("click", addLine);
      if (linesContainer.children.length === 0) {
        addLine();
      }
      outboundForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(outboundForm);
        const lines = Array.from(linesContainer.children)
          .map((row) => {
            const itemId = row.querySelector("select[name='item_id']").value;
            const qty = row.querySelector("input[name='quantity']").value;
            return { item_id: Number(itemId), ordered_qty: Number(qty) };
          })
          .filter((line) => line.item_id && line.ordered_qty > 0);
        if (!lines.length) {
          showInlineMessage("error", "Ajouter au moins une ligne valide");
          return;
        }
        const payload = {
          reference: formData.get("reference"),
          customer_name: formData.get("customer_name") || null,
          warehouse_id: Number(formData.get("warehouse_id")),
          shipping_date: formData.get("shipping_date") || null,
          lines
        };
        try {
          await apiFetch("/outbound-orders", {
            method: "POST",
            body: JSON.stringify(payload)
          });
          showInlineMessage("success", "Commande créée");
          setView("outbound", {}, { skipHash: true });
        } catch (err) {
          showInlineMessage("error", err.message);
        }
      });
    }

    if (selectedOrder) {
      attachOutboundDetailHandlers(selectedOrder, locations);
    }
  } catch (err) {
    showInlineMessage("error", err.message);
    mainViewEl.innerHTML = `<div class="empty-state">Impossible de charger les commandes.</div>`;
  }
}

function renderOutboundDetail(order, locations) {
  const lines = order.lines || [];
  return `
    <section class="panel">
      <div class="view-header">
        <div>
          <h2>Commande ${order.reference}</h2>
          <p>Statut : ${renderStatusBadge(order.status)}</p>
        </div>
        <button class="ghost" id="back-to-outbound">Retour</button>
      </div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Ligne</th>
              <th>Commandé</th>
              <th>Prélevé</th>
              <th>Restant</th>
            </tr>
          </thead>
          <tbody>
            ${lines
              .map((line) => {
                const remaining = Number(line.ordered_qty) - Number(line.picked_qty || 0);
                return `
                  <tr>
                    <td>${line.item_id}</td>
                    <td>${formatQuantity(line.ordered_qty)}</td>
                    <td>${formatQuantity(line.picked_qty)}</td>
                    <td>${remaining > 0 ? formatQuantity(remaining) : "-"}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
      ${canOperate()
        ? `<form id="pick-form" class="section">
            <h3>Enregistrer le picking</h3>
            <div class="lines-container">
              ${lines
                .map((line) => {
                  const remaining = Number(line.ordered_qty) - Number(line.picked_qty || 0);
                  return `
                    <div class="line-row" data-line="${line.id}">
                      <span>Ligne #${line.id}</span>
                      <input type="number" name="picked_qty" min="0" step="0.001" max="${remaining}" placeholder="Quantité" ${
                        remaining <= 0 ? "disabled" : ""
                      } />
                      <select name="location_id" ${remaining <= 0 ? "disabled" : ""}>
                        <option value="">Emplacement</option>
                        ${locations
                          .map((loc) => `<option value="${loc.id}">${loc.code}</option>`)
                          .join("")}
                      </select>
                      <span></span>
                    </div>
                  `;
                })
                .join("")}
            </div>
            <button class="primary" type="submit">Enregistrer</button>
          </form>`
        : ""}
    </section>
  `;
}

function attachOutboundDetailHandlers(order) {
  document.getElementById("back-to-outbound").addEventListener("click", () => setView("outbound", {}, { skipHash: true }));
  if (!canOperate()) return;
  const form = document.getElementById("pick-form");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const rows = Array.from(form.querySelectorAll(".line-row"));
    const picks = rows
      .map((row) => {
        const lineId = Number(row.dataset.line);
        const qty = parseFloat(row.querySelector("input[name='picked_qty']").value);
        const locationId = Number(row.querySelector("select[name='location_id']").value);
        return qty > 0 && locationId ? { line_id: lineId, picked_qty: qty, from_location_id: locationId } : null;
      })
      .filter(Boolean);
    if (!picks.length) {
      showInlineMessage("error", "Renseigner au moins une ligne valide");
      return;
    }
    try {
      await apiFetch(`/outbound-orders/${order.id}/pick`, {
        method: "POST",
        body: JSON.stringify({ picks })
      });
      showInlineMessage("success", "Picking enregistré");
      setView("outbound", {}, { skipHash: true });
    } catch (err) {
      showInlineMessage("error", err.message);
    }
  });
}

const locationCache = new Map();

async function getLocationsForWarehouse(id) {
  if (!id) return [];
  if (locationCache.has(id)) {
    return locationCache.get(id);
  }
  const locations = await apiFetch(`/warehouses/${id}/locations`);
  locationCache.set(id, locations);
  return locations;
}

async function renderStock(params = {}) {
  const filters = {
    item_id: params.item_id || "",
    warehouse_id: params.warehouse_id || "",
    location_id: params.location_id || ""
  };
  mainViewEl.innerHTML = `<div class="loader">Chargement du stock...</div>`;
  try {
    const [items, warehouses] = await Promise.all([apiFetch("/items"), apiFetch("/warehouses")]);
    let locationOptions = [];
    if (filters.warehouse_id) {
      locationOptions = await getLocationsForWarehouse(Number(filters.warehouse_id));
    }
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
    const stocks = await apiFetch(`/stock${query.toString() ? `?${query.toString()}` : ""}`);
    mainViewEl.innerHTML = `
      <div class="view-header">
        <h1>Stock</h1>
      </div>
      <section class="panel">
        <form id="stock-filter" class="grid-two">
          <div class="form-group">
            <label>Article</label>
            <select name="item_id">
              <option value="">Tous</option>
              ${items
                .map(
                  (item) =>
                    `<option value="${item.id}" ${filters.item_id == item.id ? "selected" : ""}>${item.sku} — ${item.name}</option>`
                )
                .join("")}
            </select>
          </div>
          <div class="form-group">
            <label>Entrepôt</label>
            <select name="warehouse_id">
              <option value="">Tous</option>
              ${warehouses
                .map((w) => `<option value="${w.id}" ${filters.warehouse_id == w.id ? "selected" : ""}>${w.name}</option>`)
                .join("")}
            </select>
          </div>
          <div class="form-group">
            <label>Emplacement</label>
            <select name="location_id" ${filters.warehouse_id ? "" : "disabled"}>
              <option value="">Tous</option>
              ${locationOptions
                .map((loc) => `<option value="${loc.id}" ${filters.location_id == loc.id ? "selected" : ""}>${loc.code}</option>`)
                .join("")}
            </select>
          </div>
          <div class="form-group" style="align-self:flex-end;">
            <button class="primary" type="submit">Filtrer</button>
          </div>
        </form>
      </section>
      <section class="panel">
        <h2>Niveaux de stock</h2>
        ${stocks.length
          ? `<div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Article</th>
                    <th>Emplacement</th>
                    <th>Entrepôt</th>
                    <th>Quantité</th>
                    <th>Batch</th>
                    <th>Péremption</th>
                    <th>Mis à jour</th>
                  </tr>
                </thead>
                <tbody>
                  ${stocks
                    .map((row) => {
                      const warehouse = warehouses.find((w) => w.id === row.warehouse_id);
                      return `
                        <tr>
                          <td>${row.sku} — ${row.name}</td>
                          <td>${row.location_code}</td>
                          <td>${warehouse ? warehouse.name : row.warehouse_id}</td>
                          <td>${formatQuantity(row.quantity)}</td>
                          <td>${row.batch_number || "-"}</td>
                          <td>${row.expiration_date ? formatDate(row.expiration_date) : "-"}</td>
                          <td>${formatDateTime(row.updated_at)}</td>
                        </tr>
                      `;
                    })
                    .join("")}
                </tbody>
              </table>
            </div>`
          : `<p class="empty-state">Aucun mouvement de stock pour ces filtres.</p>`}
      </section>
    `;

    const filterForm = document.getElementById("stock-filter");
    filterForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(filterForm).entries());
      setView("stock", data, { skipHash: true });
    });

    const warehouseSelect = filterForm.querySelector("select[name='warehouse_id']");
    warehouseSelect.addEventListener("change", async () => {
      const locationSelect = filterForm.querySelector("select[name='location_id']");
      locationSelect.innerHTML = `<option value="">Tous</option>`;
      locationSelect.disabled = !warehouseSelect.value;
      if (warehouseSelect.value) {
        const locs = await getLocationsForWarehouse(Number(warehouseSelect.value));
        locs.forEach((loc) => {
          const option = document.createElement("option");
          option.value = loc.id;
          option.textContent = loc.code;
          locationSelect.appendChild(option);
        });
      }
    });
  } catch (err) {
    showInlineMessage("error", err.message);
    mainViewEl.innerHTML = `<div class="empty-state">Impossible de charger le stock.</div>`;
  }
}

async function renderMovements() {
  mainViewEl.innerHTML = `<div class="loader">Chargement des mouvements...</div>`;
  try {
    const movements = await apiFetch("/movements");
    mainViewEl.innerHTML = `
      <div class="view-header">
        <h1>Mouvements récents</h1>
      </div>
      <section class="panel">
        ${movements.length
          ? `<div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Article</th>
                    <th>De</th>
                    <th>Vers</th>
                    <th>Quantité</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  ${movements
                    .map(
                      (mvt) => `
                        <tr>
                          <td>${formatDateTime(mvt.created_at)}</td>
                          <td>${mvt.sku} — ${mvt.name}</td>
                          <td>${mvt.from_location_code || "-"}</td>
                          <td>${mvt.to_location_code || "-"}</td>
                          <td>${formatQuantity(mvt.quantity)}</td>
                          <td>${mvt.movement_type}</td>
                        </tr>
                      `
                    )
                    .join("")}
                </tbody>
              </table>
            </div>`
          : `<p class="empty-state">Pas encore de mouvements enregistrés.</p>`}
      </section>
    `;
  } catch (err) {
    showInlineMessage("error", err.message);
    mainViewEl.innerHTML = `<div class="empty-state">Impossible de charger les mouvements.</div>`;
  }
}

async function renderInventory(params = {}) {
  mainViewEl.innerHTML = `<div class="loader">Chargement des inventaires...</div>`;
  try {
    const [inventories, warehouses, items] = await Promise.all([
      apiFetch("/inventory-counts"),
      apiFetch("/warehouses"),
      apiFetch("/items")
    ]);
    const selectedId = params.inventoryId ? Number(params.inventoryId) : null;
    const selectedInventory = inventories.find((inv) => inv.id === selectedId) || null;

    mainViewEl.innerHTML = `
      <div class="view-header">
        <h1>Inventaires</h1>
      </div>
      ${selectedInventory
        ? renderInventoryDetail(selectedInventory, warehouses, items)
        : `
          <section class="panel">
            <h2>Campagnes</h2>
            ${inventories.length
              ? `<div class="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Entrepôt</th>
                        <th>Statut</th>
                        <th>Début</th>
                        <th>Fin</th>
                        <th>Lignes</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${inventories
                        .map((inv) => {
                          const warehouse = warehouses.find((w) => w.id === inv.warehouse_id);
                          return `
                            <tr>
                              <td>${inv.id}</td>
                              <td>${warehouse ? warehouse.name : inv.warehouse_id}</td>
                              <td>${renderStatusBadge(inv.status)}</td>
                              <td>${formatDateTime(inv.started_at)}</td>
                              <td>${inv.closed_at ? formatDateTime(inv.closed_at) : "-"}</td>
                              <td>${inv.lines?.length || 0}</td>
                              <td><button class="secondary" data-inventory="${inv.id}">Ouvrir</button></td>
                            </tr>
                          `;
                        })
                        .join("")}
                    </tbody>
                  </table>
                </div>`
              : `<p class="empty-state">Aucun inventaire en cours.</p>`}
          </section>
          ${canOperate()
            ? `<section class="panel">
                <h2>Créer une campagne</h2>
                <form id="inventory-form">
                  <div class="form-group">
                    <label>Entrepôt</label>
                    <select name="warehouse_id" required>
                      <option value="">Sélectionner...</option>
                      ${warehouses.map((w) => `<option value="${w.id}">${w.name}</option>`).join("")}
                    </select>
                  </div>
                  <button class="primary" type="submit">Créer</button>
                </form>
              </section>`
            : ""}
        `}
    `;

    document.querySelectorAll("[data-inventory]").forEach((button) => {
      button.addEventListener("click", () => setView("inventory", { inventoryId: button.dataset.inventory }, { skipHash: true }));
    });

    if (!selectedInventory && canOperate()) {
      const inventoryForm = document.getElementById("inventory-form");
      if (inventoryForm) {
        inventoryForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const warehouseId = Number(new FormData(inventoryForm).get("warehouse_id"));
          try {
            const created = await apiFetch("/inventory-counts", {
              method: "POST",
              body: JSON.stringify({ warehouse_id: warehouseId })
            });
            showInlineMessage("success", "Campagne créée");
            setView("inventory", { inventoryId: created.id }, { skipHash: true });
          } catch (err) {
            showInlineMessage("error", err.message);
          }
        });
      }
    }

    if (selectedInventory) {
      attachInventoryDetailHandlers(selectedInventory, warehouses, items);
    }
  } catch (err) {
    showInlineMessage("error", err.message);
    mainViewEl.innerHTML = `<div class="empty-state">Impossible de charger les inventaires.</div>`;
  }
}

function renderInventoryDetail(inventory, warehouses, items) {
  const warehouse = warehouses.find((w) => w.id === inventory.warehouse_id);
  const lines = inventory.lines || [];
  return `
    <section class="panel">
      <div class="view-header">
        <div>
          <h2>Inventaire #${inventory.id}</h2>
          <p>${warehouse ? warehouse.name : inventory.warehouse_id}</p>
          <p>Statut : ${renderStatusBadge(inventory.status)}</p>
        </div>
        <button class="ghost" id="back-to-inventory">Retour</button>
      </div>
      <h3>Lignes comptabilisées (${lines.length})</h3>
      ${lines.length
        ? `<div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Article</th>
                  <th>Emplacement</th>
                  <th>Compté</th>
                  <th>Système</th>
                  <th>Écart</th>
                </tr>
              </thead>
              <tbody>
                ${lines
                  .map((line) => `
                    <tr>
                      <td>${line.item_id}</td>
                      <td>${line.location_id}</td>
                      <td>${formatQuantity(line.counted_qty)}</td>
                      <td>${formatQuantity(line.system_qty)}</td>
                      <td>${formatQuantity(line.difference)}</td>
                    </tr>
                  `)
                  .join("")}
              </tbody>
            </table>
          </div>`
        : `<p class="empty-state">Aucune ligne saisie pour le moment.</p>`}
      ${inventory.status !== "CLOSED" && canOperate()
        ? `<form id="inventory-line-form" class="section">
            <h3>Ajouter des lignes</h3>
            <div class="lines-container" id="inventory-lines"></div>
            <button class="secondary" type="button" id="add-inventory-line">Ajouter une ligne</button>
            <button class="primary" type="submit">Enregistrer</button>
          </form>`
        : ""}
      ${inventory.status !== "CLOSED" && isAdmin()
        ? `<button class="danger" id="close-inventory">Clôturer l'inventaire</button>`
        : ""}
    </section>
  `;
}

function attachInventoryDetailHandlers(inventory, warehouses, items) {
  document.getElementById("back-to-inventory").addEventListener("click", () => setView("inventory", {}, { skipHash: true }));
  if (inventory.status !== "CLOSED" && canOperate()) {
    const linesContainer = document.getElementById("inventory-lines");
    const addLineButton = document.getElementById("add-inventory-line");
    if (linesContainer && addLineButton) {
      const addLine = async () => {
        const warehouseLocations = await getLocationsForWarehouse(inventory.warehouse_id);
        if (!items.length || !warehouseLocations.length) {
          showInlineMessage("error", "Vérifier qu'il existe des articles et des emplacements");
          return;
        }
        const row = document.createElement("div");
        row.className = "line-row";
        row.innerHTML = `
          <select name="item_id" required>
            <option value="">Article</option>
            ${items.map((item) => `<option value="${item.id}">${item.sku} — ${item.name}</option>`).join("")}
          </select>
          <select name="location_id" required>
            <option value="">Emplacement</option>
            ${warehouseLocations.map((loc) => `<option value="${loc.id}">${loc.code}</option>`).join("")}
          </select>
          <input name="counted_qty" type="number" step="0.001" required />
          <button type="button" class="ghost">✕</button>
        `;
        row.querySelector("button").addEventListener("click", () => row.remove());
        linesContainer.appendChild(row);
      };
      addLineButton.addEventListener("click", addLine);
      if (linesContainer.children.length === 0) {
        addLine();
      }
      const lineForm = document.getElementById("inventory-line-form");
      if (lineForm) {
        lineForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const rows = Array.from(linesContainer.children);
          const lines = rows
            .map((row) => {
              const itemId = Number(row.querySelector("select[name='item_id']").value);
              const locationId = Number(row.querySelector("select[name='location_id']").value);
              const qty = parseFloat(row.querySelector("input[name='counted_qty']").value);
              return itemId && locationId && !Number.isNaN(qty)
                ? { item_id: itemId, location_id: locationId, counted_qty: qty }
                : null;
            })
            .filter(Boolean);
          if (!lines.length) {
            showInlineMessage("error", "Ajouter au moins une ligne valide");
            return;
          }
          try {
            await apiFetch(`/inventory-counts/${inventory.id}/lines`, {
              method: "POST",
              body: JSON.stringify({ lines })
            });
            showInlineMessage("success", "Lignes enregistrées");
            setView("inventory", { inventoryId: inventory.id }, { skipHash: true });
          } catch (err) {
            showInlineMessage("error", err.message);
          }
        });
      }
    }
  }

  if (inventory.status !== "CLOSED" && isAdmin()) {
    const closeButton = document.getElementById("close-inventory");
    if (closeButton) {
      closeButton.addEventListener("click", async () => {
        if (!confirm("Clôturer définitivement cette campagne ?")) {
          return;
        }
        try {
          await apiFetch(`/inventory-counts/${inventory.id}/close`, { method: "POST" });
          showInlineMessage("success", "Inventaire clôturé");
          setView("inventory", { inventoryId: inventory.id }, { skipHash: true });
        } catch (err) {
          showInlineMessage("error", err.message);
        }
      });
    }
  }
}

async function renderReporting() {
  mainViewEl.innerHTML = `<div class="loader">Chargement du reporting...</div>`;
  try {
    const [stockByItem, pendingInbounds, openOutbounds, operatorActivity, warehouseMap, tasks, financeSummary, hrSummary] = await Promise.all([
      safeApiFetch("/reports/stock-by-item", []),
      safeApiFetch("/reports/pending-inbounds", []),
      safeApiFetch("/reports/open-outbounds", []),
      safeApiFetch("/reports/operator-activity", { tasks: [], movements: [] }),
      safeApiFetch("/warehouse-map", []),
      safeApiFetch("/tasks", []),
      safeApiFetch("/reports/finance-summary", { enabled: false }),
      safeApiFetch("/reports/hr-summary", { enabled: false })
    ]);
    const topItems = stockByItem.slice(0, 10);
    const heatmapHtml = renderHeatmapPreview(warehouseMap || []);
    const pendingTasks = tasks.filter((task) => task.status === "PENDING");
    mainViewEl.innerHTML = `
      <div class="view-header">
        <h1>Reporting temps réel</h1>
        <p>Automatisations, tâches et santé de l'entrepôt en un coup d'œil.</p>
      </div>
      <div class="grid-responsive">
        <section class="panel">
          <div class="panel-title">
            <h2>Top 10 articles en mouvement</h2>
            <span>${formatDate(new Date())}</span>
          </div>
          ${topItems.length
            ? `<ul class="simple-list">
                ${topItems
                  .map(
                    (item, index) => `
                      <li>
                        <strong>#${index + 1} — ${item.sku}</strong>
                        <span>${item.name}</span>
                        <span class="value">${formatQuantity(item.total_quantity)}</span>
                      </li>`
                  )
                  .join("")}
              </ul>`
            : `<p class="empty-state">Pas de données disponibles.</p>`}
        </section>
        ${financeSummary?.enabled
          ? `<section class="panel">
              <div class="panel-title">
                <h2>Finance</h2>
                <span>${financeSummary.invoice_status.reduce((sum, item) => sum + Number(item.count || 0), 0)} écritures</span>
              </div>
              <div class="stats-list">
                ${financeSummary.invoice_status
                  .map((status) => `<div><span>${status.status}</span><strong>${status.count}</strong></div>`)
                  .join("")}
              </div>
              <div class="table-wrapper compact">
                <table>
                  <thead><tr><th>Facture</th><th>Client</th><th>Montant</th><th>Status</th></tr></thead>
                  <tbody>
                    ${financeSummary.latest_invoices
                      .map(
                        (invoice) => `
                          <tr>
                            <td>${invoice.number}</td>
                            <td>${invoice.party_name}</td>
                            <td>${formatCurrency(invoice.total_ttc)}</td>
                            <td>${invoice.status}</td>
                          </tr>`
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>
            </section>`
          : ""}
        <section class="panel">
          <div class="panel-title">
            <h2>Activité des opérateurs</h2>
            <span>7 derniers jours</span>
          </div>
          <div class="stats-list">
            ${operatorActivity.tasks
              .map((row) => `<div><span>${row.status}</span><strong>${row.count || row.count === 0 ? row.count : row.count}</strong></div>`)
              .join("") || `<p class="empty-state">Aucune activité.</p>`}
          </div>
          <div class="stats-list subtle">
            ${operatorActivity.movements
              .map((row) => `<div><span>${row.movement_type}</span><strong>${row.count}</strong></div>`)
              .join("")}
          </div>
        </section>
        <section class="panel">
          <div class="panel-title">
            <h2>Heatmap entrepôt</h2>
            <span>Occupation par zone</span>
          </div>
          ${heatmapHtml}
        </section>
        <section class="panel">
          <div class="panel-title">
            <h2>Tâches en cours</h2>
            <span>${pendingTasks.length} en attente</span>
          </div>
          ${pendingTasks.length
            ? `<ul class="task-list">
                ${pendingTasks
                  .slice(0, 6)
                  .map(
                    (task) => `
                      <li>
                        <div>
                          <strong>${task.type}</strong>
                          <span>${task.metadata?.location_code || task.metadata?.location_id || ""}</span>
                        </div>
                        <span class="badge">${task.priority}</span>
                      </li>`
                  )
                  .join("")}
              </ul>`
            : `<p class="empty-state">Aucune tâche à traiter.</p>`}
        </section>
        ${hrSummary?.enabled
          ? `<section class="panel">
              <div class="panel-title">
                <h2>RH & Paie</h2>
                <span>${hrSummary.employees_by_department.reduce((sum, row) => sum + Number(row.count || 0), 0)} collaborateurs</span>
              </div>
              <div class="stats-list">
                ${hrSummary.employees_by_department
                  .map((row) => `<div><span>${row.department || "N/A"}</span><strong>${row.count}</strong></div>`)
                  .join("")}
              </div>
              <div class="stats-list subtle">
                ${hrSummary.leaves
                  .map((row) => `<div><span>${row.status}</span><strong>${row.count}</strong></div>`)
                  .join("")}
              </div>
              <div class="stats-list subtle">
                ${hrSummary.payroll_runs
                  .map((row) => `<div><span>${row.status}</span><strong>${row.count}</strong></div>`)
                  .join("")}
              </div>
            </section>`
          : ""}
      </div>
      <div class="grid-two">
        <section class="panel">
          <h2>Réceptions en attente</h2>
          ${renderSimpleTable(pendingInbounds, ["reference", "supplier_name", "status", "expected_date"])}
        </section>
        <section class="panel">
          <h2>Commandes ouvertes</h2>
          ${renderSimpleTable(openOutbounds, ["reference", "customer_name", "status", "shipping_date"])}
        </section>
      </div>
    `;
  } catch (err) {
    showInlineMessage("error", err.message);
    mainViewEl.innerHTML = `<div class="empty-state">Impossible de charger le reporting.</div>`;
  }
}

if (state.token && state.user) {
  buildShell();
  setView(state.currentView || "dashboard", state.viewParams || {}, { skipHash: true });
} else {
  renderLogin();
}
