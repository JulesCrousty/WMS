CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(50) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(30) NOT NULL,
    email           VARCHAR(100),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    last_login_at   TIMESTAMP
);

CREATE TABLE IF NOT EXISTS warehouses (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(20) UNIQUE NOT NULL,
    name        VARCHAR(100) NOT NULL,
    address     TEXT,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS locations (
    id              SERIAL PRIMARY KEY,
    warehouse_id    INT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    code            VARCHAR(50) NOT NULL,
    type            VARCHAR(20) NOT NULL,
    capacity        INTEGER,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (warehouse_id, code)
);

CREATE TABLE IF NOT EXISTS items (
    id              SERIAL PRIMARY KEY,
    sku             VARCHAR(50) UNIQUE NOT NULL,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    unit            VARCHAR(20) NOT NULL DEFAULT 'PCS',
    barcode         VARCHAR(50),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock (
    id              SERIAL PRIMARY KEY,
    item_id         INT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    location_id     INT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    quantity        NUMERIC(14, 3) NOT NULL DEFAULT 0,
    batch_number    VARCHAR(50),
    expiration_date DATE,
    qa_status       VARCHAR(20) NOT NULL DEFAULT 'OK',
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (item_id, location_id, batch_number, expiration_date)
);

ALTER TABLE stock
    ADD COLUMN IF NOT EXISTS qa_status VARCHAR(20) NOT NULL DEFAULT 'OK';

CREATE TABLE IF NOT EXISTS inbound_orders (
    id              SERIAL PRIMARY KEY,
    reference       VARCHAR(50) UNIQUE NOT NULL,
    supplier_name   VARCHAR(255),
    warehouse_id    INT NOT NULL REFERENCES warehouses(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    expected_date   DATE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inbound_order_lines (
    id                  SERIAL PRIMARY KEY,
    inbound_order_id    INT NOT NULL REFERENCES inbound_orders(id) ON DELETE CASCADE,
    item_id             INT NOT NULL REFERENCES items(id),
    expected_qty        NUMERIC(14, 3) NOT NULL,
    received_qty        NUMERIC(14, 3) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS outbound_orders (
    id              SERIAL PRIMARY KEY,
    reference       VARCHAR(50) UNIQUE NOT NULL,
    customer_name   VARCHAR(255),
    warehouse_id    INT NOT NULL REFERENCES warehouses(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    shipping_date   DATE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outbound_order_lines (
    id                  SERIAL PRIMARY KEY,
    outbound_order_id   INT NOT NULL REFERENCES outbound_orders(id) ON DELETE CASCADE,
    item_id             INT NOT NULL REFERENCES items(id),
    ordered_qty         NUMERIC(14, 3) NOT NULL,
    picked_qty          NUMERIC(14, 3) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS movements (
    id                  SERIAL PRIMARY KEY,
    item_id             INT NOT NULL REFERENCES items(id),
    from_location_id    INT REFERENCES locations(id),
    to_location_id      INT REFERENCES locations(id),
    quantity            NUMERIC(14, 3) NOT NULL,
    movement_type       VARCHAR(20) NOT NULL,
    user_id             INT REFERENCES users(id),
    created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_counts (
    id              SERIAL PRIMARY KEY,
    warehouse_id    INT NOT NULL REFERENCES warehouses(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    started_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    closed_at       TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_count_lines (
    id                  SERIAL PRIMARY KEY,
    inventory_count_id  INT NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
    item_id             INT NOT NULL REFERENCES items(id),
    location_id         INT NOT NULL REFERENCES locations(id),
    counted_qty         NUMERIC(14, 3),
    system_qty          NUMERIC(14, 3),
    difference          NUMERIC(14, 3)
);

CREATE TABLE IF NOT EXISTS audit_log (
    id          SERIAL PRIMARY KEY,
    user_id     INT REFERENCES users(id),
    action      VARCHAR(50) NOT NULL,
    entity      VARCHAR(50) NOT NULL,
    entity_id   INT,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    details     JSONB
);

CREATE TABLE IF NOT EXISTS permissions (
    name        VARCHAR(60) PRIMARY KEY,
    description TEXT
);

CREATE TABLE IF NOT EXISTS roles (
    name        VARCHAR(40) PRIMARY KEY,
    label       VARCHAR(80) NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_name        VARCHAR(40) REFERENCES roles(name) ON DELETE CASCADE,
    permission_name  VARCHAR(60) REFERENCES permissions(name) ON DELETE CASCADE,
    PRIMARY KEY (role_name, permission_name)
);

CREATE TABLE IF NOT EXISTS putaway_rules (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(120) NOT NULL,
    strategy    VARCHAR(40) NOT NULL,
    criteria    JSONB NOT NULL,
    destination JSONB NOT NULL,
    priority    INT NOT NULL DEFAULT 0,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS picking_rules (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(120) NOT NULL,
    grouping    VARCHAR(40) NOT NULL,
    heuristics  JSONB NOT NULL,
    priority    INT NOT NULL DEFAULT 0,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
    id             SERIAL PRIMARY KEY,
    type           VARCHAR(40) NOT NULL,
    status         VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    priority       VARCHAR(10) NOT NULL DEFAULT 'MEDIUM',
    assigned_to    INT REFERENCES users(id),
    metadata       JSONB NOT NULL DEFAULT '{}',
    auto_generated BOOLEAN NOT NULL DEFAULT FALSE,
    due_at         TIMESTAMP,
    created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS location_thresholds (
    location_id INT PRIMARY KEY REFERENCES locations(id) ON DELETE CASCADE,
    min_qty     NUMERIC(14,3) NOT NULL DEFAULT 0,
    max_qty     NUMERIC(14,3)
);

CREATE TABLE IF NOT EXISTS quality_inspections (
    id               SERIAL PRIMARY KEY,
    inbound_order_id INT REFERENCES inbound_orders(id) ON DELETE SET NULL,
    stock_id         INT REFERENCES stock(id) ON DELETE SET NULL,
    status           VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    notes            TEXT,
    created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    resolved_at      TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cycle_count_runs (
    id             SERIAL PRIMARY KEY,
    warehouse_id   INT REFERENCES warehouses(id) ON DELETE CASCADE,
    strategy       VARCHAR(30) NOT NULL,
    locations      JSONB NOT NULL,
    created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Finance / Accounting
CREATE TABLE IF NOT EXISTS finance_accounts (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(20) UNIQUE NOT NULL,
    label           VARCHAR(255) NOT NULL,
    type            VARCHAR(20) NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS finance_journals (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(20) UNIQUE NOT NULL,
    label           VARCHAR(100) NOT NULL,
    type            VARCHAR(20) NOT NULL
);

CREATE TABLE IF NOT EXISTS finance_fiscal_years (
    id              SERIAL PRIMARY KEY,
    label           VARCHAR(100) NOT NULL UNIQUE,
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'OPEN'
);

CREATE TABLE IF NOT EXISTS finance_entries (
    id              SERIAL PRIMARY KEY,
    journal_id      INT NOT NULL REFERENCES finance_journals(id),
    fiscal_year_id  INT NOT NULL REFERENCES finance_fiscal_years(id),
    entry_date      DATE NOT NULL,
    reference       VARCHAR(50),
    label           VARCHAR(255),
    status          VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_entry_lines (
    id              SERIAL PRIMARY KEY,
    entry_id        INT NOT NULL REFERENCES finance_entries(id) ON DELETE CASCADE,
    account_id      INT NOT NULL REFERENCES finance_accounts(id),
    description     VARCHAR(255),
    debit           NUMERIC(14,2) NOT NULL DEFAULT 0,
    credit          NUMERIC(14,2) NOT NULL DEFAULT 0,
    analytic_code   VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS finance_parties (
    id              SERIAL PRIMARY KEY,
    type            VARCHAR(20) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    address         TEXT,
    email           VARCHAR(150),
    phone           VARCHAR(50),
    account_id      INT REFERENCES finance_accounts(id),
    UNIQUE (type, name)
);

CREATE TABLE IF NOT EXISTS finance_invoices (
    id              SERIAL PRIMARY KEY,
    party_id        INT NOT NULL REFERENCES finance_parties(id),
    number          VARCHAR(50) UNIQUE NOT NULL,
    invoice_date    DATE NOT NULL,
    due_date        DATE,
    total_ht        NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_tva       NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_ttc       NUMERIC(14,2) NOT NULL DEFAULT 0,
    status          VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_bank_transactions (
    id                  SERIAL PRIMARY KEY,
    statement_date      DATE NOT NULL,
    label               VARCHAR(255) NOT NULL,
    amount              NUMERIC(14,2) NOT NULL,
    reference           VARCHAR(100),
    reconciliation_note TEXT,
    reconciliation_status VARCHAR(20) NOT NULL DEFAULT 'UNMATCHED',
    entry_id            INT REFERENCES finance_entries(id)
);

-- Human Resources / Payroll
CREATE TABLE IF NOT EXISTS hr_employees (
    id              SERIAL PRIMARY KEY,
    employee_number VARCHAR(50) UNIQUE NOT NULL,
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(150),
    phone           VARCHAR(50),
    hire_date       DATE NOT NULL,
    end_date        DATE,
    job_title       VARCHAR(150),
    department      VARCHAR(150),
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS hr_employee_user_link (
    employee_id     INT NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (employee_id, user_id)
);

CREATE TABLE IF NOT EXISTS hr_contracts (
    id              SERIAL PRIMARY KEY,
    employee_id     INT NOT NULL REFERENCES hr_employees(id),
    type            VARCHAR(20) NOT NULL,
    start_date      DATE NOT NULL,
    end_date        DATE,
    base_salary     NUMERIC(14,2) NOT NULL,
    work_time_pct   NUMERIC(5,2) NOT NULL DEFAULT 100.0,
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS hr_leave_types (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(20) UNIQUE NOT NULL,
    label           VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS hr_leaves (
    id              SERIAL PRIMARY KEY,
    employee_id     INT NOT NULL REFERENCES hr_employees(id),
    leave_type_id   INT NOT NULL REFERENCES hr_leave_types(id),
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_items (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(20) UNIQUE NOT NULL,
    label           VARCHAR(255) NOT NULL,
    type            VARCHAR(20) NOT NULL,
    calculation_rule JSONB
);

CREATE TABLE IF NOT EXISTS payroll_runs (
    id              SERIAL PRIMARY KEY,
    label           VARCHAR(100) NOT NULL UNIQUE,
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'OPEN'
);

CREATE TABLE IF NOT EXISTS payroll_payslips (
    id              SERIAL PRIMARY KEY,
    payroll_run_id  INT NOT NULL REFERENCES payroll_runs(id),
    employee_id     INT NOT NULL REFERENCES hr_employees(id),
    contract_id     INT REFERENCES hr_contracts(id),
    gross_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
    net_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_payslip_lines (
    id              SERIAL PRIMARY KEY,
    payslip_id      INT NOT NULL REFERENCES payroll_payslips(id) ON DELETE CASCADE,
    payroll_item_id INT NOT NULL REFERENCES payroll_items(id),
    base_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
    rate            NUMERIC(7,4) NOT NULL DEFAULT 0,
    amount          NUMERIC(14,2) NOT NULL DEFAULT 0
);

-- Seed data
INSERT INTO users (username, password_hash, role, email)
VALUES ('admin', 'scrypt:766de236add650ea81fd66538f7f0a55:aab792a9d71d85bc480268f510f3406cd5e4f791ab34170b6a83a65467ef4e2c142591847a5d449b2ad86fddd044f5b8897858c3337d0dc6d8a46f6fb255da4d', 'ADMIN_SYSTEME', 'admin@example.com')
ON CONFLICT (username) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO permissions (name, description) VALUES
    ('CAN_MANAGE_USERS', 'Gestion complète des utilisateurs et des rôles'),
    ('CAN_CREATE_INBOUND_ORDER', 'Créer des ordres entrants'),
    ('CAN_RECEIVE', 'Effectuer les réceptions et contrôles qualité'),
    ('CAN_PICK', 'Réaliser les missions de picking'),
    ('CAN_MOVE_STOCK', 'Déclarer des mouvements internes'),
    ('CAN_ACCESS_INVENTORY', 'Consulter les stocks et inventaires'),
    ('CAN_VIEW_REPORTING', 'Accéder aux tableaux de bord avancés du WMS'),
    ('CAN_MANAGE_RULES', 'Configurer les règles de putaway et de picking'),
    ('CAN_MANAGE_ITEMS', 'Créer/éditer le catalogue articles'),
    ('CAN_VIEW_TASKS', 'Voir le moteur de tâches'),
    ('CAN_MANAGE_TASKS', 'Créer et assigner des tâches'),
    ('CAN_VIEW_HEATMAP', 'Visualiser la cartographie de l’entrepôt'),
    ('CAN_MANAGE_QUALITY', 'Gérer les contrôles qualité'),
    ('CAN_EXECUTE_TASKS', 'Marquer ses tâches comme réalisées'),
    ('WMS_ACCESS', 'Accès au module WMS dans l’ERP'),
    ('CORE_SETTINGS', 'Paramétrage global de l’ERP'),
    ('FINANCE_ACCESS', 'Accès au module Finance / Comptabilité'),
    ('FINANCE_VIEW', 'Lecture du plan comptable, journaux et écritures'),
    ('FINANCE_CONFIGURE', 'Paramétrage du plan comptable et des journaux'),
    ('FINANCE_OPERATE', 'Saisie et validation des écritures comptables'),
    ('FINANCE_INVOICE', 'Gestion des factures clients/fournisseurs'),
    ('HR_ACCESS', 'Accès au module RH'),
    ('HR_MANAGE_EMPLOYEES', 'Création et mise à jour des dossiers salariés'),
    ('HR_MANAGE_CONTRACTS', 'Gestion des contrats de travail'),
    ('HR_APPROVE_LEAVES', 'Validation des congés / absences'),
    ('PAYROLL_ACCESS', 'Accès au module Paie'),
    ('PAYROLL_CONFIGURE', 'Gestion des rubriques de paie'),
    ('PAYROLL_RUN', 'Lancement des campagnes de paie et génération des bulletins'),
    ('REPORTING_ACCESS', 'Accès aux rapports transverses ERP'),
    ('REPORTING_ADVANCED', 'Exports et reporting financiers avancés')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO roles (name, label, description) VALUES
    ('ADMIN_SYSTEME', 'Administrateur Système', 'Contrôle complet de l’ERP'),
    ('RESP_LOGISTIQUE', 'Responsable Logistique', 'Pilotage WMS & reporting opérationnel'),
    ('OPERATEUR_ENTREPOT', 'Opérateur Entrepôt', 'Réception, picking et mouvements'),
    ('RESP_FINANCIER', 'Responsable Financier', 'Pilotage comptable et reporting'),
    ('COMPTABLE', 'Comptable', 'Saisie d’écritures et facturation'),
    ('ADMIN_RH', 'Administrateur RH', 'Gestion RH & campagnes de paie'),
    ('TECHNICIEN_PAIE', 'Technicien Paie', 'Production de bulletins'),
    ('VIEWER_GLOBAL', 'Viewer global', 'Consultation multi-modules')
ON CONFLICT (name) DO UPDATE SET label = EXCLUDED.label, description = COALESCE(EXCLUDED.description, roles.description);

INSERT INTO role_permissions (role_name, permission_name)
SELECT 'ADMIN_SYSTEME', name FROM permissions
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_name, permission_name)
SELECT role_name, permission_name FROM (VALUES
    ('RESP_LOGISTIQUE', 'WMS_ACCESS'),
    ('RESP_LOGISTIQUE', 'CAN_CREATE_INBOUND_ORDER'),
    ('RESP_LOGISTIQUE', 'CAN_RECEIVE'),
    ('RESP_LOGISTIQUE', 'CAN_PICK'),
    ('RESP_LOGISTIQUE', 'CAN_MOVE_STOCK'),
    ('RESP_LOGISTIQUE', 'CAN_ACCESS_INVENTORY'),
    ('RESP_LOGISTIQUE', 'CAN_VIEW_REPORTING'),
    ('RESP_LOGISTIQUE', 'REPORTING_ACCESS'),
    ('RESP_LOGISTIQUE', 'CAN_MANAGE_RULES'),
    ('RESP_LOGISTIQUE', 'CAN_MANAGE_ITEMS'),
    ('RESP_LOGISTIQUE', 'CAN_VIEW_TASKS'),
    ('RESP_LOGISTIQUE', 'CAN_MANAGE_TASKS'),
    ('RESP_LOGISTIQUE', 'CAN_VIEW_HEATMAP'),
    ('RESP_LOGISTIQUE', 'CAN_MANAGE_QUALITY'),
    ('RESP_LOGISTIQUE', 'CAN_EXECUTE_TASKS'),
    ('OPERATEUR_ENTREPOT', 'WMS_ACCESS'),
    ('OPERATEUR_ENTREPOT', 'CAN_RECEIVE'),
    ('OPERATEUR_ENTREPOT', 'CAN_PICK'),
    ('OPERATEUR_ENTREPOT', 'CAN_MOVE_STOCK'),
    ('OPERATEUR_ENTREPOT', 'CAN_ACCESS_INVENTORY'),
    ('OPERATEUR_ENTREPOT', 'CAN_VIEW_TASKS'),
    ('OPERATEUR_ENTREPOT', 'CAN_EXECUTE_TASKS'),
    ('RESP_FINANCIER', 'FINANCE_ACCESS'),
    ('RESP_FINANCIER', 'FINANCE_VIEW'),
    ('RESP_FINANCIER', 'FINANCE_CONFIGURE'),
    ('RESP_FINANCIER', 'FINANCE_OPERATE'),
    ('RESP_FINANCIER', 'FINANCE_INVOICE'),
    ('RESP_FINANCIER', 'REPORTING_ACCESS'),
    ('RESP_FINANCIER', 'REPORTING_ADVANCED'),
    ('RESP_FINANCIER', 'CAN_VIEW_REPORTING'),
    ('COMPTABLE', 'FINANCE_ACCESS'),
    ('COMPTABLE', 'FINANCE_VIEW'),
    ('COMPTABLE', 'FINANCE_OPERATE'),
    ('COMPTABLE', 'FINANCE_INVOICE'),
    ('COMPTABLE', 'REPORTING_ACCESS'),
    ('COMPTABLE', 'CAN_VIEW_REPORTING'),
    ('ADMIN_RH', 'HR_ACCESS'),
    ('ADMIN_RH', 'HR_MANAGE_EMPLOYEES'),
    ('ADMIN_RH', 'HR_MANAGE_CONTRACTS'),
    ('ADMIN_RH', 'HR_APPROVE_LEAVES'),
    ('ADMIN_RH', 'PAYROLL_ACCESS'),
    ('ADMIN_RH', 'PAYROLL_CONFIGURE'),
    ('ADMIN_RH', 'PAYROLL_RUN'),
    ('ADMIN_RH', 'REPORTING_ACCESS'),
    ('TECHNICIEN_PAIE', 'PAYROLL_ACCESS'),
    ('TECHNICIEN_PAIE', 'PAYROLL_CONFIGURE'),
    ('TECHNICIEN_PAIE', 'PAYROLL_RUN'),
    ('TECHNICIEN_PAIE', 'REPORTING_ACCESS'),
    ('VIEWER_GLOBAL', 'WMS_ACCESS'),
    ('VIEWER_GLOBAL', 'FINANCE_ACCESS'),
    ('VIEWER_GLOBAL', 'CAN_ACCESS_INVENTORY'),
    ('VIEWER_GLOBAL', 'FINANCE_VIEW'),
    ('VIEWER_GLOBAL', 'HR_ACCESS'),
    ('VIEWER_GLOBAL', 'REPORTING_ACCESS'),
    ('VIEWER_GLOBAL', 'CAN_VIEW_REPORTING')
) AS seed(role_name, permission_name)
ON CONFLICT DO NOTHING;

INSERT INTO finance_accounts (code, label, type)
VALUES
    ('401000', 'Fournisseurs', 'LIABILITY'),
    ('411000', 'Clients', 'ASSET'),
    ('601000', 'Achats de marchandises', 'EXPENSE'),
    ('445710', 'TVA Collectée', 'LIABILITY'),
    ('512000', 'Banque', 'ASSET'),
    ('707000', 'Ventes de marchandises', 'INCOME')
ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label, type = EXCLUDED.type;

INSERT INTO finance_journals (code, label, type)
VALUES
    ('ACH', 'Journal Achats', 'PURCHASE'),
    ('VEN', 'Journal Ventes', 'SALES'),
    ('BNK', 'Journal Banque', 'BANK'),
    ('OD',  'Opérations diverses', 'GENERAL')
ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label, type = EXCLUDED.type;

INSERT INTO finance_fiscal_years (label, start_date, end_date, status)
VALUES ('EX2024', '2024-01-01', '2024-12-31', 'OPEN')
ON CONFLICT (label) DO UPDATE SET start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, status = EXCLUDED.status;

INSERT INTO finance_parties (type, name, address, email, phone, account_id)
VALUES
    ('CUSTOMER', 'Client Démo', '1 rue ERP, Paris', 'client@example.com', '+33100000000', (SELECT id FROM finance_accounts WHERE code = '411000')),
    ('SUPPLIER', 'Fournisseur Démo', '2 avenue Supply, Lyon', 'fournisseur@example.com', '+33400000000', (SELECT id FROM finance_accounts WHERE code = '401000'))
ON CONFLICT (type, name) DO NOTHING;

INSERT INTO finance_invoices (party_id, number, invoice_date, due_date, total_ht, total_tva, total_ttc, status)
VALUES (
    (SELECT id FROM finance_parties WHERE type = 'CUSTOMER' AND name = 'Client Démo'),
    'INV-0001',
    '2024-03-15',
    '2024-04-15',
    1200,
    240,
    1440,
    'VALIDATED'
)
ON CONFLICT (number) DO NOTHING;

INSERT INTO hr_leave_types (code, label)
VALUES
    ('CP', 'Congés payés'),
    ('RTT', 'Réduction du temps de travail'),
    ('MALADIE', 'Maladie')
ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label;

INSERT INTO hr_employees (employee_number, first_name, last_name, email, phone, hire_date, job_title, department)
VALUES ('EMP-001', 'Alicia', 'Martin', 'alicia.martin@example.com', '+33600000000', '2023-03-01', 'Responsable ADV', 'Logistique')
ON CONFLICT (employee_number) DO UPDATE SET email = EXCLUDED.email;

INSERT INTO hr_contracts (employee_id, type, start_date, base_salary, work_time_pct)
SELECT e.id, 'CDI', '2023-03-01', 2800, 100 FROM hr_employees e
WHERE e.employee_number = 'EMP-001'
  AND NOT EXISTS (SELECT 1 FROM hr_contracts WHERE employee_id = e.id);

INSERT INTO payroll_items (code, label, type, calculation_rule)
VALUES
    ('BASE', 'Salaire de base', 'EARNING', '{"type":"FIXED"}'),
    ('PRIME', 'Prime mensuelle', 'EARNING', '{"type":"BONUS"}'),
    ('RETENUE', 'Retenue salariale', 'DEDUCTION', '{"type":"RATE","rate":0.22}')
ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label, type = EXCLUDED.type, calculation_rule = EXCLUDED.calculation_rule;

INSERT INTO payroll_runs (label, period_start, period_end, status)
VALUES ('Paie Avril 2024', '2024-04-01', '2024-04-30', 'OPEN')
ON CONFLICT (label) DO NOTHING;

INSERT INTO putaway_rules (name, strategy, criteria, destination, priority)
VALUES (
    'Chaussures → Allée 12',
    'FAMILY',
    '{"family":"CHAUSSURES"}',
    '{"aisle":"12","zone":"PICK"}',
    10
)
ON CONFLICT DO NOTHING;

INSERT INTO picking_rules (name, grouping, heuristics, priority)
VALUES (
    'Picking ABC',
    'ZONE',
    '{"distance":"ABC","split":"auto"}',
    5
)
ON CONFLICT DO NOTHING;

INSERT INTO warehouses (code, name, address)
VALUES ('MAIN', 'Main Warehouse', '123 Supply Chain Ave')
ON CONFLICT (code) DO NOTHING;

INSERT INTO locations (warehouse_id, code, type, capacity)
SELECT id, 'RECEIVING-01', 'RECEIVING', 100 FROM warehouses WHERE code = 'MAIN'
ON CONFLICT DO NOTHING;

INSERT INTO locations (warehouse_id, code, type, capacity)
SELECT id, 'PICK-01', 'PICKING', 50 FROM warehouses WHERE code = 'MAIN'
ON CONFLICT DO NOTHING;

INSERT INTO location_thresholds (location_id, min_qty, max_qty)
SELECT l.id, 5, 80 FROM locations l
JOIN warehouses w ON w.id = l.warehouse_id AND w.code = 'MAIN'
WHERE l.code = 'PICK-01'
ON CONFLICT (location_id) DO NOTHING;

INSERT INTO items (sku, name, unit, barcode)
VALUES ('SKU-001', 'Demo Item', 'PCS', '1234567890123')
ON CONFLICT (sku) DO NOTHING;

