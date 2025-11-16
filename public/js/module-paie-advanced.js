const SAMPLE_RULES = [
  { code: "BRUT", label: "Salaire de base", type: "FIXE", value: "1 950 €" },
  { code: "HS25", label: "Heures supp. 25%", type: "% brut", value: "Taux × heures" },
  { code: "COT_PAT", label: "Charges patronales", type: "% brut", value: "42%" }
];

const SAMPLE_PROFILES = [
  { code: "CADRE", label: "Cadre", items: 18 },
  { code: "NCADRE", label: "Non cadre", items: 14 }
];

export function renderPayrollRulesSection(rules = SAMPLE_RULES) {
  return `
    <div class="panel">
      <h3>Règles de calcul</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Libellé</th>
            <th>Type</th>
            <th>Configuration</th>
          </tr>
        </thead>
        <tbody>
          ${rules
            .map(
              (rule) => `
                <tr>
                  <td>${rule.code}</td>
                  <td>${rule.label}</td>
                  <td>${rule.type}</td>
                  <td>${rule.value}</td>
                </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

export function renderPayrollProfilesSection(profiles = SAMPLE_PROFILES) {
  return `
    <div class="panel">
      <h3>Profils de paie</h3>
      <div class="kpi-grid">
        ${profiles
          .map(
            (profile) => `
              <div class="kpi-card">
                <span>${profile.code}</span>
                <strong>${profile.items}</strong>
                <small>rubriques</small>
              </div>`
          )
          .join("")}
      </div>
    </div>
  `;
}

export function renderSimulationSection() {
  return `
    <div class="panel">
      <h3>Simulation express</h3>
      <form class="simulation-form">
        <div class="form-group">
          <label>Salarié</label>
          <input type="text" placeholder="Rechercher" />
        </div>
        <div class="form-group">
          <label>Heures supplémentaires</label>
          <input type="number" min="0" step="0.5" value="2" />
        </div>
        <div class="form-group">
          <label>Prime exceptionnelle (€)</label>
          <input type="number" min="0" step="50" />
        </div>
        <button type="button" class="primary">Générer la simulation</button>
      </form>
    </div>
  `;
}

export function renderFinanceExportSection() {
  return `
    <div class="panel">
      <h3>Export comptable</h3>
      <p>Associez automatiquement les rubriques aux comptes de charges et dettes.</p>
      <button type="button" class="secondary">Configurer les comptes</button>
    </div>
  `;
}
