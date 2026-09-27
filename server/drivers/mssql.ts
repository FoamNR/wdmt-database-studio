import { Connection as TediousConnection, Request as TediousRequest } from 'tedious';
import {
  ColumnMeta,
  ConnectionConfig,
  PaginationOptions,
  QueryResult,
  SchemaMeta,
  TableMeta,
  TableStructure,
} from '../types.js';
import { IDatabaseDriver } from './interface.js';
import { ActiveTunnel, SSHTunnelManager } from '../tunnel/ssh.js';

export class MSSQLDriver implements IDatabaseDriver {
  private config: ConnectionConfig;
  private connection: TediousConnection | null = null;
  private tunnel: ActiveTunnel | null = null;

  constructor(config: ConnectionConfig) {
    this.config = config;
  }

  public async connect(): Promise<void> {
    if (this.connection) return;

    let targetHost = this.config.host || 'localhost';
    let targetPort = this.config.port || 1433;

    if (this.config.sshTunnel?.enabled) {
      this.tunnel = await SSHTunnelManager.createTunnel(
        this.config.sshTunnel,
        targetHost,
        targetPort
      );
      targetHost = '127.0.0.1';
      targetPort = this.tunnel.localPort;
    }

    return new Promise((resolve, reject) => {
      const conn = new TediousConnection({
        server: targetHost,
        options: {
          port: targetPort,
          database: this.config.database || 'master',
          encrypt: this.config.ssl ?? false,
          trustServerCertificate: true,
          connectTimeout: 10000,
          rowCollectionOnRequestCompletion: true,
        },
        authentication: {
          type: 'default',
          options: {
            userName: this.config.user || 'sa',
            password: this.config.password || '',
          },
        },
      });

      conn.on('connect', (err) => {
        if (err) {
          reject(err);
        } else {
          this.connection = conn;
          resolve();
        }
      });

      conn.on('error', (err) => {
        console.error('MSSQL Connection error:', err);
      });

      conn.connect();
    });
  }

  private executeSqlInternal(
    sql: string
  ): Promise<{ rows: Record<string, any>[]; columns: ColumnMeta[]; rowCount: number }> {
    return new Promise((resolve, reject) => {
      const rows: Record<string, any>[] = [];
      let columns: ColumnMeta[] = [];

      const request = new TediousRequest(sql, (err, rowCount) => {
        if (err) {
          return reject(err);
        }
        resolve({ rows, columns, rowCount: rowCount ?? rows.length });
      });

      request.on('columnMetadata', (columnsMeta: any) => {
        if (Array.isArray(columnsMeta)) {
          columns = columnsMeta.map((c: any) => ({
            name: c.colName,
            type: c.type?.name || 'VARCHAR',
            nullable: true,
            isPrimaryKey: false,
          }));
        }
      });

      request.on('row', (rowColumns: any) => {
        const rowObj: Record<string, any> = {};
        if (Array.isArray(rowColumns)) {
          rowColumns.forEach((c: any) => {
            rowObj[c.metadata.colName] = c.value;
          });
        }
        rows.push(rowObj);
      });

      this.connection!.execSql(request);
    });
  }

  public async testConnection(): Promise<{ success: boolean; message: string; version?: string }> {
    try {
      await this.connect();
      const res = await this.executeSqlInternal('SELECT @@VERSION as version;');
      const version = res.rows[0]?.version || 'SQL Server';
      return { success: true, message: 'Connected successfully', version };
    } catch (err: any) {
      return { success: false, message: err.message || 'Connection failed' };
    }
  }

  public async getSchemas(): Promise<SchemaMeta[]> {
    await this.connect();
    const res = await this.executeSqlInternal(
      `SELECT schema_name FROM information_schema.schemata 
       WHERE schema_name NOT IN ('guest', 'INFORMATION_SCHEMA', 'sys', 'db_owner', 'db_accessadmin', 'db_securityadmin', 'db_ddladmin', 'db_backupoperator', 'db_datareader', 'db_datawriter', 'db_denydatareader', 'db_denydatawriter')
       ORDER BY schema_name;`
    );

    const schemas: SchemaMeta[] = [];
    for (const r of res.rows) {
      const sName = r.schema_name;
      const tables = await this.getTables(sName);
      schemas.push({
        name: sName,
        tables,
      });
    }

    return schemas;
  }

  public async getTables(schema: string = 'dbo'): Promise<TableMeta[]> {
    await this.connect();
    const res = await this.executeSqlInternal(
      `SELECT TABLE_NAME, TABLE_TYPE 
       FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_SCHEMA = '${schema.replace(/'/g, "''")}'
       ORDER BY TABLE_NAME;`
    );

    return res.rows.map((r) => ({
      name: r.TABLE_NAME,
      schema,
      type: r.TABLE_TYPE === 'VIEW' ? 'view' : 'table',
    }));
  }

  public async getTableStructure(table: string, schema: string = 'dbo'): Promise<TableStructure> {
    await this.connect();

    // 1. Columns & PK
    const colSql = `
      SELECT 
        c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE, c.COLUMN_DEFAULT,
        COLUMNPROPERTY(OBJECT_ID('${schema.replace(/'/g, "''")}.${table.replace(/'/g, "''")}'), c.COLUMN_NAME, 'IsIdentity') as is_identity,
        CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END as is_pk
      FROM INFORMATION_SCHEMA.COLUMNS c
      LEFT JOIN (
        SELECT ku.COLUMN_NAME
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
          ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
        WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
          AND tc.TABLE_SCHEMA = '${schema.replace(/'/g, "''")}'
          AND tc.TABLE_NAME = '${table.replace(/'/g, "''")}'
      ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
      WHERE c.TABLE_SCHEMA = '${schema.replace(/'/g, "''")}' AND c.TABLE_NAME = '${table.replace(/'/g, "''")}'
      ORDER BY c.ORDINAL_POSITION;
    `;

    const colRes = await this.executeSqlInternal(colSql);
    const columns: ColumnMeta[] = colRes.rows.map((r) => ({
      name: r.COLUMN_NAME,
      type: r.DATA_TYPE,
      nullable: r.IS_NULLABLE === 'YES',
      isPrimaryKey: r.is_pk === 1,
      isAutoIncrement: r.is_identity === 1,
      defaultValue: r.COLUMN_DEFAULT,
    }));

    const primaryKeys = columns.filter((c) => c.isPrimaryKey).map((c) => c.name);

    return {
      columns,
      primaryKeys,
      foreignKeys: [],
      indexes: [],
      ddl: await this.getTableDDL(table, schema),
    };
  }

  public async getTableData(
    table: string,
    schema: string = 'dbo',
    options?: PaginationOptions
  ): Promise<QueryResult> {
    await this.connect();
    const startTime = Date.now();

    const page = options?.page || 1;
    const pageSize = options?.pageSize || 50;
    const offset = (page - 1) * pageSize;

    let orderClause = options?.sortBy
      ? `ORDER BY [${options.sortBy.replace(/]/g, ']]')}] ${options.sortOrder === 'DESC' ? 'DESC' : 'ASC'}`
      : 'ORDER BY (SELECT NULL)';

    const countSql = `SELECT COUNT(*) AS count FROM [${schema}].[${table}];`;
    const countRes = await this.executeSqlInternal(countSql);
    const totalCount = parseInt(countRes.rows[0]?.count || '0', 10);

    const dataSql = `
      SELECT * FROM [${schema}].[${table}]
      ${orderClause}
      OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY;
    `;

    const dataRes = await this.executeSqlInternal(dataSql);
    const executionTimeMs = Date.now() - startTime;

    return {
      columns: dataRes.columns,
      rows: dataRes.rows,
      rowCount: dataRes.rows.length,
      totalCount,
      executionTimeMs,
    };
  }

  public async executeRawQuery(sql: string, maxRows: number = 2000, schema?: string): Promise<QueryResult> {
    await this.connect();
    const startTime = Date.now();

    try {
      if (schema && schema !== 'default') {
        try {
          await this.executeSqlInternal(`USE [${schema.replace(/]/g, ']]')}];`);
        } catch {
          // ignore
        }
      }
      const res = await this.executeSqlInternal(sql);
      const executionTimeMs = Date.now() - startTime;
      return {
        columns: res.columns,
        rows: res.rows.slice(0, maxRows),
        rowCount: res.rowCount,
        executionTimeMs,
      };
    } catch (err: any) {
      const executionTimeMs = Date.now() - startTime;
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs,
        error: err.message || 'MSSQL query error',
      };
    }
  }

  public async updateCell(
    table: string,
    schema: string = 'dbo',
    primaryKey: Record<string, any>,
    column: string,
    value: any
  ): Promise<{ success: boolean; affectedRows: number }> {
    await this.connect();
    const pkEntries = Object.entries(primaryKey);
    if (pkEntries.length === 0) throw new Error('Primary key is required for inline update');

    const whereParts = pkEntries.map(
      ([pkCol, pkVal]) =>
        `[${pkCol.replace(/]/g, ']]')}] = ${typeof pkVal === 'number' ? pkVal : `'${String(pkVal).replace(/'/g, "''")}'`}`
    );

    const valStr =
      value === null
        ? 'NULL'
        : typeof value === 'number'
          ? value
          : `'${String(value).replace(/'/g, "''")}'`;

    const sql = `
      UPDATE [${schema}].[${table}]
      SET [${column.replace(/]/g, ']]')}] = ${valStr}
      WHERE ${whereParts.join(' AND ')};
    `;

    const res = await this.executeSqlInternal(sql);
    return { success: true, affectedRows: res.rowCount || 1 };
  }

  public async insertRow(
    table: string,
    schema: string = 'dbo',
    data: Record<string, any>
  ): Promise<{ success: boolean; affectedRows: number }> {
    await this.connect();
    const cols = Object.keys(data);
    if (cols.length === 0) throw new Error('Data required for insertion');

    const colNames = cols.map((c) => `[${c.replace(/]/g, ']]')}]`).join(', ');
    const values = cols
      .map((c) => {
        const val = data[c];
        if (val === null || val === undefined) return 'NULL';
        if (typeof val === 'number') return val;
        return `'${String(val).replace(/'/g, "''")}'`;
      })
      .join(', ');

    const sql = `INSERT INTO [${schema}].[${table}] (${colNames}) VALUES (${values});`;
    const res = await this.executeSqlInternal(sql);
    return { success: true, affectedRows: res.rowCount || 1 };
  }

  public async deleteRow(
    table: string,
    schema: string = 'dbo',
    primaryKey: Record<string, any>
  ): Promise<{ success: boolean; affectedRows: number }> {
    await this.connect();
    const pkEntries = Object.entries(primaryKey);
    if (pkEntries.length === 0) throw new Error('Primary key required for deletion');

    const whereParts = pkEntries.map(
      ([pkCol, pkVal]) =>
        `[${pkCol.replace(/]/g, ']]')}] = ${typeof pkVal === 'number' ? pkVal : `'${String(pkVal).replace(/'/g, "''")}'`}`
    );

    const sql = `DELETE FROM [${schema}].[${table}] WHERE ${whereParts.join(' AND ')};`;
    const res = await this.executeSqlInternal(sql);
    return { success: true, affectedRows: res.rowCount || 1 };
  }

  public async getTableDDL(table: string, schema: string = 'dbo'): Promise<string> {
    const colSql = `
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = '${schema.replace(/'/g, "''")}' AND TABLE_NAME = '${table.replace(/'/g, "''")}'
      ORDER BY ORDINAL_POSITION;
    `;
    const res = await this.executeSqlInternal(colSql);
    const lines = res.rows.map((r) => {
      let line = `  [${r.COLUMN_NAME}] ${r.DATA_TYPE.toUpperCase()}`;
      if (r.IS_NULLABLE === 'NO') line += ' NOT NULL';
      if (r.COLUMN_DEFAULT) line += ` DEFAULT ${r.COLUMN_DEFAULT}`;
      return line;
    });

    return `CREATE TABLE [${schema}].[${table}] (\n${lines.join(',\n')}\n);`;
  }

  public async disconnect(): Promise<void> {
    if (this.connection) {
      try {
        this.connection.close();
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
