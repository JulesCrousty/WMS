import { safeApiGet } from "./api.js";
import { formatDate, formatCurrency } from "./utils.js";
import {
  renderPayrollProfilesSection,
  renderPayrollRulesSection,
  renderSimulationSection,
  renderFinanceExportSection
} from "./module-paie-advanced.js";

const navigation = [
  { id: "runs", label: "Campagnes" },
  { id: "payslips", label: "Bulletins" },
  { id: "parametrage", label: "Paramétrage" },
  { id: "simulation", label: "Simulations" },
  { id: "exports", label: "Exports" }
];

export const paieModule = {
  id: "paie",
  label: "Paie",
  shortLabel: "Paie",
  description: "Moteur de paie multi-structures, règles et exports.",
  icon: "💶",
  accent: "var(--module-paie)",
  permissions: ["PAYROLL_ACCESS"],
  defaultSection: "runs",
  navigation,
  async render(section) {
    switch (section) {
      case "payslips":
        return renderPayslips();
      case "parametrage":
        return renderParameters();
      case "simulation":
        return { title: "Simulations", subtitle: "Tester rapidement un bulletin", html: renderSimulationSection() };
      case "exports":
        return { title: "Exports", subtitle: "Lien Finance", html: renderFinanceExportSection() };
      default:
        return renderRuns();
    }
  }
};

async function renderRuns() {
  const runs = await safeApiGet("/payroll/runs", []);
  return {
    title: "Campagnes de paie",
    subtitle: "Pilotage des périodes et statuts",
    html: `
      <section class="panel">
        <table class="data-table">
          <thead>
            <tr>
              <th>Libellé</th>
              <th>Période</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            ${runs
              .map(
                (run) => `
                  <tr>
                    <td>${run.label}</td>
                    <td>${formatDate(run.period_start)} → ${formatDate(run.period_end)}</td>
                    <td><span class="badge ${run.status === "CLOSED" ? "success" : "warning"}">${run.status}</span></td>
                  </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </section>
    `
  };
}

async function renderPayslips() {
  const payslips = await safeApiGet("/payroll/payslips", []);
  return {
    title: "Bulletins",
    subtitle: "Dernières éditions",
    html: `
      <section class="panel">
        <table class="data-table">
          <thead>
            <tr>
              <th>Salarié</th>
              <th>Campagne</th>
              <th>Brut</th>
              <th>Net</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            ${payslips
              .map(
                (payslip) => `
                  <tr>
                    <td>${payslip.first_name} ${payslip.last_name}</td>
                    <td>${payslip.run_label}</td>
                    <td>${formatCurrency(payslip.gross_amount)}</td>
                    <td>${formatCurrency(payslip.net_amount)}</td>
                    <td>${formatDate(payslip.created_at)}</td>
                  </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </section>
    `
  };
}

async function renderParameters() {
  const items = await safeApiGet("/payroll/items", []);
  return {
    title: "Paramétrage",
    subtitle: "Profils, rubriques et règles",
    html: `${renderPayrollProfilesSection()}${renderPayrollRulesSection(
      items.map((item) => ({ code: item.code, label: item.label, type: item.type, value: "Voir règle" }))
    )}`
  };
}
