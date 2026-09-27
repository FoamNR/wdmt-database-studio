import type {
  ConnectionConfig,
  PaginationOptions,
  QueryResult,
  SchemaMeta,
  TableStructure,
} from '../types';

const API_BASE = '/api';

export const ApiService = {
  async getConnections(): Promise<ConnectionConfig[]> {
    const res = await fetch(`${API_BASE}/connections`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to fetch connections');
    return data.data;
  },

  async saveConnection(config: Partial<ConnectionConfig>): Promise<ConnectionConfig> {
    const res = await fetch(`${API_BASE}/connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to save connection');
    return data.data;
  },

  async deleteConnection(id: string): Promise<boolean> {
    const res = await fetch(`${API_BASE}/connections/${id}`, { method: 'DELETE' });
    const data = await res.json();
    return data.success;
  },

  async testConnection(config: Partial<ConnectionConfig>): Promise<{ success: boolean; message: string; version?: string }> {
    const res = await fetch(`${API_BASE}/connections/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    return res.json();
  },

  async testSavedConnection(id: string): Promise<{ success: boolean; message: string; version?: string }> {
    const res = await fetch(`${API_BASE}/connections/${id}/test`, { method: 'POST' });
    return res.json();
  },

  async getSchemas(connectionId: string): Promise<SchemaMeta[]> {
    const res = await fetch(`${API_BASE}/connections/${connectionId}/schemas`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to fetch database schemas');
    return data.data;
  },

  async getTableStructure(connectionId: string, table: string, schema?: string): Promise<TableStructure> {
    const query = schema ? `?schema=${encodeURIComponent(schema)}` : '';
    const res = await fetch(`${API_BASE}/connections/${connectionId}/tables/${encodeURIComponent(table)}/structure${query}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to fetch table structure');
    return data.data;
  },

  async getTableData(
    connectionId: string,
    table: string,
    schema?: string,
    options?: PaginationOptions
  ): Promise<QueryResult> {
    const params = new URLSearchParams();
    if (schema) params.append('schema', schema);
    if (options?.page) params.append('page', options.page.toString());
    if (options?.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options?.sortBy) params.append('sortBy', options.sortBy);
    if (options?.sortOrder) params.append('sortOrder', options.sortOrder);
    if (options?.filterColumn) params.append('filterColumn', options.filterColumn);
    if (options?.filterOperator) params.append('filterOperator', options.filterOperator);
    if (options?.filterValue) params.append('filterValue', options.filterValue);

    const res = await fetch(
      `${API_BASE}/connections/${connectionId}/tables/${encodeURIComponent(table)}/data?${params.toString()}`
    );
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to fetch table data');
    return data.data;
  },

  async executeQuery(
    connectionId: string,
    sql: string,
    maxRows: number = 2000,
    schema?: string
  ): Promise<QueryResult> {
    const res = await fetch(`${API_BASE}/connections/${connectionId}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, maxRows, schema }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Query execution error');
    return data.data;
  },

  async updateCell(
    connectionId: string,
    table: string,
    schema: string | undefined,
    primaryKey: Record<string, any>,
    column: string,
    value: any
  ): Promise<{ success: boolean; affectedRows: number }> {
    const res = await fetch(`${API_BASE}/connections/${connectionId}/tables/${encodeURIComponent(table)}/cell`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schema, primaryKey, column, value }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to update cell');
    return data.data;
  },

  async insertRow(
    connectionId: string,
    table: string,
    schema: string | undefined,
    rowData: Record<string, any>
  ): Promise<{ success: boolean; affectedRows: number }> {
    const res = await fetch(`${API_BASE}/connections/${connectionId}/tables/${encodeURIComponent(table)}/row`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schema, data: rowData }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to insert row');
    return data.data;
  },

  async deleteRow(
    connectionId: string,
    table: string,
    schema: string | undefined,
    primaryKey: Record<string, any>
  ): Promise<{ success: boolean; affectedRows: number }> {
    const res = await fetch(`${API_BASE}/connections/${connectionId}/tables/${encodeURIComponent(table)}/row`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schema, primaryKey }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to delete row');
    return data.data;
  },

  async createSampleDatabase(): Promise<ConnectionConfig> {
    const res = await fetch(`${API_BASE}/sample-db`, { method: 'POST' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to create sample database');
    return data.data;
  },

  getExportUrl(connectionId: string, options: { table?: string; schema?: string; format: 'csv' | 'json' | 'sql'; sql?: string }): string {
    const params = new URLSearchParams();
    if (options.table) params.append('table', options.table);
    if (options.schema) params.append('schema', options.schema);
    if (options.format) params.append('format', options.format);
    if (options.sql) params.append('sql', options.sql);
    return `${API_BASE}/connections/${connectionId}/export?${params.toString()}`;
  },
};
