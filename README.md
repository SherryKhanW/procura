# Procura

Procurement and vendor management for Intro to Databases, Milestone 4.

Workflow: purchase request → approval → purchase order → delivery → invoice → payment.

## Current checkpoint

Password login, shared database sessions, logout, password changes, server-enforced roles, an authenticated workspace, and Admin employee/department management are implemented. Admins can search/filter employees, create/edit accounts, assign roles/departments, activate/deactivate accounts, set/reset other employees' passwords, and create/rename departments. Procurement workflow modules are upcoming work.

The backend uses parameterized SQL rather than an ORM so the database implementation stays visible. The existing 16-table design and Milestone 3 procedure/trigger are retained. The shared database is provisioned on alwaysdata with restricted runtime grants. The user confirmed the authentication migration, verified-TLS database check, Admin password provisioning, and successful login. Admin management uses those existing tables/grants; live Admin write checks remain pending. See [Admin management and validation](docs/admin-management.md) and [authentication setup and the role contract](docs/authentication.md).

## Local application setup

Use Node.js 22.12+ (Node 22 LTS recommended) and npm. From the repository root:

```sh
npm ci
cp -n server/.env.example server/.env
```

Keep an existing `server/.env`; do not overwrite working database credentials. Configure the database variables, import `database/05-auth.sql` as the setup account in phpMyAdmin's selected `procura_db`, then provision an existing employee:

```sh
npm run db:check
npm run auth:set-password
npm run dev
```

Start with `sofia.garcia@procura.co` (the seeded Admin); choose an individual application password at the hidden prompt. This is separate from the MariaDB password. Open http://127.0.0.1:5173 and sign in. See [full setup instructions](docs/authentication.md). Vite proxies `/api` to port 3001. If you use another browser origin, set `APP_ORIGIN` to it exactly in `server/.env`. If you change the API port, also update Vite's proxy. `/api/health` remains a public liveness endpoint.

`server/.env` is ignored by Git. Put database credentials there, never in client code or a `VITE_` variable. Use `DB_SSL=true` for a hosted database; set `DB_SSL_CA` if the provider supplies a CA certificate. Certificate verification is always enabled when TLS is enabled. Use `DB_SSL=false` only for a separate local database.

## Database installation

The shared service uses MariaDB 11.8.9 on alwaysdata, at `mysql-procura.alwaysdata.net:3306`, database `procura_db`. All teammates must use this shared database. The installation instructions below are for a separate NEW empty database when reproducing setup, not for reimporting the live seed.

Using a database setup account, create a NEW empty database named `procura` with `utf8mb4` encoding. Select that database in phpMyAdmin and import these files in order:

1. `database/01-schema.sql` — all 16 tables with original key constraints.
2. `database/02-seed.sql` — fictional baseline data, including the two intentionally mismatched invoices. Import once.
3. `database/03-advanced.sql` — `sp_decide_purchase_request` and `trg_payment_three_way_match`.

Create the runtime user and apply `database/04-app-privileges.sql` with the shared host's exact database/account names, then apply `database/05-auth.sql`. The GRANT statements target `procura_db` and `procura_app` on alwaysdata; adjust those qualifiers only for a separate installation. Do not reimport the schema or seed into the live shared database.

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

Configure a restricted application user before entering credentials in `server/.env`; the app must not run as root. Database privileges are defined in `04-app-privileges.sql` and the authentication migration's session grant. The historical email-only login query in `database/reference/ui-queries.sql` is reference material and must not be used as authentication.

After configuring `server/.env`:

```sh
npm run db:check
```

This read-only command verifies TLS when enabled, read access to all 16 business tables plus `Login_Session`, the password column, visibility of the approval procedure, and that the logged-in account has no direct schema-administration or grant-delegation privileges. It does not print credentials or authentication hashes. It does not create tables, import data, validate the full schema or column-level access policies, or execute the procedure/trigger. It exits nonzero when these connection/access checks fail.

The check uses one direct connection so DNS, network, TLS, and authentication failures retain their original error codes. `ENOTFOUND` means the hostname could not be resolved and authentication has not been attempted; `ER_ACCESS_DENIED_ERROR` means authentication was rejected. Follow the displayed hint before changing credentials. Keep `DB_SSL=true` for the hosted database.

## Production build

```sh
npm run build
npm start
```

Express serves the built client and API together. Set `HOST=0.0.0.0` when required by the hosting provider, its assigned `PORT`, `NODE_ENV=production`, and `APP_ORIGIN` to the exact public HTTPS origin. Use HTTPS at the reverse proxy. Configure trusted proxy hops explicitly when needed. Final deployment and procurement modules are still outstanding; this checkpoint is not the finished Milestone 4 app.

## Verification

Run `npm test` for authentication/Admin HTTP tests and repository transaction tests, and `npm run build` for the client. Tests use controlled repositories/drivers, not the hosted database. Follow the browser/shared-database checks in [the authentication guide](docs/authentication.md) and [the Admin guide](docs/admin-management.md). Existing installations only need to pull the Admin changes and restart; do not reimport the original data or replace working environment credentials.

## Sequential handoffs

| Owner | Scope |
| --- | --- |
| Sheharyar | Foundation, shared database, authentication/authorization, layout, employee/department management, database privileges |
| Myra | Vendors/products, purchase requests, approval-procedure integration |
| Omer | Purchase orders and deliveries |
| Wajeeh | Invoices/payments, three-way matching, dashboard, integration and report assembly |

Each owner implements frontend and backend, tests their handoff, and supplies documentation/screenshots for their own work. Previous owners remain responsible for defects in their modules. Authentication and authorization must protect business routes before they are added.
