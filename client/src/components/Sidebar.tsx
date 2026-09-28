import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Table as TableIcon,
  Eye,
  FileCode,
  Search,
  Settings,
  Trash2,
  Plus,
  Play,
  Download,
  Folder,
  Sparkles,
  X,
  Network,
} from 'lucide-react';
import type { ConnectionConfig, SchemaMeta } from '../types';

interface SidebarProps {
  connections: ConnectionConfig[];
  activeConnection: ConnectionConfig | null;
  schemas: SchemaMeta[];
  isLoadingSchemas: boolean;
  isCollapsed: boolean;
  onSelectConnection: (conn: ConnectionConfig) => void;
  onOpenConnectionModal: (conn?: ConnectionConfig) => void;
  onDeleteConnection: (id: string) => void;
  onOpenTableData: (table: string, schema?: string) => void;
  onOpenTableStructure: (table: string, schema?: string) => void;
  onOpenTableQuery: (table: string, schema?: string) => void;
  onOpenERD?: (schema?: string) => void;
  onOpenExportModal: (table: string, schema?: string) => void;
  onGenerateSampleDb?: () => void;
  isLoadingSample?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  connections,
  activeConnection,
  schemas,
  isLoadingSchemas,
  isCollapsed,
  onSelectConnection,
  onOpenConnectionModal,
  onDeleteConnection,
  onOpenTableData,
  onOpenTableStructure,
  onOpenTableQuery,
  onOpenERD,
  onOpenExportModal,
  onGenerateSampleDb,
  isLoadingSample = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [collapsedSchemas, setCollapsedSchemas] = useState<Record<string, boolean>>({});

  const toggleSchema = (schemaName: string) => {
    setCollapsedSchemas((prev) => ({
      ...prev,
      [schemaName]: !prev[schemaName],
    }));
  };

  const filteredSchemas = schemas
    .map((schema) => {
      const filteredTables = schema.tables.filter((t) =>
        t.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      return {
        ...schema,
        tables: filteredTables,
      };
    })
    .filter(
      (schema) =>
        searchTerm === '' ||
        schema.tables.length > 0 ||
        schema.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

  return (
    <aside className={`app-sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Connection Header */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-sidebar)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Connections ({connections.length})
          </span>
          <div style={{ display: 'flex', gap: '2px' }}>
            {activeConnection && (
              <button
                className="btn btn-ghost btn-sm btn-icon"
                onClick={() => onOpenConnectionModal(activeConnection)}
                title="Edit Connection Profile"
              >
                <Settings size={13} />
              </button>
            )}
            {activeConnection && (
              <button
                className="btn btn-ghost btn-sm btn-icon"
                onClick={() => onDeleteConnection(activeConnection.id)}
                title="Delete Connection Profile"
                style={{ color: 'var(--danger)' }}
              >
                <Trash2 size={13} />
              </button>
            )}
            <button
              className="btn btn-ghost btn-sm btn-icon"
              onClick={() => onOpenConnectionModal()}
              title="Add New Connection"
            >
              <Plus size={14} color="var(--accent-primary)" />
            </button>
          </div>
        </div>

        {connections.length > 0 ? (
          <select
            className="input-select"
            value={activeConnection?.id || ''}
            onChange={(e) => {
              const selected = connections.find((c) => c.id === e.target.value);
              if (selected) onSelectConnection(selected);
            }}
            style={{ fontWeight: 500, height: '30px', fontSize: '0.8rem', padding: '4px 8px' }}
          >
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.type})
              </option>
            ))}
          </select>
        ) : (
          <div style={{ padding: '4px 0' }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => onOpenConnectionModal()}
              style={{ width: '100%', marginBottom: onGenerateSampleDb ? '6px' : 0 }}
            >
              <Plus size={13} /> Add Connection
            </button>
            {onGenerateSampleDb && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={onGenerateSampleDb}
                disabled={isLoadingSample}
                style={{ width: '100%', borderColor: 'rgba(16, 185, 129, 0.3)', color: '#34d399' }}
              >
                <Sparkles size={13} /> {isLoadingSample ? 'Creating...' : 'Load Sample SQLite DB'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Search Input */}
      {activeConnection && (
        <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={13} color="var(--text-dim)" style={{ position: 'absolute', left: '9px' }} />
            <input
              type="text"
              className="input-text"
              placeholder="Search tables..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '28px', paddingRight: searchTerm ? '26px' : '8px', height: '28px', fontSize: '0.775rem' }}
            />
            {searchTerm && (
              <button
                className="btn btn-ghost btn-sm btn-icon"
                onClick={() => setSearchTerm('')}
                style={{ position: 'absolute', right: '4px', height: '20px', width: '20px', padding: 0 }}
              >
                <X size={12} color="var(--text-dim)" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Explorer Tree */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 4px' }}>
        {/* Quick ER Diagram Action */}
        {activeConnection && onOpenERD && !isLoadingSchemas && filteredSchemas.length > 0 && (
          <div style={{ padding: '2px 4px 6px 4px' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => onOpenERD()}
              style={{
                width: '100%',
                justifyContent: 'center',
                height: '28px',
                fontSize: '0.75rem',
                borderColor: 'rgba(56, 189, 248, 0.3)',
                color: '#38bdf8',
                background: 'rgba(56, 189, 248, 0.05)',
                fontWeight: 500,
              }}
              title="Open Interactive ER Diagram"
            >
              <Network size={13} color="#38bdf8" />
              <span>Visual ER Diagram</span>
            </button>
          </div>
        )}

        {isLoadingSchemas && (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.775rem' }}>
            <div
              style={{
                display: 'inline-block',
                width: '18px',
                height: '18px',
                border: '2px solid var(--accent-primary)',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                marginBottom: '6px',
              }}
            />
            <div>Loading schemas...</div>
          </div>
        )}

        {!isLoadingSchemas && activeConnection && filteredSchemas.length === 0 && (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.775rem' }}>
            No tables or views found.
          </div>
        )}

        {!isLoadingSchemas &&
          filteredSchemas.map((schema) => {
            const isCollapsedNode = collapsedSchemas[schema.name] ?? false;

            return (
              <div key={schema.name} style={{ marginBottom: '2px' }}>
                {/* Schema Node Header */}
                <div
                  onClick={() => toggleSchema(schema.name)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 6px',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    transition: 'all var(--transition-fast)',
                  }}
                  className="sidebar-tree-node"
                >
                  {isCollapsedNode ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  <Folder size={13} color="#818cf8" />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {schema.name}
                  </span>

                  {onOpenERD && (
                    <button
                      className="btn btn-ghost btn-sm btn-icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenERD(schema.name);
                      }}
                      title={`View ${schema.name} ER Diagram`}
                      style={{ height: '18px', width: '18px', padding: 0, opacity: 0.7 }}
                    >
                      <Network size={11} color="#38bdf8" />
                    </button>
                  )}

                  <span style={{ fontSize: '0.675rem', color: 'var(--text-dim)', background: 'var(--bg-surface-elevated)', padding: '1px 5px', borderRadius: '3px' }}>
                    {schema.tables.length}
                  </span>
                </div>

                {/* Tables List */}
                {!isCollapsedNode && (
                  <div style={{ paddingLeft: '10px', borderLeft: '1px solid var(--border-subtle)', marginLeft: '10px' }}>
                    {schema.tables.map((table) => (
                      <div
                        key={table.name}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '4px 6px',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.775rem',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          transition: 'all var(--transition-fast)',
                        }}
                        className="table-tree-item"
                        onClick={() => onOpenTableData(table.name, schema.name)}
                        title={`Table: ${schema.name}.${table.name} (${table.type})`}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden' }}>
                          {table.type === 'view' ? (
                            <Eye size={12} color="#38bdf8" />
                          ) : (
                            <TableIcon size={12} color="var(--text-muted)" />
                          )}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {table.name}
                          </span>
                        </div>

                        {/* Quick action buttons on hover */}
                        <div className="table-quick-actions" style={{ display: 'flex', gap: '1px' }}>
                          <button
                            className="btn btn-ghost btn-sm btn-icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenTableStructure(table.name, schema.name);
                            }}
                            title="View Structure"
                            style={{ height: '22px', width: '22px', padding: '2px' }}
                          >
                            <FileCode size={11} color="#a855f7" />
                          </button>
                          <button
                            className="btn btn-ghost btn-sm btn-icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenTableQuery(table.name, schema.name);
                            }}
                            title="Query Table"
                            style={{ height: '22px', width: '22px', padding: '2px' }}
                          >
                            <Play size={11} color="#10b981" />
                          </button>
                          <button
                            className="btn btn-ghost btn-sm btn-icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenExportModal(table.name, schema.name);
                            }}
                            title="Export Data"
                            style={{ height: '22px', width: '22px', padding: '2px' }}
                          >
                            <Download size={11} color="#f59e0b" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </aside>
  );
};
