const appRoot = document.getElementById("app");

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "items", label: "Articles" },
  { id: "warehouses", label: "Entrepôts & Emplacements" },
  { id: "inbound", label: "Réceptions" },
  { id: "outbound", label: "Préparations" },
  { id: "stock", label: "Stock" },
  { id: "movements", label: "Mouvements" },
  { id: "inventory", label: "Inventaires" },
  { id: "reports", label: "Rapports" }
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
  viewParams: {}
};

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
  shellBuilt = false;
}

function isAdmin() {
  return state.user?.role === "ADMIN";
}

function canOperate() {
  return state.user && ["ADMIN", "OPERATOR"].includes(state.user.role);
}

function canEditItems() {
  return state.user && state.user.role !== "VIEWER";
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
      <h1>WMS</h1>
      <p>Connectez-vous pour accéder au système de gestion d'entrepôt.</p>
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
  appRoot.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar-header">
          <h2>WMS</h2>
        </div>
        <nav id="sidebar-nav">
          ${NAV_ITEMS
            .map(
              (item) =>
                `<a class="nav-link" data-view="${item.id}" href="#${item.id}">${item.label}</a>`
            )
            .join("")}
        </nav>
        <div class="sidebar-footer">
          &copy; ${new Date().getFullYear()} WMS Demo
        </div>
      </aside>
      <div class="content-area">
        <header class="app-header">
          <div>
            <strong>${state.user?.username || ""}</strong>
            <div class="badge">${state.user?.role || ""}</div>
          </div>
          <div class="user-info">
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
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const view = link.dataset.view;
      setView(view);
    });
  });
}

function setView(view, params = {}, options = {}) {
  if (!state.token) {
    renderLogin();
    return;
  }
  if (!shellBuilt) {
    buildShell();
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
    case "reports":
      renderReports();
      break;
    default:
      renderDashboard();
      break;
  }
}

async function renderDashboard() {
  mainViewEl.innerHTML = `<div class="loader">Chargement du tableau de bord...</div>`;
  try {
    const [items, pendingInbounds, openOutbounds, stockByItem] = await Promise.all([
      apiFetch("/items"),
      apiFetch("/reports/pending-inbounds"),
      apiFetch("/reports/open-outbounds"),
      apiFetch("/reports/stock-by-item")
    ]);
    const activeItems = items.filter((item) => item.is_active).length;
    const totalStock = stockByItem.reduce((sum, row) => sum + Number(row.total_quantity || 0), 0);
    mainViewEl.innerHTML = `
      <div class="view-header">
        <h1>Tableau de bord</h1>
      </div>
      <div class="card-grid">
        <div class="stat-card">
          <h3>Articles actifs</h3>
          <div class="value">${activeItems}</div>
        </div>
        <div class="stat-card">
          <h3>Réceptions ouvertes</h3>
          <div class="value">${pendingInbounds.length}</div>
        </div>
        <div class="stat-card">
          <h3>Commandes à préparer</h3>
          <div class="value">${openOutbounds.length}</div>
        </div>
        <div class="stat-card">
          <h3>Quantité totale en stock</h3>
          <div class="value">${formatQuantity(totalStock)}</div>
        </div>
      </div>
      <div class="quick-links">
        <button class="secondary" data-link="inbound">Réceptions en attente</button>
        <button class="secondary" data-link="outbound">Commandes à préparer</button>
        <button class="secondary" data-link="stock">Stock par article</button>
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
        setView("warehouses", { warehouseId: btn.dataset.viewLocations }, { skipHash: true });
      });
    });

    const closeBtn = document.getElementById("close-locations");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => setView("warehouses", {}, { skipHash: true }));
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
            setView("warehouses", {}, { skipHash: true });
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
            setView("warehouses", { warehouseId: payload.warehouse_id }, { skipHash: true });
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

async function renderReports() {
  mainViewEl.innerHTML = `<div class="loader">Chargement des rapports...</div>`;
  try {
    const [stockByItem, pendingInbounds, openOutbounds] = await Promise.all([
      apiFetch("/reports/stock-by-item"),
      apiFetch("/reports/pending-inbounds"),
      apiFetch("/reports/open-outbounds")
    ]);
    mainViewEl.innerHTML = `
      <div class="view-header">
        <h1>Rapports</h1>
      </div>
      <section class="panel">
        <h2>Stock par article</h2>
        ${stockByItem.length
          ? `<div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Libellé</th>
                    <th>Quantité totale</th>
                  </tr>
                </thead>
                <tbody>
                  ${stockByItem
                    .map(
                      (row) => `
                        <tr>
                          <td>${row.sku}</td>
                          <td>${row.name}</td>
                          <td>${formatQuantity(row.total_quantity)}</td>
                        </tr>
                      `
                    )
                    .join("")}
                </tbody>
              </table>
            </div>`
          : `<p class="empty-state">Aucun article trouvé.</p>`}
      </section>
      <section class="panel">
        <h2>Réceptions en attente</h2>
        ${pendingInbounds.length
          ? `<div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Référence</th>
                    <th>Fournisseur</th>
                    <th>Statut</th>
                    <th>Date prévue</th>
                  </tr>
                </thead>
                <tbody>
                  ${pendingInbounds
                    .map(
                      (order) => `
                        <tr>
                          <td>${order.reference}</td>
                          <td>${order.supplier_name || "-"}</td>
                          <td>${renderStatusBadge(order.status)}</td>
                          <td>${formatDate(order.expected_date)}</td>
                        </tr>
                      `
                    )
                    .join("")}
                </tbody>
              </table>
            </div>`
          : `<p class="empty-state">Aucune réception en attente.</p>`}
      </section>
      <section class="panel">
        <h2>Commandes ouvertes</h2>
        ${openOutbounds.length
          ? `<div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Référence</th>
                    <th>Client</th>
                    <th>Statut</th>
                    <th>Date d'expédition</th>
                  </tr>
                </thead>
                <tbody>
                  ${openOutbounds
                    .map(
                      (order) => `
                        <tr>
                          <td>${order.reference}</td>
                          <td>${order.customer_name || "-"}</td>
                          <td>${renderStatusBadge(order.status)}</td>
                          <td>${formatDate(order.shipping_date)}</td>
                        </tr>
                      `
                    )
                    .join("")}
                </tbody>
              </table>
            </div>`
          : `<p class="empty-state">Aucune commande ouverte.</p>`}
      </section>
    `;
  } catch (err) {
    showInlineMessage("error", err.message);
    mainViewEl.innerHTML = `<div class="empty-state">Impossible de charger les rapports.</div>`;
  }
}

if (state.token && state.user) {
  buildShell();
  setView(state.currentView || "dashboard", state.viewParams || {}, { skipHash: true });
} else {
  renderLogin();
}
