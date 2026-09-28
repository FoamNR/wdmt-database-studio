import mysql from 'mysql2/promise';
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
import { ActiveTunnel, SSHTunnelManager } from '../tunnel/ssh.js';
import { extractTableNameFromSql, splitSqlStatements } from '../utils/sql.js';

export class MySQLDriver implements IDatabaseDriver {
  private config: ConnectionConfig;
  private connection: mysql.Connection | null = null;
  private tunnel: ActiveTunnel | null = null;

  constructor(config: ConnectionConfig) {
    this.config = config;
  }

  public async connect(): Promise<void> {
    if (this.connection) return;

    let targetHost = this.config.host || 'localhost';
    let targetPort = this.config.port || 3306;

    if (this.config.sshTunnel?.enabled) {
      this.tunnel = await SSHTunnelManager.createTunnel(
        this.config.sshTunnel,
        targetHost,
        targetPort
      );
      targetHost = '127.0.0.1';
      targetPort = this.tunnel.localPort;
    }

    try {
      this.connection = await mysql.createConnection({
        host: targetHost,
        port: targetPort,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        ssl: this.config.ssl
          ? {
              rejectUnauthorized: this.config.sslRejectUnauthorized ?? false,
            }
          : undefined,
        connectTimeout: 8000,
        multipleStatements: true,
        decimalNumbers: true,
      });
    } catch (err: any) {
      // Fallback for Docker environment connecting to host machine database
      if (
        (targetHost === 'localhost' || targetHost === '127.0.0.1') &&
        !this.config.sshTunnel?.enabled
      ) {
        try {
          this.connection = await mysql.createConnection({
            host: 'host.docker.internal',
            port: targetPort,
            user: this.config.user,
            password: this.config.password,
            database: this.config.database,
            ssl: this.config.ssl
              ? {
                  rejectUnauthorized: this.config.sslRejectUnauthorized ?? false,
                }
              : undefined,
            connectTimeout: 5000,
            multipleStatements: true,
            decimalNumbers: true,
          });
          return;
        } catch {
          // Keep original error
        }
      }
      throw err;
    }
  }

  public async testConnection(): Promise<{ success: boolean; message: string; version?: string }> {
    try {
      await this.connect();
      const [rows] = (await this.connection!.query('SELECT VERSION() as version;')) as any;
      const version = rows[0]?.version || 'MySQL';
      return { success: true, message: 'Connected successfully', version };
    } catch (err: any) {
      return { success: false, message: err.message || 'Connection failed' };
    }
  }

  public async getSchemas(): Promise<SchemaMeta[]> {
    await this.connect();
    const [rows] = (await this.connection!.query(
      `SELECT schema_name FROM information_schema.schemata 
       WHERE schema_name NOT IN ('information_schema', 'performance_schema', 'mysql', 'sys')
       ORDER BY schema_name;`
    )) as any;

    const schemas: SchemaMeta[] = [];
    for (const r of rows) {
      const sName = r.SCHEMA_NAME || r.schema_name;
      const tables = await this.getTables(sName);
      schemas.push({
        name: sName,
        tables,
      });
    }

    return schemas;
  }

  public async getTables(schema?: string): Promise<TableMeta[]> {
    await this.connect();
    const targetSchema = schema || this.config.database || 'default';
    const [rows] = (await this.connection!.query(
      `SELECT TABLE_NAME, TABLE_TYPE 
       FROM information_schema.TABLES 
       WHERE TABLE_SCHEMA = ?
       ORDER BY TABLE_NAME;`,
      [targetSchema]
    )) as any;

    return rows.map((r: any) => ({
      name: r.TABLE_NAME || r.table_name,
      schema: targetSchema,
      type: (r.TABLE_TYPE || r.table_type) === 'VIEW' ? 'view' : 'table',
    }));
  }

  public async getTableStructure(table: string, schema?: string): Promise<TableStructure> {
    await this.connect();
    const targetSchema = schema || this.config.database || 'default';

    // 1. Columns
    const [colRows] = (await this.connection!.query(
      `SELECT 
        COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, EXTRA
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
       ORDER BY ORDINAL_POSITION;`,
      [targetSchema, table]
    )) as any;

    const columns: ColumnMeta[] = colRows.map((r: any) => ({
      name: r.COLUMN_NAME || r.column_name,
      type: r.COLUMN_TYPE || r.column_type || r.DATA_TYPE || r.data_type,
      nullable: (r.IS_NULLABLE || r.is_nullable) === 'YES',
      isPrimaryKey: (r.COLUMN_KEY || r.column_key) === 'PRI',
      isAutoIncrement: ((r.EXTRA || r.extra || '')).toLowerCase().includes('auto_increment'),
      defaultValue: r.COLUMN_DEFAULT ?? r.column_default,
    }));

    const primaryKeys = columns.filter((c) => c.isPrimaryKey).map((c) => c.name);

    // 2. Foreign Keys
    const [fkRows] = (await this.connection!.query(
      `SELECT 
        COLUMN_NAME, REFERENCED_TABLE_SCHEMA, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL;`,
      [targetSchema, table]
    )) as any;

    const foreignKeys = fkRows.map((r: any) => ({
      column: r.COLUMN_NAME || r.column_name,
      referencedSchema: r.REFERENCED_TABLE_SCHEMA || r.referenced_table_schema,
      referencedTable: r.REFERENCED_TABLE_NAME || r.referenced_table_name,
      referencedColumn: r.REFERENCED_COLUMN_NAME || r.referenced_column_name,
    }));

    // 3. Indexes
    const [idxRows] = (await this.connection!.query(
      `SHOW INDEX FROM \`${targetSchema}\`.\`${table}\`;`
    )) as any;

    const indexMap = new Map<string, { columns: string[]; isUnique: boolean; isPrimary: boolean }>();
    for (const r of idxRows) {
      const keyName = r.Key_name || r.key_name;
      const colName = r.Column_name || r.column_name;
      const nonUnique = r.Non_unique ?? r.non_unique;

      if (!indexMap.has(keyName)) {
        indexMap.set(keyName, {
          columns: [],
          isUnique: nonUnique === 0,
          isPrimary: keyName === 'PRIMARY',
        });
      }
      indexMap.get(keyName)!.columns.push(colName);
    }

    const indexes = Array.from(indexMap.entries()).map(([name, data]) => ({
      name,
      columns: data.columns,
      isUnique: data.isUnique,
      isPrimary: data.isPrimary,
    }));

    const ddl = await this.getTableDDL(table, targetSchema);

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
    schema?: string,
    options?: PaginationOptions
  ): Promise<QueryResult> {
    await this.connect();
    const startTime = Date.now();
    const targetSchema = schema || this.config.database || 'default';

    const page = options?.page || 1;
    const pageSize = options?.pageSize || 50;
    const offset = (page - 1) * pageSize;

    let whereClause = '';
    const queryParams: any[] = [];

    if (options?.filterColumn && options?.filterOperator) {
      const colName = `\`${options.filterColumn.replace(/`/g, '``')}\``;
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
      orderClause = `ORDER BY \`${options.sortBy.replace(/`/g, '``')}\` ${dir}`;
    }

    const countSql = `SELECT COUNT(*) AS count FROM \`${targetSchema}\`.\`${table}\` ${whereClause};`;
    const [countRows] = (await this.connection!.query(countSql, queryParams)) as any;
    const totalCount = parseInt(countRows[0]?.count || '0', 10);

    const dataSql = `
      SELECT * FROM \`${targetSchema}\`.\`${table}\`
      ${whereClause}
      ${orderClause}
      LIMIT ? OFFSET ?;
    `;

    const [rows, fields] = (await this.connection!.query(dataSql, [
      ...queryParams,
      pageSize,
      offset,
    ])) as any;
    const executionTimeMs = Date.now() - startTime;

    const columns: ColumnMeta[] = (fields || []).map((f: any) => ({
      name: f.name,
      type: `${f.type}`,
      nullable: true,
      isPrimaryKey: false,
    }));

    return {
      columns,
      rows: Array.isArray(rows) ? rows : [],
      rowCount: Array.isArray(rows) ? rows.length : 0,
      totalCount,
      executionTimeMs,
    };
  }

  public async executeRawQuery(sql: string, maxRows: number = 2000, schema?: string): Promise<QueryResult> {
    await this.connect();
    const overallStartTime = Date.now();

    try {
      if (schema && schema !== 'default') {
        try {
          await this.connection!.query(`USE \`${schema.replace(/`/g, '``')}\`;`);
        } catch {
          // Continue even if USE fails (e.g., in case of permissions or transient error)
        }
      }

      const statements = splitSqlStatements(sql);
      const [result, fields] = (await this.connection!.query(sql)) as any;
      const totalExecutionTimeMs = Date.now() - overallStartTime;

      const isMulti = statements.length > 1 && Array.isArray(result) && (Array.isArray(result[0]) || typeof result[0]?.affectedRows === 'number');

      const resultSets: QueryResultSet[] = [];

      if (isMulti) {
        for (let i = 0; i < statements.length; i++) {
          const stmtText = statements[i];
          const detectedTable = extractTableNameFromSql(stmtText);
          const currentRes = result[i];
          const currentFields = Array.isArray(fields) && Array.isArray(fields[i]) ? fields[i] : fields;

          if (Array.isArray(currentRes)) {
            const columns: ColumnMeta[] = (currentFields || []).map((f: any) => ({
              name: f.name,
              type: `${f.type}`,
              nullable: true,
              isPrimaryKey: false,
            }));
            const rows = currentRes.slice(0, maxRows);
            resultSets.push({
              id: `result_${i + 1}`,
              tableName: detectedTable || `Table Result ${i + 1}`,
              sqlSnippet: stmtText,
              columns,
              rows,
              rowCount: currentRes.length,
              totalCount: currentRes.length,
              executionTimeMs: Math.round(totalExecutionTimeMs / statements.length),
            });
          } else {
            resultSets.push({
              id: `result_${i + 1}`,
              tableName: detectedTable || `Statement ${i + 1}`,
              sqlSnippet: stmtText,
              columns: [],
              rows: [],
              rowCount: 0,
              affectedRows: currentRes?.affectedRows,
              executionTimeMs: Math.round(totalExecutionTimeMs / statements.length),
            });
          }
        }
      } else {
        const detectedTable = extractTableNameFromSql(sql);
        if (Array.isArray(result)) {
          const columns: ColumnMeta[] = (fields || []).map((f: any) => ({
            name: f.name,
            type: `${f.type}`,
            nullable: true,
            isPrimaryKey: false,
          }));
          resultSets.push({
            id: 'result_1',
            tableName: detectedTable || 'Table Result 1',
            sqlSnippet: sql,
            columns,
            rows: result.slice(0, maxRows),
            rowCount: result.length,
            totalCount: result.length,
            executionTimeMs: totalExecutionTimeMs,
          });
        } else {
          resultSets.push({
            id: 'result_1',
            tableName: detectedTable || 'Statement 1',
            sqlSnippet: sql,
            columns: [],
            rows: [],
            rowCount: 0,
            affectedRows: result?.affectedRows,
            executionTimeMs: totalExecutionTimeMs,
          });
        }
      }

      const primary = resultSets.find((r) => r.rows.length > 0) || resultSets[0];

      return {
        columns: primary ? primary.columns : [],
        rows: primary ? primary.rows : [],
        rowCount: primary ? primary.rowCount : 0,
        affectedRows: primary ? primary.affectedRows : undefined,
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
        error: err.message || 'MySQL query error',
        results: [],
      };
    }
  }

  public async updateCell(
    table: string,
    schema: string = 'default',
    primaryKey: Record<string, any>,
    column: string,
    value: any
  ): Promise<{ success: boolean; affectedRows: number }> {
    await this.connect();
    const targetSchema = schema || this.config.database || 'default';

    const pkEntries = Object.entries(primaryKey);
    if (pkEntries.length === 0) throw new Error('Primary key is required for inline update');

    const whereParts: string[] = [];
    const values: any[] = [value];

    pkEntries.forEach(([pkCol, pkVal]) => {
      values.push(pkVal);
      whereParts.push(`\`${pkCol.replace(/`/g, '``')}\` = ?`);
    });

    const sql = `
      UPDATE \`${targetSchema}\`.\`${table}\`
      SET \`${column.replace(/`/g, '``')}\` = ?
      WHERE ${whereParts.join(' AND ')};
    `;

    const [res] = (await this.connection!.query(sql, values)) as any;
    return { success: true, affectedRows: res.affectedRows || 0 };
  }

  public async insertRow(
    table: string,
    schema: string = 'default',
    data: Record<string, any>
  ): Promise<{ success: boolean; affectedRows: number }> {
    await this.connect();
    const targetSchema = schema || this.config.database || 'default';

    const cols = Object.keys(data);
    if (cols.length === 0) throw new Error('Data required for insertion');

    const colNames = cols.map((c) => `\`${c.replace(/`/g, '``')}\``).join(', ');
    const placeholders = cols.map(() => '?').join(', ');
    const values = cols.map((c) => data[c]);

    const sql = `INSERT INTO \`${targetSchema}\`.\`${table}\` (${colNames}) VALUES (${placeholders});`;
    const [res] = (await this.connection!.query(sql, values)) as any;
    return { success: true, affectedRows: res.affectedRows || 0 };
  }

  public async deleteRow(
    table: string,
    schema: string = 'default',
    primaryKey: Record<string, any>
  ): Promise<{ success: boolean; affectedRows: number }> {
    await this.connect();
    const targetSchema = schema || this.config.database || 'default';

    const pkEntries = Object.entries(primaryKey);
    if (pkEntries.length === 0) throw new Error('Primary key required for deletion');

    const whereParts: string[] = [];
    const values: any[] = [];

    pkEntries.forEach(([pkCol, pkVal]) => {
      values.push(pkVal);
      whereParts.push(`\`${pkCol.replace(/`/g, '``')}\` = ?`);
    });

    const sql = `DELETE FROM \`${targetSchema}\`.\`${table}\` WHERE ${whereParts.join(' AND ')};`;
    const [res] = (await this.connection!.query(sql, values)) as any;
    return { success: true, affectedRows: res.affectedRows || 0 };
  }

  public async getTableDDL(table: string, schema?: string): Promise<string> {
    try {
      const targetSchema = schema || this.config.database || 'default';
      const [rows] = (await this.connection!.query(
        `SHOW CREATE TABLE \`${targetSchema}\`.\`${table}\`;`
      )) as any;
      return rows[0]?.['Create Table'] || rows[0]?.['Create View'] || '';
    } catch {
      return '';
    }
  }

  public async disconnect(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.end();
      } catch {}
      this.connection = null;
    }
    if (this.tunnel) {
      try {
        await this.tunnel.close();
      } catch {}
      this.tunnel = null;
    }
  }
}
