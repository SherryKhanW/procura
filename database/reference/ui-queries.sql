-- Reference queries from Milestone 3; not an installation script.
-- Replace literal IDs with bound parameters when implementing app routes.
-- Email-only demo login below is historical; DO NOT use for authentication.
-- SQL QUERIES FOR UI FUNCTIONALITY

-- 01. DEMO LOGIN (email-only prototype access)
SELECT e.EmployeeID, e.FirstName, e.LastName, e.Email, e.Role,
       d.DepartmentName
FROM Login AS l
INNER JOIN Employee AS e ON l.EmployeeID = e.EmployeeID
INNER JOIN Department AS d ON e.DepartmentID = d.DepartmentID
WHERE e.Email = 'sara.ahmed@procura.co'
  AND l.IsActive = TRUE;


-- 02. PURCHASE REQUEST LIST / SEARCH / FILTERS
SELECT pr.RequestID,
       CONCAT(e.FirstName, ' ', e.LastName) AS Requester,
       d.DepartmentName, pr.RequestDate,
       COUNT(pri.ProductID) AS NumberOfItems,
       COALESCE(SUM(pri.QuantityRequested * pri.EstimatedUnitPrice), 0)
           AS EstimatedTotal,
       pr.Status
FROM Purchase_Request AS pr
INNER JOIN Employee AS e ON pr.EmployeeID = e.EmployeeID
INNER JOIN Department AS d ON e.DepartmentID = d.DepartmentID
LEFT JOIN Purchase_Request_Item AS pri ON pr.RequestID = pri.RequestID
GROUP BY pr.RequestID, e.FirstName, e.LastName,
         d.DepartmentName, pr.RequestDate, pr.Status
ORDER BY pr.RequestDate DESC, pr.RequestID DESC;

-- 03. NEW PURCHASE REQUEST
-- Product dropdown.
SELECT ProductID, ProductName, Category
FROM Product
ORDER BY ProductName;

-- Requester and department for the form; use logged-in EmployeeID.
SELECT e.EmployeeID, e.FirstName, e.LastName, d.DepartmentName
FROM Employee AS e
INNER JOIN Department AS d ON e.DepartmentID = d.DepartmentID
WHERE e.EmployeeID = 1;


-- 04. REQUEST DETAILS AND APPROVAL
SELECT pr.RequestID, pr.RequestDate, pr.Status, pr.Justification,
       CONCAT(e.FirstName, ' ', e.LastName) AS Requester,
       d.DepartmentName
FROM Purchase_Request AS pr
INNER JOIN Employee AS e ON pr.EmployeeID = e.EmployeeID
INNER JOIN Department AS d ON e.DepartmentID = d.DepartmentID
WHERE pr.RequestID = 1;

SELECT pri.ProductID, p.ProductName, pri.QuantityRequested,
       pri.EstimatedUnitPrice,
       pri.QuantityRequested * pri.EstimatedUnitPrice AS LineTotal
FROM Purchase_Request_Item AS pri
INNER JOIN Product AS p ON pri.ProductID = p.ProductID
WHERE pri.RequestID = 1
ORDER BY p.ProductName;

SELECT a.ApprovalID,
       CONCAT(e.FirstName, ' ', e.LastName) AS DecisionBy,
       a.ApprovalDate, a.Status, a.Comments
FROM Approval AS a
INNER JOIN Employee AS e ON a.EmployeeID = e.EmployeeID
WHERE a.RequestID = 1;

-- 05. APPROVALS QUEUE
SELECT pr.RequestID,
       CONCAT(e.FirstName, ' ', e.LastName) AS Requester,
       d.DepartmentName, pr.RequestDate,
       COALESCE(SUM(pri.QuantityRequested * pri.EstimatedUnitPrice), 0)
           AS EstimatedTotal
FROM Purchase_Request AS pr
INNER JOIN Employee AS e ON pr.EmployeeID = e.EmployeeID
INNER JOIN Department AS d ON e.DepartmentID = d.DepartmentID
LEFT JOIN Purchase_Request_Item AS pri ON pr.RequestID = pri.RequestID
WHERE pr.Status = 'Pending'
GROUP BY pr.RequestID, e.FirstName, e.LastName,
         d.DepartmentName, pr.RequestDate
ORDER BY pr.RequestDate, pr.RequestID;


-- 06. CREATE PURCHASE ORDER
-- Approved requests without a PO; initially empty with the current seed data.
SELECT pr.RequestID,
       CONCAT(e.FirstName, ' ', e.LastName) AS Requester,
       pr.RequestDate
FROM Purchase_Request AS pr
INNER JOIN Employee AS e ON pr.EmployeeID = e.EmployeeID
LEFT JOIN Purchase_Order AS po ON pr.RequestID = po.RequestID
WHERE pr.Status = 'Approved' AND po.POID IS NULL
ORDER BY pr.RequestDate, pr.RequestID;

-- Active vendors supplying ALL products in request 1.
SELECT v.VendorID, v.VendorName
FROM Vendor AS v
INNER JOIN Vendor_Product AS vp ON v.VendorID = vp.VendorID
INNER JOIN Purchase_Request_Item AS pri ON vp.ProductID = pri.ProductID
WHERE pri.RequestID = 1 AND v.Status = 'Active'
GROUP BY v.VendorID, v.VendorName
HAVING COUNT(DISTINCT vp.ProductID) = (
    SELECT COUNT(*) FROM Purchase_Request_Item WHERE RequestID = 1
);

-- Prefill request 1's items using vendor 1's agreed prices.
SELECT p.ProductID, p.ProductName, pri.QuantityRequested,
       vp.AgreedUnitPrice, vp.LeadTimeDays
FROM Purchase_Request_Item AS pri
INNER JOIN Product AS p ON pri.ProductID = p.ProductID
INNER JOIN Vendor_Product AS vp ON pri.ProductID = vp.ProductID
WHERE pri.RequestID = 1 AND vp.VendorID = 1;


-- 07. PURCHASE ORDER LIST
SELECT po.POID, po.RequestID, v.VendorName, po.OrderDate,
       po.ExpectedDeliveryDate, po.Status,
       COALESCE(SUM(poi.QuantityOrdered * poi.UnitPrice), 0) AS OrderTotal
FROM Purchase_Order AS po
INNER JOIN Vendor AS v ON po.VendorID = v.VendorID
LEFT JOIN Purchase_Order_Item AS poi ON po.POID = poi.POID
GROUP BY po.POID, po.RequestID, v.VendorName,
         po.OrderDate, po.ExpectedDeliveryDate, po.Status
ORDER BY po.OrderDate DESC, po.POID DESC;

-- 08. PURCHASE ORDER DETAILS
SELECT po.POID, po.RequestID, v.VendorName, po.OrderDate,
       po.ExpectedDeliveryDate, po.Status
FROM Purchase_Order AS po
INNER JOIN Vendor AS v ON po.VendorID = v.VendorID
WHERE po.POID = 1;

-- Aggregate delivery quantities first to avoid duplicating other item values.
SELECT poi.POItemID, p.ProductName, poi.QuantityOrdered, poi.UnitPrice,
       poi.QuantityOrdered * poi.UnitPrice AS LineTotal,
       COALESCE(received.TotalReceived, 0) AS TotalReceived,
       COALESCE(ii.QuantityInvoiced, 0) AS QuantityInvoiced
FROM Purchase_Order_Item AS poi
INNER JOIN Product AS p ON poi.ProductID = p.ProductID
LEFT JOIN (
    SELECT POItemID, SUM(QuantityReceived) AS TotalReceived
    FROM Delivery_Item GROUP BY POItemID
) AS received ON poi.POItemID = received.POItemID
LEFT JOIN Invoice_Item AS ii ON poi.POItemID = ii.POItemID
WHERE poi.POID = 1;

SELECT DISTINCT d.DeliveryID, d.DeliveryDate, d.Status
FROM Delivery AS d
INNER JOIN Delivery_Item AS di ON d.DeliveryID = di.DeliveryID
INNER JOIN Purchase_Order_Item AS poi ON di.POItemID = poi.POItemID
WHERE poi.POID = 1;

SELECT InvoiceID, InvoiceNumber, InvoiceDate, DueDate, Status
FROM Invoice WHERE POID = 1;

-- 09. RECORD DELIVERY
-- PO dropdown: orders with at least one outstanding item.
SELECT DISTINCT po.POID, v.VendorName
FROM Purchase_Order AS po
INNER JOIN Vendor AS v ON po.VendorID = v.VendorID
INNER JOIN Purchase_Order_Item AS poi ON po.POID = poi.POID
LEFT JOIN (
    SELECT POItemID, SUM(QuantityReceived) AS TotalReceived
    FROM Delivery_Item GROUP BY POItemID
) AS received ON poi.POItemID = received.POItemID
WHERE poi.QuantityOrdered > COALESCE(received.TotalReceived, 0)
  AND po.Status <> 'Closed'
ORDER BY po.POID;

SELECT poi.POItemID, p.ProductName, poi.QuantityOrdered,
       COALESCE(SUM(di.QuantityReceived), 0) AS AlreadyReceived,
       poi.QuantityOrdered - COALESCE(SUM(di.QuantityReceived), 0)
           AS RemainingQuantity
FROM Purchase_Order_Item AS poi
INNER JOIN Product AS p ON poi.ProductID = p.ProductID
LEFT JOIN Delivery_Item AS di ON poi.POItemID = di.POItemID
WHERE poi.POID = 11
GROUP BY poi.POItemID, p.ProductName, poi.QuantityOrdered
HAVING RemainingQuantity > 0;

-- 10. DELIVERY LIST AND DETAILS
SELECT d.DeliveryID, d.DeliveryDate,
       CONCAT(e.FirstName, ' ', e.LastName) AS ReceivedBy,
       COUNT(di.DeliveryItemID) AS NumberOfItems, d.Status
FROM Delivery AS d
INNER JOIN Employee AS e ON d.EmployeeID = e.EmployeeID
LEFT JOIN Delivery_Item AS di ON d.DeliveryID = di.DeliveryID
GROUP BY d.DeliveryID, d.DeliveryDate, e.FirstName, e.LastName, d.Status
ORDER BY d.DeliveryDate DESC, d.DeliveryID DESC;

SELECT poi.POID, p.ProductName, di.QuantityReceived
FROM Delivery_Item AS di
INNER JOIN Purchase_Order_Item AS poi ON di.POItemID = poi.POItemID
INNER JOIN Product AS p ON poi.ProductID = p.ProductID
WHERE di.DeliveryID = 1;

-- 11. RECORD INVOICE
-- Initially empty: every seeded PO already has an invoice.
SELECT po.POID, v.VendorName, po.OrderDate
FROM Purchase_Order AS po
INNER JOIN Vendor AS v ON po.VendorID = v.VendorID
LEFT JOIN Invoice AS i ON po.POID = i.POID
WHERE i.InvoiceID IS NULL;

-- Prefill order lines; vendor is obtained through the PO, not stored on Invoice.
SELECT poi.POItemID, p.ProductName, poi.QuantityOrdered, poi.UnitPrice
FROM Purchase_Order_Item AS poi
INNER JOIN Product AS p ON poi.ProductID = p.ProductID
WHERE poi.POID = 1;

-- 12. INVOICE DETAILS / THREE-WAY MATCH DISPLAY
SELECT i.InvoiceID, i.InvoiceNumber, i.POID, v.VendorName,
       i.InvoiceDate, i.DueDate, i.Status,
       pay.PaymentDate, pay.Amount, pay.PaymentMethod
FROM Invoice AS i
INNER JOIN Purchase_Order AS po ON i.POID = po.POID
INNER JOIN Vendor AS v ON po.VendorID = v.VendorID
LEFT JOIN Payment AS pay ON i.InvoiceID = pay.InvoiceID
WHERE i.InvoiceID = 11;

-- This displays results; it does NOT enforce payment eligibility.
-- Starts from all PO lines so a missing invoice line is also a mismatch.
SELECT poi.POItemID, p.ProductName, poi.QuantityOrdered,
       COALESCE(received.TotalReceived, 0) AS TotalReceived,
       ii.QuantityInvoiced, ii.UnitPrice AS InvoicedUnitPrice,
       ii.QuantityInvoiced * ii.UnitPrice AS InvoiceLineTotal,
       CASE
           WHEN ii.InvoiceItemID IS NOT NULL
            AND poi.QuantityOrdered = COALESCE(received.TotalReceived, 0)
            AND poi.QuantityOrdered = ii.QuantityInvoiced
           THEN 'Match' ELSE 'Mismatch'
       END AS MatchResult
FROM Invoice AS i
INNER JOIN Purchase_Order_Item AS poi ON i.POID = poi.POID
INNER JOIN Product AS p ON poi.ProductID = p.ProductID
LEFT JOIN Invoice_Item AS ii
    ON ii.InvoiceID = i.InvoiceID AND ii.POItemID = poi.POItemID
LEFT JOIN (
    SELECT POItemID, SUM(QuantityReceived) AS TotalReceived
    FROM Delivery_Item GROUP BY POItemID
) AS received ON poi.POItemID = received.POItemID
WHERE i.InvoiceID = 11;

SELECT SUM(QuantityInvoiced * UnitPrice) AS InvoiceTotal
FROM Invoice_Item WHERE InvoiceID = 1;


-- 14. INVOICE / PAYMENT LIST
SELECT i.InvoiceID, i.InvoiceNumber, po.POID, v.VendorName,
       i.InvoiceDate, i.DueDate,
       SUM(ii.QuantityInvoiced * ii.UnitPrice) AS InvoiceTotal,
       CASE WHEN pay.PaymentID IS NULL THEN 'Unpaid' ELSE 'Paid' END
           AS PaymentStatus,
       pay.PaymentDate, pay.Amount AS AmountPaid
FROM Invoice AS i
INNER JOIN Purchase_Order AS po ON i.POID = po.POID
INNER JOIN Vendor AS v ON po.VendorID = v.VendorID
LEFT JOIN Invoice_Item AS ii ON i.InvoiceID = ii.InvoiceID
LEFT JOIN Payment AS pay ON i.InvoiceID = pay.InvoiceID
-- Optional unpaid filter:
-- WHERE pay.PaymentID IS NULL
GROUP BY i.InvoiceID, i.InvoiceNumber, po.POID, v.VendorName,
         i.InvoiceDate, i.DueDate, pay.PaymentID, pay.PaymentDate, pay.Amount
ORDER BY i.DueDate, i.InvoiceID;

-- 15. VENDORS / SUPPLIED PRODUCTS / DELETE
SELECT VendorID, VendorName, ContactName, Email, Phone, Address, Status
FROM Vendor
ORDER BY VendorName;

SELECT p.ProductID, p.ProductName, vp.VendorSKU,
       vp.AgreedUnitPrice, vp.LeadTimeDays
FROM Vendor_Product AS vp
INNER JOIN Product AS p ON vp.ProductID = p.ProductID
WHERE vp.VendorID = 1
ORDER BY p.ProductName;

-- 16. PRODUCTS
SELECT p.ProductID, p.ProductName, p.Description, p.Category,
       COUNT(vp.VendorID) AS NumberOfVendors
FROM Product AS p
LEFT JOIN Vendor_Product AS vp ON p.ProductID = vp.ProductID
-- Optional: WHERE p.ProductName LIKE '%Laptop%' AND p.Category = 'Computers'
GROUP BY p.ProductID, p.ProductName, p.Description, p.Category
ORDER BY p.ProductName;

-- 17. EMPLOYEES / DEPARTMENTS / ACCESS MANAGEMENT
SELECT e.EmployeeID, e.FirstName, e.LastName, e.Email, e.Role,
       d.DepartmentName
FROM Employee AS e
INNER JOIN Department AS d ON e.DepartmentID = d.DepartmentID
ORDER BY e.LastName, e.FirstName;

SELECT DepartmentID, DepartmentName FROM Department ORDER BY DepartmentName;


-- 18. DASHBOARD
-- Under the current definition, open requests = requests awaiting approval.
SELECT COUNT(*) AS OpenRequests
FROM Purchase_Request WHERE Status = 'Pending';

SELECT COUNT(*) AS AwaitingApproval
FROM Purchase_Request WHERE Status = 'Pending';

-- Open orders means all orders not yet closed.
SELECT COUNT(*) AS OpenPurchaseOrders
FROM Purchase_Order WHERE Status <> 'Closed';

-- Recent requests panel (not a complete cross-table activity feed).
SELECT pr.RequestID,
       CONCAT(e.FirstName, ' ', e.LastName) AS Requester,
       pr.RequestDate, pr.Status
FROM Purchase_Request AS pr
INNER JOIN Employee AS e ON pr.EmployeeID = e.EmployeeID
ORDER BY pr.RequestDate DESC, pr.RequestID DESC
LIMIT 5;
