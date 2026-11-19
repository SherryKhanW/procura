-- Existing Milestone 3 approval procedure and payment trigger.
DELIMITER $$

DROP PROCEDURE IF EXISTS sp_decide_purchase_request$$
CREATE PROCEDURE sp_decide_purchase_request(
    IN p_RequestID INT,
    IN p_ManagerID INT,
    IN p_Decision VARCHAR(20),
    IN p_ApprovalDate DATE,
    IN p_Comments TEXT
)
BEGIN
    DECLARE v_manager_role VARCHAR(50) DEFAULT NULL;
    DECLARE v_request_status VARCHAR(30) DEFAULT NULL;
    DECLARE v_request_date DATE DEFAULT NULL;

    -- Roll back both table changes if any statement fails.
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    IF p_Decision IS NULL
       OR p_Decision NOT IN ('Approved', 'Rejected') THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Decision must be Approved or Rejected';
    END IF;

    IF p_ApprovalDate IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Approval date is required';
    END IF;

    -- Only a manager can decide; other employee roles are rejected.
    SELECT Role INTO v_manager_role
    FROM Employee
    WHERE EmployeeID = p_ManagerID;

    IF v_manager_role IS NULL OR v_manager_role <> 'Manager' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Only managers can approve or reject requests';
    END IF;

    -- Lock the request so two concurrent managers cannot decide it twice.
    SELECT Status, RequestDate
      INTO v_request_status, v_request_date
    FROM Purchase_Request
    WHERE RequestID = p_RequestID
    FOR UPDATE;

    IF v_request_status IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Purchase request not found';
    END IF;

    IF v_request_status <> 'Pending' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Only pending requests can be decided';
    END IF;

    IF p_ApprovalDate < v_request_date THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Approval date cannot precede request date';
    END IF;

    INSERT INTO Approval
        (RequestID, EmployeeID, ApprovalDate, Status, Comments)
    VALUES
        (p_RequestID, p_ManagerID, p_ApprovalDate, p_Decision, p_Comments);

    UPDATE Purchase_Request
    SET Status = p_Decision
    WHERE RequestID = p_RequestID;

    COMMIT;
END$$

DROP TRIGGER IF EXISTS trg_payment_three_way_match$$
CREATE TRIGGER trg_payment_three_way_match
BEFORE INSERT ON Payment
FOR EACH ROW
BEGIN
    DECLARE v_po_id INT DEFAULT NULL;
    DECLARE v_po_lines INT DEFAULT 0;
    DECLARE v_mismatched_lines INT DEFAULT 0;
    DECLARE v_extra_lines INT DEFAULT 0;
    DECLARE v_invoice_total DECIMAL(18,2) DEFAULT 0.00;

    -- Find the purchase order that belongs to this invoice.
    SELECT POID INTO v_po_id
    FROM Invoice
    WHERE InvoiceID = NEW.InvoiceID;

    IF v_po_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Cannot pay a nonexistent invoice';
    END IF;

    SELECT COUNT(*) INTO v_po_lines
    FROM Purchase_Order_Item
    WHERE POID = v_po_id;

    -- For EVERY PO line, require a matching invoice line and identical
    -- ordered, received (across all deliveries) and invoiced quantities.
    SELECT COUNT(*) INTO v_mismatched_lines
    FROM Purchase_Order_Item AS poi
    LEFT JOIN Invoice_Item AS ii
        ON ii.POItemID = poi.POItemID
       AND ii.InvoiceID = NEW.InvoiceID
    LEFT JOIN (
        SELECT POItemID, SUM(QuantityReceived) AS TotalReceived
        FROM Delivery_Item
        GROUP BY POItemID
    ) AS received
        ON received.POItemID = poi.POItemID
    WHERE poi.POID = v_po_id
      AND (ii.InvoiceItemID IS NULL
           OR poi.QuantityOrdered <> COALESCE(received.TotalReceived, 0)
           OR poi.QuantityOrdered <> ii.QuantityInvoiced);

    -- Also reject an invoice that includes items from a different PO.
    SELECT COUNT(*) INTO v_extra_lines
    FROM Invoice_Item AS ii
    INNER JOIN Purchase_Order_Item AS poi
        ON ii.POItemID = poi.POItemID
    WHERE ii.InvoiceID = NEW.InvoiceID
      AND poi.POID <> v_po_id;

    IF v_po_lines = 0 OR v_mismatched_lines > 0 OR v_extra_lines > 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Payment blocked: three-way match failed';
    END IF;

    -- Ensure the amount paid equals the full invoiced amount.
    SELECT COALESCE(SUM(QuantityInvoiced * UnitPrice), 0.00)
      INTO v_invoice_total
    FROM Invoice_Item
    WHERE InvoiceID = NEW.InvoiceID;

    IF NEW.Amount <= 0 OR NEW.Amount <> v_invoice_total THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Payment amount must equal invoice total';
    END IF;
END$$

DELIMITER ;
