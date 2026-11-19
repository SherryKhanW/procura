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

Successful manager approval/payment and concurrent-user behavior still need
application-level integration tests. This checkpoint does not claim them.

## Finish the connection

1. In alwaysdata's MySQL Users screen, create `procura_app`, choose a private
   password, require SSL, and initially choose **no rights** on `procura_db`.
2. Confirm the actual host qualifier for that account, then run
   `database/04-app-privileges.sql` as the setup user. It grants selected data
   operations and procedure execution, without schema administration or grant
   delegation. This script has not yet been executed at this checkpoint.
3. Copy `server/.env.example` to `server/.env` if it does not already exist,
   and set `DB_PASSWORD` privately. Do not commit credentials.
4. Run `npm run db:check` with the runtime account. This has not yet been run
   successfully against the hosted service because credentials are pending.
5. Verify that SELECT works and schema-altering operations are denied to the
   runtime account, then proceed to password-backed application login.

Do not re-save panel permissions after applying custom SQL grants: alwaysdata
can reset those grants to its panel selection. Manage later grants through SQL.

Reference: https://help.alwaysdata.com/en/docs/web-hosting/databases/mariadb/
