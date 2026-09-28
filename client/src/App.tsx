import React, { useState, useEffect } from 'react';
import {
  Table as TableIcon,
  FileCode,
  Terminal,
  Plus,
  X,
  Sparkles,
  Network,
} from 'lucide-react';
import type { ConnectionConfig, SchemaMeta, WorkspaceTab } from './types';
import { ApiService } from './services/api';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ConnectionModal } from './components/ConnectionModal';
import { VirtualizedTable } from './components/DataGrid/VirtualizedTable';
import { TableStructureView } from './components/SchemaViewer/TableStructureView';
import { ERDViewer } from './components/SchemaViewer/ERDViewer';
import { SQLEditorTab } from './components/SQLEditor/SQLEditorTab';
import { ExportModal } from './components/ExportModal';

export function App() {
  const [connections, setConnections] = useState<ConnectionConfig[]>([]);
  const [activeConnection, setActiveConnection] = useState<ConnectionConfig | null>(null);
  const [schemas, setSchemas] = useState<SchemaMeta[]>([]);
  const [isLoadingSchemas, setIsLoadingSchemas] = useState(false);
  const [isLoadingSample, setIsLoadingSample] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Tabs System
  const [tabs, setTabs] = useState<WorkspaceTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Theme System (Default: light)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('wdmt_theme');
    return saved === 'dark' || saved === 'light' ? saved : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('wdmt_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Modals
  const [isConnModalOpen, setIsConnModalOpen] = useState(false);
  const [editingConn, setEditingConn] = useState<ConnectionConfig | null>(null);
  const [exportModalState, setExportModalState] = useState<{
    isOpen: boolean;
    table?: string;
    schema?: string;
    sql?: string;
  }>({ isOpen: false });

  // 1. Initial Load Connections
  const loadConnections = async (selectId?: string) => {
    try {
      const list = await ApiService.getConnections();
      setConnections(list);
      if (list.length > 0) {
        const target = selectId ? list.find((c) => c.id === selectId) || list[0] : list[0];
        setActiveConnection(target);
      } else {
        setActiveConnection(null);
        setSchemas([]);
      }
    } catch (err) {
      console.error('Failed to load connections:', err);
    }
  };

  useEffect(() => {
    loadConnections();
  }, []);

  // 2. Load Schemas when activeConnection changes
  const loadSchemas = async () => {
    if (!activeConnection) {
      setSchemas([]);
      return;
    }
    setIsLoadingSchemas(true);
    try {
      const res = await ApiService.getSchemas(activeConnection.id);
      setSchemas(res);
    } catch (err: any) {
      console.error('Failed to load schemas:', err);
      setSchemas([]);
    } finally {
      setIsLoadingSchemas(false);
    }
  };

  useEffect(() => {
    loadSchemas();
  }, [activeConnection?.id]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsSidebarCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Helper for database-specific qualified table names
  const getQualifiedTableName = (table: string, schema?: string, dbType?: string) => {
    if (dbType === 'mysql') {
      return schema && schema !== 'default' ? `\`${schema}\`.\`${table}\`` : `\`${table}\``;
    }
    if (dbType === 'mssql') {
      return schema ? `[${schema}].[${table}]` : `[${table}]`;
    }
    if (dbType === 'sqlite') {
      return `"${table}"`;
    }
    // PostgreSQL / default
    return schema && schema !== 'public' ? `"${schema}"."${table}"` : `"${table}"`;
  };

  // 3. Tab Operations
  const openTab = (tab: WorkspaceTab) => {
    const existing = tabs.find((t) => t.id === tab.id);
    if (existing) {
      setActiveTabId(existing.id);
    } else {
      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tab.id);
    }
  };

  const closeTab = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const index = tabs.findIndex((t) => t.id === id);
    const newTabs = tabs.filter((t) => t.id !== id);
    setTabs(newTabs);

    if (activeTabId === id) {
      if (newTabs.length > 0) {
        const nextActive = newTabs[Math.max(0, index - 1)];
        setActiveTabId(nextActive.id);
      } else {
        setActiveTabId(null);
      }
    }
  };

  const handleOpenTableData = (table: string, schema?: string) => {
    if (!activeConnection) return;
    const id = `data_${activeConnection.id}_${schema || 'def'}_${table}`;
    openTab({
      id,
      title: `${table}`,
      type: 'table-data',
      connectionId: activeConnection.id,
      schema,
      tableName: table,
    });
  };

  const handleOpenTableStructure = (table: string, schema?: string) => {
    if (!activeConnection) return;
    const id = `struct_${activeConnection.id}_${schema || 'def'}_${table}`;
    openTab({
      id,
      title: `${table} (DDL)`,
      type: 'table-structure',
      connectionId: activeConnection.id,
      schema,
      tableName: table,
    });
  };

  const handleOpenTableQuery = (table: string, schema?: string) => {
    if (!activeConnection) return;
    const id = `query_${activeConnection.id}_${Date.now()}`;
    const qualifiedTable = getQualifiedTableName(table, schema, activeConnection.type);
    openTab({
      id,
      title: `Query: ${table}`,
      type: 'query',
      connectionId: activeConnection.id,
      schema,
      tableName: table,
      sqlQuery: `SELECT * FROM ${qualifiedTable} LIMIT 100;`,
    });
  };

  const handleNewQueryTab = () => {
    if (!activeConnection) return;
    const count = tabs.filter((t) => t.type === 'query').length + 1;
    const id = `query_${activeConnection.id}_${Date.now()}`;
    const defaultSchema = schemas.length > 0 ? schemas[0].name : undefined;
    openTab({
      id,
      title: `Query ${count}`,
      type: 'query',
      connectionId: activeConnection.id,
      schema: defaultSchema,
      sqlQuery: `SELECT 1 as id, 'Hello from WDMT Studio' as greeting;`,
    });
  };

  const handleOpenERD = (schema?: string) => {
    if (!activeConnection) return;
    const targetSchema = schema && schema !== 'all' ? schema : 'all';
    const id = `erd_${activeConnection.id}_${targetSchema}`;
    openTab({
      id,
      title: targetSchema !== 'all' ? `ERD: ${targetSchema}` : 'ER Diagram',
      type: 'erd',
      connectionId: activeConnection.id,
      schema: targetSchema,
    });
  };

  // 4. Sample DB Generator
  const handleGenerateSampleDb = async () => {
    setIsLoadingSample(true);
    try {
      const sample = await ApiService.createSampleDatabase();
      await loadConnections(sample.id);
      setActiveConnection(sample);
      handleOpenTableData('products', 'main');
    } catch (err: any) {
      alert(`Failed to create sample database: ${err.message}`);
    } finally {
      setIsLoadingSample(false);
    }
  };

  // 5. Delete Connection
  const handleDeleteConnection = async (id: string) => {
    if (!confirm('Are you sure you want to delete this connection profile?')) return;
    try {
      await ApiService.deleteConnection(id);
      setTabs((prev) => prev.filter((t) => t.connectionId !== id));
      await loadConnections();
    } catch (err: any) {
      alert(`Failed to delete connection: ${err.message}`);
    }
  };

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="app-container">
      {/* Linear Header */}
      <Header
        activeConnection={activeConnection}
        connections={connections}
        isSidebarCollapsed={isSidebarCollapsed}
        theme={theme}
        onToggleTheme={toggleTheme}
        onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        onOpenConnectionModal={(conn) => {
          setEditingConn(conn || null);
          setIsConnModalOpen(true);
        }}
        onNewQueryTab={handleNewQueryTab}
        onRefreshSchema={loadSchemas}
        onOpenERD={handleOpenERD}
        onGenerateSampleDb={handleGenerateSampleDb}
        isLoadingSample={isLoadingSample}
      />

      {/* Main Body */}
      <div className="app-body">
        {/* Left Sidebar */}
        <Sidebar
          connections={connections}
          activeConnection={activeConnection}
          schemas={schemas}
          isLoadingSchemas={isLoadingSchemas}
          isCollapsed={isSidebarCollapsed}
          onSelectConnection={(conn) => setActiveConnection(conn)}
          onOpenConnectionModal={(conn) => {
            setEditingConn(conn || null);
            setIsConnModalOpen(true);
          }}
          onDeleteConnection={handleDeleteConnection}
          onOpenTableData={handleOpenTableData}
          onOpenTableStructure={handleOpenTableStructure}
          onOpenTableQuery={handleOpenTableQuery}
          onOpenERD={handleOpenERD}
          onOpenExportModal={(tbl, sch) =>
            setExportModalState({ isOpen: true, table: tbl, schema: sch })
          }
          onGenerateSampleDb={handleGenerateSampleDb}
          isLoadingSample={isLoadingSample}
        />

        {/* Main Workspace Area */}
        <main className="main-content">
          {/* Tabs Bar */}
          <div className="tabs-bar">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              let Icon = Terminal;
              if (tab.type === 'table-data') Icon = TableIcon;
              if (tab.type === 'table-structure') Icon = FileCode;
              if (tab.type === 'erd') Icon = Network;

              return (
                <div
                  key={tab.id}
                  className={`tab-item ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveTabId(tab.id)}
                >
                  <Icon size={13} color={isActive ? 'var(--accent-primary)' : 'var(--text-dim)'} />
                  <span>{tab.title}</span>
                  <button
                    className="tab-close-btn"
                    onClick={(e) => closeTab(tab.id, e)}
                    title="Close tab"
                  >
                    <X size={11} />
                  </button>
                </div>
              );
            })}

            {activeConnection && (
              <button className="new-tab-btn" onClick={handleNewQueryTab} title="New SQL Query">
                <Plus size={13} /> Query
              </button>
            )}
          </div>

          {/* Tab Workspace Viewport */}
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            {tabs.length === 0 ? (
              /* Linear Obsidian Empty Workspace */
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '40px',
                  textAlign: 'center',
                  background: 'radial-gradient(circle at 50% 35%, rgba(94, 106, 210, 0.06) 0%, transparent 60%)',
                }}
              >
                <div style={{ position: 'relative', marginBottom: '20px' }}>
                  {/* Ambient Glow Aura */}
                  <div
                    style={{
                      position: 'absolute',
                      inset: '-16px',
                      background: 'radial-gradient(circle, rgba(94, 106, 210, 0.35) 0%, rgba(139, 92, 246, 0.18) 45%, transparent 70%)',
                      borderRadius: '50%',
                      filter: 'blur(18px)',
                      pointerEvents: 'none',
                      zIndex: 0,
                    }}
                  />
                  {/* Glassmorphic Logo Card */}
                  <div
                    style={{
                      position: 'relative',
                      zIndex: 1,
                      width: '88px',
                      height: '88px',
                      borderRadius: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'linear-gradient(135deg, rgba(94, 106, 210, 0.12) 0%, var(--bg-surface-elevated) 100%)',
                      border: '1px solid rgba(94, 106, 210, 0.25)',
                      boxShadow: '0 12px 30px -6px rgba(0, 0, 0, 0.25), 0 0 24px rgba(94, 106, 210, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.15)',
                      backdropFilter: 'blur(10px)',
                    }}
                  >
                    <img
                      src="/logo.png"
                      alt="WDMT Studio"
                      style={{
                        width: '56px',
                        height: '56px',
                        objectFit: 'contain',
                        filter: 'drop-shadow(0 6px 14px rgba(94, 106, 210, 0.35))',
                      }}
                    />
                  </div>
                </div>

                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  WDMT Database Studio
                </h2>
                <p style={{ color: 'var(--text-muted)', maxWidth: '420px', fontSize: '0.825rem', marginBottom: '20px', lineHeight: '1.5' }}>
                  Minimalist high-performance database workspace for PostgreSQL, MySQL, SQLite, and SQL Server.
                </p>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setEditingConn(null);
                      setIsConnModalOpen(true);
                    }}
                  >
                    <Plus size={14} /> Add Connection
                  </button>

                  {activeConnection && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleOpenERD()}
                      style={{ borderColor: 'rgba(56, 189, 248, 0.3)', color: '#38bdf8' }}
                    >
                      <Network size={14} /> Schema ER Diagram
                    </button>
                  )}

                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleGenerateSampleDb}
                    disabled={isLoadingSample}
                    style={{ borderColor: 'rgba(16, 185, 129, 0.3)', color: '#34d399' }}
                  >
                    <Sparkles size={14} />
                    {isLoadingSample ? 'Generating...' : 'Load Sample SQLite DB'}
                  </button>
                </div>
              </div>
            ) : (
              /* Active Tab Rendering */
              activeTab && (
                <>
                  {activeTab.type === 'table-data' && activeTab.tableName && (
                    <VirtualizedTable
                      key={activeTab.id}
                      connectionId={activeTab.connectionId}
                      tableName={activeTab.tableName}
                      schema={activeTab.schema}
                      onOpenExportModal={(tbl, sch) =>
                        setExportModalState({ isOpen: true, table: tbl, schema: sch })
                      }
                    />
                  )}

                  {activeTab.type === 'table-structure' && activeTab.tableName && (
                    <TableStructureView
                      key={activeTab.id}
                      connectionId={activeTab.connectionId}
                      tableName={activeTab.tableName}
                      schema={activeTab.schema}
                      onOpenERD={handleOpenERD}
                    />
                  )}

                  {activeTab.type === 'erd' && (
                    <ERDViewer
                      key={activeTab.id}
                      connectionId={activeTab.connectionId}
                      initialSchema={activeTab.schema}
                      schemas={schemas}
                      theme={theme}
                      onOpenTableData={handleOpenTableData}
                      onOpenTableStructure={handleOpenTableStructure}
                      onOpenTableQuery={handleOpenTableQuery}
                    />
                  )}

                  {activeTab.type === 'query' && (
                    <SQLEditorTab
                      key={activeTab.id}
                      connectionId={activeTab.connectionId}
                      initialSql={activeTab.sqlQuery}
                      initialSchema={activeTab.schema}
                      schemas={schemas}
                      theme={theme}
                      onOpenExportModal={(tbl, sch, sql) =>
                        setExportModalState({ isOpen: true, table: tbl, schema: sch, sql })
                      }
                    />
                  )}
                </>
              )
            )}
          </div>
        </main>
      </div>

      {/* Connection Profile Modal */}
      <ConnectionModal
        isOpen={isConnModalOpen}
        initialConfig={editingConn}
        onClose={() => {
          setIsConnModalOpen(false);
          setEditingConn(null);
        }}
        onSaved={async (savedConn) => {
          await loadConnections(savedConn.id);
          setActiveConnection(savedConn);
        }}
      />

      {/* Export Modal */}
      {exportModalState.isOpen && activeConnection && (
        <ExportModal
          isOpen={exportModalState.isOpen}
          onClose={() => setExportModalState({ isOpen: false })}
          connectionId={activeConnection.id}
          tableName={exportModalState.table}
          schema={exportModalState.schema}
          sqlQuery={exportModalState.sql}
        />
      )}
    </div>
  );
}

export default App;
