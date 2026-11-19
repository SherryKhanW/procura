-- Select procura_db in phpMyAdmin and run as the setup account, once.
-- Existing employees, Login rows, and procurement data are preserved.
-- A NULL password hash means the employee cannot sign in yet.
ALTER TABLE Login ADD COLUMN IF NOT EXISTS PasswordHash VARCHAR(255) NULL;

-- Operational sessions are separate from the original 16 business tables.
-- Only SHA-256 digests of random session tokens are stored, never cookies.
CREATE TABLE IF NOT EXISTS Login_Session (
    TokenHash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    LoginID INT NOT NULL,
    CreatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ExpiresAt DATETIME(3) NOT NULL,
    INDEX ix_session_expiry (ExpiresAt),
    CONSTRAINT fk_session_login FOREIGN KEY (LoginID) REFERENCES Login(LoginID)
) ENGINE = InnoDB;

-- The runtime account cannot create or alter this table.
-- The database-level SELECT grant in 04 already covers it.
GRANT INSERT, DELETE ON procura_db.Login_Session TO 'procura_app'@'%';
