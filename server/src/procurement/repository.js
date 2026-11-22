import { ProcurementError } from './validation.js';

const procedureMessages = new Set([
  'Decision must be Approved or Rejected',
  'Approval date is required',
  'Only managers can approve or reject requests',
  'Purchase request not found',
  'Only pending requests can be decided',
  'Approval date cannot precede request date',
]);

const money = value => Number(value).toFixed(2);
const count = value => Number(value);

function mapDatabaseError(error, duplicate = 'That record already exists.') {
  if (error instanceof ProcurementError) return error;
  if (error.sqlState === '45000' && procedureMessages.has(error.sqlMessage)) return new ProcurementError(400, error.sqlMessage);
  if (error.code === 'ER_DUP_ENTRY') return new ProcurementError(409, duplicate);
  if (error.code === 'ER_NO_REFERENCED_ROW_2') return new ProcurementError(400, 'A selected product or vendor no longer exists. Refresh and try again.');
  if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) return new ProcurementError(409, 'Another change is in progress. Refresh and try again.');
  return error;
}

function where(conditions) {
  return conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
}

export function createProcurementRepository(pool) {
  // Employees without read-all only receive rows they submitted.
  function visibility(user, conditions, parameters) {
    const seeAll = user.permissions.includes('requests:read:all');
    conditions.push('(? = 1 OR pr.EmployeeID = ?)');
    parameters.push(seeAll ? 1 : 0, user.employeeId);
  }

  return {
    // Catalog list used by product management and the request item dropdown.
    async listProducts({ search = '', category = null } = {}) {
      const conditions = []; const parameters = [];
      if (search) {
        conditions.push("LOCATE(LOWER(?), LOWER(CONCAT(p.ProductName, ' ', COALESCE(p.Description, ''), ' ', p.Category))) > 0");
        parameters.push(search);
      }
      if (category) { conditions.push('p.Category = ?'); parameters.push(category); }
      const [products, categories] = await Promise.all([
        pool.query(`SELECT p.ProductID AS productId, p.ProductName AS productName, p.Description AS description,
          p.Category AS category, COUNT(vp.VendorID) AS numberOfVendors
          FROM Product AS p LEFT JOIN Vendor_Product AS vp ON vp.ProductID = p.ProductID
          ${where(conditions)} GROUP BY p.ProductID, p.ProductName, p.Description, p.Category
          ORDER BY p.ProductName, p.ProductID`, parameters),
        pool.query('SELECT DISTINCT Category AS category FROM Product ORDER BY Category'),
      ]);
      return {
        products: products.map(row => ({ ...row, numberOfVendors: count(row.numberOfVendors) })),
        categories: categories.map(row => row.category),
      };
    },

    // Adds a shared catalog product. Price stays on the vendor listing.
    async createProduct(input) {
      try {
        const result = await pool.query('INSERT INTO Product (ProductName, Description, Category) VALUES (?, ?, ?)', [input.productName, input.description, input.category]);
        return { productId: count(result.insertId) };
      } catch (error) { throw mapDatabaseError(error); }
    },

    async updateProduct(productId, input) {
      const existing = await pool.query('SELECT ProductID FROM Product WHERE ProductID = ?', [productId]);
      if (!existing.length) throw new ProcurementError(404, 'Product not found.');
      try {
        await pool.query('UPDATE Product SET ProductName = ?, Description = ?, Category = ? WHERE ProductID = ?', [input.productName, input.description, input.category, productId]);
        return { productId };
      } catch (error) { throw mapDatabaseError(error); }
    },

    async listVendors({ search = '', status = null } = {}) {
      const conditions = []; const parameters = [];
      if (search) {
        conditions.push("LOCATE(LOWER(?), LOWER(CONCAT(v.VendorName, ' ', COALESCE(v.ContactName, ''), ' ', COALESCE(v.Email, '')))) > 0");
        parameters.push(search);
      }
      if (status) { conditions.push('v.Status = ?'); parameters.push(status); }
      const rows = await pool.query(`SELECT v.VendorID AS vendorId, v.VendorName AS vendorName, v.ContactName AS contactName,
        v.Email AS email, v.Phone AS phone, v.Address AS address, v.Status AS status,
        COUNT(vp.ProductID) AS numberOfProducts
        FROM Vendor AS v LEFT JOIN Vendor_Product AS vp ON vp.VendorID = v.VendorID
        ${where(conditions)} GROUP BY v.VendorID, v.VendorName, v.ContactName, v.Email, v.Phone, v.Address, v.Status
        ORDER BY v.VendorName, v.VendorID`, parameters);
      return rows.map(row => ({ ...row, numberOfProducts: count(row.numberOfProducts) }));
    },

    // Vendor plus the products it currently supplies, with that vendor's price.
    async getVendor(vendorId) {
      const vendors = await pool.query(`SELECT VendorID AS vendorId, VendorName AS vendorName, ContactName AS contactName,
        Email AS email, Phone AS phone, Address AS address, Status AS status FROM Vendor WHERE VendorID = ?`, [vendorId]);
      if (!vendors.length) throw new ProcurementError(404, 'Vendor not found.');
      const listings = await pool.query(`SELECT p.ProductID AS productId, p.ProductName AS productName, vp.VendorSKU AS vendorSku,
        vp.AgreedUnitPrice AS agreedUnitPrice, vp.LeadTimeDays AS leadTimeDays
        FROM Vendor_Product AS vp INNER JOIN Product AS p ON p.ProductID = vp.ProductID
        WHERE vp.VendorID = ? ORDER BY p.ProductName`, [vendorId]);
      return {
        vendor: vendors[0],
        listings: listings.map(row => ({ ...row, agreedUnitPrice: money(row.agreedUnitPrice), leadTimeDays: count(row.leadTimeDays) })),
      };
    },

    // Inactive is an update, not a delete, so past orders still name the vendor.
    async createVendor(input) {
      try {
        const result = await pool.query(`INSERT INTO Vendor (VendorName, ContactName, Email, Phone, Address, Status)
          VALUES (?, ?, ?, ?, ?, ?)`, [input.vendorName, input.contactName, input.email, input.phone, input.address, input.status]);
        return { vendorId: count(result.insertId) };
      } catch (error) { throw mapDatabaseError(error); }
    },

    async updateVendor(vendorId, input) {
      const existing = await pool.query('SELECT VendorID FROM Vendor WHERE VendorID = ?', [vendorId]);
      if (!existing.length) throw new ProcurementError(404, 'Vendor not found.');
      try {
        await pool.query(`UPDATE Vendor SET VendorName = ?, ContactName = ?, Email = ?, Phone = ?, Address = ?, Status = ?
          WHERE VendorID = ?`, [input.vendorName, input.contactName, input.email, input.phone, input.address, input.status, vendorId]);
        return { vendorId };
      } catch (error) { throw mapDatabaseError(error); }
    },

    async addListing(vendorId, input) {
      const vendor = await pool.query('SELECT VendorID FROM Vendor WHERE VendorID = ?', [vendorId]);
      if (!vendor.length) throw new ProcurementError(404, 'Vendor not found.');
      try {
        await pool.query(`INSERT INTO Vendor_Product (VendorID, ProductID, VendorSKU, AgreedUnitPrice, LeadTimeDays)
          VALUES (?, ?, ?, ?, ?)`, [vendorId, input.productId, input.vendorSku, input.agreedUnitPrice, input.leadTimeDays]);
        return { vendorId, productId: input.productId };
      } catch (error) { throw mapDatabaseError(error, 'This vendor already supplies that product.'); }
    },

    // Locks the listing, then updates it. A row deleted by someone else is not reported as saved.
    async updateListing(vendorId, productId, input) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const existing = await connection.query('SELECT ProductID FROM Vendor_Product WHERE VendorID = ? AND ProductID = ? FOR UPDATE', [vendorId, productId]);
        if (!existing.length) throw new ProcurementError(404, 'Supplier listing not found.');
        await connection.query(`UPDATE Vendor_Product SET VendorSKU = ?, AgreedUnitPrice = ?, LeadTimeDays = ?
          WHERE VendorID = ? AND ProductID = ?`, [input.vendorSku, input.agreedUnitPrice, input.leadTimeDays, vendorId, productId]);
        await connection.commit();
        return { vendorId, productId };
      } catch (error) {
        await connection.rollback();
        throw mapDatabaseError(error);
      } finally {
        connection.release();
      }
    },

    // Removes only the vendor-product row. Vendor, product, and old order prices stay.
    async deleteListing(vendorId, productId) {
      const result = await pool.query('DELETE FROM Vendor_Product WHERE VendorID = ? AND ProductID = ?', [vendorId, productId]);
      if (!result.affectedRows) throw new ProcurementError(404, 'Supplier listing not found.');
      return { vendorId, productId };
    },

    async listRequests(user, { search = '', status = null } = {}) {
      const conditions = []; const parameters = [];
      visibility(user, conditions, parameters);
      if (search) {
        conditions.push("LOCATE(LOWER(?), LOWER(CONCAT(e.FirstName, ' ', e.LastName, ' ', d.DepartmentName, ' ', pr.Justification, ' ', pr.RequestID))) > 0");
        parameters.push(search);
      }
      if (status) { conditions.push('pr.Status = ?'); parameters.push(status); }
      const rows = await pool.query(`SELECT pr.RequestID AS requestId,
        CONCAT(e.FirstName, ' ', e.LastName) AS requester, d.DepartmentName AS departmentName,
        DATE_FORMAT(pr.RequestDate, '%Y-%m-%d') AS requestDate, COUNT(pri.ProductID) AS numberOfItems,
        COALESCE(SUM(pri.QuantityRequested * pri.EstimatedUnitPrice), 0) AS estimatedTotal, pr.Status AS status
        FROM Purchase_Request AS pr
        INNER JOIN Employee AS e ON pr.EmployeeID = e.EmployeeID
        INNER JOIN Department AS d ON e.DepartmentID = d.DepartmentID
        LEFT JOIN Purchase_Request_Item AS pri ON pri.RequestID = pr.RequestID
        ${where(conditions)}
        GROUP BY pr.RequestID, e.FirstName, e.LastName, d.DepartmentName, DATE_FORMAT(pr.RequestDate, '%Y-%m-%d'), pr.Status
        ORDER BY pr.RequestDate DESC, pr.RequestID DESC`, parameters);
      return rows.map(row => ({ ...row, numberOfItems: count(row.numberOfItems), estimatedTotal: money(row.estimatedTotal) }));
    },

    // Pending requests for the manager queue, oldest first.
    async listApprovalQueue() {
      const rows = await pool.query(`SELECT pr.RequestID AS requestId,
        CONCAT(e.FirstName, ' ', e.LastName) AS requester, d.DepartmentName AS departmentName,
        DATE_FORMAT(pr.RequestDate, '%Y-%m-%d') AS requestDate,
        COALESCE(SUM(pri.QuantityRequested * pri.EstimatedUnitPrice), 0) AS estimatedTotal
        FROM Purchase_Request AS pr
        INNER JOIN Employee AS e ON pr.EmployeeID = e.EmployeeID
        INNER JOIN Department AS d ON e.DepartmentID = d.DepartmentID
        LEFT JOIN Purchase_Request_Item AS pri ON pri.RequestID = pr.RequestID
        WHERE pr.Status = 'Pending'
        GROUP BY pr.RequestID, e.FirstName, e.LastName, d.DepartmentName, DATE_FORMAT(pr.RequestDate, '%Y-%m-%d')
        ORDER BY pr.RequestDate, pr.RequestID`);
      return rows.map(row => ({ ...row, estimatedTotal: money(row.estimatedTotal) }));
    },

    async getRequest(user, requestId) {
      const parameters = [requestId]; const conditions = ['pr.RequestID = ?'];
      visibility(user, conditions, parameters);
      const requests = await pool.query(`SELECT pr.RequestID AS requestId, pr.EmployeeID AS employeeId,
        CONCAT(e.FirstName, ' ', e.LastName) AS requester, d.DepartmentName AS departmentName,
        DATE_FORMAT(pr.RequestDate, '%Y-%m-%d') AS requestDate, pr.Status AS status, pr.Justification AS justification
        FROM Purchase_Request AS pr
        INNER JOIN Employee AS e ON pr.EmployeeID = e.EmployeeID
        INNER JOIN Department AS d ON e.DepartmentID = d.DepartmentID
        WHERE ${conditions.join(' AND ')}`, parameters);
      if (!requests.length) throw new ProcurementError(404, 'Purchase request not found.');
      const items = await pool.query(`SELECT pri.ProductID AS productId, p.ProductName AS productName,
        pri.QuantityRequested AS quantityRequested, pri.EstimatedUnitPrice AS estimatedUnitPrice,
        pri.QuantityRequested * pri.EstimatedUnitPrice AS lineTotal
        FROM Purchase_Request_Item AS pri INNER JOIN Product AS p ON p.ProductID = pri.ProductID
        WHERE pri.RequestID = ? ORDER BY p.ProductName`, [requestId]);
      const approvals = await pool.query(`SELECT a.ApprovalID AS approvalId,
        CONCAT(e.FirstName, ' ', e.LastName) AS decisionBy, DATE_FORMAT(a.ApprovalDate, '%Y-%m-%d') AS approvalDate,
        a.Status AS status, a.Comments AS comments
        FROM Approval AS a INNER JOIN Employee AS e ON e.EmployeeID = a.EmployeeID
        WHERE a.RequestID = ?`, [requestId]);
      return {
        request: requests[0],
        items: items.map(row => ({ ...row, quantityRequested: count(row.quantityRequested), estimatedUnitPrice: money(row.estimatedUnitPrice), lineTotal: money(row.lineTotal) })),
        approval: approvals[0] ?? null,
      };
    },

    // Inserts the pending header and every item together, or saves neither.
    async createRequest(employeeId, input) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const ids = input.items.map(item => item.productId);
        const found = await connection.query(`SELECT ProductID AS productId FROM Product WHERE ProductID IN (${ids.map(() => '?').join(',')})`, ids);
        if (found.length !== ids.length) throw new ProcurementError(400, 'Choose each item from the product catalog.');
        const header = await connection.query(`INSERT INTO Purchase_Request (EmployeeID, RequestDate, Status, Justification)
          VALUES (?, CURDATE(), 'Pending', ?)`, [employeeId, input.justification]);
        const requestId = count(header.insertId);
        for (const item of input.items) {
          await connection.query(`INSERT INTO Purchase_Request_Item (RequestID, ProductID, QuantityRequested, EstimatedUnitPrice)
            VALUES (?, ?, ?, ?)`, [requestId, item.productId, item.quantity, item.estimatedUnitPrice]);
        }
        await connection.commit();
        return { requestId };
      } catch (error) {
        await connection.rollback();
        throw mapDatabaseError(error, 'Each product can only appear once on a request.');
      } finally {
        connection.release();
      }
    },

    // The procedure writes Approval and Purchase_Request.Status in one database transaction.
    async decideRequest(managerId, requestId, input) {
      try {
        await pool.query('CALL sp_decide_purchase_request(?, ?, ?, CURDATE(), ?)', [requestId, managerId, input.decision, input.comments]);
        return { requestId, decision: input.decision };
      } catch (error) { throw mapDatabaseError(error); }
    },
  };
}
