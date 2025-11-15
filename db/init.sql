CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(50) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(30) NOT NULL,
    email           VARCHAR(100),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
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

-- Seed data
INSERT INTO users (username, password_hash, role, email)
VALUES ('admin', 'scrypt:766de236add650ea81fd66538f7f0a55:aab792a9d71d85bc480268f510f3406cd5e4f791ab34170b6a83a65467ef4e2c142591847a5d449b2ad86fddd044f5b8897858c3337d0dc6d8a46f6fb255da4d', 'ADMIN', 'admin@example.com')
ON CONFLICT (username) DO NOTHING;

INSERT INTO permissions (name, description) VALUES
    ('CAN_MANAGE_USERS', 'Gestion complète des utilisateurs et des rôles'),
    ('CAN_CREATE_INBOUND_ORDER', 'Créer des ordres entrants'),
    ('CAN_RECEIVE', 'Effectuer les réceptions et contrôles qualité'),
    ('CAN_PICK', 'Réaliser les missions de picking'),
    ('CAN_MOVE_STOCK', 'Déclarer des mouvements internes'),
    ('CAN_ACCESS_INVENTORY', 'Consulter les stocks et inventaires'),
    ('CAN_VIEW_REPORTING', 'Accéder aux tableaux de bord avancés'),
    ('CAN_MANAGE_RULES', 'Configurer les règles de putaway et de picking'),
    ('CAN_MANAGE_ITEMS', 'Créer/éditer le catalogue articles'),
    ('CAN_VIEW_TASKS', 'Voir le moteur de tâches'),
    ('CAN_MANAGE_TASKS', 'Créer et assigner des tâches'),
    ('CAN_VIEW_HEATMAP', 'Visualiser la cartographie de l’entrepôt'),
    ('CAN_MANAGE_QUALITY', 'Gérer les contrôles qualité'),
    ('CAN_EXECUTE_TASKS', 'Marquer ses tâches comme réalisées')
ON CONFLICT (name) DO NOTHING;

INSERT INTO roles (name, label, description) VALUES
    ('ADMIN', 'Administrateur', 'Contrôle complet du WMS'),
    ('LOGISTICS_MANAGER', 'Manager Logistique', 'Pilotage opérationnel quotidien'),
    ('PICKER', 'Préparateur de commandes', 'Picking et packing'),
    ('RECEIVER', 'Réceptionnaire', 'Réceptions et contrôles qualité'),
    ('FORKLIFT', 'Cariste', 'Déplacements et réapprovisionnements'),
    ('VIEWER', 'Viewer', 'Consultation uniquement')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_name, permission_name)
SELECT role_name, permission_name FROM (VALUES
    ('ADMIN', 'CAN_MANAGE_USERS'),
    ('ADMIN', 'CAN_CREATE_INBOUND_ORDER'),
    ('ADMIN', 'CAN_RECEIVE'),
    ('ADMIN', 'CAN_PICK'),
    ('ADMIN', 'CAN_MOVE_STOCK'),
    ('ADMIN', 'CAN_ACCESS_INVENTORY'),
    ('ADMIN', 'CAN_VIEW_REPORTING'),
    ('ADMIN', 'CAN_MANAGE_RULES'),
    ('ADMIN', 'CAN_MANAGE_ITEMS'),
    ('ADMIN', 'CAN_VIEW_TASKS'),
    ('ADMIN', 'CAN_MANAGE_TASKS'),
    ('ADMIN', 'CAN_VIEW_HEATMAP'),
    ('ADMIN', 'CAN_MANAGE_QUALITY'),
    ('ADMIN', 'CAN_EXECUTE_TASKS'),
    ('LOGISTICS_MANAGER', 'CAN_CREATE_INBOUND_ORDER'),
    ('LOGISTICS_MANAGER', 'CAN_RECEIVE'),
    ('LOGISTICS_MANAGER', 'CAN_PICK'),
    ('LOGISTICS_MANAGER', 'CAN_MOVE_STOCK'),
    ('LOGISTICS_MANAGER', 'CAN_ACCESS_INVENTORY'),
    ('LOGISTICS_MANAGER', 'CAN_VIEW_REPORTING'),
    ('LOGISTICS_MANAGER', 'CAN_MANAGE_RULES'),
    ('LOGISTICS_MANAGER', 'CAN_MANAGE_ITEMS'),
    ('LOGISTICS_MANAGER', 'CAN_VIEW_TASKS'),
    ('LOGISTICS_MANAGER', 'CAN_MANAGE_TASKS'),
    ('LOGISTICS_MANAGER', 'CAN_VIEW_HEATMAP'),
    ('LOGISTICS_MANAGER', 'CAN_EXECUTE_TASKS'),
    ('PICKER', 'CAN_PICK'),
    ('PICKER', 'CAN_MOVE_STOCK'),
    ('PICKER', 'CAN_ACCESS_INVENTORY'),
    ('PICKER', 'CAN_VIEW_TASKS'),
    ('PICKER', 'CAN_EXECUTE_TASKS'),
    ('RECEIVER', 'CAN_CREATE_INBOUND_ORDER'),
    ('RECEIVER', 'CAN_RECEIVE'),
    ('RECEIVER', 'CAN_MOVE_STOCK'),
    ('RECEIVER', 'CAN_ACCESS_INVENTORY'),
    ('RECEIVER', 'CAN_VIEW_TASKS'),
    ('RECEIVER', 'CAN_MANAGE_QUALITY'),
    ('RECEIVER', 'CAN_EXECUTE_TASKS'),
    ('FORKLIFT', 'CAN_MOVE_STOCK'),
    ('FORKLIFT', 'CAN_VIEW_TASKS'),
    ('FORKLIFT', 'CAN_EXECUTE_TASKS'),
    ('FORKLIFT', 'CAN_ACCESS_INVENTORY'),
    ('VIEWER', 'CAN_ACCESS_INVENTORY'),
    ('VIEWER', 'CAN_VIEW_REPORTING'),
    ('VIEWER', 'CAN_VIEW_HEATMAP')
) AS seed(role_name, permission_name)
ON CONFLICT DO NOTHING;

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

