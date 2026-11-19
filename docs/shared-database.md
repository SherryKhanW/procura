# Shared database setup checkpoint

## Service

- Host: `mysql-procura.alwaysdata.net`
- Port: `3306`
- Database: `procura_db`
- Verified server version: MariaDB `11.8.9`
- Setup account: `procura`
- Intended restricted backend account: `procura_app`

The setup account is for installation and privilege management. The backend
must use the restricted account with TLS. Passwords belong only in ignored
local environment files or deployment secrets.

## Verified on the hosted service

The schema and seed from `01-schema.sql` and `02-seed.sql` were applied through
phpMyAdmin's SQL editor. The initial database was empty. The procedure and
trigger from `03-advanced.sql` were created successfully. This is the base
seed, excluding the additional manual demonstration purchases in COMMANDS.sql.

| Table | Exact rows after import |
| --- | ---: |
| Department | 10 |
| Employee | 10 |
| Product | 10 |
| Vendor | 10 |
| Vendor_Product | 14 |
| Purchase_Request | 15 |
| Purchase_Request_Item | 15 |
| Approval | 13 |
| Purchase_Order | 12 |
| Purchase_Order_Item | 12 |
| Delivery | 12 |
| Delivery_Item | 13 |
| Invoice | 12 |
| Invoice_Item | 12 |
| Payment | 10 |
| Login | 10 |

- `sp_decide_purchase_request` exists as a PROCEDURE.
- `trg_payment_three_way_match` exists as a BEFORE INSERT trigger.
- Calling the approval procedure for request 14 as employee 1 was rejected
  with `Only managers can approve or reject requests`.
- Attempting payment of 9000.00 on short-delivered invoice 11 was rejected
  with `Payment blocked: three-way match failed`.
- Subsequent verification confirmed request 14 remained Pending, had zero
  approval records, and Payment still contained 10 rows.
- Setup-account schema privileges include grantable CREATE ROUTINE, TRIGGER,
  EXECUTE, SELECT, INSERT and UPDATE privileges, among others.
- `procura_app` was created with SSL required and initially no database rights.
- All 20 GRANT statements were applied successfully through the setup account.
  The database-level SELECT grant escapes the underscore in `procura_db`, so
  it names exactly this database rather than a wildcard pattern.
- The setup account cannot inspect another user's SHOW GRANTS on this shared
  host (access to the `mysql` system database is denied). The runtime account
  will verify its own grants through `npm run db:check` after its password is
  entered privately in `server/.env`.

Successful manager approval/payment and concurrent-user behavior still need
application-level integration tests. This checkpoint does not claim them.

## Finish the connection

1. Account creation and the SQL privileges in `database/04-app-privileges.sql`
   are complete. Do not create the account or re-save panel permissions again.
2. Copy `server/.env.example` to `server/.env` if it does not already exist,
   and set `DB_PASSWORD` privately. The working copy has been prepared with
   host, port, database, username and TLS settings. Each developer must supply
   the runtime account password in their own ignored environment file.
   Do not commit credentials.
3. Run `npm run db:check` with the runtime account. This has not yet been run
   successfully against the hosted service. The diagnostic now uses one direct
   connection to show the original DNS, network, TLS, or authentication error.
4. Verify that SELECT works and schema-altering operations are denied to the
   runtime account, then proceed to password-backed application login.

Do not re-save panel permissions after applying custom SQL grants: alwaysdata
can reset those grants to its panel selection. Manage later grants through SQL.

Reference: https://help.alwaysdata.com/en/docs/web-hosting/databases/mariadb/
