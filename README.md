# Procura

Procurement and vendor management for Intro to Databases, Milestone 4.

Workflow: purchase request → approval → purchase order → delivery → invoice → payment.

## Current checkpoint

Step 1: React/Vite client, Express API, MariaDB connector, database validation command, and clean SQL installation files. Login, permissions, admin pages, and workflow screens are upcoming work; this scaffold does not authenticate users or expose business records.

The backend uses parameterized SQL rather than an ORM so the database implementation stays visible. The existing 16-table design and Milestone 3 procedure/trigger are retained. No database is hosted or provisioned by this commit.

## Local application setup

Use Node.js 22.12+ (Node 22 LTS recommended) and npm. From the repository root:

```sh
npm ci
cp server/.env.example server/.env
npm run dev
```

Open the URL Vite prints (normally http://localhost:5173). The page reports API liveness only. The API listens on http://127.0.0.1:3001/api/health; it can start before database credentials are configured. Vite proxies `/api` to port 3001. If you change the API port, update that proxy as well.

`server/.env` is ignored by Git. Put database credentials there, never in client code or a `VITE_` variable. Use `DB_SSL=true` for a hosted database; set `DB_SSL_CA` if the provider supplies a CA certificate. Certificate verification is always enabled when TLS is enabled. The example `DB_SSL=false` is for a local database.

## Database installation

Use MariaDB compatible with our Milestone 3 database (MariaDB 10.4.28), or a MySQL host only after validating compatibility. Before selecting a hosting service, confirm support for stored procedures, triggers, transactions, and database users/privileges. All teammates must connect to one shared hosted database for the final submission.

Using a database setup account, create a NEW empty database named `procura` with `utf8mb4` encoding. Select that database in phpMyAdmin and import these files in order:

1. `database/01-schema.sql` — all 16 tables with original key constraints.
2. `database/02-seed.sql` — fictional baseline data, including the two intentionally mismatched invoices. Import once.
3. `database/03-advanced.sql` — `sp_decide_purchase_request` and `trg_payment_three_way_match`.

Equivalent CLI commands (replace `mariadb` with your installed client executable if necessary):

```sh
mariadb -h YOUR_HOST -u YOUR_SETUP_USER -p procura < database/01-schema.sql
mariadb -h YOUR_HOST -u YOUR_SETUP_USER -p procura < database/02-seed.sql
mariadb -h YOUR_HOST -u YOUR_SETUP_USER -p procura < database/03-advanced.sql
```

Use the host's documented TLS settings for remote CLI connections. Do not reimport the seed over existing data. These scripts deliberately exclude the later manual tests in COMMANDS.sql, so baseline request IDs 14 and 15 remain Pending. Historical test-workflow dashboard counts will differ from this clean baseline. The scripts are not migrations for an existing database.

Verify both advanced objects using the setup account:

```sql
SHOW CREATE PROCEDURE sp_decide_purchase_request;
SHOW CREATE TRIGGER trg_payment_three_way_match;
```

Configure a restricted application user before entering credentials in `server/.env`; the app must not run as root. Database privilege configuration and password-backed Login migration will be implemented in the next foundation steps. The historical email-only login query in `database/reference/ui-queries.sql` is reference material and must not be used as authentication.

After configuring `server/.env`:

```sh
npm run db:check
```

This read-only command connects to the configured database and verifies visibility of all 16 expected tables. It does not create tables, import data, verify column definitions, or validate the procedure/trigger behavior. It exits nonzero when configuration, connection, or table checks fail.

## Production build

```sh
npm run build
npm start
```

Express serves the built client and API together. Set `HOST=0.0.0.0` when required by the hosting provider, its assigned `PORT`, and `NODE_ENV=production`. Use HTTPS at the reverse proxy. Final deployment and authentication are still outstanding; this checkpoint is not the finished Milestone 4 app.

## Sequential handoffs

| Owner | Scope |
| --- | --- |
| Sheharyar | Foundation, shared database, authentication/authorization, layout, employee/department management, database privileges |
| Myra | Vendors/products, purchase requests, approval-procedure integration |
| Omer | Purchase orders and deliveries |
| Wajeeh | Invoices/payments, three-way matching, dashboard, integration and report assembly |

Each owner implements frontend and backend, tests their handoff, and supplies documentation/screenshots for their own work. Previous owners remain responsible for defects in their modules. Authentication and authorization must protect business routes before they are added.
