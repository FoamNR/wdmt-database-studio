import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import {
  ColumnMeta,
  ConnectionConfig,
  PaginationOptions,
  QueryResult,
  QueryResultSet,
  SchemaMeta,
  TableMeta,
  TableStructure,
} from '../types.js';
import { IDatabaseDriver } from './interface.js';
import { splitSqlStatements, extractTableNameFromSql } from '../utils/sql.js';

export class SQLiteDriver implements IDatabaseDriver {
  private config: ConnectionConfig;
  private db: DatabaseSync | null = null;

  constructor(config: ConnectionConfig) {
    this.config = config;
  }

  public async connect(): Promise<void> {
    if (this.db) return;

    const path = this.config.filePath || ':memory:';
    if (path !== ':memory:' && !fs.existsSync(path)) {
      const dir = path.substring(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')));
      if (dir && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  public async testConnection(): Promise<{ success: boolean; message: string; version?: string }> {
    try {
      await this.connect();
      const stmt = this.db!.prepare('SELECT sqlite_version() as version;');
      const row = stmt.get() as any;
      return {
        success: true,
        message: 'Connected successfully',
        version: `SQLite ${row?.version || ''}`,
      };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to open SQLite database' };
    }
  }

  public async getSchemas(): Promise<SchemaMeta[]> {
    await this.connect();
    const tables = await this.getTables('main');
    return [
      {
        name: 'main',
        tables,
      },
    ];
  }

  public async getTables(schema: string = 'main'): Promise<TableMeta[]> {
    await this.connect();
    const stmt = this.db!.prepare(`
      SELECT name, type 
      FROM sqlite_schema 
      WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
      ORDER BY name;
    `);
    const rows = stmt.all() as any[];

    return rows.map((r) => ({
      name: r.name,
      schema: 'main',
      type: r.type === 'view' ? 'view' : 'table',
    }));
  }

  public async getTableStructure(table: string, schema: string = 'main'): Promise<TableStructure> {
    await this.connect();

    // 1. Column info
    const pragmaStmt = this.db!.prepare(`PRAGMA table_info("${table.replace(/"/g, '""')}");`);
    const colRows = pragmaStmt.all() as any[];

    const columns: ColumnMeta[] = colRows.map((r) => ({
      name: r.name,
      type: r.type || 'TEXT',
      nullable: r.notnull === 0,
      isPrimaryKey: r.pk > 0,
      isAutoIncrement: r.pk > 0 && (r.type || '').toUpperCase() === 'INTEGER',
      defaultValue: r.dflt_value,
    }));

    const primaryKeys = columns.filter((c) => c.isPrimaryKey).map((c) => c.name);

    // 2. Foreign keys
    const fkStmt = this.db!.prepare(`PRAGMA foreign_key_list("${table.replace(/"/g, '""')}");`);
    const fkRows = fkStmt.all() as any[];
    const foreignKeys = fkRows.map((r) => ({
      column: r.from,
      referencedTable: r.table,
      referencedColumn: r.to,
      referencedSchema: 'main',
    }));

    // 3. Indexes
    const idxStmt = this.db!.prepare(`PRAGMA index_list("${table.replace(/"/g, '""')}");`);
    const idxRows = idxStmt.all() as any[];
    const indexes: any[] = [];

    for (const idx of idxRows) {
      const idxInfoStmt = this.db!.prepare(`PRAGMA index_info("${idx.name.replace(/"/g, '""')}");`);
      const idxCols = (idxInfoStmt.all() as any[]).map((c) => c.name);
      indexes.push({
        name: idx.name,
        columns: idxCols,
        isUnique: idx.unique === 1,
        isPrimary: idx.origin === 'pk',
      });
    }

    const ddl = await this.getTableDDL(table, schema);

    return {
      columns,
      primaryKeys,
      foreignKeys,
      indexes,
      ddl,
    };
  }

  public async getTableData(
    table: string,
    schema: string = 'main',
    options?: PaginationOptions
  ): Promise<QueryResult> {
    await this.connect();
    const startTime = Date.now();

    const page = options?.page || 1;
    const pageSize = options?.pageSize || 50;
    const offset = (page - 1) * pageSize;

    let whereClause = '';
    const queryParams: any[] = [];

    if (options?.filterColumn && options?.filterOperator) {
      const colName = `"${options.filterColumn.replace(/"/g, '""')}"`;
      if (options.filterOperator === 'null') {
        whereClause = `WHERE ${colName} IS NULL`;
      } else if (options.filterOperator === 'notNull') {
        whereClause = `WHERE ${colName} IS NOT NULL`;
      } else if (options.filterOperator === 'contains') {
        queryParams.push(`%${options.filterValue}%`);
        whereClause = `WHERE ${colName} LIKE ?`;
      } else if (options.filterOperator === 'gt') {
        queryParams.push(options.filterValue);
        whereClause = `WHERE ${colName} > ?`;
      } else if (options.filterOperator === 'lt') {
        queryParams.push(options.filterValue);
        whereClause = `WHERE ${colName} < ?`;
      } else {
        queryParams.push(options.filterValue);
        whereClause = `WHERE ${colName} = ?`;
      }
    }

    let orderClause = '';
    if (options?.sortBy) {
      const dir = options.sortOrder === 'DESC' ? 'DESC' : 'ASC';
      orderClause = `ORDER BY "${options.sortBy.replace(/"/g, '""')}" ${dir}`;
    }

    const countSql = `SELECT COUNT(*) AS count FROM "${table.replace(/"/g, '""')}" ${whereClause};`;
    const countStmt = this.db!.prepare(countSql);
    const countRow = countStmt.get(...queryParams) as any;
    const totalCount = countRow?.count || 0;

    const dataSql = `
      SELECT * FROM "${table.replace(/"/g, '""')}"
      ${whereClause}
      ${orderClause}
      LIMIT ? OFFSET ?;
    `;

    const dataStmt = this.db!.prepare(dataSql);
    const rows = dataStmt.all(...queryParams, pageSize, offset) as Record<string, any>[];
    const executionTimeMs = Date.now() - startTime;

    const columns: ColumnMeta[] = [];
    if (rows.length > 0) {
      Object.keys(rows[0]).forEach((k) => {
        columns.push({
          name: k,
          type: typeof rows[0][k],
          nullable: true,
          isPrimaryKey: false,
        });
      });
    }

    return {
      columns,
      rows,
      rowCount: rows.length,
      totalCount,
      executionTimeMs,
    };
  }

  public async executeRawQuery(sql: string, maxRows: number = 2000, _schema?: string): Promise<QueryResult> {
    await this.connect();
    const overallStartTime = Date.now();

    try {
      const statements = splitSqlStatements(sql);
      if (statements.length === 0) {
        return {
          columns: [],
          rows: [],
          rowCount: 0,
          executionTimeMs: 0,
          results: [],
        };
      }

      const resultSets: QueryResultSet[] = [];

      for (let i = 0; i < statements.length; i++) {
        const stmtText = statements[i];
        const stmtStart = Date.now();
        const trimmed = stmtText.trim();
        const detectedTable = extractTableNameFromSql(trimmed);

        const isSelect =
          trimmed.toUpperCase().startsWith('SELECT') ||
          trimmed.toUpperCase().startsWith('PRAGMA') ||
          trimmed.toUpperCase().startsWith('EXPLAIN') ||
          trimmed.toUpperCase().startsWith('WITH');

        if (isSelect) {
          try {
            const stmt = this.db!.prepare(stmtText);
            const rawRows = stmt.all() as Record<string, any>[];
            const stmtTime = Date.now() - stmtStart;
            const rows = rawRows.slice(0, maxRows);

            const columns: ColumnMeta[] = [];
            if (rows.length > 0) {
              Object.keys(rows[0]).forEach((k) => {
                columns.push({
                  name: k,
                  type: typeof rows[0][k],
                  nullable: true,
                  isPrimaryKey: false,
                });
              });
            }

            resultSets.push({
              id: `result_${i + 1}`,
              tableName: detectedTable || `Query Result ${i + 1}`,
              sqlSnippet: stmtText,
              columns,
              rows,
              rowCount: rawRows.length,
              totalCount: rawRows.length,
              executionTimeMs: stmtTime,
            });
          } catch (err: any) {
            resultSets.push({
              id: `result_${i + 1}`,
              tableName: detectedTable || `Statement ${i + 1}`,
              sqlSnippet: stmtText,
              columns: [],
              rows: [],
              rowCount: 0,
              executionTimeMs: Date.now() - stmtStart,
              error: err.message,
            });
          }
        } else {
          // DDL or DML
          try {
            this.db!.exec(stmtText);
            const stmtTime = Date.now() - stmtStart;
            const changesStmt = this.db!.prepare('SELECT changes() as changes;');
            const changesRow = changesStmt.get() as any;

            resultSets.push({
              id: `result_${i + 1}`,
              tableName: detectedTable || `Statement ${i + 1}`,
              sqlSnippet: stmtText,
              columns: [],
              rows: [],
              rowCount: 0,
              affectedRows: changesRow?.changes || 0,
              executionTimeMs: stmtTime,
            });
          } catch (err: any) {
            resultSets.push({
              id: `result_${i + 1}`,
              tableName: detectedTable || `Statement ${i + 1}`,
              sqlSnippet: stmtText,
              columns: [],
              rows: [],
              rowCount: 0,
              executionTimeMs: Date.now() - stmtStart,
              error: err.message,
            });
          }
        }
      }

      const totalExecutionTimeMs = Date.now() - overallStartTime;
      const primaryResult = resultSets.find((r) => r.rows.length > 0) || resultSets[0];

      return {
        columns: primaryResult ? primaryResult.columns : [],
        rows: primaryResult ? primaryResult.rows : [],
        rowCount: primaryResult ? primaryResult.rowCount : 0,
        affectedRows: primaryResult ? primaryResult.affectedRows : undefined,
        error: primaryResult?.error,
        executionTimeMs: totalExecutionTimeMs,
        results: resultSets,
      };
    } catch (err: any) {
      const executionTimeMs = Date.now() - overallStartTime;
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs,
        error: err.message || 'SQLite query error',
        results: [],
      };
    }
  }

  public async updateCell(
    table: string,
    schema: string = 'main',
    primaryKey: Record<string, any>,
    column: string,
    value: any
  ): Promise<{ success: boolean; affectedRows: number }> {
    await this.connect();

    const pkEntries = Object.entries(primaryKey);
    if (pkEntries.length === 0) throw new Error('Primary key is required for inline update');

    const whereParts: string[] = [];
    const values: any[] = [value];

    pkEntries.forEach(([pkCol, pkVal]) => {
      values.push(pkVal);
      whereParts.push(`"${pkCol.replace(/"/g, '""')}" = ?`);
    });

    const sql = `
      UPDATE "${table.replace(/"/g, '""')}"
      SET "${column.replace(/"/g, '""')}" = ?
      WHERE ${whereParts.join(' AND ')};
    `;

    const stmt = this.db!.prepare(sql);
    stmt.run(...values);

    const changesStmt = this.db!.prepare('SELECT changes() as changes;');
    const changesRow = changesStmt.get() as any;
    return { success: true, affectedRows: changesRow?.changes || 1 };
  }

  public async insertRow(
    table: string,
    schema: string = 'main',
    data: Record<string, any>
  ): Promise<{ success: boolean; affectedRows: number }> {
    await this.connect();
    const cols = Object.keys(data);
    if (cols.length === 0) throw new Error('Data required for insertion');

    const colNames = cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ');
    const placeholders = cols.map(() => '?').join(', ');
    const values = cols.map((c) => data[c]);

    const sql = `INSERT INTO "${table.replace(/"/g, '""')}" (${colNames}) VALUES (${placeholders});`;
    const stmt = this.db!.prepare(sql);
    stmt.run(...values);

    const changesStmt = this.db!.prepare('SELECT changes() as changes;');
    const changesRow = changesStmt.get() as any;
    return { success: true, affectedRows: changesRow?.changes || 1 };
  }

  public async deleteRow(
    table: string,
    schema: string = 'main',
    primaryKey: Record<string, any>
  ): Promise<{ success: boolean; affectedRows: number }> {
    await this.connect();
    const pkEntries = Object.entries(primaryKey);
    if (pkEntries.length === 0) throw new Error('Primary key required for deletion');

    const whereParts: string[] = [];
    const values: any[] = [];

    pkEntries.forEach(([pkCol, pkVal]) => {
      values.push(pkVal);
      whereParts.push(`"${pkCol.replace(/"/g, '""')}" = ?`);
    });

    const sql = `DELETE FROM "${table.replace(/"/g, '""')}" WHERE ${whereParts.join(' AND ')};`;
    const stmt = this.db!.prepare(sql);
    stmt.run(...values);

    const changesStmt = this.db!.prepare('SELECT changes() as changes;');
    const changesRow = changesStmt.get() as any;
    return { success: true, affectedRows: changesRow?.changes || 1 };
  }

  public async getTableDDL(table: string, schema: string = 'main'): Promise<string> {
    try {
      const stmt = this.db!.prepare(
        `SELECT sql FROM sqlite_schema WHERE name = ? AND type IN ('table', 'view');`
      );
      const row = stmt.get(table) as any;
      return row?.sql || '';
    } catch {
      return '';
    }
  }

  public async disconnect(): Promise<void> {
    if (this.db) {
      try {
        this.db.close();
      } catch {}
      this.db = null;
    }
  }
}
