import React, { useState, useEffect, useRef, useMemo } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import {
  Play,
  Download,
  Trash2,
  Clock,
  AlertCircle,
  AlignLeft,
  Table as TableIcon,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Layers,
  Sparkles,
  Database,
} from 'lucide-react';
import type { QueryResult, QueryResultSet, SchemaMeta } from '../../types';
import { ApiService } from '../../services/api';
import { buildSqlCompletionItems } from './sqlAutocomplete';

interface SQLEditorTabProps {
  connectionId: string;
  initialSql?: string;
  initialSchema?: string;
  schemas?: SchemaMeta[];
  theme?: 'light' | 'dark';
  onOpenExportModal: (table?: string, schema?: string, sql?: string) => void;
  onRefreshSchema?: () => void;
}

export const SQLEditorTab: React.FC<SQLEditorTabProps> = ({
  connectionId,
  initialSql = 'SELECT * FROM categories;\nSELECT * FROM products LIMIT 10;\nSELECT * FROM orders;',
  initialSchema,
  schemas = [],
  theme = 'light',
  onOpenExportModal,
  onRefreshSchema,
}) => {
  const [sql, setSql] = useState(initialSql);
  const [selectedSchema, setSelectedSchema] = useState<string>(
    initialSchema || (schemas.length > 0 ? schemas[0].name : '')
  );
  const [result, setResult] = useState<QueryResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [maxRows, setMaxRows] = useState(2000);
  const [activeResultIndex, setActiveResultIndex] = useState<number | 'all'>(0);
  const [searchFilter, setSearchFilter] = useState('');
  const [sortState, setSortState] = useState<{ colName?: string; dir: 'ASC' | 'DESC' }>({ dir: 'ASC' });
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const completionDisposableRef = useRef<any>(null);

  // Sync theme changes with Monaco Editor
  useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(theme === 'light' ? 'linear-light' : 'obsidian-dark');
    }
  }, [theme]);

  // Register or update SQL Autocomplete Provider whenever schemas change
  useEffect(() => {
    if (!monacoRef.current) return;
    const monaco = monacoRef.current;

    if (completionDisposableRef.current) {
      completionDisposableRef.current.dispose();
    }

    completionDisposableRef.current = monaco.languages.registerCompletionItemProvider('sql', {
      triggerCharacters: [' ', '.', '(', ',', '\n', '\t'],
      provideCompletionItems: (model: any, position: any) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const suggestions = buildSqlCompletionItems(monaco, schemas, range);
        return { suggestions };
      },
    });

    return () => {
      if (completionDisposableRef.current) {
        completionDisposableRef.current.dispose();
      }
    };
  }, [schemas]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // 1. Linear Light Theme for Monaco
    monaco.editor.defineTheme('linear-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '5e6ad2', fontStyle: 'bold' },
        { token: 'string', foreground: '059669' },
        { token: 'number', foreground: 'd97706' },
        { token: 'comment', foreground: '9ca3af', fontStyle: 'italic' },
        { token: 'operator', foreground: '0284c7' },
      ],
      colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#111827',
        'editorCursor.foreground': '#5e6ad2',
        'editor.lineHighlightBackground': '#f8f9fa',
        'editorLineNumber.foreground': '#9ca3af',
        'editorLineNumber.activeForeground': '#4b5563',
        'editorIndentGuide.background': '#e5e7eb',
      },
    });

    // 2. Obsidian Dark Theme for Monaco
    monaco.editor.defineTheme('obsidian-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '5e6ad2', fontStyle: 'bold' },
        { token: 'string', foreground: '10b981' },
        { token: 'number', foreground: 'f59e0b' },
        { token: 'comment', foreground: '71717a', fontStyle: 'italic' },
        { token: 'operator', foreground: '38bdf8' },
      ],
      colors: {
        'editor.background': '#0d0e11',
        'editor.foreground': '#f4f4f5',
        'editorCursor.foreground': '#5e6ad2',
        'editor.lineHighlightBackground': '#141519',
        'editorLineNumber.foreground': '#52525b',
        'editorLineNumber.activeForeground': '#a1a1aa',
        'editorIndentGuide.background': '#18191d',
      },
    });

    monaco.editor.setTheme(theme === 'light' ? 'linear-light' : 'obsidian-dark');

    // Add Ctrl+Enter shortcut to run query
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      runQuery();
    });

    // Register initial completion provider
    if (completionDisposableRef.current) {
      completionDisposableRef.current.dispose();
    }
    completionDisposableRef.current = monaco.languages.registerCompletionItemProvider('sql', {
      triggerCharacters: [' ', '.', '(', ',', '\n', '\t'],
      provideCompletionItems: (model: any, position: any) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const suggestions = buildSqlCompletionItems(monaco, schemas, range);
        return { suggestions };
      },
    });
  };

  const runQuery = async () => {
    const queryText = editorRef.current ? editorRef.current.getValue() : sql;
    if (!queryText.trim()) return;

    setIsExecuting(true);
    try {
      const res = await ApiService.executeQuery(
        connectionId,
        queryText,
        maxRows,
        selectedSchema || undefined
      );
      setResult(res);
      setActiveResultIndex(0);
      setSearchFilter('');
      setSortState({ dir: 'ASC' });

      // Realtime schema & sidebar refresh on DDL / DML operations
      if (!res.error && onRefreshSchema) {
        const normalized = queryText.toUpperCase();
        const modifiesSchemaOrData = /\b(CREATE|DROP|ALTER|RENAME|TRUNCATE|INSERT|UPDATE|DELETE|REPLACE|VACUUM)\b/i.test(
          normalized
        );
        if (modifiesSchemaOrData) {
          onRefreshSchema();
        }
      }
    } catch (err: any) {
      setResult({
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: 0,
        error: err.message || 'Execution failed',
        results: [],
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleFormatSql = () => {
    if (editorRef.current) {
      editorRef.current.getAction('editor.action.formatDocument')?.run();
    }
  };

  const handleClear = () => {
    setSql('');
    if (editorRef.current) {
      editorRef.current.setValue('');
    }
  };

  // Quick Table Query Insert
  const insertQuerySnippet = (snippet: string) => {
    if (editorRef.current) {
      const current = editorRef.current.getValue();
      const newText = current.trim() ? `${current.trim()}\n\n${snippet}` : snippet;
      editorRef.current.setValue(newText);
      setSql(newText);
    } else {
      setSql(snippet);
    }
  };

  // Result sets list (extracted table-by-table)
  const resultSets: QueryResultSet[] = useMemo(() => {
    if (!result) return [];
    if (result.results && result.results.length > 0) {
      return result.results;
    }
    return [
      {
        id: 'res_1',
        tableName: 'Table Result 1',
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rowCount,
        totalCount: result.totalCount || result.rowCount,
        executionTimeMs: result.executionTimeMs,
        affectedRows: result.affectedRows,
        error: result.error,
      },
    ];
  }, [result]);

  const currentResultSet: QueryResultSet | null = useMemo(() => {
    if (resultSets.length === 0) return null;
    if (typeof activeResultIndex === 'number' && resultSets[activeResultIndex]) {
      return resultSets[activeResultIndex];
    }
    return resultSets[0] || null;
  }, [resultSets, activeResultIndex]);

  // Filter and sort for the active table result
  const displayRows = useMemo(() => {
    if (!currentResultSet) return [];
    let rows = [...currentResultSet.rows];

    // Search filter
    if (searchFilter.trim()) {
      const query = searchFilter.toLowerCase();
      rows = rows.filter((row) =>
        Object.values(row).some((val) =>
          val !== null && val !== undefined && String(val).toLowerCase().includes(query)
        )
      );
    }

    // Sorting
    if (sortState.colName) {
      const col = sortState.colName;
      const isAsc = sortState.dir === 'ASC';
      rows.sort((a, b) => {
        const valA = a[col];
        const valB = b[col];
        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;
        if (typeof valA === 'number' && typeof valB === 'number') {
          return isAsc ? valA - valB : valB - valA;
        }
        return isAsc ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
      });
    }

    return rows;
  }, [currentResultSet, searchFilter, sortState]);

  const handleSortCol = (col: string) => {
    if (sortState.colName === col) {
      if (sortState.dir === 'ASC') {
        setSortState({ colName: col, dir: 'DESC' });
      } else {
        setSortState({ colName: undefined, dir: 'ASC' });
      }
    } else {
      setSortState({ colName: col, dir: 'ASC' });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: 'var(--bg-app)', overflow: 'hidden' }}>
      {/* Editor Control Toolbar */}
      <div style={{ padding: '6px 14px', background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={runQuery}
            disabled={isExecuting}
            title="Execute All Queries (Ctrl + Enter)"
          >
            <Play size={12} fill="#fff" />
            <span>{isExecuting ? 'Running...' : 'Run (Ctrl+Enter)'}</span>
          </button>

          <button className="btn btn-secondary btn-sm" onClick={handleFormatSql} title="Format SQL query">
            <AlignLeft size={12} />
            <span>Format</span>
          </button>

          <button className="btn btn-ghost btn-sm" onClick={handleClear} title="Clear Editor">
            <Trash2 size={12} />
            <span>Clear</span>
          </button>

          {schemas && schemas.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                marginLeft: '4px',
                paddingLeft: '8px',
                borderLeft: '1px solid var(--border-subtle)',
              }}
            >
              <Database size={12} color="var(--accent-primary)" />
              <select
                className="input-select"
                style={{
                  height: '24px',
                  padding: '1px 8px',
                  fontSize: '0.725rem',
                  maxWidth: '180px',
                  color: 'var(--text-primary)',
                  borderColor: 'rgba(94, 106, 210, 0.3)',
                }}
                value={selectedSchema}
                onChange={(e) => setSelectedSchema(e.target.value)}
                title="Active Database / Schema Context"
              >
                {schemas.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.725rem', color: 'var(--text-dim)' }}>
            <span>Limit:</span>
            <select
              className="input-select"
              style={{ width: '80px', height: '24px', padding: '1px 6px', fontSize: '0.725rem' }}
              value={maxRows}
              onChange={(e) => setMaxRows(parseInt(e.target.value, 10))}
            >
              <option value={500}>500</option>
              <option value={2000}>2,000</option>
              <option value={5000}>5,000</option>
              <option value={20000}>20,000</option>
            </select>
          </div>

          {currentResultSet && currentResultSet.rows.length > 0 && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() =>
                onOpenExportModal(
                  currentResultSet.tableName?.startsWith('Table Result') ? undefined : currentResultSet.tableName,
                  undefined,
                  currentResultSet.sqlSnippet || sql
                )
              }
              title="Export active table result"
            >
              <Download size={12} />
              <span>Export Table</span>
            </button>
          )}
        </div>
      </div>

      {/* Split View: Top (Monaco Editor), Bottom (Separated Table Results) */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        {/* Editor (35% height) */}
        <div style={{ height: '35%', borderBottom: '1px solid var(--border-subtle)', position: 'relative', background: 'var(--bg-sidebar)' }}>
          <Editor
            height="100%"
            defaultLanguage="sql"
            theme="vs-dark"
            value={sql}
            onChange={(val) => setSql(val || '')}
            onMount={handleEditorDidMount}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              tabSize: 2,
              wordWrap: 'on',
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 8, bottom: 8 },
              quickSuggestions: {
                other: true,
                comments: false,
                strings: false,
              },
              suggestOnTriggerCharacters: true,
              snippetSuggestions: 'top',
              acceptSuggestionOnEnter: 'on',
              tabCompletion: 'on',
              suggest: {
                showKeywords: true,
                showSnippets: true,
                showClasses: true,
                showFields: true,
                preview: true,
              },
            }}
          />
        </div>

        {/* Separated Table Results Area (65% height) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-app)', overflow: 'hidden' }}>
          {/* Table Results Tabs Bar (Separated Table by Table) */}
          <div
            style={{
              padding: '0 10px',
              background: 'var(--bg-sidebar)',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              height: '36px',
              gap: '6px',
            }}
          >
            {/* Table Result Tabs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', overflowX: 'auto', overflowY: 'hidden', flex: 1 }}>
              {resultSets.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-dim)', padding: '0 6px' }}>
                  <TableIcon size={13} />
                  <span>Table Results will appear here</span>
                </div>
              ) : (
                resultSets.map((rs, idx) => {
                  const isActive = activeResultIndex === idx;
                  return (
                    <button
                      key={rs.id || idx}
                      onClick={() => {
                        setActiveResultIndex(idx);
                        setSearchFilter('');
                        setSortState({ dir: 'ASC' });
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        height: '26px',
                        borderRadius: 'var(--radius-sm)',
                        background: isActive ? 'var(--bg-surface)' : 'transparent',
                        color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                        border: isActive ? '1px solid var(--border-subtle)' : '1px solid transparent',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        transition: 'all var(--transition-fast)',
                        boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                      }}
                    >
                      <TableIcon size={12} color={isActive ? 'var(--accent-primary)' : 'var(--text-dim)'} />
                      <span style={{ fontWeight: 600 }}>{rs.tableName || `Table ${idx + 1}`}</span>
                      {rs.error ? (
                        <span style={{ color: '#f87171', fontSize: '0.675rem' }}>[Error]</span>
                      ) : (
                        <span
                          style={{
                            fontSize: '0.675rem',
                            color: isActive ? 'var(--text-secondary)' : 'var(--text-dim)',
                            background: 'rgba(255, 255, 255, 0.04)',
                            padding: '1px 5px',
                            borderRadius: '3px',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {rs.rows.length > 0 ? rs.rows.length.toLocaleString() : rs.affectedRows !== undefined ? `${rs.affectedRows} affected` : '0'}
                        </span>
                      )}
                    </button>
                  );
                })
              )}

              {resultSets.length > 1 && (
                <button
                  onClick={() => setActiveResultIndex('all')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 10px',
                    height: '26px',
                    borderRadius: 'var(--radius-sm)',
                    background: activeResultIndex === 'all' ? 'var(--bg-surface)' : 'transparent',
                    color: activeResultIndex === 'all' ? 'var(--text-primary)' : 'var(--text-muted)',
                    border: activeResultIndex === 'all' ? '1px solid var(--border-subtle)' : '1px solid transparent',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all var(--transition-fast)',
                  }}
                  title="View all table results stacked together"
                >
                  <Layers size={12} />
                  <span>All Tables Stacked ({resultSets.length})</span>
                </button>
              )}
            </div>

            {/* In-table search & total execution time */}
            {result && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {currentResultSet && currentResultSet.rows.length > 0 && activeResultIndex !== 'all' && (
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Search size={11} color="var(--text-dim)" style={{ position: 'absolute', left: '7px' }} />
                    <input
                      type="text"
                      className="input-text"
                      placeholder="Filter table rows..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      style={{ width: '130px', height: '22px', fontSize: '0.7rem', paddingLeft: '22px', paddingRight: '6px' }}
                    />
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                  <Clock size={11} />
                  <span>{result.executionTimeMs} ms</span>
                </div>
              </div>
            )}
          </div>

          {/* Table Result Content Viewport */}
          <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
            {isExecuting && (
              <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                <div
                  style={{
                    display: 'inline-block',
                    width: '20px',
                    height: '20px',
                    border: '2px solid var(--accent-primary)',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                    marginBottom: '6px',
                  }}
                />
                <div>Executing query statements...</div>
              </div>
            )}

            {!isExecuting && !result && (
              <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                Press <strong>Run</strong> or <strong>Ctrl + Enter</strong> to execute your SQL query.
                <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center', gap: '8px' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => insertQuerySnippet('SELECT * FROM categories;\nSELECT * FROM products LIMIT 10;\nSELECT * FROM orders;')}
                    style={{ fontSize: '0.725rem' }}
                  >
                    <Sparkles size={11} color="#10b981" /> Load Multi-Table Sample Query
                  </button>
                </div>
              </div>
            )}

            {!isExecuting && activeResultIndex === 'all' && (
              /* Stacked View: Shows all tables in separate blocks */
              <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {resultSets.map((rs, idx) => (
                  <div
                    key={rs.id || idx}
                    style={{
                      background: 'var(--bg-surface)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        padding: '6px 12px',
                        background: 'var(--bg-sidebar)',
                        borderBottom: '1px solid var(--border-subtle)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <TableIcon size={13} color="var(--accent-primary)" />
                        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{rs.tableName || `Table ${idx + 1}`}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                          ({rs.rowCount} rows • {rs.executionTimeMs}ms)
                        </span>
                      </div>
                      {rs.rows.length > 0 && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => onOpenExportModal(rs.tableName, undefined, rs.sqlSnippet)}
                          style={{ height: '22px', fontSize: '0.7rem', padding: '2px 6px' }}
                        >
                          <Download size={11} /> Export
                        </button>
                      )}
                    </div>

                    {rs.error ? (
                      <div style={{ padding: '10px 14px', color: '#f87171', fontSize: '0.775rem' }}>{rs.error}</div>
                    ) : rs.rows.length === 0 ? (
                      <div style={{ padding: '16px', color: 'var(--text-dim)', fontSize: '0.75rem', textAlign: 'center' }}>
                        No records returned. ({rs.affectedRows || 0} rows affected)
                      </div>
                    ) : (
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th style={{ width: '36px', textAlign: 'center' }}>#</th>
                            {rs.columns.map((c) => (
                              <th key={c.name}>{c.name}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rs.rows.slice(0, 50).map((row, rIdx) => (
                            <tr key={rIdx}>
                              <td style={{ textAlign: 'center', color: 'var(--text-dim)', background: 'rgba(0,0,0,0.15)', fontSize: '0.75rem' }}>{rIdx + 1}</td>
                              {rs.columns.map((c) => {
                                const val = row[c.name];
                                return (
                                  <td key={c.name}>
                                    {val === null || val === undefined ? (
                                      <span className="cell-null">NULL</span>
                                    ) : typeof val === 'boolean' ? (
                                      <span style={{ color: val ? '#34d399' : '#f87171' }}>{String(val)}</span>
                                    ) : (
                                      String(val)
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!isExecuting && activeResultIndex !== 'all' && currentResultSet && (
              /* Single Table View */
              <>
                {currentResultSet.error ? (
                  <div style={{ margin: '14px', padding: '12px 14px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: '#f87171', fontSize: '0.8rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, marginBottom: '4px' }}>
                      <AlertCircle size={14} /> Execution Error:
                    </div>
                    <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', fontSize: '0.775rem' }}>
                      {currentResultSet.error}
                    </pre>
                  </div>
                ) : currentResultSet.rows.length === 0 ? (
                  <div style={{ padding: '28px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                    Statement executed successfully ({currentResultSet.affectedRows || 0} rows affected).
                  </div>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: '36px', textAlign: 'center' }}>#</th>
                        {currentResultSet.columns.map((c) => {
                          const isSorted = sortState.colName === c.name;
                          return (
                            <th key={c.name} onClick={() => handleSortCol(c.name)} style={{ cursor: 'pointer' }} title={`Sort by ${c.name}`}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                                <span>{c.name}</span>
                                {isSorted ? (
                                  sortState.dir === 'ASC' ? <ArrowUp size={11} color="var(--accent-primary)" /> : <ArrowDown size={11} color="var(--accent-primary)" />
                                ) : (
                                  <ArrowUpDown size={10} color="rgba(255,255,255,0.15)" />
                                )}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.length === 0 ? (
                        <tr>
                          <td colSpan={currentResultSet.columns.length + 1} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-dim)' }}>
                            No rows matched your filter query.
                          </td>
                        </tr>
                      ) : (
                        displayRows.map((row, rIdx) => (
                          <tr key={rIdx}>
                            <td style={{ textAlign: 'center', color: 'var(--text-dim)', background: 'rgba(0,0,0,0.15)', fontSize: '0.75rem' }}>{rIdx + 1}</td>
                            {currentResultSet.columns.map((c) => {
                              const val = row[c.name];
                              return (
                                <td key={c.name}>
                                  {val === null || val === undefined ? (
                                    <span className="cell-null">NULL</span>
                                  ) : typeof val === 'boolean' ? (
                                    <span style={{ color: val ? '#34d399' : '#f87171' }}>{String(val)}</span>
                                  ) : typeof val === 'object' ? (
                                    JSON.stringify(val)
                                  ) : (
                                    String(val)
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
