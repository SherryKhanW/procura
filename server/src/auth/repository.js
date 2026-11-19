const identityColumns = `l.LoginID AS loginId, l.IsActive AS isActive,
  e.EmployeeID AS employeeId, e.FirstName AS firstName, e.LastName AS lastName,
  e.Email AS email, e.Role AS role, e.DepartmentID AS departmentId,
  d.DepartmentName AS departmentName`;
const identityJoin = `JOIN Employee e ON e.EmployeeID = l.EmployeeID
  JOIN Department d ON d.DepartmentID = e.DepartmentID`;

export function createAuthRepository(pool) {
  return {
    async findLogin(email) {
      const rows = await pool.query(`SELECT ${identityColumns}, l.PasswordHash AS passwordHash
        FROM Login l ${identityJoin} WHERE e.Email = ? LIMIT 1`, [email]);
      return rows[0] ?? null;
    },
    async createSession(tokenHash, loginId, passwordHash) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        // Take the same row lock as password replacement. This works even at
        // READ COMMITTED: a reset cannot race a stale credential into a session.
        const rows = await connection.query('SELECT PasswordHash AS passwordHash, IsActive AS isActive FROM Login WHERE LoginID = ? FOR UPDATE', [loginId]);
        if (!rows.length || !rows[0].isActive || rows[0].passwordHash !== passwordHash) {
          await connection.rollback();
          return false;
        }
        await connection.query(`INSERT INTO Login_Session (TokenHash, LoginID, ExpiresAt)
          VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 8 HOUR))`, [tokenHash, loginId]);
        await connection.commit();
        return true;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
    async findSession(tokenHash) {
      const rows = await pool.query(`SELECT ${identityColumns}
        FROM Login_Session s JOIN Login l ON l.LoginID = s.LoginID ${identityJoin}
        WHERE s.TokenHash = ? AND s.ExpiresAt > UTC_TIMESTAMP(3)
          AND l.IsActive = TRUE AND l.PasswordHash IS NOT NULL LIMIT 1`, [tokenHash]);
      return rows[0] ?? null;
    },
    async deleteSession(tokenHash) {
      await pool.query('DELETE FROM Login_Session WHERE TokenHash = ?', [tokenHash]);
    },
    async deleteExpiredSessions() {
      await pool.query('DELETE FROM Login_Session WHERE ExpiresAt <= UTC_TIMESTAMP(3)');
    },
    async replacePassword(loginId, expectedHash, newHash) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const rows = await connection.query('SELECT PasswordHash AS passwordHash FROM Login WHERE LoginID = ? FOR UPDATE', [loginId]);
        if (!rows.length || rows[0].passwordHash !== expectedHash) {
          await connection.rollback();
          return false;
        }
        await connection.query('UPDATE Login SET PasswordHash = ? WHERE LoginID = ?', [newHash, loginId]);
        await connection.query('DELETE FROM Login_Session WHERE LoginID = ?', [loginId]);
        await connection.commit();
        return true;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
  };
}
