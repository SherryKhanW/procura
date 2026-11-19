-- Milestone 3 schema. Apply to an EMPTY selected database only.
-- CREATING TABLES

-- 1. Departments
CREATE TABLE IF NOT EXISTS Department (
    DepartmentID INT AUTO_INCREMENT PRIMARY KEY,
    DepartmentName VARCHAR(100) NOT NULL
) ENGINE = InnoDB;


-- 2. Employees
CREATE TABLE IF NOT EXISTS Employee (
    EmployeeID INT AUTO_INCREMENT PRIMARY KEY,
    FirstName VARCHAR(100) NOT NULL,
    LastName VARCHAR(100) NOT NULL,
    Email VARCHAR(255) NOT NULL,
    Role VARCHAR(50) NOT NULL,
    DepartmentID INT NOT NULL,

    CONSTRAINT uq_employee_email UNIQUE (Email),

    CONSTRAINT fk_employee_department
        FOREIGN KEY (DepartmentID)
        REFERENCES Department (DepartmentID)
) ENGINE = InnoDB;


-- 3. Products
CREATE TABLE IF NOT EXISTS Product (
    ProductID INT AUTO_INCREMENT PRIMARY KEY,
    ProductName VARCHAR(150) NOT NULL,
    Description TEXT,
    Category VARCHAR(100) NOT NULL
) ENGINE = InnoDB;


-- 4. Vendors
CREATE TABLE IF NOT EXISTS Vendor (
    VendorID INT AUTO_INCREMENT PRIMARY KEY,
    VendorName VARCHAR(150) NOT NULL,
    ContactName VARCHAR(150),
    Email VARCHAR(255),
    Phone VARCHAR(30),
    Address TEXT,
    Status VARCHAR(30) NOT NULL DEFAULT 'Active'
) ENGINE = InnoDB;


-- 5. Products supplied by each vendor
CREATE TABLE IF NOT EXISTS Vendor_Product (
    VendorID INT NOT NULL,
    ProductID INT NOT NULL,
    VendorSKU VARCHAR(100),
    AgreedUnitPrice DECIMAL(12, 2) NOT NULL,
    LeadTimeDays INT NOT NULL,

    PRIMARY KEY (VendorID, ProductID),

    CONSTRAINT fk_vendor_product_vendor
        FOREIGN KEY (VendorID)
        REFERENCES Vendor (VendorID),

    CONSTRAINT fk_vendor_product_product
        FOREIGN KEY (ProductID)
        REFERENCES Product (ProductID)
) ENGINE = InnoDB;


-- 6. Purchase requests
CREATE TABLE IF NOT EXISTS Purchase_Request (
    RequestID INT AUTO_INCREMENT PRIMARY KEY,
    EmployeeID INT NOT NULL,
    RequestDate DATE NOT NULL,
    Status VARCHAR(30) NOT NULL DEFAULT 'Pending',
    Justification TEXT NOT NULL,

    CONSTRAINT fk_request_employee
        FOREIGN KEY (EmployeeID)
        REFERENCES Employee (EmployeeID)
) ENGINE = InnoDB;


-- 7. Products within each purchase request
CREATE TABLE IF NOT EXISTS Purchase_Request_Item (
    RequestID INT NOT NULL,
    ProductID INT NOT NULL,
    QuantityRequested INT NOT NULL,
    EstimatedUnitPrice DECIMAL(12, 2) NOT NULL,

    PRIMARY KEY (RequestID, ProductID),

    CONSTRAINT fk_request_item_request
        FOREIGN KEY (RequestID)
        REFERENCES Purchase_Request (RequestID),

    CONSTRAINT fk_request_item_product
        FOREIGN KEY (ProductID)
        REFERENCES Product (ProductID)
) ENGINE = InnoDB;


-- 8. Approval decisions
CREATE TABLE IF NOT EXISTS Approval (
    ApprovalID INT AUTO_INCREMENT PRIMARY KEY,
    RequestID INT NOT NULL,
    EmployeeID INT NOT NULL,
    ApprovalDate DATE NOT NULL,
    Status VARCHAR(30) NOT NULL,
    Comments TEXT,

    CONSTRAINT uq_approval_request UNIQUE (RequestID),

    CONSTRAINT fk_approval_request
        FOREIGN KEY (RequestID)
        REFERENCES Purchase_Request (RequestID),

    CONSTRAINT fk_approval_employee
        FOREIGN KEY (EmployeeID)
        REFERENCES Employee (EmployeeID)
) ENGINE = InnoDB;


-- 9. Purchase orders
CREATE TABLE IF NOT EXISTS Purchase_Order (
    POID INT AUTO_INCREMENT PRIMARY KEY,
    RequestID INT NOT NULL,
    VendorID INT NOT NULL,
    OrderDate DATE NOT NULL,
    ExpectedDeliveryDate DATE NOT NULL,
    Status VARCHAR(30) NOT NULL DEFAULT 'Open',

    CONSTRAINT uq_order_request UNIQUE (RequestID),

    CONSTRAINT fk_order_request
        FOREIGN KEY (RequestID)
        REFERENCES Purchase_Request (RequestID),

    CONSTRAINT fk_order_vendor
        FOREIGN KEY (VendorID)
        REFERENCES Vendor (VendorID)
) ENGINE = InnoDB;


-- 10. Products within each purchase order
CREATE TABLE IF NOT EXISTS Purchase_Order_Item (
    POItemID INT AUTO_INCREMENT PRIMARY KEY,
    POID INT NOT NULL,
    ProductID INT NOT NULL,
    QuantityOrdered INT NOT NULL,
    UnitPrice DECIMAL(12, 2) NOT NULL,

    CONSTRAINT uq_order_product UNIQUE (POID, ProductID),

    CONSTRAINT fk_order_item_order
        FOREIGN KEY (POID)
        REFERENCES Purchase_Order (POID),

    CONSTRAINT fk_order_item_product
        FOREIGN KEY (ProductID)
        REFERENCES Product (ProductID)
) ENGINE = InnoDB;


-- 11. Deliveries
CREATE TABLE IF NOT EXISTS Delivery (
    DeliveryID INT AUTO_INCREMENT PRIMARY KEY,
    DeliveryDate DATE NOT NULL,
    EmployeeID INT NOT NULL,
    Status VARCHAR(30) NOT NULL DEFAULT 'Received',

    CONSTRAINT fk_delivery_employee
        FOREIGN KEY (EmployeeID)
        REFERENCES Employee (EmployeeID)
) ENGINE = InnoDB;


-- 12. Items received in each delivery
CREATE TABLE IF NOT EXISTS Delivery_Item (
    DeliveryItemID INT AUTO_INCREMENT PRIMARY KEY,
    DeliveryID INT NOT NULL,
    POItemID INT NOT NULL,
    QuantityReceived INT NOT NULL,

    CONSTRAINT uq_delivery_po_item UNIQUE (DeliveryID, POItemID),

    CONSTRAINT fk_delivery_item_delivery
        FOREIGN KEY (DeliveryID)
        REFERENCES Delivery (DeliveryID),

    CONSTRAINT fk_delivery_item_order_item
        FOREIGN KEY (POItemID)
        REFERENCES Purchase_Order_Item (POItemID)
) ENGINE = InnoDB;


-- 13. Invoices
CREATE TABLE IF NOT EXISTS Invoice (
    InvoiceID INT AUTO_INCREMENT PRIMARY KEY,
    POID INT NOT NULL,
    InvoiceNumber VARCHAR(100) NOT NULL,
    InvoiceDate DATE NOT NULL,
    DueDate DATE NOT NULL,
    Status VARCHAR(30) NOT NULL DEFAULT 'Unpaid',

    CONSTRAINT uq_invoice_order UNIQUE (POID),

    CONSTRAINT fk_invoice_order
        FOREIGN KEY (POID)
        REFERENCES Purchase_Order (POID)
) ENGINE = InnoDB;


-- 14. Items billed on each invoice
CREATE TABLE IF NOT EXISTS Invoice_Item (
    InvoiceItemID INT AUTO_INCREMENT PRIMARY KEY,
    InvoiceID INT NOT NULL,
    POItemID INT NOT NULL,
    QuantityInvoiced INT NOT NULL,
    UnitPrice DECIMAL(12, 2) NOT NULL,

    CONSTRAINT uq_invoice_po_item UNIQUE (POItemID),

    CONSTRAINT fk_invoice_item_invoice
        FOREIGN KEY (InvoiceID)
        REFERENCES Invoice (InvoiceID),

    CONSTRAINT fk_invoice_item_order_item
        FOREIGN KEY (POItemID)
        REFERENCES Purchase_Order_Item (POItemID)
) ENGINE = InnoDB;


-- 15. Payments
CREATE TABLE IF NOT EXISTS Payment (
    PaymentID INT AUTO_INCREMENT PRIMARY KEY,
    InvoiceID INT NOT NULL,
    PaymentDate DATE NOT NULL,
    Amount DECIMAL(12, 2) NOT NULL,
    PaymentMethod VARCHAR(50) NOT NULL,

    CONSTRAINT uq_payment_invoice UNIQUE (InvoiceID),

    CONSTRAINT fk_payment_invoice
        FOREIGN KEY (InvoiceID)
        REFERENCES Invoice (InvoiceID)
) ENGINE = InnoDB;


-- 16. Login
CREATE TABLE Login (
    LoginID INT AUTO_INCREMENT PRIMARY KEY,
    EmployeeID INT NOT NULL,
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT uq_login_employee UNIQUE (EmployeeID),

    CONSTRAINT fk_login_employee
        FOREIGN KEY (EmployeeID)
        REFERENCES Employee (EmployeeID)
) ENGINE = InnoDB;
