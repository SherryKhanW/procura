# Admin employee and department management

## Use the new screens

Pull the latest code, run `npm ci`, and restart `npm run dev`. Sign in with the
Admin account you already provisioned. The sidebar now includes **Employees &
access** and **Departments**. This checkpoint uses the existing tables and grants
from `04-app-privileges.sql` and `05-auth.sql`; no new migration is required.

- Employees & access: search by name/email; filter by role, department, or
  sign-in status; add employees; edit their details and department/role;
  activate/deactivate accounts; set/reset another employee's password.
- A new employee gets a Login and individual application password in the same
  transaction. An active new account can sign in immediately. Share its password
  privately; no email is sent. Employees can change it through Your account.
- Existing accounts marked Password needed can now be provisioned through the
  Admin UI, as well as through the developer CLI. Resetting a password revokes
  all target sessions and preserves activation; inactive accounts stay inactive.
- Edit your own basic details if needed. Your own Admin role and activation stay
  enabled. Your account remains the path for changing your own password.
- Departments: search the current list, add a department, or rename one. The
  employee count comes from a SQL aggregate. Renaming retains its ID and all
  employee assignments. The application rejects duplicate names after trimming
  and case folding. Existing database design has no unique department-name
  constraint; SQL writes outside the application can bypass this validation.

Employees are deactivated through `Login.IsActive`, retaining their Employee
records and procurement foreign keys. There are no employee/department DELETE
endpoints and no new DELETE grants on those business tables. Do not describe
these screens as implementing physical deletion; the team's remaining modules
must cover the milestone's deletion requirements where appropriate.

## API

All endpoints are behind the existing session guard and permission middleware.
They require Admin permissions; each write also revalidates its acting Admin
inside its transaction. Body IDs/roles never determine the acting employee.

| Method | Path | Permission / body |
| --- | --- | --- |
| GET | `/api/admin/users` | `users:read`; optional `search`, `role`, `departmentId`, `status` (`ready`, `pending`, `inactive`) |
| POST | `/api/admin/users` | `employees:manage`; firstName, lastName, email, role, departmentId, isActive, password |
| PUT | `/api/admin/users/:id` | `employees:manage`; employee fields except password, plus version |
| POST | `/api/admin/users/:id/password` | `employees:manage`; password, version |
| GET | `/api/admin/departments` | `departments:manage`; names, employee counts, versions |
| POST | `/api/admin/departments` | `departments:manage`; departmentName |
| PUT | `/api/admin/departments/:id` | `departments:manage`; departmentName, version |

Emails must be `@procura.co`; names are required and at most 100 characters;
roles are the six supported roles; activation must be a JSON boolean. IDs are
positive 32-bit integers. Password rules and hashing match existing login.
Search strings use a bound SQL substring expression, so `%` and `_` remain
literal characters. Filters combine with AND. Responses never return passwords
or hashes. Counts and inserted IDs are converted from driver numeric types to
JSON-safe numbers. Creation and password-reset operations are rate limited.

## Transactions and simultaneous edits

Every mutation starts a transaction, locks the existing Admin employee rows in
ID order, then checks that the acting employee still has an active Admin Login
and configured password. Target records are locked afterward. All application
Admin mutations follow this order, including new Admin creation, so conflicting
Admin changes serialize. An Admin cannot remove their own Admin role or disable
their own account. Revalidating the acting account after the shared locks also
prevents two Admins from concurrently disabling each other and leaving no active
Admin through these endpoints. A deadlock/lock timeout returns a retryable 409.

Employee and department list responses include a version derived from their
public editable state. A locked record must still match the submitted version;
a stale employee/department edit gets 409 and must be refreshed. Versions do not
contain password hashes; two intentional Admin password resets can run in
sequence, with the final password taking effect. This is not a credential-version
or audit-history feature.

Changing an employee's email, role, department, or activation deletes their
sessions in the same transaction as the change. A password reset does the same.
Failure to create Login or revoke sessions rolls back all related writes. Name
edits preserve sessions. Historical employees without Login records receive a
Login when managed; an absent password still prevents sign-in.

MariaDB references: [FOR UPDATE](https://mariadb.com/docs/server/reference/sql-statements/data-manipulation/selecting-data/for-update),
[INSERT ON DUPLICATE KEY UPDATE](https://mariadb.com/docs/server/reference/sql-statements/data-manipulation/inserting-loading-data/insert-on-duplicate-key-update).

## Validation evidence and live checks

Automated tests run the real HTTP routes and repository with controlled drivers.
They cover Admin-only access, validation and filters, parameter binding, version
conflicts, self-lockout protection, actor revalidation after locking, session
revocation, atomic failure paths, and errors that avoid exposing SQL details.
They do not execute SQL against the hosted service or prove live lock behavior.

The user confirmed the authentication migration, verified-TLS database check,
Admin password provisioning, and successful Admin login. The new Admin write
flows still need live browser/database checks after this commit:

1. Add a department, rename it, and confirm its ID is retained.
2. Create an employee in that department with an initial password. Confirm the
   account can sign in in a private browser window and lacks the Admin screens.
3. Edit its role or deactivate it from the Admin window. Its existing session
   must stop working, while Admin remains signed in. Reactivate it and confirm
   sign-in works again.
4. Reset that employee's password. Confirm the old password fails, the new one
   works, and other employees' sessions remain valid.
5. Open the same employee edit in two Admin browser windows. Save one change;
   saving the other stale form must show a conflict. Refresh before retrying.
6. Check that your own role and activation controls are disabled and existing
   requests/approvals/orders still reference their original employee IDs.

Record real results/screenshots for the report after performing those checks.
Procurement modules and their successful approval/payment/concurrent-write
checks remain the next owners' work.
