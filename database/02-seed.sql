-- Fictional Milestone 3 base dataset. Run ONCE after 01-schema.sql.
-- Intentionally excludes later manual demonstration/test workflows.
START TRANSACTION;
-- ADDING DUMMY VALUES TO THE TABLES

-- 1. DEPARTMENTS
INSERT INTO Department (DepartmentID, DepartmentName) VALUES
(1, 'Engineering'),
(2, 'Finance'),
(3, 'Human Resources'),
(4, 'Marketing'),
(5, 'Operations'),
(6, 'Purchasing'),
(7, 'Receiving'),
(8, 'IT Support'),
(9, 'Legal'),
(10, 'Administration');


-- 2. EMPLOYEES
INSERT INTO Employee
(EmployeeID, FirstName, LastName, Email, Role, DepartmentID)
VALUES
(1, 'Sara', 'Ahmed', 'sara.ahmed@example.com', 'Employee', 1),
(2, 'Omar', 'Khan', 'omar.khan@example.com', 'Finance', 2),
(3, 'Maya', 'Patel', 'maya.patel@example.com', 'Employee', 3),
(4, 'Adam', 'Wilson', 'adam.wilson@example.com', 'Employee', 4),
(5, 'Lina', 'Hassan', 'lina.hassan@example.com', 'Manager', 5),
(6, 'Daniel', 'Lee', 'daniel.lee@example.com', 'Purchasing', 6),
(7, 'Noor', 'Ali', 'noor.ali@example.com', 'Receiving', 7),
(8, 'James', 'Brown', 'james.brown@example.com', 'Employee', 8),
(9, 'Aisha', 'Malik', 'aisha.malik@example.com', 'Manager', 9),
(10, 'Sofia', 'Garcia', 'sofia.garcia@example.com', 'Admin', 10);


-- 3. PRODUCTS
INSERT INTO Product
(ProductID, ProductName, Description, Category)
VALUES
(1, 'Business Laptop', 'Laptop with 16 GB RAM and 512 GB SSD', 'Computers'),
(2, '24-inch Monitor', 'Full HD external monitor', 'Displays'),
(3, 'Wireless Keyboard', 'Wireless keyboard with USB receiver', 'Accessories'),
(4, 'Wireless Mouse', 'Wireless optical mouse', 'Accessories'),
(5, 'Office Chair', 'Adjustable ergonomic office chair', 'Furniture'),
(6, 'Office Desk', 'Standard workstation desk', 'Furniture'),
(7, 'External SSD', 'Portable 1 TB solid-state drive', 'Storage'),
(8, 'Laser Printer', 'Network-enabled monochrome printer', 'Printers'),
(9, 'Printer Toner', 'Replacement toner cartridge', 'Consumables'),
(10, 'Network Router', 'Dual-band office network router', 'Networking');


-- 4. VENDORS
INSERT INTO Vendor
(VendorID, VendorName, ContactName, Email, Phone, Address, Status)
VALUES
(1, 'Atlas Computing', 'Alex Reed', 'sales@atlas.example.com',
 '+1-212-555-0101', '101 Market Street, New York', 'Active'),
(2, 'ClearView Displays', 'Beth Chen', 'sales@clearview.example.com',
 '+1-212-555-0102', '102 Market Street, New York', 'Active'),
(3, 'KeyWorks Supply', 'Chris Evans', 'sales@keyworks.example.com',
 '+1-212-555-0103', '103 Market Street, New York', 'Active'),
(4, 'Pointer Office Tech', 'Dina Saleh', 'sales@pointer.example.com',
 '+1-212-555-0104', '104 Market Street, New York', 'Active'),
(5, 'Comfort Seating', 'Ethan Park', 'sales@comfort.example.com',
 '+1-212-555-0105', '105 Market Street, New York', 'Active'),
(6, 'Workspace Furniture', 'Fatima Noor', 'sales@workspace.example.com',
 '+1-212-555-0106', '106 Market Street, New York', 'Active'),
(7, 'DataSafe Storage', 'Grace Kim', 'sales@datasafe.example.com',
 '+1-212-555-0107', '107 Market Street, New York', 'Active'),
(8, 'PrintPro Systems', 'Hassan Omar', 'sales@printpro.example.com',
 '+1-212-555-0108', '108 Market Street, New York', 'Active'),
(9, 'Office Consumables', 'Isabel Diaz', 'sales@consumables.example.com',
 '+1-212-555-0109', '109 Market Street, New York', 'Active'),
(10, 'Connect Networks', 'Jack Miller', 'sales@connect.example.com',
 '+1-212-555-0110', '110 Market Street, New York', 'Active');


-- 5. VENDOR PRODUCTS
-- Extra listings demonstrate that a product can have multiple vendors.
INSERT INTO Vendor_Product
(VendorID, ProductID, VendorSKU, AgreedUnitPrice, LeadTimeDays)
VALUES
(1, 1, 'ATL-LAP-01', 900.00, 5),
(2, 2, 'CLR-MON-01', 250.00, 4),
(3, 3, 'KEY-KBD-01', 40.00, 3),
(4, 4, 'PTR-MSE-01', 25.00, 3),
(5, 5, 'COM-CHR-01', 180.00, 7),
(6, 6, 'WRK-DSK-01', 120.00, 7),
(7, 7, 'DAT-SSD-01', 60.00, 4),
(8, 8, 'PRT-PRN-01', 300.00, 5),
(9, 9, 'OFF-TNR-01', 75.00, 2),
(10, 10, 'CON-RTR-01', 150.00, 4),
(1, 2, 'ATL-MON-02', 260.00, 5),
(2, 1, 'CLR-LAP-02', 920.00, 6),
(3, 4, 'KEY-MSE-02', 28.00, 3),
(4, 3, 'PTR-KBD-02', 42.00, 4);


-- 6. PURCHASE REQUESTS
-- 1-12: approved; 13: rejected; 14-15: pending.
INSERT INTO Purchase_Request
(RequestID, EmployeeID, RequestDate, Status, Justification)
VALUES
(1, 1, '2026-09-01', 'Approved', 'Laptops for new engineers'),
(2, 8, '2026-09-01', 'Approved', 'Monitors for workstation upgrades'),
(3, 3, '2026-09-02', 'Approved', 'Keyboards for HR workstations'),
(4, 4, '2026-09-02', 'Approved', 'Replacement mice for marketing'),
(5, 1, '2026-09-03', 'Approved', 'Chairs for the engineering office'),
(6, 3, '2026-09-03', 'Approved', 'Desks for new staff'),
(7, 8, '2026-09-04', 'Approved', 'External drives for backups'),
(8, 4, '2026-09-04', 'Approved', 'Printers for departmental use'),
(9, 2, '2026-09-05', 'Approved', 'Replacement toner for finance'),
(10, 8, '2026-09-05', 'Approved', 'Routers for network expansion'),
(11, 1, '2026-10-01', 'Approved', 'Laptops for the next hiring round'),
(12, 4, '2026-10-01', 'Approved', 'Monitors for the marketing office'),
(13, 3, '2026-10-02', 'Rejected', 'Additional chairs beyond current needs'),
(14, 1, '2026-10-28', 'Pending', 'Keyboards for the development lab'),
(15, 8, '2026-10-29', 'Pending', 'External drives for the IT team');


-- 7. PURCHASE REQUEST ITEMS
INSERT INTO Purchase_Request_Item
(RequestID, ProductID, QuantityRequested, EstimatedUnitPrice)
VALUES
(1, 1, 10, 900.00),
(2, 2, 20, 250.00),
(3, 3, 10, 40.00),
(4, 4, 10, 25.00),
(5, 5, 10, 180.00),
(6, 6, 10, 120.00),
(7, 7, 10, 60.00),
(8, 8, 10, 300.00),
(9, 9, 10, 75.00),
(10, 10, 10, 150.00),
(11, 1, 10, 900.00),
(12, 2, 20, 250.00),
(13, 5, 10, 180.00),
(14, 3, 15, 40.00),
(15, 7, 12, 60.00);


-- 8. APPROVALS
-- Only employees with the Manager role make these decisions.
INSERT INTO Approval
(ApprovalID, RequestID, EmployeeID, ApprovalDate, Status, Comments)
VALUES
(1, 1, 5, '2026-09-02', 'Approved', 'Required for incoming engineers'),
(2, 2, 5, '2026-09-02', 'Approved', 'Workstation upgrade approved'),
(3, 3, 9, '2026-09-03', 'Approved', 'Within departmental budget'),
(4, 4, 5, '2026-09-03', 'Approved', 'Replacement equipment approved'),
(5, 5, 5, '2026-09-04', 'Approved', 'Ergonomic seating approved'),
(6, 6, 9, '2026-09-04', 'Approved', 'New staff seating plan confirmed'),
(7, 7, 5, '2026-09-05', 'Approved', 'Backup equipment approved'),
(8, 8, 9, '2026-09-05', 'Approved', 'Departmental requirement confirmed'),
(9, 9, 5, '2026-09-06', 'Approved', 'Consumables purchase approved'),
(10, 10, 5, '2026-09-06', 'Approved', 'Network expansion approved'),
(11, 11, 5, '2026-10-02', 'Approved', 'Hiring equipment approved'),
(12, 12, 9, '2026-10-02', 'Approved', 'Monitor purchase approved'),
(13, 13, 9, '2026-10-03', 'Rejected', 'Existing chairs meet current needs');


-- 9. PURCHASE ORDERS
INSERT INTO Purchase_Order
(POID, RequestID, VendorID, OrderDate, ExpectedDeliveryDate, Status)
VALUES
(1, 1, 1, '2026-09-03', '2026-09-10', 'Closed'),
(2, 2, 2, '2026-09-03', '2026-09-10', 'Closed'),
(3, 3, 3, '2026-09-04', '2026-09-10', 'Closed'),
(4, 4, 4, '2026-09-04', '2026-09-10', 'Closed'),
(5, 5, 5, '2026-09-05', '2026-09-14', 'Closed'),
(6, 6, 6, '2026-09-05', '2026-09-14', 'Closed'),
(7, 7, 7, '2026-09-06', '2026-09-12', 'Closed'),
(8, 8, 8, '2026-09-06', '2026-09-13', 'Closed'),
(9, 9, 9, '2026-09-07', '2026-09-11', 'Closed'),
(10, 10, 10, '2026-09-07', '2026-09-13', 'Closed'),
(11, 11, 1, '2026-10-03', '2026-10-10', 'Partially Received'),
(12, 12, 2, '2026-10-03', '2026-10-10', 'Invoiced');


-- 10. PURCHASE ORDER ITEMS
INSERT INTO Purchase_Order_Item
(POItemID, POID, ProductID, QuantityOrdered, UnitPrice)
VALUES
(1, 1, 1, 10, 900.00),
(2, 2, 2, 20, 250.00),
(3, 3, 3, 10, 40.00),
(4, 4, 4, 10, 25.00),
(5, 5, 5, 10, 180.00),
(6, 6, 6, 10, 120.00),
(7, 7, 7, 10, 60.00),
(8, 8, 8, 10, 300.00),
(9, 9, 9, 10, 75.00),
(10, 10, 10, 10, 150.00),
(11, 11, 1, 10, 900.00),
(12, 12, 2, 20, 250.00);


-- 11. DELIVERIES
-- "Received" means the shipment was logged,
-- not necessarily that its associated order is fully received.
INSERT INTO Delivery
(DeliveryID, DeliveryDate, EmployeeID, Status)
VALUES
(1, '2026-09-08', 7, 'Received'),
(2, '2026-09-10', 7, 'Received'),
(3, '2026-09-09', 7, 'Received'),
(4, '2026-09-09', 7, 'Received'),
(5, '2026-09-12', 7, 'Received'),
(6, '2026-09-12', 7, 'Received'),
(7, '2026-09-10', 7, 'Received'),
(8, '2026-09-11', 7, 'Received'),
(9, '2026-09-09', 7, 'Received'),
(10, '2026-09-11', 7, 'Received'),
(11, '2026-10-08', 7, 'Received'),
(12, '2026-10-09', 7, 'Received');


-- 12. DELIVERY ITEMS
-- Delivery 1 contains items from two different purchase orders.
-- PO item 1 arrives in two deliveries: 6 + 4 = 10.
-- PO item 11 has only 6 of its 10 units received.
INSERT INTO Delivery_Item
(DeliveryItemID, DeliveryID, POItemID, QuantityReceived)
VALUES
(1, 1, 1, 6),
(2, 1, 2, 20),
(3, 2, 1, 4),
(4, 3, 3, 10),
(5, 4, 4, 10),
(6, 5, 5, 10),
(7, 6, 6, 10),
(8, 7, 7, 10),
(9, 8, 8, 10),
(10, 9, 9, 10),
(11, 10, 10, 10),
(12, 11, 11, 6),
(13, 12, 12, 20);


-- 13. INVOICES
INSERT INTO Invoice
(InvoiceID, POID, InvoiceNumber, InvoiceDate, DueDate, Status)
VALUES
(1, 1, 'ATL-2026-001', '2026-09-11', '2026-10-11', 'Paid'),
(2, 2, 'CLR-2026-001', '2026-09-11', '2026-10-11', 'Paid'),
(3, 3, 'KEY-2026-001', '2026-09-10', '2026-10-10', 'Paid'),
(4, 4, 'PTR-2026-001', '2026-09-10', '2026-10-10', 'Paid'),
(5, 5, 'COM-2026-001', '2026-09-13', '2026-10-13', 'Paid'),
(6, 6, 'WRK-2026-001', '2026-09-13', '2026-10-13', 'Paid'),
(7, 7, 'DAT-2026-001', '2026-09-11', '2026-10-11', 'Paid'),
(8, 8, 'PRT-2026-001', '2026-09-12', '2026-10-12', 'Paid'),
(9, 9, 'OFF-2026-001', '2026-09-10', '2026-10-10', 'Paid'),
(10, 10, 'CON-2026-001', '2026-09-12', '2026-10-12', 'Paid'),
(11, 11, 'ATL-2026-002', '2026-10-09', '2026-11-08', 'Unpaid'),
(12, 12, 'CLR-2026-002', '2026-10-10', '2026-11-09', 'Unpaid');


-- 14. INVOICE ITEMS
-- Invoice 11: ordered 10, received 6, invoiced 10.
-- Invoice 12: ordered 20, received 20, invoiced 22.
-- These are intentional mismatches; neither has a payment.
INSERT INTO Invoice_Item
(InvoiceItemID, InvoiceID, POItemID, QuantityInvoiced, UnitPrice)
VALUES
(1, 1, 1, 10, 900.00),
(2, 2, 2, 20, 250.00),
(3, 3, 3, 10, 40.00),
(4, 4, 4, 10, 25.00),
(5, 5, 5, 10, 180.00),
(6, 6, 6, 10, 120.00),
(7, 7, 7, 10, 60.00),
(8, 8, 8, 10, 300.00),
(9, 9, 9, 10, 75.00),
(10, 10, 10, 10, 150.00),
(11, 11, 11, 10, 900.00),
(12, 12, 12, 22, 250.00);


-- 15. PAYMENTS
-- Each amount equals the corresponding invoice total.
-- All paid invoices have matching ordered/received/invoiced quantities.
INSERT INTO Payment
(PaymentID, InvoiceID, PaymentDate, Amount, PaymentMethod)
VALUES
(1, 1, '2026-09-20', 9000.00, 'Bank Transfer'),
(2, 2, '2026-09-20', 5000.00, 'Bank Transfer'),
(3, 3, '2026-09-20', 400.00, 'Corporate Card'),
(4, 4, '2026-09-20', 250.00, 'Corporate Card'),
(5, 5, '2026-09-22', 1800.00, 'Bank Transfer'),
(6, 6, '2026-09-22', 1200.00, 'Bank Transfer'),
(7, 7, '2026-09-21', 600.00, 'Corporate Card'),
(8, 8, '2026-09-22', 3000.00, 'Bank Transfer'),
(9, 9, '2026-09-20', 750.00, 'Corporate Card'),
(10, 10, '2026-09-22', 1500.00, 'Bank Transfer');


-- Forgot to add dummy values for thr Login table so updating table
-- Change the existing dummy employees' email domain so only procura.co emails are authorised.
UPDATE Employee
SET Email = REPLACE(Email, '@example.com', '@procura.co');

-- Authorize the ten existing employees.
INSERT INTO Login (LoginID, EmployeeID, IsActive) VALUES
(1, 1, TRUE),
(2, 2, TRUE),
(3, 3, TRUE),
(4, 4, TRUE),
(5, 5, TRUE),
(6, 6, TRUE),
(7, 7, TRUE),
(8, 8, TRUE),
(9, 9, TRUE),
(10, 10, TRUE);



COMMIT;
