import { AdminError, employeeVersion, departmentVersion } from './validation.js';

const employeeSelect = `SELECT e.EmployeeID AS employeeId, e.FirstName AS firstName,
  e.LastName AS lastName, e.Email AS email, e.Role AS role, e.DepartmentID AS departmentId,
  d.DepartmentName AS departmentName, COALESCE(l.IsActive, FALSE) AS isActive,
  (l.PasswordHash IS NOT NULL) AS passwordConfigured
  FROM Employee e JOIN Department d ON d.DepartmentID = e.DepartmentID
  LEFT JOIN Login l ON l.EmployeeID = e.EmployeeID`;
const publicEmployee = row => ({ ...row, isActive: Boolean(row.isActive), passwordConfigured: Boolean(row.passwordConfigured), version: employeeVersion(row) });
const stale = () => new AdminError(409, 'Someone changed this record. Refresh the list and try again.');

export function createAdminRepository(pool) {
  async function adminTransaction(actorId, action) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      // Serialize administration through existing Admin employee rows. Always
      // acquire these before target records, including for new Admin accounts.
      // A concurrent Admin deactivation must finish before actor revalidation.
      const admins = await connection.query("SELECT EmployeeID AS employeeId FROM Employee WHERE Role = 'Admin' ORDER BY EmployeeID FOR UPDATE");
      const actor = await connection.query('SELECT IsActive AS isActive, PasswordHash AS passwordHash FROM Login WHERE EmployeeID = ? FOR UPDATE', [actorId]);
      if (!admins.some(row => row.employeeId === actorId) || !actor[0]?.isActive || !actor[0]?.passwordHash) {
        throw new AdminError(403, 'Your administrative access changed. Sign in again.');
      }
      const result = await action(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      if (error.code === 'ER_DUP_ENTRY') throw new AdminError(409, 'An employee with this email already exists.');
      if (error.code === 'ER_NO_REFERENCED_ROW_2') throw new AdminError(400, 'The selected department no longer exists. Refresh and try again.');
      if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) throw new AdminError(409, 'Another change is in progress. Refresh and try again.');
      throw error;
    } finally {
      connection.release();
    }
  }

  async function lockedEmployee(connection, employeeId, version) {
    const rows = await connection.query(`${employeeSelect} WHERE e.EmployeeID = ? FOR UPDATE`, [employeeId]);
    if (!rows.length) throw new AdminError(404, 'Employee not found.');
    if (employeeVersion(rows[0]) !== version) throw stale();
    return rows[0];
  }

  return {
    async listUsers({ search = '', role = null, departmentId = null, status = null } = {}) {
      const conditions = []; const parameters = [];
      if (search) {
        // A literal substring search: %, _ and backslashes have no wildcard role.
        conditions.push("LOCATE(LOWER(?), LOWER(CONCAT(e.FirstName, ' ', e.LastName, ' ', e.Email))) > 0");
        parameters.push(search);
      }
      if (role) { conditions.push('e.Role = ?'); parameters.push(role); }
      if (departmentId) { conditions.push('e.DepartmentID = ?'); parameters.push(departmentId); }
      if (status === 'ready') conditions.push('l.IsActive = TRUE AND l.PasswordHash IS NOT NULL');
      if (status === 'inactive') conditions.push('(l.IsActive = FALSE OR l.LoginID IS NULL)');
      if (status === 'pending') conditions.push('l.IsActive = TRUE AND l.PasswordHash IS NULL');
      const rows = await pool.query(`${employeeSelect}${conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''} ORDER BY e.EmployeeID`, parameters);
      return rows.map(publicEmployee);
    },
    async listDepartments() {
      const rows = await pool.query(`SELECT d.DepartmentID AS departmentId, d.DepartmentName AS departmentName,
        COUNT(e.EmployeeID) AS employeeCount FROM Department d LEFT JOIN Employee e ON e.DepartmentID = d.DepartmentID
        GROUP BY d.DepartmentID, d.DepartmentName ORDER BY d.DepartmentName, d.DepartmentID`);
      return rows.map(row => ({ ...row, employeeCount: Number(row.employeeCount), version: departmentVersion(row) }));
    },
    async createEmployee(actorId, data, passwordHash) {
      return adminTransaction(actorId, async connection => {
        const result = await connection.query(`INSERT INTO Employee (FirstName, LastName, Email, Role, DepartmentID)
          VALUES (?, ?, ?, ?, ?)`, [data.firstName, data.lastName, data.email, data.role, data.departmentId]);
        const employeeId = Number(result.insertId);
        await connection.query('INSERT INTO Login (EmployeeID, IsActive, PasswordHash) VALUES (?, ?, ?)', [employeeId, data.isActive, passwordHash]);
        return { employeeId };
      });
    },
    async updateEmployee(actorId, employeeId, data) {
      return adminTransaction(actorId, async connection => {
        const previous = await lockedEmployee(connection, employeeId, data.version);
        if (actorId === employeeId && (data.role !== 'Admin' || !data.isActive)) {
          throw new AdminError(400, 'You cannot deactivate your own account or remove your own Admin role.');
        }
        await connection.query(`UPDATE Employee SET FirstName = ?, LastName = ?, Email = ?, Role = ?, DepartmentID = ?
          WHERE EmployeeID = ?`, [data.firstName, data.lastName, data.email, data.role, data.departmentId, employeeId]);
        // A historical Employee may have no Login row. Preserve an existing
        // password and create a locked, unprovisioned Login only when missing.
        await connection.query(`INSERT INTO Login (EmployeeID, IsActive) VALUES (?, ?)
          ON DUPLICATE KEY UPDATE IsActive = VALUES(IsActive)`, [employeeId, data.isActive]);
        if (previous.email !== data.email || previous.role !== data.role || Boolean(previous.isActive) !== data.isActive || previous.departmentId !== data.departmentId) {
          await connection.query(`DELETE s FROM Login_Session s JOIN Login l ON l.LoginID = s.LoginID WHERE l.EmployeeID = ?`, [employeeId]);
        }
        return { employeeId };
      });
    },
    async setEmployeePassword(actorId, employeeId, version, passwordHash) {
      return adminTransaction(actorId, async connection => {
        if (actorId === employeeId) throw new AdminError(400, 'Use Your account to change your own password.');
        const employee = await lockedEmployee(connection, employeeId, version);
        await connection.query(`INSERT INTO Login (EmployeeID, IsActive, PasswordHash) VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE PasswordHash = VALUES(PasswordHash)`, [employeeId, Boolean(employee.isActive), passwordHash]);
        await connection.query(`DELETE s FROM Login_Session s JOIN Login l ON l.LoginID = s.LoginID WHERE l.EmployeeID = ?`, [employeeId]);
        return { employeeId };
      });
    },
    async createDepartment(actorId, data) {
      return adminTransaction(actorId, async connection => {
        const duplicate = await connection.query('SELECT DepartmentID FROM Department WHERE LOWER(TRIM(DepartmentName)) = LOWER(?) LIMIT 1', [data.departmentName]);
        if (duplicate.length) throw new AdminError(409, 'A department with this name already exists.');
        const result = await connection.query('INSERT INTO Department (DepartmentName) VALUES (?)', [data.departmentName]);
        return { departmentId: Number(result.insertId) };
      });
    },
    async updateDepartment(actorId, departmentId, data) {
      return adminTransaction(actorId, async connection => {
        const rows = await connection.query('SELECT DepartmentID AS departmentId, DepartmentName AS departmentName FROM Department WHERE DepartmentID = ? FOR UPDATE', [departmentId]);
        if (!rows.length) throw new AdminError(404, 'Department not found.');
        if (departmentVersion(rows[0]) !== data.version) throw stale();
        const duplicate = await connection.query('SELECT DepartmentID FROM Department WHERE LOWER(TRIM(DepartmentName)) = LOWER(?) AND DepartmentID <> ? LIMIT 1', [data.departmentName, departmentId]);
        if (duplicate.length) throw new AdminError(409, 'A department with this name already exists.');
        await connection.query('UPDATE Department SET DepartmentName = ? WHERE DepartmentID = ?', [data.departmentName, departmentId]);
        return { departmentId };
      });
    },
  };
}
