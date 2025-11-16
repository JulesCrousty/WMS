import { safeApiGet } from "./api.js";
import { formatDate } from "./utils.js";
import {
  renderOrganizationSection,
  renderSkillsSection,
  renderTrainingsSection,
  renderEvaluationsSection
} from "./module-rh-advanced.js";

const navigation = [
  { id: "employees", label: "Salariés" },
  { id: "contracts", label: "Contrats" },
  { id: "leaves", label: "Congés" },
  { id: "organisation", label: "Organisation" },
  { id: "competences", label: "Compétences" },
  { id: "evaluations", label: "Évaluations" },
  { id: "temps", label: "Temps de travail" }
];

export const rhModule = {
  id: "rh",
  label: "Ressources humaines",
  shortLabel: "RH",
  description: "Gestion RH avancée : dossiers, compétences, workflows.",
  icon: "👥",
  accent: "var(--module-rh)",
  permissions: ["HR_ACCESS"],
  defaultSection: "employees",
  navigation,
  async render(section) {
    switch (section) {
      case "contracts":
        return renderContracts();
      case "leaves":
        return renderLeaves();
      case "organisation":
        return { title: "Organisation", subtitle: "Structure hiérarchique", html: renderOrganizationSection() };
      case "competences":
        return {
          title: "Compétences",
          subtitle: "Cartographie des savoirs",
          html: `${renderSkillsSection()}${renderTrainingsSection()}`
        };
      case "evaluations":
        return { title: "Évaluations", subtitle: "Campagnes et avancement", html: renderEvaluationsSection() };
      case "temps":
        return renderTimeTracking();
      default:
        return renderEmployees();
    }
  }
};

async function renderEmployees() {
  const employees = await safeApiGet("/hr/employees", []);
  return {
    title: "Salariés",
    subtitle: "Vue synthétique des dossiers actifs",
    html: `
      <section class="panel">
        <table class="data-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Poste</th>
              <th>Service</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${employees
              .map(
                (employee) => `
                  <tr>
                    <td>${employee.first_name} ${employee.last_name}</td>
                    <td>${employee.job_title || "-"}</td>
                    <td>${employee.department || "-"}</td>
                    <td><span class="badge ${employee.status === "ACTIVE" ? "success" : "warning"}">${employee.status}</span></td>
                  </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </section>
    `
  };
}

async function renderContracts() {
  const contracts = await safeApiGet("/hr/contracts", []);
  return {
    title: "Contrats",
    subtitle: "Suivi des contrats en cours",
    html: `
      <section class="panel">
        <table class="data-table">
          <thead>
            <tr>
              <th>Salarié</th>
              <th>Type</th>
              <th>Début</th>
              <th>Fin</th>
            </tr>
          </thead>
          <tbody>
            ${contracts
              .map(
                (contract) => `
                  <tr>
                    <td>${contract.first_name} ${contract.last_name}</td>
                    <td>${contract.type}</td>
                    <td>${formatDate(contract.start_date)}</td>
                    <td>${formatDate(contract.end_date)}</td>
                  </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </section>
    `
  };
}

async function renderLeaves() {
  const leaves = await safeApiGet("/hr/leaves", []);
  return {
    title: "Congés & absences",
    subtitle: "Workflows et validations",
    html: `
      <section class="panel">
        <table class="data-table">
          <thead>
            <tr>
              <th>Salarié</th>
              <th>Type</th>
              <th>Du</th>
              <th>Au</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            ${leaves
              .map(
                (leave) => `
                  <tr>
                    <td>${leave.first_name} ${leave.last_name}</td>
                    <td>${leave.leave_type}</td>
                    <td>${formatDate(leave.start_date)}</td>
                    <td>${formatDate(leave.end_date)}</td>
                    <td><span class="badge ${leave.status === "APPROVED" ? "success" : leave.status === "PENDING" ? "warning" : "danger"}">${leave.status}</span></td>
                  </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </section>
    `
  };
}

function renderTimeTracking() {
  const entries = [
    { employee: "A. Bernard", date: "2024-05-13", planned: "09:00 - 17:00", actual: "08:55 - 18:20", overtime: 1.25 },
    { employee: "S. Lopez", date: "2024-05-13", planned: "08:00 - 16:00", actual: "08:02 - 16:05", overtime: 0.08 }
  ];
  return {
    title: "Temps de travail",
    subtitle: "Pointages vs horaires théoriques",
    html: `
      <section class="panel">
        <table class="data-table">
          <thead>
            <tr>
              <th>Salarié</th>
              <th>Date</th>
              <th>Prévu</th>
              <th>Pointé</th>
              <th>Heures sup.</th>
            </tr>
          </thead>
          <tbody>
            ${entries
              .map(
                (entry) => `
                  <tr>
                    <td>${entry.employee}</td>
                    <td>${formatDate(entry.date)}</td>
                    <td>${entry.planned}</td>
                    <td>${entry.actual}</td>
                    <td>${entry.overtime}h</td>
                  </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </section>
    `
  };
}
