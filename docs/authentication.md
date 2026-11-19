# Password login and application roles

## Enable this checkpoint on the shared database

The original 16 business tables and data stay in place. There is one additional
operational table, `Login_Session`, for shared sessions. It starts empty.

1. Pull the repository and run `npm ci`.
2. In phpMyAdmin, sign in with the **setup account**, select `procura_db`, and
   import `database/05-auth.sql`. Do not reimport the original schema or seed.
   The migration adds nullable `Login.PasswordHash`, creates `Login_Session`,
   and grants INSERT/DELETE on sessions to `procura_app`. It can be rerun on
   MariaDB without resetting existing credentials or sessions.
3. Keep your working database credentials in `server/.env`. The backend uses
   that same restricted account; no setup-account credential belongs there.
4. Run `npm run db:check` to check the additional table and password column.
5. Run `npm run auth:set-password`. Enter `sofia.garcia@procura.co` to provision
   the existing Admin employee first. Enter and confirm an application password
   of 12–128 characters. Password input is hidden and never enters shell history.
6. Run `npm run dev`, open **http://127.0.0.1:5173**, and sign in with that email
   and the application password you just chose. Team access lists the current
   employees, roles, activation, and whether a password is configured.
7. Repeat `npm run auth:set-password` for any other existing employee who needs
   to sign in. Every account gets its own password. There is no public signup.

`auth:set-password` also handles forgotten application passwords. It preserves
activation and role, checks for a conflicting password reset, and revokes all
sessions for that account atomically. It does not change a MariaDB user's
password. Whoever holds the backend database credentials can provision app
passwords; keep those credentials with authorized project developers.

The migration has not yet been applied to the hosted service at this commit.
The user confirmed the pre-migration database check passed over verified TLS.
Do not report hosted authentication complete until the steps above succeed.

## Accounts retained from Milestone 3

| Role | Example existing employee | Authorized work |
| --- | --- | --- |
| Employee | sara.ahmed@procura.co | Read catalog; create and view own requests |
| Manager | lina.hassan@procura.co | Employee access; read all requests; approve/reject; dashboard |
| Purchasing | daniel.lee@procura.co | Employee access; read all requests; manage catalog and purchase orders; dashboard |
| Receiving | noor.ali@procura.co | Employee access; read orders; record/read deliveries |
| Finance | omar.khan@procura.co | Employee access; read orders/deliveries; invoices/payments; dashboard |
| Admin | sofia.garcia@procura.co | Employee access; read all requests/orders/deliveries; dashboard; team access; employee/department administration |

Other seeded employees also work after their individual password is set.
An active Login record, configured password, and recognized role are required.
Admin is not a universal business-role override. In particular, only Manager
has approval permission, matching `sp_decide_purchase_request`. This checkpoint
implements authentication, account password changes, and read-only team access;
the permissions for upcoming procurement/admin CRUD modules are a handoff
contract, not a claim those screens or endpoints have been implemented.

## API contract

| Method | Path | Requirement / result |
| --- | --- | --- |
| GET | `/api/health` | Public liveness only |
| POST | `/api/auth/login` | Email/password; fresh cookie and public user, or generic 401 |
| GET | `/api/auth/me` | Current authenticated user including server-derived permissions |
| POST | `/api/auth/logout` | Revoke presented session and clear cookie; idempotent |
| POST | `/api/auth/password` | Current password + new password; revoke all own sessions |
| GET | `/api/admin/users` | Admin's `users:read` permission; no password hashes |

Write calls require `X-Procura-Request: 1`. The frontend API helper supplies it.
Any supplied `Origin` must match `APP_ORIGIN`; the API grants no cross-origin
CORS access. Locally, the default origin is `http://127.0.0.1:5173`. If you use
`localhost` or another Vite port, set `APP_ORIGIN` to that exact browser origin
in `server/.env`, without a trailing slash, and restart the backend.
If serving a local production bundle with `npm start` over HTTP, keep
`NODE_ENV=development` and set `APP_ORIGIN=http://127.0.0.1:3001` (or your actual
API port). Hosted production must use HTTPS and `NODE_ENV=production`.

## Protecting teammates' modules

Register every business endpoint in `server/src/app.js` **after**
`app.use('/api', auth.requireAuth)` and **before** the `/api` 404 fallback.
For example:

```js
app.post('/api/requests', requirePermission('requests:create'), createRequest);
app.post('/api/requests/:id/decision', requirePermission('requests:approve'), decideRequest);
```

Use `req.user.employeeId`, `req.user.role`, and `req.user.permissions` populated
from the database. Never accept an acting employee ID or role from the request
body. Request detail/list/update handlers must also enforce ownership in SQL
when the user has only `requests:read:own`; the role guard alone does not enforce
row ownership. Modules must validate each requested record's workflow state and
use transactions for dependent writes. Approval handlers must pass the signed-in
manager's employee ID to the existing procedure.

## Storage and deployment

- Passwords: salted Node.js scrypt (`N=32768, r=8, p=3`, 64-byte key), with
  constant-time derived-key comparison. Passwords are never stored as plaintext.
  Accounts without a configured hash stay locked; no shared default password.
- Sessions: 32 random bytes per login; only the token's SHA-256 digest is saved
  in MariaDB. Eight-hour absolute expiry uses the database UTC clock. Login
  rotates any presented session; logout deletes it. Successful logins prune
  expired rows. The same session works across API restarts/instances that use
  the same shared database and cookie configuration.
- Cookies: HttpOnly, SameSite=Lax, Path=/, eight-hour max age; production adds
  Secure and the `__Host-` name prefix. Tokens are not in localStorage or JSON.
- Identity is re-read on each protected request. Role changes and deactivation
  take effect on the next request, without trusting cached browser permissions.
- Login and password-change endpoints are limited to 15 and 5 attempts per IP
  per 15 minutes respectively. The default limiter store is local to one API
  process and resets on restart. Before scaling to multiple API processes, add
  a shared limiter store. Database sessions already support multiple instances.
- Production requires `NODE_ENV=production`, an explicit HTTPS `APP_ORIGIN`,
  and HTTPS at the reverse proxy. Build and serve the frontend with Express.
  Set `TRUST_PROXY_HOPS` only to the known proxy hop count (0 locally), with
  ingress preventing clients from bypassing those proxies. Do not set it to
  a blanket trusted value; forwarded IPs affect rate limiting.
- Database-level grants are shared by the backend; application roles are
  enforced separately per signed-in employee. Keep verified database TLS on.

## Verification and remaining evidence

`npm test` exercises the real HTTP routes and security middleware against a
controlled repository, plus repository transaction failure/rollback paths.
It covers credential rejection, six role boundaries, CSRF checks, cookie flags,
expiry/revocation, password changes, role changes/deactivation, rate limits,
SQL binding, and isolation between clients and app instances. It does not
substitute for execution against the hosted MariaDB service. `npm run build`
checks the production frontend bundle.

After migration and provisioning, verify through the running app:

1. Admin signs in, refreshes, and opens Team access.
2. A separately provisioned Employee in a private browser window can sign in
   while Admin remains signed in. Employee's request to `/api/admin/users`
   must return 403; anonymous requests return 401.
3. Change one account's password in Your account. All of that account's browser
   sessions must sign out, while the other employee remains signed in.
4. Restart the API and confirm a remaining valid cookie still works.
5. Confirm logout invalidates its session and a wrong password is rejected.

Successful approval/payment and concurrent procurement writes remain separate
integration work when those modules exist. Preserve screenshots/results for
Milestone 4 only after performing the real checks.

References: [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html),
[OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html),
[express-rate-limit usage](https://express-rate-limit.mintlify.app/quickstart/usage).
