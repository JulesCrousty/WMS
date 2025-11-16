export function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("fr-FR");
}

export function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function formatNumber(value, options = {}) {
  const defaults = { minimumFractionDigits: 0, maximumFractionDigits: 0 };
  return Number(value || 0).toLocaleString("fr-FR", { ...defaults, ...options });
}

export function formatCurrency(value) {
  return Number(value || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}
