CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(50) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(20) NOT NULL,
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
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (item_id, location_id, batch_number, expiration_date)
);

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

-- Seed data
INSERT INTO users (username, password_hash, role, email)
VALUES ('admin', 'scrypt:766de236add650ea81fd66538f7f0a55:aab792a9d71d85bc480268f510f3406cd5e4f791ab34170b6a83a65467ef4e2c142591847a5d449b2ad86fddd044f5b8897858c3337d0dc6d8a46f6fb255da4d', 'ADMIN', 'admin@example.com')
ON CONFLICT (username) DO NOTHING;

INSERT INTO warehouses (code, name, address)
VALUES ('MAIN', 'Main Warehouse', '123 Supply Chain Ave')
ON CONFLICT (code) DO NOTHING;

INSERT INTO locations (warehouse_id, code, type, capacity)
SELECT id, 'RECEIVING-01', 'RECEIVING', 100 FROM warehouses WHERE code = 'MAIN'
ON CONFLICT DO NOTHING;

INSERT INTO locations (warehouse_id, code, type, capacity)
SELECT id, 'PICK-01', 'PICKING', 50 FROM warehouses WHERE code = 'MAIN'
ON CONFLICT DO NOTHING;

INSERT INTO items (sku, name, unit, barcode)
VALUES ('SKU-001', 'Demo Item', 'PCS', '1234567890123')
ON CONFLICT (sku) DO NOTHING;

