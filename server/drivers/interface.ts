import {
  ColumnMeta,
  PaginationOptions,
  QueryResult,
  SchemaMeta,
  TableMeta,
  TableStructure,
} from '../types.js';

export interface IDatabaseDriver {
  connect(): Promise<void>;
  testConnection(): Promise<{ success: boolean; message: string; version?: string }>;
  getSchemas(): Promise<SchemaMeta[]>;
  getTables(schema?: string): Promise<TableMeta[]>;
  getTableStructure(table: string, schema?: string): Promise<TableStructure>;
  getTableData(table: string, schema?: string, options?: PaginationOptions): Promise<QueryResult>;
  executeRawQuery(sql: string, maxRows?: number, schema?: string): Promise<QueryResult>;
  updateCell(
    table: string,
    schema: string,
    primaryKey: Record<string, any>,
    column: string,
    value: any
  ): Promise<{ success: boolean; affectedRows: number }>;
  insertRow(
    table: string,
    schema: string,
    data: Record<string, any>
  ): Promise<{ success: boolean; affectedRows: number }>;
  deleteRow(
    table: string,
    schema: string,
    primaryKey: Record<string, any>
  ): Promise<{ success: boolean; affectedRows: number }>;
  getTableDDL(table: string, schema?: string): Promise<string>;
  disconnect(): Promise<void>;
}
