import { Router, Request, Response } from 'express';
import { ConnectionVault } from '../vault/storage.js';
import { ConnectionManager } from '../services/connectionManager.js';
import { DriverFactory } from '../drivers/factory.js';
import { ConnectionConfig, PaginationOptions } from '../types.js';
import path from 'node:path';
import fs from 'node:fs';

export const apiRouter = Router();

// 1. List connections
apiRouter.get('/connections', (req: Request, res: Response) => {
  try {
    const list = ConnectionVault.listConnections(false);
    res.json({ success: true, data: list });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Save / Update connection
apiRouter.post('/connections', (req: Request, res: Response) => {
  try {
    const config: ConnectionConfig = req.body;
    if (!config.name || !config.type) {
      return res.status(400).json({ success: false, error: 'Name and database type are required' });
    }
    const saved = ConnectionVault.saveConnection(config);
    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Delete connection
apiRouter.delete('/connections/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await ConnectionManager.closeDriver(id);
    const deleted = ConnectionVault.deleteConnection(id);
    res.json({ success: deleted });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Test unsaved connection
apiRouter.post('/connections/test', async (req: Request, res: Response) => {
  let driver: any = null;
  try {
    const config: ConnectionConfig = req.body;
    driver = DriverFactory.createDriver(config);
    const result = await driver.testConnection();
    await driver.disconnect();
    res.json(result);
  } catch (err: any) {
    if (driver) await driver.disconnect().catch(() => {});
    res.json({ success: false, message: err.message || 'Connection failed' });
  }
});

// 5. Test saved connection
apiRouter.post('/connections/:id/test', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const config = ConnectionVault.getConnectionById(id, true);
    if (!config) return res.status(404).json({ success: false, error: 'Connection not found' });

    const driver = DriverFactory.createDriver(config);
    const result = await driver.testConnection();
    await driver.disconnect();
    res.json(result);
  } catch (err: any) {
    res.json({ success: false, message: err.message || 'Connection failed' });
  }
});

// 6. Get schemas & tables
apiRouter.get('/connections/:id/schemas', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const driver = await ConnectionManager.getDriver(id);
    const schemas = await driver.getSchemas();
    res.json({ success: true, data: schemas });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Get table structure
apiRouter.get('/connections/:id/tables/:table/structure', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const table = String(req.params.table);
    const schema = (req.query.schema as string) || undefined;
    const driver = await ConnectionManager.getDriver(id);
    const structure = await driver.getTableStructure(table, schema);
    res.json({ success: true, data: structure });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Get table data (paginated)
apiRouter.get('/connections/:id/tables/:table/data', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const table = String(req.params.table);
    const schema = (req.query.schema as string) || undefined;
    const page = parseInt(req.query.page as string, 10) || 1;
    const pageSize = parseInt(req.query.pageSize as string, 10) || 50;
    const sortBy = (req.query.sortBy as string) || undefined;
    const sortOrder = (req.query.sortOrder as 'ASC' | 'DESC') || undefined;
    const filterColumn = (req.query.filterColumn as string) || undefined;
    const filterOperator = (req.query.filterOperator as any) || undefined;
    const filterValue = (req.query.filterValue as string) || undefined;

    const options: PaginationOptions = {
      page,
      pageSize,
      sortBy,
      sortOrder,
      filterColumn,
      filterOperator,
      filterValue,
    };

    const driver = await ConnectionManager.getDriver(id);
    const data = await driver.getTableData(table, schema, options);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Execute raw query
apiRouter.post('/connections/:id/query', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { sql, maxRows, schema } = req.body;
    if (!sql || typeof sql !== 'string') {
      return res.status(400).json({ success: false, error: 'SQL query string required' });
    }

    const driver = await ConnectionManager.getDriver(id);
    const result = await driver.executeRawQuery(sql, maxRows || 2000, schema);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 10. Update cell (inline edit)
apiRouter.post('/connections/:id/tables/:table/cell', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const table = String(req.params.table);
    const { schema, primaryKey, column, value } = req.body;

    if (!primaryKey || !column) {
      return res.status(400).json({ success: false, error: 'primaryKey and column are required' });
    }

    const driver = await ConnectionManager.getDriver(id);
    const result = await driver.updateCell(table, schema || 'default', primaryKey, column, value);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 11. Insert row
apiRouter.post('/connections/:id/tables/:table/row', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const table = String(req.params.table);
    const { schema, data } = req.body;

    if (!data || Object.keys(data).length === 0) {
      return res.status(400).json({ success: false, error: 'Row data is required' });
    }

    const driver = await ConnectionManager.getDriver(id);
    const result = await driver.insertRow(table, schema || 'default', data);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 12. Delete row
apiRouter.delete('/connections/:id/tables/:table/row', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const table = String(req.params.table);
    const { schema, primaryKey } = req.body;

    if (!primaryKey || Object.keys(primaryKey).length === 0) {
      return res.status(400).json({ success: false, error: 'Primary key is required' });
    }

    const driver = await ConnectionManager.getDriver(id);
    const result = await driver.deleteRow(table, schema || 'default', primaryKey);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 13. Export table / query
apiRouter.get('/connections/:id/export', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const table = req.query.table as string;
    const schema = (req.query.schema as string) || undefined;
    const format = (req.query.format as 'csv' | 'json' | 'sql') || 'csv';
    const sqlQuery = req.query.sql as string;

    const driver = await ConnectionManager.getDriver(id);
    let rows: Record<string, any>[] = [];
    let columns: string[] = [];

    if (sqlQuery) {
      const qRes = await driver.executeRawQuery(sqlQuery, 50000);
      rows = qRes.rows;
      columns = qRes.columns.map((c) => c.name);
    } else if (table) {
      const qRes = await driver.getTableData(table, schema, { page: 1, pageSize: 50000 });
      rows = qRes.rows;
      columns = qRes.columns.map((c) => c.name);
    } else {
      return res.status(400).json({ success: false, error: 'Table or SQL query required for export' });
    }

    const filename = `export_${table || 'query'}_${Date.now()}`;

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
      return res.send(JSON.stringify(rows, null, 2));
    } else if (format === 'sql') {
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.sql"`);
      const targetTable = table || 'exported_table';
      let sqlOut = `-- WDMT SQL Export\n-- Table: ${targetTable}\n-- Date: ${new Date().toISOString()}\n\n`;
      if (rows.length > 0) {
        for (const row of rows) {
          const keys = Object.keys(row);
          const vals = keys.map((k) => {
            const v = row[k];
            if (v === null || v === undefined) return 'NULL';
            if (typeof v === 'number') return v;
            return `'${String(v).replace(/'/g, "''")}'`;
          });
          sqlOut += `INSERT INTO ${targetTable} (${keys.join(', ')}) VALUES (${vals.join(', ')});\n`;
        }
      }
      return res.send(sqlOut);
    } else {
      // CSV
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      let csv = columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(',') + '\n';
      for (const row of rows) {
        const line = columns
          .map((c) => {
            const v = row[c];
            if (v === null || v === undefined) return '';
            return `"${String(v).replace(/"/g, '""')}"`;
          })
          .join(',');
        csv += line + '\n';
      }
      return res.send(csv);
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 14. Helper to create demo SQLite database
apiRouter.post('/sample-db', async (req: Request, res: Response) => {
  try {
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    const sampleDbPath = path.join(dataDir, 'sample_ecommerce.sqlite');

    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(sampleDbPath);

    db.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        description TEXT
      );

      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER REFERENCES categories(id),
        name TEXT NOT NULL,
        sku TEXT NOT NULL UNIQUE,
        price REAL NOT NULL,
        stock_quantity INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        country TEXT DEFAULT 'Thailand',
        balance REAL DEFAULT 0.0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER REFERENCES customers(id),
        order_number TEXT NOT NULL UNIQUE,
        total_amount REAL NOT NULL,
        status TEXT DEFAULT 'completed',
        ordered_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER REFERENCES orders(id),
        product_id INTEGER REFERENCES products(id),
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL
      );
    `);

    const count = (db.prepare('SELECT COUNT(*) as c FROM categories').get() as any)?.c;
    if (count === 0) {
      db.exec(`
        INSERT INTO categories (name, slug, description) VALUES
          ('Electronics', 'electronics', 'Gadgets, phones, and computers'),
          ('Clothing', 'clothing', 'Men and Women apparel'),
          ('Home and Kitchen', 'home-kitchen', 'Appliances and cookware'),
          ('Books', 'books', 'Programming and Sci-Fi novels');

        INSERT INTO products (category_id, name, sku, price, stock_quantity, status) VALUES
          (1, 'MacBook Pro 16" M3 Max', 'TECH-MBP-16', 3499.00, 45, 'active'),
          (1, 'Sony WH-1000XM5 Headphones', 'TECH-SONY-XM5', 399.99, 120, 'active'),
          (1, 'Dell UltraSharp 27" 4K Monitor', 'TECH-DELL-27', 629.50, 60, 'active'),
          (2, 'Classic Cotton T-Shirt Black', 'APP-TSHIRT-BLK', 29.90, 350, 'active'),
          (2, 'Denim Slim Fit Jeans', 'APP-JEANS-BLU', 79.00, 180, 'active'),
          (3, 'Espresso Coffee Machine Deluxe', 'HOME-ESP-01', 599.00, 25, 'active'),
          (3, 'Air Fryer XL 5.5L', 'HOME-AIRFRY', 129.99, 85, 'active'),
          (4, 'Designing Data-Intensive Applications', 'BOOK-DDIA-01', 45.00, 200, 'active'),
          (4, 'Clean Code: A Handbook of Agile Craftsmanship', 'BOOK-CLEAN-01', 42.50, 150, 'active');

        INSERT INTO customers (first_name, last_name, email, country, balance) VALUES
          ('Somchai', 'Prasert', 'somchai.p@example.com', 'Thailand', 1500.00),
          ('Somsak', 'Jaidee', 'somsak.j@example.com', 'Thailand', 450.50),
          ('Ananya', 'Sukhumvit', 'ananya.s@example.com', 'Thailand', 3200.00),
          ('John', 'Doe', 'john.doe@example.com', 'USA', 980.00),
          ('Jane', 'Smith', 'jane.smith@example.com', 'UK', 210.00),
          ('Kenji', 'Sato', 'kenji.sato@example.com', 'Japan', 4500.00);

        INSERT INTO orders (customer_id, order_number, total_amount, status) VALUES
          (1, 'ORD-2026-001', 3898.99, 'completed'),
          (2, 'ORD-2026-002', 129.99, 'completed'),
          (3, 'ORD-2026-003', 629.50, 'processing'),
          (4, 'ORD-2026-004', 87.50, 'shipped'),
          (5, 'ORD-2026-005', 599.00, 'completed');

        INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
          (1, 1, 1, 3499.00),
          (1, 2, 1, 399.99),
          (2, 7, 1, 129.99),
          (3, 3, 1, 629.50),
          (4, 8, 1, 45.00),
          (4, 9, 1, 42.50),
          (5, 6, 1, 599.00);
      `);
    }

    db.close();

    const existing = ConnectionVault.listConnections(true).find(
      (c) => c.name === 'Sample E-Commerce (SQLite)' || c.id === 'sample-ecommerce-sqlite'
    );

    let profile: ConnectionConfig;
    if (existing) {
      profile = existing;
    } else {
      profile = ConnectionVault.saveConnection({
        id: 'sample-ecommerce-sqlite',
        name: 'Sample E-Commerce (SQLite)',
        type: 'sqlite',
        filePath: 'data/sample_ecommerce.sqlite',
        color: '#10b981',
        createdAt: '',
        updatedAt: '',
      });
    }

    res.json({ success: true, data: profile });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});


