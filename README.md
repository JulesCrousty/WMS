# ERP Logistique, Finance & RH/Paie

This repository now exposes a compact but functional ERP that unifies the previously isolated WMS module with brand new Finance and HR/Payroll capabilities. The goal is to provide an end-to-end demo stack that can be launched with Docker and exercised through a modern web UI.

## Highlights

- **Single Node.js + Express backend** serving both the REST API and the SPA assets.
- **PostgreSQL** database seeded with the full core + WMS + Finance + HR/Payroll schema.
- **JWT-secured authentication** with role-based permissions and dynamic module visibility.
- **Modular frontend** that activates the Dashboard, WMS, Finance, HR/Payroll and Reporting areas depending on the user role.
- **Docker Compose** stack (`web` + `db`) that becomes usable immediately after `docker compose up --build`.

## Functional scope

| Module | Key features available in the MVP |
| --- | --- |
| **Core / Administration** | Authentication, role/permission matrix, user creation and audit log extraction. |
| **WMS (Logistique)** | Catalogue, inbound/outbound flows, stock, movements, inventories, task engine, smart rules and reporting (feature-complete from the previous iteration). |
| **Finance / Accounting** | Chart of accounts, journals, fiscal years, manual entries with posting, customers/suppliers, invoices with automatic accounting entries, KPIs. |
| **HR / Personnel** | Employee files, contracts, leave types & requests (with validation), employee ↔ user linkage. |
| **Payroll** | Payroll items, payroll runs, payslip generation with detailed lines and campaign tracking. |
| **Reporting** | Cross-module KPIs: WMS alerts, overdue invoices, cash metrics, workforce KPIs, payroll campaigns, CSV/PDF-ready tables. |

## Running the stack

Requirements: Docker & Docker Compose.

```bash
docker compose up --build
```

Once the two containers are ready:

- Web application: http://localhost:8080
- API health check: http://localhost:8080/health
- Default super admin: `admin` / `admin123`

The PostgreSQL container loads `db/init.sql` on the first boot to create the full schema (core + WMS + Finance + HR/Payroll) and to seed reference data such as roles, permissions, warehouses, finance journals, payroll items, leave types, etc.

## Default roles and modules

| Role | Access |
| --- | --- |
| `ADMIN_SYSTEME` | Full control over every module and configuration. |
| `RESP_LOGISTIQUE` | WMS cockpit, automations, reporting. |
| `OPERATEUR_ENTREPOT` | Restricted WMS execution (receiving, picking, moves). |
| `COMPTABLE` | Finance module (journals, entries, invoicing) + reporting. |
| `RESP_FINANCIER` | Finance including configuration and budgets + reporting. |
| `ADMIN_RH` | HR master data, contracts, leave validation and payroll campaigns. |
| `TECHNICIEN_PAIE` | Payroll runs and payslip production. |
| `VIEWER_GLOBAL` | Read-only dashboard and multi-module reporting. |

Each role is mapped to a set of permissions and module toggles. The sidebar and the dashboard adapt automatically based on these permissions.

## Minimal flows delivered

- **WMS**: create an article, receive stock, process picking, review inventories and reporting within the unified shell.
- **Finance**: create accounts & journals, record a manual entry and post it, register a customer invoice and let the ERP generate its accounting entry automatically.
- **HR / Paie**: create an employee and a contract, record a leave request and validate it, create a payroll run and issue a minimal payslip.

## Local development

To run outside Docker you will need a PostgreSQL instance plus environment variables (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`). Then:

```bash
npm install
npm start
```

The web SPA is served from `/public` and consumes the Express REST API. No additional build tooling is required for this MVP.
