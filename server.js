import express from "express";
import { Pool } from "pg";
import crypto from "crypto";
import jwt from "jsonwebtoken";

const app = express();
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || "wms",
  user: process.env.DB_USER || "wms_user",
  password: process.env.DB_PASSWORD || "wms_password",
});

const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret";

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
    req.user = payload;
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

app.get("/health", asyncHandler(async (req, res) => {
  const result = await pool.query("SELECT 1 AS ok");
  res.json({ status: "ok", db: result.rows[0].ok });
}));

app.get("/", (req, res) => {
  res.send(`
    <main style="font-family: sans-serif; max-width: 700px; margin: 2rem auto;">
      <h1>WMS - Demo</h1>
      <p>API opérationnelle. Utilisez les routes listées ci-dessous pour interagir avec le système.</p>
      <h2>Authentification</h2>
      <ul>
        <li><code>POST /auth/login</code></li>
      </ul>
      <h2>Gestion</h2>
      <ul>
        <li><code>GET /items</code>, <code>POST /items</code>, <code>PUT /items/:id</code>, <code>POST /items/:id/deactivate</code></li>
        <li><code>GET /warehouses</code>, <code>POST /warehouses</code></li>
        <li><code>GET /warehouses/:warehouseId/locations</code>, <code>POST /locations</code></li>
        <li><code>GET /inbound-orders</code>, <code>POST /inbound-orders</code>, <code>POST /inbound-orders/:id/receive</code></li>
        <li><code>GET /outbound-orders</code>, <code>POST /outbound-orders</code>, <code>POST /outbound-orders/:id/pick</code></li>
        <li><code>GET /stock</code>, <code>POST /movements</code></li>
        <li><code>POST /inventory-counts</code>, <code>POST /inventory-counts/:id/lines</code>, <code>POST /inventory-counts/:id/close</code></li>
        <li><code>GET /reports/stock-by-item</code>, <code>GET /reports/pending-inbounds</code>, <code>GET /reports/open-outbounds</code></li>
      </ul>
      <p>Consultez la documentation dans README.md pour plus de détails.</p>
    </main>
  `);
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

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: "8h" });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
}));

app.get("/users", authenticateToken, authorizeRoles("ADMIN"), asyncHandler(async (req, res) => {
  const result = await pool.query("SELECT id, username, role, email, is_active, created_at FROM users ORDER BY id");
  res.json(result.rows);
}));

app.post("/users", authenticateToken, authorizeRoles("ADMIN"), asyncHandler(async (req, res) => {
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

app.get("/items", authenticateToken, asyncHandler(async (req, res) => {
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

app.post("/items", authenticateToken, authorizeRoles("ADMIN", "OPERATOR"), asyncHandler(async (req, res) => {
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

app.put("/items/:id", authenticateToken, authorizeRoles("ADMIN", "OPERATOR"), asyncHandler(async (req, res) => {
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

app.post("/items/:id/deactivate", authenticateToken, authorizeRoles("ADMIN"), asyncHandler(async (req, res) => {
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

app.get("/warehouses", authenticateToken, asyncHandler(async (req, res) => {
  const result = await pool.query("SELECT id, code, name, address FROM warehouses ORDER BY id");
  res.json(result.rows);
}));

app.post("/warehouses", authenticateToken, authorizeRoles("ADMIN"), asyncHandler(async (req, res) => {
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

app.get("/warehouses/:warehouseId/locations", authenticateToken, asyncHandler(async (req, res) => {
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

app.post("/locations", authenticateToken, authorizeRoles("ADMIN"), asyncHandler(async (req, res) => {
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

app.post("/inbound-orders", authenticateToken, authorizeRoles("ADMIN", "OPERATOR"), asyncHandler(async (req, res) => {
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

app.post("/inbound-orders/:id/receive", authenticateToken, authorizeRoles("ADMIN", "OPERATOR"), asyncHandler(async (req, res) => {
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

app.post("/movements", authenticateToken, authorizeRoles("ADMIN", "OPERATOR"), asyncHandler(async (req, res) => {
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

app.post("/outbound-orders", authenticateToken, authorizeRoles("ADMIN", "OPERATOR"), asyncHandler(async (req, res) => {
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

app.post("/outbound-orders/:id/pick", authenticateToken, authorizeRoles("ADMIN", "OPERATOR"), asyncHandler(async (req, res) => {
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

app.post("/inventory-counts", authenticateToken, authorizeRoles("ADMIN", "OPERATOR"), asyncHandler(async (req, res) => {
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

app.post("/inventory-counts/:id/lines", authenticateToken, authorizeRoles("ADMIN", "OPERATOR"), asyncHandler(async (req, res) => {
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

app.post("/inventory-counts/:id/close", authenticateToken, authorizeRoles("ADMIN"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  await pool.query(
    `UPDATE inventory_counts SET status = 'CLOSED', closed_at = NOW() WHERE id = $1`,
    [id]
  );
  res.json({ message: "Inventory closed" });
}));

app.get("/reports/stock-by-item", authenticateToken, asyncHandler(async (req, res) => {
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
app.listen(port, () => {
  console.log(`WMS app running on port ${port}`);
});
