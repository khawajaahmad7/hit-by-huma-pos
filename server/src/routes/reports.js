const express = require('express');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Get dashboard data
router.get('/dashboard', async (req, res, next) => {
  try {
    const { locationId, range, startDate, endDate } = req.query;
    const pool = db.getPool();

    const params = [];
    let locationFilter = '';
    let paramIndex = 1;

    if (locationId) {
      locationFilter = ` AND s.location_id = $${paramIndex++}`;
      params.push(parseInt(locationId));
    }

    // Build time filter based on range or explicit start/end dates
    // timeFilter contains SQL fragment starting with ' AND '
    // Default to this week's data when no explicit range is provided
    let timeFilter = ` AND s.created_at >= CURDATE() - INTERVAL WEEKDAY(CURDATE()) DAY`;
    if (startDate) {
      timeFilter = ` AND s.created_at >= $${paramIndex++}`;
      params.push(startDate);
      if (endDate) {
        timeFilter += ` AND s.created_at <= $${paramIndex++}`;
        params.push(endDate);
      }
    } else if (range === 'week') {
      timeFilter = ` AND s.created_at >= CURDATE() - INTERVAL WEEKDAY(CURDATE()) DAY`;
    } else if (range === 'today') {
      timeFilter = ` AND DATE(s.created_at) = CURRENT_DATE`;
    } else if (range === 'month') {
      timeFilter = ` AND s.created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`;
    } else if (range === 'year') {
      timeFilter = ` AND s.created_at >= DATE_FORMAT(CURDATE(), '%Y-01-01')`;
    }

    // Today's/selected range stats (include discounts)
    const todayResult = await pool.query(
      `SELECT 
        COUNT(*) as transactions,
        COALESCE(SUM(total_amount), 0) as revenue,
        COALESCE(AVG(total_amount), 0) as avg_transaction,
        COALESCE(SUM(discount_amount), 0) as discounts
       FROM sales s
       WHERE s.status = 'completed' ${timeFilter} ${locationFilter}`,
      params
    );

    // Items sold today
    const itemsResult = await pool.query(
      `SELECT COALESCE(SUM(si.quantity), 0) as items_sold
       FROM sale_items si
       INNER JOIN sales s ON si.sale_id = s.sale_id
       WHERE s.status = 'completed' ${timeFilter} ${locationFilter}`,
      params
    );

    // Low stock alerts
    const lowStockParams = locationId ? [parseInt(locationId)] : [];
    const lowStockResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM inventory i
       WHERE i.quantity_on_hand <= i.reorder_level ${locationId ? ' AND i.location_id = $1' : ''}`,
      lowStockParams
    );

    // Top products today
    const topProductsResult = await pool.query(
      `SELECT p.product_name, pv.variant_name, SUM(si.quantity) as sold, SUM(si.line_total) as revenue
       FROM sale_items si
       INNER JOIN sales s ON si.sale_id = s.sale_id
       INNER JOIN product_variants pv ON si.variant_id = pv.variant_id
       INNER JOIN products p ON pv.product_id = p.product_id
       WHERE s.status = 'completed' ${timeFilter} ${locationFilter}
       GROUP BY p.product_name, pv.variant_name
       ORDER BY sold DESC
       LIMIT 5`,
      params
    );

    // Hourly sales
    const hourlyResult = await pool.query(
      `SELECT EXTRACT(HOUR FROM s.created_at) as hour, COALESCE(SUM(s.total_amount), 0) as revenue
       FROM sales s
       WHERE s.status = 'completed' ${timeFilter} ${locationFilter}
       GROUP BY EXTRACT(HOUR FROM s.created_at)
       ORDER BY hour`,
      params
    );

    // Payment breakdown for today
    const paymentsResult = await pool.query(
      `SELECT pm.method_name, pm.method_type, COALESCE(SUM(sp.amount), 0) as total
       FROM sale_payments sp
       INNER JOIN sales s ON sp.sale_id = s.sale_id
       INNER JOIN payment_methods pm ON sp.payment_method_id = pm.payment_method_id
       WHERE s.status = 'completed' ${timeFilter} ${locationFilter}
       GROUP BY pm.method_name, pm.method_type`,
      params
    );

    const today = todayResult.rows[0] || { transactions: 0, revenue: 0, avg_transaction: 0, discounts: 0 };
    const itemsSold = itemsResult.rows[0]?.items_sold || 0;

    // Normalize payment breakdown and compute cash/card totals
    const paymentBreakdown = paymentsResult.rows.map(p => ({
      method_name: p.method_name,
      method_type: (p.method_type || '').toString(),
      total: parseFloat(p.total) || 0
    }));

    const cashSales = paymentBreakdown
      .filter(p => p.method_type && p.method_type.toLowerCase() === 'cash')
      .reduce((s, p) => s + p.total, 0);
    const cardSales = paymentBreakdown
      .filter(p => p.method_type && p.method_type.toLowerCase().includes('card'))
      .reduce((s, p) => s + p.total, 0);

    // Normalize top products for frontend
    const topProducts = topProductsResult.rows.map(p => ({
      name: p.product_name,
      variant: p.variant_name,
      quantity: parseInt(p.sold) || 0,
      revenue: parseFloat(p.revenue) || 0
    }));

    // Build flattened summary fields expected by frontend
    const summary = {
      totalRevenue: parseFloat(today.revenue) || 0,
      totalOrders: parseInt(today.transactions) || 0,
      avgOrderValue: parseFloat(today.avg_transaction) || 0,
      itemsSold: parseInt(itemsSold) || 0,
      totalDiscounts: parseFloat(today.discounts) || 0,
      cashSales,
      cardSales
    };

    res.json({
      // original nested response for backward-compatibility
      today: {
        transactions: parseInt(today.transactions) || 0,
        revenue: parseFloat(today.revenue) || 0,
        avg_transaction: parseFloat(today.avg_transaction) || 0,
        itemsSold: parseInt(itemsSold) || 0,
        discounts: parseFloat(today.discounts) || 0
      },
      lowStockCount: parseInt(lowStockResult.rows[0]?.count) || 0,
      topProducts: topProducts,
      hourlySales: hourlyResult.rows.map(h => ({
        hour: parseInt(h.hour),
        revenue: parseFloat(h.revenue) || 0
      })),
      paymentBreakdown: paymentBreakdown,
      // flattened summary (convenience for frontend)
      ...summary
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    next(error);
  }
});

// Hourly sales (compatibility endpoint expected by frontend)
router.get('/hourly-sales', async (req, res, next) => {
  try {
    const { range } = req.query; // currently only supporting 'today'
    const pool = db.getPool();
    const params = [];
    const result = await pool.query(
      `SELECT EXTRACT(HOUR FROM s.created_at) as hour, COALESCE(SUM(total_amount), 0) as revenue, COUNT(*) as transactions
       FROM sales s
       WHERE DATE(s.created_at) = CURRENT_DATE AND s.status = 'completed'
       GROUP BY EXTRACT(HOUR FROM s.created_at)
       ORDER BY hour`
    );
    res.json({ data: result.rows.map(h => ({ hour: parseInt(h.hour), sales: parseFloat(h.revenue) || 0, orders: parseInt(h.transactions) || 0 })) });
  } catch (error) {
    next(error);
  }
});

// Category breakdown (compatibility endpoint expected by frontend)
router.get('/category-breakdown', async (req, res, next) => {
  try {
    const pool = db.getPool();
    const result = await pool.query(
      `SELECT c.category_name as name, COALESCE(SUM(si.line_total),0) as revenue, COALESCE(SUM(si.quantity),0) as units
       FROM sale_items si
       INNER JOIN sales s ON si.sale_id = s.sale_id
       INNER JOIN product_variants pv ON si.variant_id = pv.variant_id
       INNER JOIN products p ON pv.product_id = p.product_id
       LEFT JOIN categories c ON p.category_id = c.category_id
       WHERE DATE(s.created_at) = CURRENT_DATE AND s.status = 'completed'
       GROUP BY c.category_name
       ORDER BY revenue DESC`);
    res.json({ data: result.rows.map(r => ({ name: r.name, revenue: parseFloat(r.revenue) || 0, units: parseInt(r.units) || 0 })) });
  } catch (error) {
    next(error);
  }
});

// Realtime quick metrics used by dashboard
router.get('/realtime', async (req, res, next) => {
  try {
    const pool = db.getPool();
    // Sales in last 60 seconds
    const result = await pool.query(
      `SELECT COUNT(*) as transactions, COALESCE(SUM(total_amount),0) as revenue
       FROM sales
       WHERE created_at >= NOW() - INTERVAL 1 MINUTE AND status = 'completed'`);
    res.json({ transactions: parseInt(result.rows[0].transactions) || 0, revenue: parseFloat(result.rows[0].revenue) || 0 });
  } catch (error) {
    next(error);
  }
});

// Employee performance (compatibility endpoint)
router.get('/employee-performance', async (req, res, next) => {
  try {
    const { limit = 5 } = req.query;
    const pool = db.getPool();
    const result = await pool.query(
      `SELECT u.user_id, u.first_name, u.last_name, COUNT(*) as transactions, COALESCE(SUM(s.total_amount),0) as revenue
       FROM sales s
       INNER JOIN users u ON s.user_id = u.user_id
       WHERE DATE(s.created_at) = CURRENT_DATE AND s.status = 'completed'
       GROUP BY u.user_id, u.first_name, u.last_name
       ORDER BY revenue DESC
       LIMIT $1`, [parseInt(limit)]
    );
    res.json({ data: result.rows.map(r => ({ user_id: r.user_id, name: `${r.first_name} ${r.last_name}`, transactions: parseInt(r.transactions) || 0, revenue: parseFloat(r.revenue) || 0 })) });
  } catch (error) {
    next(error);
  }
});

// Get sales report
router.get('/sales', authorize('reports'), async (req, res, next) => {
  try {
    const { locationId, startDate, endDate, groupBy = 'day' } = req.query;
    const pool = db.getPool();

    const params = [];
    let whereClause = "WHERE status = 'completed'";
    let paramIndex = 1;

    if (locationId) {
      whereClause += ` AND location_id = $${paramIndex++}`;
      params.push(parseInt(locationId));
    }

    if (startDate) {
      whereClause += ` AND created_at >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ` AND created_at <= $${paramIndex++}`;
      params.push(endDate);
    }

    let groupByClause = 'DATE(s.created_at)';
    let selectDate = 'DATE(s.created_at) as date';

    if (groupBy === 'month') {
      groupByClause = "DATE_FORMAT(s.created_at, '%Y-%m')";
      selectDate = "DATE_FORMAT(s.created_at, '%Y-%m') as date";
    } else if (groupBy === 'week') {
      groupByClause = "DATE_FORMAT(DATE_SUB(s.created_at, INTERVAL WEEKDAY(s.created_at) DAY), '%Y-%m-%d')";
      selectDate = "DATE_FORMAT(DATE_SUB(s.created_at, INTERVAL WEEKDAY(s.created_at) DAY), '%Y-%m-%d') as date";
    }

    const result = await pool.query(
      `SELECT ${selectDate},
        COUNT(*) as transactions,
        COALESCE(SUM(total_amount), 0) as revenue,
        COALESCE(SUM(discount_amount), 0) as discounts,
        COALESCE(AVG(total_amount), 0) as avg_transaction
       FROM sales
       ${whereClause}
       GROUP BY ${groupByClause}
       ORDER BY date DESC`,
      params
    );

    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

// Get sales by category
router.get('/sales-by-category', authorize('reports'), async (req, res, next) => {
  try {
    const { locationId, startDate, endDate } = req.query;
    const pool = db.getPool();

    const params = [];
    let whereClause = "WHERE s.status = 'completed'";
    let paramIndex = 1;

    if (locationId) {
      whereClause += ` AND s.location_id = $${paramIndex++}`;
      params.push(parseInt(locationId));
    }

    if (startDate) {
      whereClause += ` AND s.created_at >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ` AND s.created_at <= $${paramIndex++}`;
      params.push(endDate);
    }

    const result = await pool.query(
      `SELECT c.category_name, 
        COUNT(DISTINCT s.sale_id) as transactions,
        SUM(si.quantity) as units_sold,
        COALESCE(SUM(si.line_total), 0) as revenue
       FROM sale_items si
       INNER JOIN sales s ON si.sale_id = s.sale_id
       INNER JOIN product_variants pv ON si.variant_id = pv.variant_id
       INNER JOIN products p ON pv.product_id = p.product_id
       LEFT JOIN categories c ON p.category_id = c.category_id
       ${whereClause}
       GROUP BY c.category_name
       ORDER BY revenue DESC`,
      params
    );

    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

// Get sales by employee
router.get('/sales-by-employee', authorize('reports'), async (req, res, next) => {
  try {
    const { locationId, startDate, endDate } = req.query;
    const pool = db.getPool();

    const params = [];
    let whereClause = "WHERE s.status = 'completed'";
    let paramIndex = 1;

    if (locationId) {
      whereClause += ` AND s.location_id = $${paramIndex++}`;
      params.push(parseInt(locationId));
    }

    if (startDate) {
      whereClause += ` AND s.created_at >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ` AND s.created_at <= $${paramIndex++}`;
      params.push(endDate);
    }

    const result = await pool.query(
      `SELECT u.first_name, u.last_name,
        COUNT(*) as transactions,
        COALESCE(SUM(s.total_amount), 0) as revenue,
        COALESCE(AVG(s.total_amount), 0) as avg_transaction
       FROM sales s
       INNER JOIN users u ON s.user_id = u.user_id
       ${whereClause}
       GROUP BY u.user_id, u.first_name, u.last_name
       ORDER BY revenue DESC`,
      params
    );

    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

// Generate Z-Report
router.post('/z-report', authorize('reports'), async (req, res, next) => {
  try {
    const { locationId, shiftId } = req.body;
    const pool = db.getPool();

    const params = [parseInt(locationId)];
    let shiftFilter = '';
    let paramIndex = 2;

    if (shiftId) {
      shiftFilter = ` AND shift_id = $${paramIndex++}`;
      params.push(parseInt(shiftId));
    }

    // Get sales summary
    const salesResult = await pool.query(
      `SELECT 
        COUNT(*) as transaction_count,
        COALESCE(SUM(total_amount), 0) as gross_sales,
        COALESCE(SUM(discount_amount), 0) as total_discounts,
        COALESCE(SUM(tax_amount), 0) as total_tax
       FROM sales
       WHERE location_id = $1 AND DATE(created_at) = CURRENT_DATE AND status = 'completed' ${shiftFilter}`,
      params
    );

    // Get payment breakdown
    const paymentsResult = await pool.query(
      `SELECT pm.method_name, COALESCE(SUM(sp.amount), 0) as total
       FROM sale_payments sp
       INNER JOIN sales s ON sp.sale_id = s.sale_id
       INNER JOIN payment_methods pm ON sp.payment_method_id = pm.payment_method_id
       WHERE s.location_id = $1 AND DATE(s.created_at) = CURRENT_DATE AND s.status = 'completed' ${shiftFilter}
       GROUP BY pm.method_name`,
      params
    );

    res.json({
      date: new Date().toISOString(),
      summary: salesResult.rows[0],
      payments: paymentsResult.rows
    });
  } catch (error) {
    next(error);
  }
});

// Get Z-Reports history
router.get('/z-reports', authorize('reports'), async (req, res, next) => {
  try {
    // For now, return generated data since we don't have a z_reports table
    res.json({ reports: [] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
