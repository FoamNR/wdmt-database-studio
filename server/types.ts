export type DatabaseType = 'postgres' | 'mysql' | 'sqlite' | 'mssql';

export interface SSHTunnelConfig {
  enabled: boolean;
  host: string;
  port: number;
  user: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

export interface ConnectionConfig {
  id: string;
  name: string;
  type: DatabaseType;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  filePath?: string; // For SQLite
  ssl?: boolean;
  sslRejectUnauthorized?: boolean;
  sshTunnel?: SSHTunnelConfig;
  createdAt: string;
  updatedAt: string;
  color?: string;
}

export interface ColumnMeta {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isAutoIncrement?: boolean;
  defaultValue?: string | null;
  comment?: string;
}

export interface TableMeta {
  name: string;
  schema?: string;
  type: 'table' | 'view' | 'materialized_view';
  rowCount?: number;
  sizeBytes?: number;
}

export interface SchemaMeta {
  name: string;
  tables: TableMeta[];
}

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  filterColumn?: string;
  filterOperator?: 'equals' | 'contains' | 'gt' | 'lt' | 'null' | 'notNull';
  filterValue?: string;
}

export interface QueryResultSet {
  id: string;
  tableName?: string;
  sqlSnippet?: string;
  columns: ColumnMeta[];
  rows: Record<string, any>[];
  rowCount: number;
  totalCount?: number;
  executionTimeMs: number;
  affectedRows?: number;
  error?: string;
}

export interface QueryResult {
  columns: ColumnMeta[];
  rows: Record<string, any>[];
  rowCount: number;
  totalCount?: number;
  executionTimeMs: number;
  affectedRows?: number;
  error?: string;
  results?: QueryResultSet[];
}

export interface TableStructure {
  columns: ColumnMeta[];
  primaryKeys: string[];
  foreignKeys: {
    column: string;
    referencedTable: string;
    referencedColumn: string;
    referencedSchema?: string;
  }[];
  indexes: {
    name: string;
    columns: string[];
    isUnique: boolean;
    isPrimary: boolean;
  }[];
  ddl: string;
}
