const SAMPLE_ORG = [
  {
    company: "Groupe Nova",
    sites: [
      {
        name: "Siège Paris",
        departments: [
          { name: "Direction RH", head: "C. Martin" },
          { name: "Paie", head: "N. Leroy" }
        ]
      },
      {
        name: "Entrepôt Lyon",
        departments: [
          { name: "Opérations", head: "K. Mendes" },
          { name: "Support RH", head: "M. Diallo" }
        ]
      }
    ]
  }
];

const SAMPLE_SKILLS = [
  { label: "Management", level: 4 },
  { label: "Droit social", level: 3 },
  { label: "Analyse RH", level: 5 },
  { label: "Communication", level: 4 }
];

const SAMPLE_TRAININGS = [
  { label: "RGPD RH", date: "2023-09-10", status: "Réalisée" },
  { label: "Pilotage des compétences", date: "2023-12-05", status: "Planifiée" }
];

const SAMPLE_EVALUATIONS = [
  { campaign: "Annuel 2023", status: "Clôturé", completion: 100 },
  { campaign: "Mi-année 2024", status: "En cours", completion: 62 }
];

export function renderOrganizationSection(structure = SAMPLE_ORG) {
  return `
    <div class="panel">
      <h3>Organisation</h3>
      ${structure
        .map(
          (company) => `
            <div class="org-company">
              <h4>${company.company}</h4>
              ${company.sites
                .map(
                  (site) => `
                    <div class="org-site">
                      <strong>${site.name}</strong>
                      <ul>
                        ${site.departments
                          .map((dept) => `<li>${dept.name} · <span>${dept.head}</span></li>`)
                          .join("")}
                      </ul>
                    </div>`
                )
                .join("")}
            </div>`
        )
        .join("")}
    </div>
  `;
}

export function renderSkillsSection(skills = SAMPLE_SKILLS) {
  return `
    <div class="panel">
      <h3>Compétences clés</h3>
      <div class="skills-grid">
        ${skills
          .map(
            (skill) => `
              <div class="skill-card">
                <strong>${skill.label}</strong>
                <div class="skill-level" data-level="${skill.level}">
                  ${Array.from({ length: 5 })
                    .map((_, index) => `<span class="${index < skill.level ? "active" : ""}"></span>`)
                    .join("")}
                </div>
              </div>`
          )
          .join("")}
      </div>
    </div>
  `;
}

export function renderTrainingsSection(trainings = SAMPLE_TRAININGS) {
  return `
    <div class="panel">
      <h3>Formations</h3>
      <ul>
        ${trainings
          .map(
            (training) => `
              <li>
                <strong>${training.label}</strong>
                <div>${new Date(training.date).toLocaleDateString("fr-FR")} · ${training.status}</div>
              </li>`
          )
          .join("")}
      </ul>
    </div>
  `;
}

export function renderEvaluationsSection(campaigns = SAMPLE_EVALUATIONS) {
  return `
    <div class="panel">
      <h3>Campagnes d'évaluation</h3>
      ${campaigns
        .map(
          (campaign) => `
            <div class="evaluation-card">
              <div>
                <strong>${campaign.campaign}</strong>
                <p>${campaign.status}</p>
              </div>
              <div class="progress">
                <div class="bar" style="width:${campaign.completion}%"></div>
              </div>
            </div>`
        )
        .join("")}
    </div>
  `;
}
