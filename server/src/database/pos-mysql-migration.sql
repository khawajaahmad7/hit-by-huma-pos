-- =============================================
-- HIT BY HUMA POS - MySQL migration for the live cPanel DB
-- Adds ONLY the POS-specific tables missing from the storefront schema.
-- The storefront (C:\HIT-store Drizzle schema) already owns:
--   categories, products, product_variants, inventory, customers, sales,
--   sale_items, sale_payments, payment_methods, locations, settings,
--   cart_items, online_orders_meta, sku_colors, sku_sizes
-- Import via cPanel phpMyAdmin (select DB first, then Import).
-- Safe to re-run (CREATE TABLE IF NOT EXISTS / INSERT IGNORE).
-- =============================================

SET FOREIGN_KEY_CHECKS = 0;

-- =============================================
-- AUTH / STAFF (POS-only)
-- =============================================

CREATE TABLE IF NOT EXISTS roles (
  role_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role_name VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(200),
  permissions TEXT, -- JSON array
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  user_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_code VARCHAR(20) NOT NULL UNIQUE,
  email VARCHAR(100) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100),
  phone VARCHAR(20),
  role_id INT UNSIGNED,
  default_location_id INT UNSIGNED,
  pin_hash VARCHAR(10),
  hourly_rate DECIMAL(10,2) DEFAULT 0,
  commission_rate DECIMAL(5,2) DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  last_login DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT FK_Users_Role FOREIGN KEY (role_id) REFERENCES roles(role_id),
  CONSTRAINT FK_Users_Location FOREIGN KEY (default_location_id) REFERENCES locations(location_id),
  INDEX IX_Users_Role (role_id),
  INDEX IX_Users_Location (default_location_id)
) ENGINE=InnoDB;

-- Shift management (POS-only)
CREATE TABLE IF NOT EXISTS shifts (
  shift_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  location_id INT UNSIGNED NOT NULL,
  terminal_id VARCHAR(20),
  opening_cash DECIMAL(18,2) DEFAULT 0,
  closing_cash DECIMAL(18,2),
  expected_cash DECIMAL(18,2),
  cash_difference DECIMAL(18,2),
  status VARCHAR(20) DEFAULT 'active', -- active, closed, reconciled
  start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  end_time DATETIME NULL,
  notes VARCHAR(500),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT FK_Shifts_User FOREIGN KEY (user_id) REFERENCES users(user_id),
  CONSTRAINT FK_Shifts_Location FOREIGN KEY (location_id) REFERENCES locations(location_id),
  INDEX IX_Shifts_User (user_id),
  INDEX IX_Shifts_Location (location_id),
  INDEX IX_Shifts_Status (status)
) ENGINE=InnoDB;

-- Parked / suspended carts (POS-only)
CREATE TABLE IF NOT EXISTS parked_sales (
  parked_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  location_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED,
  customer_id INT UNSIGNED,
  cart_data JSON NOT NULL,
  notes VARCHAR(200),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT FK_Parked_Location FOREIGN KEY (location_id) REFERENCES locations(location_id),
  CONSTRAINT FK_Parked_User FOREIGN KEY (user_id) REFERENCES users(user_id),
  CONSTRAINT FK_Parked_Customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
) ENGINE=InnoDB;

-- Inventory audit trail (POS-only)
CREATE TABLE IF NOT EXISTS inventory_transactions (
  transaction_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  variant_id INT UNSIGNED NOT NULL,
  location_id INT UNSIGNED NOT NULL,
  transaction_type VARCHAR(20) NOT NULL, -- SALE, RECEIVE, ADJUSTMENT, TRANSFER_IN, TRANSFER_OUT, RETURN
  quantity_change INT NOT NULL,
  quantity_before INT NOT NULL,
  quantity_after INT NOT NULL,
  reference_type VARCHAR(50),
  reference_id INT UNSIGNED,
  notes VARCHAR(500),
  user_id INT UNSIGNED,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT FK_InvTrans_Variant FOREIGN KEY (variant_id) REFERENCES product_variants(variant_id),
  CONSTRAINT FK_InvTrans_Location FOREIGN KEY (location_id) REFERENCES locations(location_id),
  CONSTRAINT FK_InvTrans_User FOREIGN KEY (user_id) REFERENCES users(user_id),
  INDEX IX_InvTrans_Variant (variant_id),
  INDEX IX_InvTrans_Location (location_id),
  INDEX IX_InvTrans_Date (created_at)
) ENGINE=InnoDB;

-- =============================================
-- PRODUCT ATTRIBUTES (variant matrix, POS-only)
-- =============================================

CREATE TABLE IF NOT EXISTS attributes (
  attribute_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  attribute_name VARCHAR(50) NOT NULL UNIQUE,
  attribute_type VARCHAR(20) DEFAULT 'select',
  sort_order INT DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attribute_values (
  attribute_value_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  attribute_id INT UNSIGNED NOT NULL,
  value VARCHAR(100) NOT NULL,
  color_hex VARCHAR(7),
  sort_order INT DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT UQ_Attribute_Value UNIQUE (attribute_id, value),
  CONSTRAINT FK_AttributeValues_Attribute FOREIGN KEY (attribute_id) REFERENCES attributes(attribute_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS variant_attributes (
  variant_attribute_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  variant_id INT UNSIGNED NOT NULL,
  attribute_id INT UNSIGNED NOT NULL,
  attribute_value_id INT UNSIGNED NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT UQ_Variant_Attribute UNIQUE (variant_id, attribute_id),
  CONSTRAINT FK_VariantAttributes_Variant FOREIGN KEY (variant_id) REFERENCES product_variants(variant_id) ON DELETE CASCADE,
  CONSTRAINT FK_VariantAttributes_Attribute FOREIGN KEY (attribute_id) REFERENCES attributes(attribute_id),
  CONSTRAINT FK_VariantAttributes_Value FOREIGN KEY (attribute_value_id) REFERENCES attribute_values(attribute_value_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_attributes (
  product_attribute_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id INT UNSIGNED NOT NULL,
  attribute_id INT UNSIGNED NOT NULL,
  is_required TINYINT(1) DEFAULT 1,
  sort_order INT DEFAULT 0,
  CONSTRAINT UQ_Product_Attribute UNIQUE (product_id, attribute_id),
  CONSTRAINT FK_ProductAttributes_Product FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE,
  CONSTRAINT FK_ProductAttributes_Attribute FOREIGN KEY (attribute_id) REFERENCES attributes(attribute_id)
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================
-- SEED DATA (INSERT IGNORE = safe on re-run / existing rows)
-- =============================================

INSERT IGNORE INTO roles (role_name, description, permissions) VALUES
('admin', 'Full system access', '["*"]'),
('manager', 'Store manager with override capabilities', '["pos.*","inventory.*","reports.*","customers.*","products.*","settings.*","returns.approve","discounts.override","void"]'),
('cashier', 'POS terminal operations', '["pos.sale","pos.park","pos.retrieve","customers.view","customers.create","products.view"]'),
('salesman', 'POS sales with auto shift', '["pos.sale","customers.view","customers.create"]'),
('inventory', 'Inventory management', '["inventory.*","products.view"]');

-- Default admin: employee code ADMIN001, password "password123" (change after first login!)
INSERT IGNORE INTO users (employee_code, email, password_hash, first_name, last_name, role_id, default_location_id, is_active)
VALUES ('ADMIN001', 'admin@hitbyhuma.com', '$2b$10$7ydAgP8Gk9tIhMu2HyqDMOGZnod.aQtwsJNvLT5pkLUP7eJly579m', 'Admin', 'User', 1, 1, 1);

-- POS settings keys the POS server reads (settings table is shared with the storefront)
INSERT IGNORE INTO settings (setting_key, setting_value, setting_type, description, is_public) VALUES
('company_name', 'HIT BY HUMA', 'string', 'Company name for receipts', 0),
('currency_symbol', 'PKR', 'string', 'Currency symbol', 0),
('currency_code', 'PKR', 'string', 'ISO currency code', 0),
('tax_rate', '0', 'number', 'Default tax rate percentage', 0),
('max_discount_without_approval', '10', 'number', 'Maximum discount % without manager approval', 0),
('low_stock_threshold', '10', 'number', 'Low stock alert threshold', 0),
('cash_variance_threshold', '500', 'number', 'Maximum acceptable cash variance', 0),
('receipt_footer', 'Thank you for shopping at HIT BY HUMA! Exchange within 7 days with receipt.', 'string', 'Receipt footer text', 0),
('loyalty_points_per_100', '1', 'number', 'Loyalty points earned per 100 PKR', 0);

INSERT IGNORE INTO attributes (attribute_name, attribute_type, sort_order) VALUES
('Size', 'select', 1),
('Color', 'color', 2);

INSERT IGNORE INTO attribute_values (attribute_id, value, sort_order) VALUES
(1, 'XS', 1), (1, 'S', 2), (1, 'M', 3), (1, 'L', 4), (1, 'XL', 5), (1, 'XXL', 6), (1, 'Free Size', 7);

INSERT IGNORE INTO attribute_values (attribute_id, value, color_hex, sort_order) VALUES
(2, 'Black', '#000000', 1),
(2, 'White', '#FFFFFF', 2),
(2, 'Red', '#FF0000', 3),
(2, 'Blue', '#0000FF', 4),
(2, 'Green', '#00FF00', 5),
(2, 'Navy', '#000080', 6),
(2, 'Maroon', '#800000', 7),
(2, 'Beige', '#F5F5DC', 8),
(2, 'Pink', '#FFC0CB', 9),
(2, 'Purple', '#800080', 10);

SELECT 'POS MySQL migration completed successfully!' AS Status;
