import { apiGet, apiPost, apiPatch } from "./api.js";
import { showModal, closeModal, showToast } from "./ui.js";

const navigation = [
  { id: "users", label: "Utilisateurs" },
  { id: "roles", label: "Rôles & permissions" },
  { id: "audit", label: "Journal" }
];

export const adminUsersModule = {
  id: "admin-users",
  label: "Administration utilisateurs",
  shortLabel: "Admin",
  description: "Gestion des comptes, rôles et audit.",
  icon: "⚙️",
  accent: "var(--module-admin)",
  permissions: ["CAN_MANAGE_USERS"],
  defaultSection: "users",
  navigation,
  async render(section, context) {
    switch (section) {
      case "roles":
        return renderRoles();
      case "audit":
        return renderAudit();
      default:
        return renderUsers(context);
    }
  }
};

async function renderUsers(context) {
  const [users, roles] = await Promise.all([apiGet("/users"), apiGet("/users/roles")]);
  return {
    title: "Utilisateurs",
    subtitle: "Créer, modifier, désactiver les comptes",
    html: `
      <div class="panel">
        <div class="panel-header" style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;">
          <div>
            <h3>Liste des comptes</h3>
            <p>${users.length} comptes actifs</p>
          </div>
          <button id="create-user" class="primary">Créer un utilisateur</button>
        </div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Email</th>
                <th>Rôle</th>
                <th>Statut</th>
                <th>Dernière connexion</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${users
                .map(
                  (user) => `
                    <tr>
                      <td>${user.username}</td>
                      <td>${user.email || "-"}</td>
                      <td>${user.role}</td>
                      <td><span class="badge ${user.is_active ? "success" : "danger"}">${user.is_active ? "Actif" : "Inactif"}</span></td>
                      <td>${user.last_login_at ? new Date(user.last_login_at).toLocaleString("fr-FR") : "-"}</td>
                      <td>
                        <button class="ghost" data-edit='${JSON.stringify(user)}'>Modifier</button>
                      </td>
                    </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    `,
    onMount(container) {
      container.querySelector("#create-user")?.addEventListener("click", () => openUserModal(null, roles, context));
      container.querySelectorAll("[data-edit]").forEach((button) => {
        button.addEventListener("click", () => {
          const user = JSON.parse(button.dataset.edit);
          openUserModal(user, roles, context);
        });
      });
    }
  };
}

async function renderRoles() {
  const roles = await apiGet("/users/roles");
  return {
    title: "Rôles & permissions",
    subtitle: "Référentiel des accès",
    html: `
      <section class="panel">
        ${roles
          .map(
            (role) => `
              <div class="role-card">
                <h3>${role.label}</h3>
                <p>${role.description || role.name}</p>
                <div class="badge">${role.permissions.length} permissions</div>
              </div>`
          )
          .join("")}
      </section>
    `
  };
}

async function renderAudit() {
  const entries = await apiGet("/admin/audit-log");
  return {
    title: "Journal de sécurité",
    subtitle: "Historique des actions sensibles",
    html: `
      <section class="panel">
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Utilisateur</th>
              <th>Action</th>
              <th>Objet</th>
            </tr>
          </thead>
          <tbody>
            ${entries
              .map(
                (entry) => `
                  <tr>
                    <td>${new Date(entry.created_at).toLocaleString("fr-FR")}</td>
                    <td>${entry.actor || "Système"}</td>
                    <td>${entry.action}</td>
                    <td>${entry.entity} #${entry.entity_id}</td>
                  </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </section>
    `
  };
}

function openUserModal(user, roles, context) {
  const title = user ? `Modifier ${user.username}` : "Créer un utilisateur";
  showModal(
    title,
    `
      <form id="user-form">
        <div class="form-group">
          <label>Identifiant</label>
          <input name="username" value="${user?.username ?? ""}" ${user ? "readonly" : ""} required />
        </div>
        <div class="form-group">
          <label>Email</label>
          <input name="email" type="email" value="${user?.email ?? ""}" />
        </div>
        ${user
          ? ""
          : `<div class="form-group"><label>Mot de passe</label><input name="password" type="password" required /></div>`}
        <div class="form-group">
          <label>Rôle</label>
          <select name="role" required>
            ${roles
              .map((role) => `<option value="${role.name}" ${role.name === user?.role ? "selected" : ""}>${role.label}</option>`)
              .join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Statut</label>
          <select name="is_active">
            <option value="true" ${user?.is_active !== false ? "selected" : ""}>Actif</option>
            <option value="false" ${user?.is_active === false ? "selected" : ""}>Inactif</option>
          </select>
        </div>
        <div class="inline-form">
          <button type="submit" class="primary">Enregistrer</button>
          <button type="button" class="ghost" id="close-modal">Annuler</button>
        </div>
      </form>
    `,
    {
      onSubmit: async (formData) => {
        try {
          if (user) {
            await apiPatch(`/users/${user.id}`, {
              email: formData.get("email"),
              role: formData.get("role"),
              is_active: formData.get("is_active") === "true"
            });
          } else {
            await apiPost("/users", {
              username: formData.get("username"),
              password: formData.get("password"),
              email: formData.get("email"),
              role: formData.get("role")
            });
          }
          closeModal();
          showToast("success", "Utilisateur enregistré");
          context?.rerender?.();
        } catch (error) {
          showToast("error", error.message);
        }
      }
    }
  );
  document.getElementById("close-modal")?.addEventListener("click", closeModal);
}
