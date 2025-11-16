import { initRouter, navigateTo } from "./router.js";
import { login, logout, getStoredSession, saveSession, fetchCurrentUser } from "./auth.js";
import { initUI, showToast, applyTransition } from "./ui.js";
import { getAccessibleModules, getModuleDefinition, canAccessModule } from "./permissions.js";
import { wmsModule } from "./module-wms.js";
import { rhModule } from "./module-rh.js";
import { paieModule } from "./module-paie.js";
import { adminUsersModule } from "./module-admin-users.js";

const moduleRegistry = {
  [wmsModule.id]: wmsModule,
  [rhModule.id]: rhModule,
  [paieModule.id]: paieModule,
  [adminUsersModule.id]: adminUsersModule
};

const state = {
  user: null,
  token: null,
  routerInitialized: false
};

let viewContainer = null;
let moduleBadge = null;

document.addEventListener("DOMContentLoaded", () => {
  initUI();
  const session = getStoredSession();
  if (session?.token && session?.user) {
    state.user = session.user;
    state.token = session.token;
    renderShell();
    bootstrapRouter();
    navigateTo("/hub");
    refreshCurrentUser();
  } else {
    renderLogin();
  }
});

function bootstrapRouter() {
  if (state.routerInitialized) {
    return;
  }
  initRouter(handleRouteChange);
  state.routerInitialized = true;
}

async function refreshCurrentUser() {
  try {
    const user = await fetchCurrentUser();
    state.user = user;
    saveSession({ token: state.token ?? getStoredSession()?.token, user });
    updateHeaderUser();
  } catch (error) {
    handleLogout();
  }
}

function renderLogin(message = "") {
  const appRoot = document.getElementById("app");
  appRoot.innerHTML = `
    <div class="view-container">
      <div class="login-wrapper fade-in">
        <h1>ERP unifié</h1>
        <p>Connectez-vous pour accéder aux modules Logistique, RH et Paie.</p>
        <form id="login-form">
          <div class="form-group">
            <label>Identifiant</label>
            <input name="username" autocomplete="username" required />
          </div>
          <div class="form-group">
            <label>Mot de passe</label>
            <input name="password" type="password" autocomplete="current-password" required />
          </div>
          ${message ? `<p class="badge danger">${message}</p>` : ""}
          <button class="primary" type="submit">Connexion</button>
        </form>
      </div>
    </div>
  `;
  const form = document.getElementById("login-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    form.querySelector("button").disabled = true;
    const data = new FormData(form);
    try {
      const session = await login(data.get("username"), data.get("password"));
      state.token = session.token;
      state.user = session.user;
      saveSession(session);
      renderShell();
      bootstrapRouter();
      navigateTo("/hub");
      showToast("success", "Bienvenue dans l'ERP !");
    } catch (error) {
      showToast("error", error.message);
      renderLogin(error.message);
    } finally {
      form.querySelector("button").disabled = false;
    }
  });
}

function renderShell() {
  const appRoot = document.getElementById("app");
  appRoot.innerHTML = `
    <div class="erp-app">
      <header class="erp-header">
        <div class="brand">
          <div class="logo-mark">ERP</div>
          <div>
            <h1>Orion ERP</h1>
            <span>Logistique · RH · Paie</span>
          </div>
        </div>
        <div class="header-center">
          <span id="module-badge" class="module-badge">Hub</span>
        </div>
        <div class="header-actions">
          <div class="user-chip">
            <div class="avatar" id="user-avatar"></div>
            <div>
              <strong id="user-name"></strong>
              <span id="user-role"></span>
            </div>
          </div>
          <button class="ghost" id="logout-btn">Déconnexion</button>
        </div>
      </header>
      <div id="view-container" class="view-container"></div>
    </div>
  `;
  moduleBadge = document.getElementById("module-badge");
  viewContainer = document.getElementById("view-container");
  document.getElementById("logout-btn").addEventListener("click", handleLogout);
  updateHeaderUser();
}

function updateHeaderUser() {
  if (!state.user) return;
  const avatar = document.getElementById("user-avatar");
  const name = document.getElementById("user-name");
  const role = document.getElementById("user-role");
  if (avatar) {
    avatar.textContent = (state.user.username || "?").substring(0, 2).toUpperCase();
  }
  if (name) {
    name.textContent = state.user.username;
  }
  if (role) {
    role.textContent = state.user.role?.replace(/_/g, " ") || "";
  }
}

function handleLogout() {
  logout();
  state.user = null;
  state.token = null;
  renderLogin();
  navigateTo("/login");
}

function handleRouteChange(route) {
  if (!state.user) {
    renderLogin();
    if (route.type !== "login") {
      navigateTo("/login");
    }
    return;
  }
  if (!viewContainer) {
    renderShell();
  }
  if (route.type === "hub") {
    updateBadge("Hub");
    renderHub();
    return;
  }
  if (route.type === "module") {
    const module = moduleRegistry[route.moduleId];
    if (!module || !canAccessModule(state.user, module.id)) {
      showToast("error", "Accès non autorisé");
      navigateTo("/hub");
      return;
    }
    const section = route.section || module.defaultSection;
    updateBadge(module.shortLabel || module.label, module.accent);
    renderModuleWorkspace(module, section);
    return;
  }
  if (route.type === "login") {
    handleLogout();
    return;
  }
  navigateTo("/hub");
}

function updateBadge(label, accent) {
  if (moduleBadge) {
    moduleBadge.textContent = label;
    moduleBadge.style.background = accent ? accent : "var(--surface-muted)";
    moduleBadge.style.color = accent ? "#fff" : "var(--primary-dark)";
  }
}

function renderHub() {
  if (!viewContainer) return;
  const modules = getAccessibleModules(state.user);
  viewContainer.innerHTML = `
    <section class="hub fade-in">
      <div class="hub-hero">
        <p class="badge">Bienvenue ${state.user.username}</p>
        <h1>Bienvenue dans l'ERP</h1>
        <p>Choisissez un module pour accéder rapidement à vos espaces de travail. Vos permissions filtrent automatiquement les accès.</p>
      </div>
      ${modules.length
        ? `<div class="module-grid">
            ${modules
              .map(
                (module) => `
                  <article class="module-card" data-module="${module.id}">
                    <div class="icon" style="background:${module.accent}">${module.icon}</div>
                    <h2>${module.label}</h2>
                    <p>${module.description}</p>
                    <small>Accéder</small>
                  </article>`
              )
              .join("")}
          </div>`
        : `<p class="empty-state">Aucun module disponible pour votre profil.</p>`}
    </section>
  `;
  viewContainer.querySelectorAll(".module-card").forEach((card) => {
    card.addEventListener("click", () => {
      const moduleId = card.dataset.module;
      const module = getModuleDefinition(moduleId);
      navigateTo(`/app/${moduleId}/${module.defaultSection}`);
    });
  });
  const hub = viewContainer.querySelector(".hub");
  if (hub) {
    applyTransition(hub);
  }
}

async function renderModuleWorkspace(module, sectionId) {
  const section = module.navigation.find((entry) => entry.id === sectionId) || module.navigation[0];
  viewContainer.innerHTML = `
    <div class="module-shell fade-in">
      <aside class="module-sidebar">
        <h3>${module.label}</h3>
        <ul>
          ${module.navigation
            .map(
              (entry) => `
                <li>
                  <button class="${entry.id === section.id ? "active" : ""}" data-section="${entry.id}">${entry.label}</button>
                </li>`
            )
            .join("")}
        </ul>
      </aside>
      <section class="module-content">
        <div class="module-content-header">
          <h1 class="module-content-title">${section.label}</h1>
          <p class="module-content-subtitle"></p>
        </div>
        <div class="module-content-body">
          <div class="loader">Chargement...</div>
        </div>
      </section>
    </div>
  `;
  viewContainer.querySelectorAll("[data-section]").forEach((button) => {
    button.addEventListener("click", () => {
      navigateTo(`/app/${module.id}/${button.dataset.section}`);
    });
  });
  try {
    const result = await module.render(section.id, {
      user: state.user,
      rerender: () => renderModuleWorkspace(module, section.id)
    });
    const body = viewContainer.querySelector(".module-content-body");
    const title = viewContainer.querySelector(".module-content-title");
    const subtitle = viewContainer.querySelector(".module-content-subtitle");
    if (body) {
      body.innerHTML = result.html;
      result.onMount?.(body);
    }
    if (title && result.title) {
      title.textContent = result.title;
    }
    if (subtitle && result.subtitle) {
      subtitle.textContent = result.subtitle;
    }
  } catch (error) {
    viewContainer.querySelector(".module-content-body").innerHTML = `<p class="empty-state">${error.message}</p>`;
  }
}
