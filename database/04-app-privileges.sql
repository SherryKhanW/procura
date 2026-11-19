-- Run as the setup user AFTER procura_app has been created in alwaysdata
-- with "no rights" and "SSL connection required" selected.
-- This file does not create accounts or contain a password.
-- Verify the account host with the provider before executing; the default
-- unrestricted host in alwaysdata is '%'. Do not change unrelated accounts.
-- Do not re-save this user's panel permissions afterward: alwaysdata may
-- replace SQL grants with the panel's all/read-only/no-rights selection.

-- Database-level grants treat '_' as a wildcard unless escaped.
-- Escape it to target exactly procura_db, matching the owner's grant scope.
GRANT SELECT ON `procura\_db`.* TO 'procura_app'@'%';

GRANT INSERT, UPDATE ON procura_db.Department TO 'procura_app'@'%';
GRANT INSERT, UPDATE ON procura_db.Employee TO 'procura_app'@'%';
GRANT INSERT, UPDATE ON procura_db.Login TO 'procura_app'@'%';
GRANT INSERT, UPDATE ON procura_db.Product TO 'procura_app'@'%';
GRANT INSERT, UPDATE ON procura_db.Vendor TO 'procura_app'@'%';
GRANT INSERT, UPDATE, DELETE ON procura_db.Vendor_Product TO 'procura_app'@'%';

GRANT INSERT ON procura_db.Purchase_Request TO 'procura_app'@'%';
GRANT UPDATE (Justification) ON procura_db.Purchase_Request TO 'procura_app'@'%';
GRANT INSERT, UPDATE ON procura_db.Purchase_Request_Item TO 'procura_app'@'%';
GRANT EXECUTE ON PROCEDURE procura_db.sp_decide_purchase_request TO 'procura_app'@'%';
-- Approval insertion and request-status changes are performed by the
-- procedure's definer. The runtime user gets no direct Approval writes.

GRANT INSERT ON procura_db.Purchase_Order TO 'procura_app'@'%';
GRANT UPDATE (Status) ON procura_db.Purchase_Order TO 'procura_app'@'%';
GRANT INSERT ON procura_db.Purchase_Order_Item TO 'procura_app'@'%';
GRANT INSERT ON procura_db.Delivery TO 'procura_app'@'%';
GRANT INSERT ON procura_db.Delivery_Item TO 'procura_app'@'%';
GRANT INSERT ON procura_db.Invoice TO 'procura_app'@'%';
GRANT UPDATE (Status) ON procura_db.Invoice TO 'procura_app'@'%';
GRANT INSERT ON procura_db.Invoice_Item TO 'procura_app'@'%';
GRANT INSERT ON procura_db.Payment TO 'procura_app'@'%';
-- Payment writes still invoke the BEFORE INSERT trigger. No runtime
-- UPDATE/DELETE of payments or alteration of tables/routines is granted.
-- Application authorization, ownership checks and transactions remain required.
