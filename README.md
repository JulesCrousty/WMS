# Warehouse Management System (WMS)

This repository contains a minimal but functional Warehouse Management System built with Node.js, Express, and PostgreSQL. The project is fully containerised with Docker and Docker Compose and covers inbound, outbound, stock management, inventory, audit logging, and reporting flows required for a WMS MVP.

## Features

- RESTful API built with Express
- PostgreSQL schema covering users, warehouses, locations, items, stock, inbound/outbound orders, movements, inventory counts, and audit logs
- Secure authentication with scrypt hashed passwords and role-based access (Admin, Operator, Viewer)
- Minimal HTML homepage with links to main API endpoints
- Reporting endpoints for stock levels and open activities
- Complete Docker setup for reproducible environments

## Getting started

### Prerequisites

- Docker and Docker Compose installed on your machine

### Run the stack

```bash
docker compose up --build
```

Once the containers are up:

- The API is reachable at http://localhost:8080
- Health check endpoint: http://localhost:8080/health
- Default credentials: `admin` / `admin123`

### Stopping the stack

```bash
docker compose down
```

To reset the PostgreSQL volume, add the `-v` flag to remove the named volume:

```bash
docker compose down -v
```

## API Overview

All protected routes require an `Authorization: Bearer <token>` header. Obtain a token via the login endpoint.

### Authentication

- `POST /auth/login` – returns a JWT token when provided with valid credentials.

### Users

- `GET /users` – list users (Admin only)
- `POST /users` – create a new user (Admin only)

### Items

- `GET /items` – list items (supports `?search=`)
- `POST /items` – create an item (Admin & Operator)
- `PUT /items/:id` – update an item (Admin & Operator)
- `POST /items/:id/deactivate` – deactivate an item (Admin)

### Warehouses & Locations

- `GET /warehouses` – list warehouses
- `POST /warehouses` – create a warehouse (Admin)
- `GET /warehouses/:warehouseId/locations` – list locations for a warehouse
- `POST /locations` – create a location (Admin)

### Inbound Orders

- `POST /inbound-orders` – create an inbound order with lines (Admin & Operator)
- `GET /inbound-orders` – list inbound orders with lines
- `POST /inbound-orders/:id/receive` – record receipts, update stock, and log movements

### Stock & Movements

- `GET /stock` – list stock levels (filters: `item_id`, `warehouse_id`, `location_id`)
- `POST /movements` – create an internal movement (Admin & Operator)
- `GET /movements` – view recent movement history

### Outbound Orders

- `POST /outbound-orders` – create an outbound order with lines (Admin & Operator)
- `GET /outbound-orders` – list outbound orders with lines
- `POST /outbound-orders/:id/pick` – record picking, decrement stock, and log movements

### Inventory

- `POST /inventory-counts` – start an inventory campaign (Admin & Operator)
- `POST /inventory-counts/:id/lines` – record counted quantities (Admin & Operator)
- `POST /inventory-counts/:id/close` – close an inventory (Admin)

### Reporting

- `GET /reports/stock-by-item`
- `GET /reports/pending-inbounds`
- `GET /reports/open-outbounds`

## Development

To run locally without Docker you will need a PostgreSQL database and to set environment variables (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`). Then install dependencies and start the server:

```bash
npm install
npm start
```

## License

This project is provided as-is for demonstration purposes.
