import express from "express";
import { Pool } from "pg";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");

app.use(express.static(publicDir));

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || "wms",
  user: process.env.DB_USER || "wms_user",
  password: process.env.DB_PASSWORD || "wms_password",
});

const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret";

const PERMISSIONS = {
  CAN_MANAGE_USERS: "Gestion des utilisateurs",
  CAN_CREATE_INBOUND_ORDER: "Création d'ordres entrants",
  CAN_RECEIVE: "Réceptions et contrôle qualité",
  CAN_PICK: "Picking",
  CAN_MOVE_STOCK: "Mouvements internes",
  CAN_ACCESS_INVENTORY: "Consultation des stocks",
  CAN_VIEW_REPORTING: "Reporting avancé",
  CAN_MANAGE_RULES: "Configuration des règles",
  CAN_MANAGE_ITEMS: "Gestion du catalogue",
  CAN_VIEW_TASKS: "Visualisation des tâches",
  CAN_MANAGE_TASKS: "Pilotage du moteur de tâches",
  CAN_VIEW_HEATMAP: "Cartographie de l'entrepôt",
  CAN_MANAGE_QUALITY: "Gestion qualité",
  CAN_EXECUTE_TASKS: "Exécution de ses tâches"
};

const ALL_PERMISSIONS = Object.keys(PERMISSIONS);

const ROLE_DEFINITIONS = {
  ADMIN: {
    label: "Administrateur",
    permissions: ALL_PERMISSIONS
  },
  LOGISTICS_MANAGER: {
    label: "Manager Logistique",
    permissions: [
      "CAN_CREATE_INBOUND_ORDER",
      "CAN_RECEIVE",
      "CAN_PICK",
      "CAN_MOVE_STOCK",
      "CAN_ACCESS_INVENTORY",
      "CAN_VIEW_REPORTING",
      "CAN_MANAGE_RULES",
      "CAN_MANAGE_ITEMS",
      "CAN_VIEW_TASKS",
      "CAN_MANAGE_TASKS",
      "CAN_VIEW_HEATMAP",
      "CAN_EXECUTE_TASKS"
    ]
  },
  PICKER: {
    label: "Préparateur",
    permissions: [
      "CAN_PICK",
      "CAN_MOVE_STOCK",
      "CAN_ACCESS_INVENTORY",
      "CAN_VIEW_TASKS",
      "CAN_EXECUTE_TASKS"
    ]
  },
  RECEIVER: {
    label: "Réceptionnaire",
    permissions: [
      "CAN_CREATE_INBOUND_ORDER",
      "CAN_RECEIVE",
      "CAN_MOVE_STOCK",
      "CAN_ACCESS_INVENTORY",
      "CAN_VIEW_TASKS",
      "CAN_MANAGE_QUALITY",
      "CAN_EXECUTE_TASKS"
    ]
  },
  FORKLIFT: {
    label: "Cariste",
    permissions: [
      "CAN_MOVE_STOCK",
      "CAN_VIEW_TASKS",
      "CAN_EXECUTE_TASKS",
      "CAN_ACCESS_INVENTORY"
    ]
  },
  VIEWER: {
    label: "Viewer",
    permissions: [
      "CAN_ACCESS_INVENTORY",
      "CAN_VIEW_REPORTING",
      "CAN_VIEW_HEATMAP"
    ]
  }
};

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith("scrypt:")) {
    return false;
  }
  const [, saltHex, hashHex] = stored.split(":");
  const salt = Buffer.from(saltHex, "hex");
  const hash = Buffer.from(hashHex, "hex");
  const derived = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(hash, derived);
}

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function logAudit(client, userId, action, entity, entityId, details = {}) {
  await client.query(
    `INSERT INTO audit_log (user_id, action, entity, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`
    , [userId || null, action, entity, entityId || null, details]
  );
}

async function changeStock(client, itemId, locationId, delta, { batchNumber = null, expirationDate = null } = {}) {
  if (!delta) {
    return;
  }
  const existing = await client.query(
    `SELECT id, quantity FROM stock
     WHERE item_id = $1 AND location_id = $2
       AND batch_number IS NOT DISTINCT FROM $3
       AND expiration_date IS NOT DISTINCT FROM $4
     FOR UPDATE`,
    [itemId, locationId, batchNumber, expirationDate]
  );
  if (existing.rowCount > 0) {
    const current = Number(existing.rows[0].quantity);
    const nextQuantity = current + Number(delta);
    if (nextQuantity < 0) {
      throw new Error("Resulting stock cannot be negative");
    }
    await client.query(
      `UPDATE stock
         SET quantity = $1,
             batch_number = $3,
             expiration_date = $4,
             updated_at = NOW()
       WHERE id = $2`,
      [nextQuantity, existing.rows[0].id, batchNumber, expirationDate]
    );
  } else {
    if (delta < 0) {
      throw new Error("Cannot decrease stock for a non-existing record");
    }
    await client.query(
      `INSERT INTO stock (item_id, location_id, quantity, batch_number, expiration_date)
       VALUES ($1, $2, $3, $4, $5)`,
      [itemId, locationId, delta, batchNumber, expirationDate]
    );
  }
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res.status(401).json({ error: "Authorization header missing" });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "Token missing" });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { ...payload, permissions: getPermissionsForRole(payload.role) };
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

function getPermissionsForRole(role) {
  const definition = ROLE_DEFINITIONS[role];
  if (!definition) {
    return [];
  }
  return definition.permissions || [];
}

function userHasPermission(user, permission) {
  return Boolean(user?.permissions?.includes(permission));
}

function authorizePermissions(...permissions) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const missing = permissions.filter((perm) => !userHasPermission(req.user, perm));
    if (missing.length > 0) {
      return res.status(403).json({ error: "Missing permissions", details: missing });
    }
    next();
  };
}

function buildUserContext(row) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    permissions: getPermissionsForRole(row.role)
  };
}

async function ensureAutomationTables() {
  await pool.query(
    `ALTER TABLE stock
       ADD COLUMN IF NOT EXISTS qa_status VARCHAR(20) NOT NULL DEFAULT 'OK'`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS permissions (
        name        VARCHAR(60) PRIMARY KEY,
        description TEXT
     )`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS roles (
        name        VARCHAR(40) PRIMARY KEY,
        label       VARCHAR(80) NOT NULL,
        description TEXT
     )`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS role_permissions (
        role_name       VARCHAR(40) REFERENCES roles(name) ON DELETE CASCADE,
        permission_name VARCHAR(60) REFERENCES permissions(name) ON DELETE CASCADE,
        PRIMARY KEY (role_name, permission_name)
     )`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS putaway_rules (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(120) NOT NULL,
        strategy    VARCHAR(40) NOT NULL,
        criteria    JSONB NOT NULL,
        destination JSONB NOT NULL,
        priority    INT NOT NULL DEFAULT 0,
        active      BOOLEAN NOT NULL DEFAULT TRUE,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW()
     )`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS picking_rules (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(120) NOT NULL,
        grouping    VARCHAR(40) NOT NULL,
        heuristics  JSONB NOT NULL,
        priority    INT NOT NULL DEFAULT 0,
        active      BOOLEAN NOT NULL DEFAULT TRUE,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW()
     )`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS tasks (
        id             SERIAL PRIMARY KEY,
        type           VARCHAR(40) NOT NULL,
        status         VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        priority       VARCHAR(10) NOT NULL DEFAULT 'MEDIUM',
        assigned_to    INT REFERENCES users(id),
        metadata       JSONB NOT NULL DEFAULT '{}',
        auto_generated BOOLEAN NOT NULL DEFAULT FALSE,
        due_at         TIMESTAMP,
        created_at     TIMESTAMP NOT NULL DEFAULT NOW()
     )`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS location_thresholds (
        location_id INT PRIMARY KEY REFERENCES locations(id) ON DELETE CASCADE,
        min_qty     NUMERIC(14,3) NOT NULL DEFAULT 0,
        max_qty     NUMERIC(14,3)
     )`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS quality_inspections (
        id               SERIAL PRIMARY KEY,
        inbound_order_id INT REFERENCES inbound_orders(id) ON DELETE SET NULL,
        stock_id         INT REFERENCES stock(id) ON DELETE SET NULL,
        status           VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        notes            TEXT,
        created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
        resolved_at      TIMESTAMP
     )`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS cycle_count_runs (
        id           SERIAL PRIMARY KEY,
        warehouse_id INT REFERENCES warehouses(id) ON DELETE CASCADE,
        strategy     VARCHAR(30) NOT NULL,
        locations    JSONB NOT NULL,
        created_at   TIMESTAMP NOT NULL DEFAULT NOW()
     )`
  );
}

async function ensureRbacSeed() {
  for (const [name, description] of Object.entries(PERMISSIONS)) {
    await pool.query(
      `INSERT INTO permissions (name, description)
       VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description`,
      [name, description]
    );
  }

  for (const [name, definition] of Object.entries(ROLE_DEFINITIONS)) {
    await pool.query(
      `INSERT INTO roles (name, label, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET label = EXCLUDED.label, description = COALESCE(EXCLUDED.description, roles.description)`,
      [name, definition.label, definition.description || null]
    );

    for (const permission of definition.permissions || []) {
      await pool.query(
        `INSERT INTO role_permissions (role_name, permission_name)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [name, permission]
      );
    }
  }
}

async function ensureRuleSeed() {
  const existingPutaway = await pool.query(`SELECT COUNT(*)::INT AS count FROM putaway_rules`);
  if (existingPutaway.rows[0].count === 0) {
    await pool.query(
      `INSERT INTO putaway_rules (name, strategy, criteria, destination, priority)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        "Chaussures → Allée 12",
        "FAMILY",
        JSON.stringify({ family: "CHAUSSURES" }),
        JSON.stringify({ aisle: "12", zone: "PICK" }),
        10
      ]
    );
  }

  const existingPicking = await pool.query(`SELECT COUNT(*)::INT AS count FROM picking_rules`);
  if (existingPicking.rows[0].count === 0) {
    await pool.query(
      `INSERT INTO picking_rules (name, grouping, heuristics, priority)
       VALUES ($1, $2, $3, $4)`,
      [
        "Picking ABC",
        "ZONE",
        JSON.stringify({ distance: "ABC", split: "auto" }),
        5
      ]
    );
  }
}

async function bootstrap() {
  await ensureAutomationTables();
  await ensureRbacSeed();
  await ensureRuleSeed();
}

app.get("/health", asyncHandler(async (req, res) => {
  const result = await pool.query("SELECT 1 AS ok");
  res.json({ status: "ok", db: result.rows[0].ok });
}));

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.post("/auth/login", asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  const result = await pool.query("SELECT id, username, password_hash, role, is_active FROM users WHERE username = $1", [username]);
  const user = result.rows[0];
  if (!user || !user.is_active) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const valid = verifyPassword(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const userContext = buildUserContext(user);
  const token = jwt.sign({ id: userContext.id, username: userContext.username, role: userContext.role }, JWT_SECRET, { expiresIn: "8h" });
  res.json({ token, user: userContext });
}));

app.get("/users", authenticateToken, authorizePermissions("CAN_MANAGE_USERS"), asyncHandler(async (req, res) => {
  const result = await pool.query("SELECT id, username, role, email, is_active, created_at FROM users ORDER BY id");
  res.json(result.rows);
}));

app.post("/users", authenticateToken, authorizePermissions("CAN_MANAGE_USERS"), asyncHandler(async (req, res) => {
  const { username, password, role, email } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: "username, password and role are required" });
  }
  const passwordHash = hashPassword(password);
  const result = await pool.query(
    `INSERT INTO users (username, password_hash, role, email)
     VALUES ($1, $2, $3, $4)
     RETURNING id, username, role, email, created_at`,
    [username, passwordHash, role, email || null]
  );
  res.status(201).json(result.rows[0]);
}));

app.get("/users/roles", authenticateToken, authorizePermissions("CAN_MANAGE_USERS"), asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT r.name, r.label, r.description,
            COALESCE(json_agg(rp.permission_name) FILTER (WHERE rp.permission_name IS NOT NULL), '[]'::json) AS permissions
     FROM roles r
     LEFT JOIN role_permissions rp ON rp.role_name = r.name
     GROUP BY r.name, r.label, r.description
     ORDER BY r.name`
  );
  res.json(result.rows);
}));

app.get("/items", authenticateToken, authorizePermissions("CAN_ACCESS_INVENTORY"), asyncHandler(async (req, res) => {
  const { search } = req.query;
  let query = "SELECT id, sku, name, barcode, unit, is_active FROM items";
  const values = [];
  if (search) {
    query += " WHERE sku ILIKE $1 OR name ILIKE $1 OR barcode ILIKE $1";
    values.push(`%${search}%`);
  }
  query += " ORDER BY id";
  const result = await pool.query(query, values);
  res.json(result.rows);
}));

app.post("/items", authenticateToken, authorizePermissions("CAN_MANAGE_ITEMS"), asyncHandler(async (req, res) => {
  const { sku, name, description, unit, barcode, is_active } = req.body;
  if (!sku || !name) {
    return res.status(400).json({ error: "sku and name are required" });
  }
  const result = await pool.query(
    `INSERT INTO items (sku, name, description, unit, barcode, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, sku, name, unit, barcode, is_active`,
    [sku, name, description || null, unit || "PCS", barcode || null, is_active ?? true]
  );
  res.status(201).json(result.rows[0]);
}));

app.put("/items/:id", authenticateToken, authorizePermissions("CAN_MANAGE_ITEMS"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { sku, name, description, unit, barcode, is_active } = req.body;
  const result = await pool.query(
    `UPDATE items
     SET sku = COALESCE($1, sku),
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         unit = COALESCE($4, unit),
         barcode = COALESCE($5, barcode),
         is_active = COALESCE($6, is_active)
     WHERE id = $7
     RETURNING id, sku, name, unit, barcode, is_active`,
    [sku, name, description, unit, barcode, is_active, id]
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Item not found" });
  }
  res.json(result.rows[0]);
}));

app.post("/items/:id/deactivate", authenticateToken, authorizePermissions("CAN_MANAGE_ITEMS"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(
    `UPDATE items SET is_active = FALSE WHERE id = $1 RETURNING id, sku, name, is_active`,
    [id]
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Item not found" });
  }
  res.json(result.rows[0]);
}));

app.get("/warehouses", authenticateToken, authorizePermissions("CAN_ACCESS_INVENTORY"), asyncHandler(async (req, res) => {
  const result = await pool.query("SELECT id, code, name, address FROM warehouses ORDER BY id");
  res.json(result.rows);
}));

app.post("/warehouses", authenticateToken, authorizePermissions("CAN_MANAGE_RULES"), asyncHandler(async (req, res) => {
  const { code, name, address } = req.body;
  if (!code || !name) {
    return res.status(400).json({ error: "code and name are required" });
  }
  const result = await pool.query(
    `INSERT INTO warehouses (code, name, address)
     VALUES ($1, $2, $3)
     RETURNING id, code, name, address`,
    [code, name, address || null]
  );
  res.status(201).json(result.rows[0]);
}));

app.get("/warehouses/:warehouseId/locations", authenticateToken, authorizePermissions("CAN_ACCESS_INVENTORY"), asyncHandler(async (req, res) => {
  const { warehouseId } = req.params;
  const result = await pool.query(
    `SELECT id, warehouse_id, code, type, capacity
     FROM locations
     WHERE warehouse_id = $1
     ORDER BY code`,
    [warehouseId]
  );
  res.json(result.rows);
}));

app.post("/locations", authenticateToken, authorizePermissions("CAN_MANAGE_RULES"), asyncHandler(async (req, res) => {
  const { warehouse_id, code, type, capacity } = req.body;
  if (!warehouse_id || !code || !type) {
    return res.status(400).json({ error: "warehouse_id, code and type are required" });
  }
  const result = await pool.query(
    `INSERT INTO locations (warehouse_id, code, type, capacity)
     VALUES ($1, $2, $3, $4)
     RETURNING id, warehouse_id, code, type, capacity`,
    [warehouse_id, code, type, capacity || null]
  );
  res.status(201).json(result.rows[0]);
}));

app.post("/inbound-orders", authenticateToken, authorizePermissions("CAN_CREATE_INBOUND_ORDER"), asyncHandler(async (req, res) => {
  const { reference, supplier_name, warehouse_id, expected_date, lines } = req.body;
  if (!reference || !warehouse_id || !Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: "reference, warehouse_id and at least one line are required" });
  }

  const created = await withTransaction(async (client) => {
    const orderResult = await client.query(
      `INSERT INTO inbound_orders (reference, supplier_name, warehouse_id, expected_date)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [reference, supplier_name || null, warehouse_id, expected_date || null]
    );
    const order = orderResult.rows[0];

    for (const line of lines) {
      if (!line.item_id || !line.expected_qty) {
        throw new Error("Each line must include item_id and expected_qty");
      }
      await client.query(
        `INSERT INTO inbound_order_lines (inbound_order_id, item_id, expected_qty)
         VALUES ($1, $2, $3)`,
        [order.id, line.item_id, line.expected_qty]
      );
    }

    await logAudit(client, req.user.id, "CREATE", "inbound_orders", order.id, { reference });
    return order;
  });

  res.status(201).json(created);
}));

app.get("/inbound-orders", authenticateToken, asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT io.id, io.reference, io.supplier_name, io.warehouse_id, io.status, io.expected_date, io.created_at,
            json_agg(json_build_object('id', iol.id, 'item_id', iol.item_id, 'expected_qty', iol.expected_qty, 'received_qty', iol.received_qty))
            FILTER (WHERE iol.id IS NOT NULL) AS lines
     FROM inbound_orders io
     LEFT JOIN inbound_order_lines iol ON io.id = iol.inbound_order_id
     GROUP BY io.id
     ORDER BY io.created_at DESC`
  );
  res.json(result.rows);
}));

app.post("/inbound-orders/:id/receive", authenticateToken, authorizePermissions("CAN_RECEIVE"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { receipts } = req.body;
  if (!Array.isArray(receipts) || receipts.length === 0) {
    return res.status(400).json({ error: "receipts array is required" });
  }

  const result = await withTransaction(async (client) => {
    const orderResult = await client.query("SELECT id, status FROM inbound_orders WHERE id = $1 FOR UPDATE", [id]);
    const order = orderResult.rows[0];
    if (!order) {
      throw new Error("Inbound order not found");
    }

    for (const receipt of receipts) {
      const { line_id, received_qty, to_location_id, batch_number = null, expiration_date = null } = receipt;
      if (!line_id || !received_qty || !to_location_id) {
        throw new Error("line_id, received_qty and to_location_id are required for each receipt");
      }

      const lineResult = await client.query(
        `SELECT * FROM inbound_order_lines WHERE id = $1 AND inbound_order_id = $2 FOR UPDATE`,
        [line_id, id]
      );
      const line = lineResult.rows[0];
      if (!line) {
        throw new Error(`Line ${line_id} not found on order`);
      }

      await client.query(
        `UPDATE inbound_order_lines SET received_qty = received_qty + $1 WHERE id = $2`,
        [received_qty, line_id]
      );

      await changeStock(client, line.item_id, to_location_id, Number(received_qty), {
        batchNumber: batch_number,
        expirationDate: expiration_date,
      });

      await client.query(
        `INSERT INTO movements (item_id, from_location_id, to_location_id, quantity, movement_type, user_id)
         VALUES ($1, NULL, $2, $3, 'RECEIPT', $4)`,
        [line.item_id, to_location_id, received_qty, req.user.id]
      );
    }

    const totals = await client.query(
      `SELECT SUM(expected_qty) AS expected, SUM(received_qty) AS received
       FROM inbound_order_lines
       WHERE inbound_order_id = $1`,
      [id]
    );
    const expected = Number(totals.rows[0].expected || 0);
    const received = Number(totals.rows[0].received || 0);
    const newStatus = received >= expected ? "CLOSED" : "IN_PROGRESS";
    await client.query(`UPDATE inbound_orders SET status = $1 WHERE id = $2`, [newStatus, id]);

    await logAudit(client, req.user.id, "RECEIVE", "inbound_orders", id, { receipts });
    return { status: newStatus };
  });

  res.json({ message: "Receipts saved", status: result.status });
}));

app.get("/stock", authenticateToken, asyncHandler(async (req, res) => {
  const { item_id, warehouse_id, location_id } = req.query;
  const clauses = [];
  const values = [];
  if (item_id) {
    values.push(item_id);
    clauses.push(`s.item_id = $${values.length}`);
  }
  if (warehouse_id) {
    values.push(warehouse_id);
    clauses.push(`l.warehouse_id = $${values.length}`);
  }
  if (location_id) {
    values.push(location_id);
    clauses.push(`s.location_id = $${values.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const query = `
    SELECT s.id, s.item_id, i.sku, i.name, s.location_id, l.code AS location_code, l.warehouse_id,
           s.quantity, s.batch_number, s.expiration_date, s.updated_at
    FROM stock s
    JOIN items i ON i.id = s.item_id
    JOIN locations l ON l.id = s.location_id
    ${where}
    ORDER BY i.sku, l.code
  `;
  const result = await pool.query(query, values);
  res.json(result.rows);
}));

app.post("/movements", authenticateToken, authorizePermissions("CAN_MOVE_STOCK"), asyncHandler(async (req, res) => {
  const { item_id, from_location_id, to_location_id, quantity, movement_type = "MOVE" } = req.body;
  if (!item_id || !to_location_id || !quantity) {
    return res.status(400).json({ error: "item_id, to_location_id and quantity are required" });
  }

  const data = await withTransaction(async (client) => {
    if (from_location_id) {
      await changeStock(client, item_id, from_location_id, -Number(quantity));
    }

    await changeStock(client, item_id, to_location_id, Number(quantity));

    const movement = await client.query(
      `INSERT INTO movements (item_id, from_location_id, to_location_id, quantity, movement_type, user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [item_id, from_location_id || null, to_location_id, quantity, movement_type, req.user.id]
    );

    return movement.rows[0];
  });

  res.status(201).json(data);
}));

app.get("/movements", authenticateToken, asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT m.id, m.item_id, i.sku, i.name, m.from_location_id, lf.code AS from_location_code,
            m.to_location_id, lt.code AS to_location_code, m.quantity, m.movement_type, m.user_id, m.created_at
     FROM movements m
     JOIN items i ON i.id = m.item_id
     LEFT JOIN locations lf ON lf.id = m.from_location_id
     LEFT JOIN locations lt ON lt.id = m.to_location_id
     ORDER BY m.created_at DESC
     LIMIT 200`
  );
  res.json(result.rows);
}));

app.post("/outbound-orders", authenticateToken, authorizePermissions("CAN_PICK"), asyncHandler(async (req, res) => {
  const { reference, customer_name, warehouse_id, shipping_date, lines } = req.body;
  if (!reference || !warehouse_id || !Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: "reference, warehouse_id and at least one line are required" });
  }

  const order = await withTransaction(async (client) => {
    const header = await client.query(
      `INSERT INTO outbound_orders (reference, customer_name, warehouse_id, shipping_date)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [reference, customer_name || null, warehouse_id, shipping_date || null]
    );

    for (const line of lines) {
      if (!line.item_id || !line.ordered_qty) {
        throw new Error("Each line must include item_id and ordered_qty");
      }
      await client.query(
        `INSERT INTO outbound_order_lines (outbound_order_id, item_id, ordered_qty)
         VALUES ($1, $2, $3)`,
        [header.rows[0].id, line.item_id, line.ordered_qty]
      );
    }

    await logAudit(client, req.user.id, "CREATE", "outbound_orders", header.rows[0].id, { reference });
    return header.rows[0];
  });

  res.status(201).json(order);
}));

app.get("/outbound-orders", authenticateToken, asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT oo.id, oo.reference, oo.customer_name, oo.warehouse_id, oo.status, oo.shipping_date, oo.created_at,
            json_agg(json_build_object('id', ool.id, 'item_id', ool.item_id, 'ordered_qty', ool.ordered_qty, 'picked_qty', ool.picked_qty))
            FILTER (WHERE ool.id IS NOT NULL) AS lines
     FROM outbound_orders oo
     LEFT JOIN outbound_order_lines ool ON oo.id = ool.outbound_order_id
     GROUP BY oo.id
     ORDER BY oo.created_at DESC`
  );
  res.json(result.rows);
}));

app.post("/outbound-orders/:id/pick", authenticateToken, authorizePermissions("CAN_PICK"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { picks } = req.body;
  if (!Array.isArray(picks) || picks.length === 0) {
    return res.status(400).json({ error: "picks array is required" });
  }

  await withTransaction(async (client) => {
    const order = await client.query("SELECT id, status FROM outbound_orders WHERE id = $1 FOR UPDATE", [id]);
    if (!order.rows[0]) {
      throw new Error("Outbound order not found");
    }

    for (const pick of picks) {
      const { line_id, picked_qty, from_location_id } = pick;
      if (!line_id || !picked_qty || !from_location_id) {
        throw new Error("line_id, picked_qty and from_location_id are required for each pick");
      }
      const lineResult = await client.query(
        `SELECT * FROM outbound_order_lines WHERE id = $1 AND outbound_order_id = $2 FOR UPDATE`,
        [line_id, id]
      );
      const line = lineResult.rows[0];
      if (!line) {
        throw new Error(`Line ${line_id} not found on order`);
      }

      const stockResult = await client.query(
        `SELECT quantity FROM stock WHERE item_id = $1 AND location_id = $2 AND batch_number IS NULL AND expiration_date IS NULL FOR UPDATE`,
        [line.item_id, from_location_id]
      );
      const available = Number(stockResult.rows[0]?.quantity || 0);
      if (available < picked_qty) {
        throw new Error("Insufficient stock at selected location");
      }

      await changeStock(client, line.item_id, from_location_id, -Number(picked_qty));

      await client.query(
        `UPDATE outbound_order_lines SET picked_qty = picked_qty + $1 WHERE id = $2`,
        [picked_qty, line_id]
      );

      await client.query(
        `INSERT INTO movements (item_id, from_location_id, to_location_id, quantity, movement_type, user_id)
         VALUES ($1, $2, NULL, $3, 'PICK', $4)`,
        [line.item_id, from_location_id, picked_qty, req.user.id]
      );
    }

    const totals = await client.query(
      `SELECT SUM(ordered_qty) AS ordered, SUM(picked_qty) AS picked
       FROM outbound_order_lines
       WHERE outbound_order_id = $1`,
      [id]
    );
    const ordered = Number(totals.rows[0].ordered || 0);
    const picked = Number(totals.rows[0].picked || 0);
    const newStatus = picked >= ordered ? "SHIPPED" : "PICKING";
    await client.query(`UPDATE outbound_orders SET status = $1 WHERE id = $2`, [newStatus, id]);

    await logAudit(client, req.user.id, "PICK", "outbound_orders", id, { picks });
  });

  res.json({ message: "Picks saved" });
}));

app.get("/inventory-counts", authenticateToken, asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT ic.id, ic.warehouse_id, w.name AS warehouse_name, ic.status, ic.started_at, ic.closed_at,
            COALESCE(json_agg(json_build_object(
              'id', icl.id,
              'item_id', icl.item_id,
              'location_id', icl.location_id,
              'counted_qty', icl.counted_qty,
              'system_qty', icl.system_qty,
              'difference', icl.difference
            ) ORDER BY icl.id) FILTER (WHERE icl.id IS NOT NULL), '[]'::json) AS lines
     FROM inventory_counts ic
     LEFT JOIN warehouses w ON w.id = ic.warehouse_id
     LEFT JOIN inventory_count_lines icl ON icl.inventory_count_id = ic.id
     GROUP BY ic.id, ic.warehouse_id, ic.status, ic.started_at, ic.closed_at, w.name
     ORDER BY ic.started_at DESC`
  );
  res.json(result.rows);
}));

app.post("/inventory-counts", authenticateToken, authorizePermissions("CAN_ACCESS_INVENTORY"), asyncHandler(async (req, res) => {
  const { warehouse_id } = req.body;
  if (!warehouse_id) {
    return res.status(400).json({ error: "warehouse_id is required" });
  }
  const result = await pool.query(
    `INSERT INTO inventory_counts (warehouse_id)
     VALUES ($1)
     RETURNING *`,
    [warehouse_id]
  );
  res.status(201).json(result.rows[0]);
}));

app.post("/inventory-counts/:id/lines", authenticateToken, authorizePermissions("CAN_ACCESS_INVENTORY"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lines } = req.body;
  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: "lines array is required" });
  }

  await withTransaction(async (client) => {
    for (const line of lines) {
      const { item_id, location_id, counted_qty } = line;
      if (!item_id || !location_id || counted_qty === undefined) {
        throw new Error("item_id, location_id and counted_qty are required for each line");
      }
      const stockResult = await client.query(
        `SELECT quantity FROM stock WHERE item_id = $1 AND location_id = $2 AND batch_number IS NULL AND expiration_date IS NULL`,
        [item_id, location_id]
      );
      const systemQty = Number(stockResult.rows[0]?.quantity || 0);
      const difference = Number(counted_qty) - systemQty;
      await client.query(
        `INSERT INTO inventory_count_lines (inventory_count_id, item_id, location_id, counted_qty, system_qty, difference)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, item_id, location_id, counted_qty, systemQty, difference]
      );
    }
    await logAudit(client, req.user.id, "COUNT", "inventory_counts", id, { lines });
  });

  res.json({ message: "Inventory lines recorded" });
}));

app.post("/inventory-counts/:id/close", authenticateToken, authorizePermissions("CAN_MANAGE_RULES"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  await pool.query(
    `UPDATE inventory_counts SET status = 'CLOSED', closed_at = NOW() WHERE id = $1`,
    [id]
  );
  res.json({ message: "Inventory closed" });
}));

app.post("/inventory/cycle-count", authenticateToken, authorizePermissions("CAN_ACCESS_INVENTORY"), asyncHandler(async (req, res) => {
  const { warehouse_id = null, strategy = "ABC", limit = 10 } = req.body || {};
  const baseQuery = `SELECT l.id, l.code, l.type, l.warehouse_id, COALESCE(SUM(s.quantity), 0) AS quantity
                     FROM locations l
                     LEFT JOIN stock s ON s.location_id = l.id
                     WHERE ($1::INT IS NULL OR l.warehouse_id = $1)
                     GROUP BY l.id, l.code, l.type, l.warehouse_id`;
  const orderClause = strategy === "ROTATION"
    ? " ORDER BY quantity DESC"
    : strategy === "ANOMALY"
    ? " ORDER BY RANDOM()"
    : " ORDER BY l.code";
  const locations = await pool.query(baseQuery + orderClause + " LIMIT $2", [warehouse_id, limit]);
  const locationList = locations.rows;

  await withTransaction(async (client) => {
    for (const location of locationList) {
      await client.query(
        `INSERT INTO tasks (type, priority, metadata, auto_generated)
         VALUES ('CYCLE_COUNT', 'HIGH', $1, TRUE)`,
        [JSON.stringify({ location_id: location.id, warehouse_id: location.warehouse_id })]
      );
    }
    await client.query(
      `INSERT INTO cycle_count_runs (warehouse_id, strategy, locations)
       VALUES ($1, $2, $3)`,
      [warehouse_id, strategy, JSON.stringify(locationList)]
    );
  });

  res.json({ locations: locationList });
}));

app.get("/tasks", authenticateToken, authorizePermissions("CAN_VIEW_TASKS"), asyncHandler(async (req, res) => {
  const { status, type } = req.query;
  const conditions = [];
  const values = [];
  if (status) {
    conditions.push(`t.status = $${conditions.length + 1}`);
    values.push(status.toUpperCase());
  }
  if (type) {
    conditions.push(`t.type = $${conditions.length + 1}`);
    values.push(type.toUpperCase());
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT t.*, u.username AS assigned_username
     FROM tasks t
     LEFT JOIN users u ON u.id = t.assigned_to
     ${where}
     ORDER BY t.created_at DESC
     LIMIT 200`,
    values
  );
  res.json(result.rows);
}));

app.post("/tasks", authenticateToken, authorizePermissions("CAN_MANAGE_TASKS"), asyncHandler(async (req, res) => {
  const { type, priority = "MEDIUM", assigned_to = null, metadata = {}, auto_generated = false, due_at = null } = req.body || {};
  if (!type) {
    return res.status(400).json({ error: "type is required" });
  }
  const result = await pool.query(
    `INSERT INTO tasks (type, priority, assigned_to, metadata, auto_generated, due_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [type.toUpperCase(), priority, assigned_to, JSON.stringify(metadata), auto_generated, due_at]
  );
  res.status(201).json(result.rows[0]);
}));

app.patch("/tasks/:id", authenticateToken, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await pool.query(`SELECT * FROM tasks WHERE id = $1`, [id]);
  if (existing.rowCount === 0) {
    return res.status(404).json({ error: "Task not found" });
  }
  const task = existing.rows[0];
  const canManage = userHasPermission(req.user, "CAN_MANAGE_TASKS");
  const canExecute = userHasPermission(req.user, "CAN_EXECUTE_TASKS");
  if (!canManage) {
    const isOwner = task.assigned_to === req.user.id || task.assigned_to === null;
    if (!isOwner) {
      return res.status(403).json({ error: "Cannot update this task" });
    }
  }

  const { status, assigned_to, metadata } = req.body || {};
  const updates = [];
  const values = [];
  if (status) {
    updates.push(`status = $${updates.length + 1}`);
    values.push(status.toUpperCase());
  }
  if (assigned_to !== undefined) {
    const wantsSelfAssignment = !task.assigned_to && assigned_to === req.user.id && canExecute;
    if (!canManage && !wantsSelfAssignment) {
      return res.status(403).json({ error: "Assignment requires CAN_MANAGE_TASKS" });
    }
    updates.push(`assigned_to = $${updates.length + 1}`);
    values.push(assigned_to || null);
  }
  if (metadata) {
    updates.push(`metadata = $${updates.length + 1}`);
    values.push(JSON.stringify(metadata));
  }
  if (!updates.length) {
    return res.status(400).json({ error: "No update supplied" });
  }
  values.push(id);
  const result = await pool.query(
    `UPDATE tasks SET ${updates.join(", ")} WHERE id = $${values.length} RETURNING *`,
    values
  );
  res.json(result.rows[0]);
}));

app.post("/tasks/auto/replenishments", authenticateToken, authorizePermissions("CAN_MANAGE_TASKS"), asyncHandler(async (req, res) => {
  const thresholdRows = await pool.query(
    `SELECT lt.location_id, lt.min_qty, lt.max_qty, l.code, w.name AS warehouse_name,
            COALESCE(SUM(s.quantity), 0) AS quantity
     FROM location_thresholds lt
     JOIN locations l ON l.id = lt.location_id
     JOIN warehouses w ON w.id = l.warehouse_id
     LEFT JOIN stock s ON s.location_id = lt.location_id
     GROUP BY lt.location_id, lt.min_qty, lt.max_qty, l.code, w.name
     HAVING COALESCE(SUM(s.quantity), 0) < lt.min_qty`
  );
  const created = [];
  await withTransaction(async (client) => {
    for (const row of thresholdRows.rows) {
      const open = await client.query(
        `SELECT 1 FROM tasks
         WHERE type = 'REPLENISHMENT'
           AND status IN ('PENDING', 'IN_PROGRESS')
           AND metadata ->> 'location_id' = $1::text
         LIMIT 1`,
        [String(row.location_id)]
      );
      if (open.rowCount > 0) {
        continue;
      }
      const taskResult = await client.query(
        `INSERT INTO tasks (type, priority, metadata, auto_generated)
         VALUES ('REPLENISHMENT', 'HIGH', $1, TRUE)
         RETURNING *`,
        [
          JSON.stringify({
            location_id: row.location_id,
            location_code: row.code,
            warehouse: row.warehouse_name,
            current_qty: Number(row.quantity),
            min_qty: Number(row.min_qty),
            max_qty: row.max_qty ? Number(row.max_qty) : null
          })
        ]
      );
      created.push(taskResult.rows[0]);
    }
  });
  res.json({ created });
}));

app.get("/rules/putaway", authenticateToken, authorizePermissions("CAN_MANAGE_RULES"), asyncHandler(async (req, res) => {
  const result = await pool.query(`SELECT * FROM putaway_rules ORDER BY active DESC, priority DESC, name`);
  res.json(result.rows);
}));

app.post("/rules/putaway", authenticateToken, authorizePermissions("CAN_MANAGE_RULES"), asyncHandler(async (req, res) => {
  const { name, strategy, criteria, destination, priority = 0, active = true } = req.body || {};
  if (!name || !strategy || !criteria || !destination) {
    return res.status(400).json({ error: "name, strategy, criteria and destination are required" });
  }
  const result = await pool.query(
    `INSERT INTO putaway_rules (name, strategy, criteria, destination, priority, active)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [name, strategy, JSON.stringify(criteria), JSON.stringify(destination), priority, active]
  );
  res.status(201).json(result.rows[0]);
}));

app.get("/rules/picking", authenticateToken, authorizePermissions("CAN_MANAGE_RULES"), asyncHandler(async (req, res) => {
  const result = await pool.query(`SELECT * FROM picking_rules ORDER BY active DESC, priority DESC, name`);
  res.json(result.rows);
}));

app.post("/rules/picking", authenticateToken, authorizePermissions("CAN_MANAGE_RULES"), asyncHandler(async (req, res) => {
  const { name, grouping, heuristics, priority = 0, active = true } = req.body || {};
  if (!name || !grouping || !heuristics) {
    return res.status(400).json({ error: "name, grouping and heuristics are required" });
  }
  const result = await pool.query(
    `INSERT INTO picking_rules (name, grouping, heuristics, priority, active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [name, grouping, JSON.stringify(heuristics), priority, active]
  );
  res.status(201).json(result.rows[0]);
}));

app.post("/picking/smart-plan", authenticateToken, authorizePermissions("CAN_PICK"), asyncHandler(async (req, res) => {
  const { warehouse_id = null, lines = [] } = req.body || {};
  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: "lines array is required" });
  }
  const itemIds = [...new Set(lines.map((line) => Number(line.item_id))).values()].filter(Boolean);
  const stockRows = await pool.query(
    `SELECT s.item_id, l.id AS location_id, l.code, l.type,
            COALESCE(SUM(s.quantity), 0) AS quantity
     FROM locations l
     LEFT JOIN stock s ON s.location_id = l.id AND s.item_id = ANY($1::INT[])
     WHERE ($2::INT IS NULL OR l.warehouse_id = $2)
     GROUP BY s.item_id, l.id, l.code, l.type
     HAVING COALESCE(SUM(s.quantity), 0) > 0
     ORDER BY l.code`,
    [itemIds.length ? itemIds : [0], warehouse_id]
  );
  const plan = lines.map((line) => {
    const matches = stockRows.rows.filter((row) => row.item_id === Number(line.item_id));
    let remaining = Number(line.quantity || line.ordered_qty || 0);
    const steps = [];
    matches.forEach((row, index) => {
      if (remaining <= 0) return;
      const pickQty = Math.min(remaining, Number(row.quantity));
      remaining -= pickQty;
      steps.push({
        location_id: row.location_id,
        location_code: row.code,
        quantity: pickQty,
        distance_score: index + 1
      });
    });
    return {
      line_id: line.id || null,
      item_id: line.item_id,
      requested_qty: Number(line.quantity || line.ordered_qty || 0),
      steps,
      shortage: remaining > 0 ? remaining : 0
    };
  });
  res.json({ plan });
}));

app.post("/putaway/suggestions", authenticateToken, authorizePermissions("CAN_RECEIVE"), asyncHandler(async (req, res) => {
  const { attributes = {} } = req.body || {};
  const result = await pool.query(`SELECT * FROM putaway_rules WHERE active = TRUE ORDER BY priority DESC, created_at DESC`);
  let matched = null;
  for (const rule of result.rows) {
    const criteria = rule.criteria || {};
    const match = Object.entries(criteria).every(([key, value]) => attributes[key] === value);
    if (match) {
      matched = rule;
      break;
    }
  }
  res.json({
    rule: matched,
    suggestion: matched ? matched.destination : { zone: "RECEIVING", rationale: "Pas de règle dédiée" }
  });
}));

app.get("/warehouse-map", authenticateToken, authorizePermissions("CAN_VIEW_HEATMAP"), asyncHandler(async (req, res) => {
  const result = await pool.query(
    `WITH stock_totals AS (
        SELECT location_id, SUM(quantity) AS quantity
        FROM stock
        GROUP BY location_id
     )
     SELECT w.id AS warehouse_id, w.name,
            json_agg(json_build_object(
              'id', l.id,
              'code', l.code,
              'type', l.type,
              'capacity', l.capacity,
              'quantity', COALESCE(st.quantity, 0)
            ) ORDER BY l.code) AS locations
     FROM warehouses w
     JOIN locations l ON l.warehouse_id = w.id
     LEFT JOIN stock_totals st ON st.location_id = l.id
     GROUP BY w.id, w.name
     ORDER BY w.name`
  );
  res.json(result.rows);
}));

app.get("/quality/inspections", authenticateToken, authorizePermissions("CAN_MANAGE_QUALITY"), asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT qi.*, io.reference AS inbound_reference
     FROM quality_inspections qi
     LEFT JOIN inbound_orders io ON io.id = qi.inbound_order_id
     ORDER BY qi.created_at DESC`
  );
  res.json(result.rows);
}));

app.post("/quality/inspections", authenticateToken, authorizePermissions("CAN_MANAGE_QUALITY"), asyncHandler(async (req, res) => {
  const { inbound_order_id = null, stock_id = null, notes = null } = req.body || {};
  const result = await pool.query(
    `INSERT INTO quality_inspections (inbound_order_id, stock_id, notes)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [inbound_order_id, stock_id, notes]
  );
  res.status(201).json(result.rows[0]);
}));

app.patch("/quality/inspections/:id", authenticateToken, authorizePermissions("CAN_MANAGE_QUALITY"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body || {};
  if (!status && !notes) {
    return res.status(400).json({ error: "No updates" });
  }
  const updates = [];
  const values = [];
  if (status) {
    updates.push(`status = $${updates.length + 1}`);
    values.push(status);
    if (["OK", "RELEASED"].includes(status.toUpperCase())) {
      updates.push(`resolved_at = NOW()`);
    }
  }
  if (notes) {
    updates.push(`notes = $${updates.length + 1}`);
    values.push(notes);
  }
  values.push(id);
  const result = await pool.query(
    `UPDATE quality_inspections SET ${updates.join(", ")} WHERE id = $${values.length} RETURNING *`,
    values
  );
  res.json(result.rows[0]);
}));

app.get("/reports/operator-activity", authenticateToken, authorizePermissions("CAN_VIEW_REPORTING"), asyncHandler(async (req, res) => {
  const [taskSummary, movementSummary] = await Promise.all([
    pool.query(`SELECT status, COUNT(*) FROM tasks GROUP BY status`),
    pool.query(`SELECT movement_type, COUNT(*) FROM movements WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY movement_type`)
  ]);
  res.json({ tasks: taskSummary.rows, movements: movementSummary.rows });
}));

app.get("/reports/stock-by-item", authenticateToken, authorizePermissions("CAN_VIEW_REPORTING"), asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT i.id, i.sku, i.name, SUM(s.quantity) AS total_quantity
     FROM items i
     LEFT JOIN stock s ON s.item_id = i.id
     GROUP BY i.id, i.sku, i.name
     ORDER BY i.sku`
  );
  res.json(result.rows);
}));

app.get("/reports/pending-inbounds", authenticateToken, asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT id, reference, supplier_name, expected_date, status
     FROM inbound_orders
     WHERE status <> 'CLOSED'
     ORDER BY expected_date NULLS LAST`
  );
  res.json(result.rows);
}));

app.get("/reports/open-outbounds", authenticateToken, asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT id, reference, customer_name, status, shipping_date
     FROM outbound_orders
     WHERE status <> 'SHIPPED'
     ORDER BY shipping_date NULLS LAST`
  );
  res.json(result.rows);
}));

app.use((err, req, res, next) => {
  console.error(err);
  if (err.message) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: "Internal server error" });
});

const port = Number(process.env.PORT) || 3000;
bootstrap()
  .then(() => {
    app.listen(port, () => {
      console.log(`WMS app running on port ${port}`);
    });
  })
  .catch((err) => {
    console.error("Unable to bootstrap automation layer", err);
    process.exit(1);
  });
