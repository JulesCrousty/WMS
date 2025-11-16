export const MODULE_DEFINITIONS = [
  {
    id: "wms",
    label: "Logistique & WMS",
    shortLabel: "WMS",
    description: "Pilotez les réceptions, préparations et inventaires de vos entrepôts.",
    icon: "🚚",
    accent: "var(--module-wms)",
    permissions: ["WMS_ACCESS"],
    defaultSection: "dashboard"
  },
  {
    id: "rh",
    label: "Ressources humaines",
    shortLabel: "RH",
    description: "Salariés, contrats, congés et organisation globale.",
    icon: "👥",
    accent: "var(--module-rh)",
    permissions: ["HR_ACCESS"],
    defaultSection: "employees"
  },
  {
    id: "paie",
    label: "Paie",
    shortLabel: "Paie",
    description: "Campagnes, profils et simulations de paie avancées.",
    icon: "💶",
    accent: "var(--module-paie)",
    permissions: ["PAYROLL_ACCESS"],
    defaultSection: "runs"
  },
  {
    id: "admin-users",
    label: "Administration utilisateurs",
    shortLabel: "Admin",
    description: "Gestion centralisée des comptes et rôles.",
    icon: "⚙️",
    accent: "var(--module-admin)",
    permissions: ["CAN_MANAGE_USERS"],
    defaultSection: "users"
  }
];

export function getModuleDefinition(id) {
  return MODULE_DEFINITIONS.find((module) => module.id === id);
}

export function canAccessModule(user, moduleId) {
  const module = getModuleDefinition(moduleId);
  if (!module) return false;
  return module.permissions.some((permission) => user?.permissions?.includes(permission));
}

export function getAccessibleModules(user) {
  return MODULE_DEFINITIONS.filter((module) => canAccessModule(user, module.id));
}

export function canManageUsers(user) {
  return user?.permissions?.includes("CAN_MANAGE_USERS");
}

export function hasPermission(user, permission) {
  return user?.permissions?.includes(permission);
}
