import pg from 'pg';
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

export class PostgresDriver implements IDatabaseDriver {
  private config: ConnectionConfig;
  private client: pg.Client | null = null;
  private tunnel: ActiveTunnel | null = null;

  constructor(config: ConnectionConfig) {
    this.config = config;
  }

  public async connect(): Promise<void> {
    if (this.client) return;

    let targetHost = this.config.host || 'localhost';
    let targetPort = this.config.port || 5432;

    if (this.config.sshTunnel?.enabled) {
      this.tunnel = await SSHTunnelManager.createTunnel(
        this.config.sshTunnel,
        targetHost,
        targetPort
      );
      targetHost = '127.0.0.1';
      targetPort = this.tunnel.localPort;
    }

    const clientConfig: pg.ClientConfig = {
      host: targetHost,
      port: targetPort,
      user: this.config.user,
      password: this.config.password,
      database: this.config.database || 'postgres',
      ssl: this.config.ssl
        ? {
            rejectUnauthorized: this.config.sslRejectUnauthorized ?? false,
          }
        : false,
      connectionTimeoutMillis: 10000,
    };

    try {
      this.client = new pg.Client(clientConfig);
      await this.client.connect();
    } catch (err: any) {
      if (
        (targetHost === 'localhost' || targetHost === '127.0.0.1') &&
        !this.config.sshTunnel?.enabled
      ) {
        try {
          this.client = new pg.Client({
            ...clientConfig,
            host: 'host.docker.internal',
            connectionTimeoutMillis: 5000,
          });
          await this.client.connect();
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
      const res = await this.client!.query('SELECT version();');
      const version = res.rows[0]?.version || 'PostgreSQL';
      return { success: true, message: 'Connected successfully', version };
    } catch (err: any) {
      return { success: false, message: err.message || 'Connection failed' };
    }
  }

  public async getSchemas(): Promise<SchemaMeta[]> {
    await this.connect();
    const schemaSql = `
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast', 'pg_temp_1', 'pg_toast_temp_1')
        AND schema_name NOT LIKE 'pg_%'
      ORDER BY schema_name;
    `;
    const schemaRes = await this.client!.query(schemaSql);
    const schemas: SchemaMeta[] = [];

    for (const row of schemaRes.rows) {
      const sName = row.schema_name;
      const tables = await this.getTables(sName);
      schemas.push({
        name: sName,
        tables,
      });
    }

    return schemas;
  }

  public async getTables(schema: string = 'public'): Promise<TableMeta[]> {
    await this.connect();
    const sql = `
      SELECT 
        table_name,
        table_type
      FROM information_schema.tables
      WHERE table_schema = $1
      ORDER BY table_name;
    `;
    const res = await this.client!.query(sql, [schema]);
    return res.rows.map((r) => ({
      name: r.table_name,
      schema,
      type: r.table_type === 'VIEW' ? 'view' : 'table',
    }));
  }

  public async getTableStructure(table: string, schema: string = 'public'): Promise<TableStructure> {
    await this.connect();

    // 1. Columns & Primary keys
    const colSql = `
      SELECT 
        c.column_name,
        c.data_type,
        c.udt_name,
        c.is_nullable,
        c.column_default,
        c.is_identity,
        CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_pk,
        CASE 
          WHEN c.is_identity = 'YES' THEN true 
          WHEN c.column_default LIKE 'nextval(%' THEN true 
          WHEN c.data_type IN ('smallserial', 'serial', 'bigserial') THEN true
          ELSE false 
        END as is_auto_increment
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = $1
          AND tc.table_name = $2
      ) pk ON c.column_name = pk.column_name
      WHERE c.table_schema = $1 AND c.table_name = $2
      ORDER BY c.ordinal_position;
    `;

    const colRes = await this.client!.query(colSql, [schema, table]);
    const columns: ColumnMeta[] = colRes.rows.map((r) => ({
      name: r.column_name,
      type: r.udt_name || r.data_type,
      nullable: r.is_nullable === 'YES',
      isPrimaryKey: r.is_pk === true,
      isAutoIncrement: r.is_auto_increment === true,
      defaultValue: r.column_default,
    }));

    const primaryKeys = columns.filter((c) => c.isPrimaryKey).map((c) => c.name);

    // 2. Foreign Keys
    const fkSql = `
      SELECT
        kcu.column_name,
        ccu.table_schema AS foreign_table_schema,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = $1
        AND tc.table_name = $2;
    `;
    const fkRes = await this.client!.query(fkSql, [schema, table]);
    const foreignKeys = fkRes.rows.map((r) => ({
      column: r.column_name,
      referencedSchema: r.foreign_table_schema,
      referencedTable: r.foreign_table_name,
      referencedColumn: r.foreign_column_name,
    }));

    // 3. Indexes
    let indexes: any[] = [];
    try {
      const idxRes = await this.client!.query(
        `
        SELECT
          indexname,
          indexdef
        FROM pg_indexes
        WHERE schemaname = $1 AND tablename = $2;
      `,
        [schema, table]
      );
      indexes = idxRes.rows.map((r) => ({
        name: r.indexname,
        columns: [r.indexdef],
        isUnique: r.indexdef.toLowerCase().includes('unique'),
        isPrimary: r.indexname.toLowerCase().includes('pkey'),
      }));
    } catch {
      // Fallback
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
    schema: string = 'public',
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
        whereClause = `WHERE ${colName}::text ILIKE $${queryParams.length}`;
      } else if (options.filterOperator === 'gt') {
        queryParams.push(options.filterValue);
        whereClause = `WHERE ${colName} > $${queryParams.length}`;
      } else if (options.filterOperator === 'lt') {
        queryParams.push(options.filterValue);
        whereClause = `WHERE ${colName} < $${queryParams.length}`;
      } else {
        queryParams.push(options.filterValue);
        whereClause = `WHERE ${colName}::text = $${queryParams.length}`;
      }
    }

    let orderClause = '';
    if (options?.sortBy) {
      const dir = options.sortOrder === 'DESC' ? 'DESC' : 'ASC';
      orderClause = `ORDER BY "${options.sortBy.replace(/"/g, '""')}" ${dir}`;
    }

    const countSql = `SELECT COUNT(*) AS count FROM "${schema}"."${table}" ${whereClause}`;
    const countRes = await this.client!.query(countSql, queryParams);
    const totalCount = parseInt(countRes.rows[0]?.count || '0', 10);

    const dataSql = `
      SELECT * FROM "${schema}"."${table}"
      ${whereClause}
      ${orderClause}
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    const dataRes = await this.client!.query(dataSql, queryParams);
    const executionTimeMs = Date.now() - startTime;

    const columns: ColumnMeta[] = (dataRes.fields || []).map((f: any) => ({
      name: f.name,
      type: `${f.dataTypeID}`,
      nullable: true,
      isPrimaryKey: false,
    }));

    return {
      columns,
      rows: dataRes.rows,
      rowCount: dataRes.rows.length,
      totalCount,
      executionTimeMs,
    };
  }

  public async executeRawQuery(sql: string, maxRows: number = 2000, schema?: string): Promise<QueryResult> {
    await this.connect();
    const overallStartTime = Date.now();

    try {
      if (schema && schema !== 'default' && schema !== 'public') {
        try {
          await this.client!.query(`SET search_path TO "${schema.replace(/"/g, '""')}", public;`);
        } catch {
          // ignore
        }
      }

      const statements = splitSqlStatements(sql);
      const res = await this.client!.query(sql);
      const totalExecutionTimeMs = Date.now() - overallStartTime;

      const rawResults = Array.isArray(res) ? res : [res];
      const resultSets: QueryResultSet[] = rawResults.map((r, i) => {
        const stmtText = statements[i] || '';
        const detectedTable = extractTableNameFromSql(stmtText);
        const columns: ColumnMeta[] = ((r as any).fields || []).map((f: any) => ({
          name: f.name,
          type: `${f.dataTypeID}`,
          nullable: true,
          isPrimaryKey: false,
        }));
        const rows = ((r as any).rows || []).slice(0, maxRows);

        return {
          id: `result_${i + 1}`,
          tableName: detectedTable || (rows.length > 0 ? `Table Result ${i + 1}` : `Statement ${i + 1}`),
          sqlSnippet: stmtText,
          columns,
          rows,
          rowCount: (r as any).rowCount || rows.length,
          totalCount: rows.length,
          affectedRows: (r as any).rowCount ?? undefined,
          executionTimeMs: Math.round(totalExecutionTimeMs / rawResults.length),
        };
      });

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
        error: err.message || 'Query execution error',
        results: [],
      };
    }
  }

  public async updateCell(
    table: string,
    schema: string = 'public',
    primaryKey: Record<string, any>,
    column: string,
    value: any
  ): Promise<{ success: boolean; affectedRows: number }> {
    await this.connect();

    const pkEntries = Object.entries(primaryKey);
    if (pkEntries.length === 0) {
      throw new Error('Primary key is required for inline update');
    }

    const whereParts: string[] = [];
    const values: any[] = [value];

    pkEntries.forEach(([pkCol, pkVal], i) => {
      values.push(pkVal);
      whereParts.push(`"${pkCol.replace(/"/g, '""')}" = $${i + 2}`);
    });

    const sql = `
      UPDATE "${schema}"."${table}"
      SET "${column.replace(/"/g, '""')}" = $1
      WHERE ${whereParts.join(' AND ')};
    `;

    const res = await this.client!.query(sql, values);
    return { success: true, affectedRows: res.rowCount || 0 };
  }

  public async insertRow(
    table: string,
    schema: string = 'public',
    data: Record<string, any>
  ): Promise<{ success: boolean; affectedRows: number }> {
    await this.connect();
    const cols = Object.keys(data);
    if (cols.length === 0) throw new Error('Data required for insertion');

    const colNames = cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ');
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    const values = cols.map((c) => data[c]);

    const sql = `INSERT INTO "${schema}"."${table}" (${colNames}) VALUES (${placeholders});`;
    const res = await this.client!.query(sql, values);
    return { success: true, affectedRows: res.rowCount || 0 };
  }

  public async deleteRow(
    table: string,
    schema: string = 'public',
    primaryKey: Record<string, any>
  ): Promise<{ success: boolean; affectedRows: number }> {
    await this.connect();
    const pkEntries = Object.entries(primaryKey);
    if (pkEntries.length === 0) throw new Error('Primary key required for deletion');

    const whereParts: string[] = [];
    const values: any[] = [];

    pkEntries.forEach(([pkCol, pkVal], i) => {
      values.push(pkVal);
      whereParts.push(`"${pkCol.replace(/"/g, '""')}" = $${i + 1}`);
    });

    const sql = `DELETE FROM "${schema}"."${table}" WHERE ${whereParts.join(' AND ')};`;
    const res = await this.client!.query(sql, values);
    return { success: true, affectedRows: res.rowCount || 0 };
  }

  public async getTableDDL(table: string, schema: string = 'public'): Promise<string> {
    const colSql = `
      SELECT 
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        c.is_identity,
        CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_pk
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = $1
          AND tc.table_name = $2
      ) pk ON c.column_name = pk.column_name
      WHERE c.table_schema = $1 AND c.table_name = $2
      ORDER BY c.ordinal_position;
    `;
    const res = await this.client!.query(colSql, [schema, table]);
    const lines = res.rows.map((r) => {
      const isNextVal = r.column_default && r.column_default.startsWith('nextval(');
      let typeStr = r.data_type.toUpperCase();
      if (isNextVal) {
        if (typeStr === 'INTEGER') typeStr = 'SERIAL';
        else if (typeStr === 'BIGINT') typeStr = 'BIGSERIAL';
        else if (typeStr === 'SMALLINT') typeStr = 'SMALLSERIAL';
      }

      let line = `  "${r.column_name}" ${typeStr}`;
      if (r.is_pk) line += ' PRIMARY KEY';
      else if (r.is_nullable === 'NO' && !isNextVal) line += ' NOT NULL';

      if (r.column_default && !isNextVal) {
        line += ` DEFAULT ${r.column_default}`;
      }
      return line;
    });

    return `CREATE TABLE "${schema}"."${table}" (\n${lines.join(',\n')}\n);`;
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.end();
      } catch {}
      this.client = null;
    }
    if (this.tunnel) {
      try {
        await this.tunnel.close();
      } catch {}
      this.tunnel = null;
    }
  }
}
