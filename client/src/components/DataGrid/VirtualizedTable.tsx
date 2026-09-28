import React, { useState, useEffect, useMemo } from 'react';
import {
  RefreshCw,
  Plus,
  Trash2,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  Check,
  Key,
  Database,
  ChevronLeft,
  ChevronRight,
  X,
  AlertCircle,
} from 'lucide-react';
import type { PaginationOptions, QueryResult, TableStructure } from '../../types';
import { ApiService } from '../../services/api';

interface VirtualizedTableProps {
  connectionId: string;
  tableName: string;
  schema?: string;
  onOpenExportModal: (table: string, schema?: string) => void;
  onRefreshSchema?: () => void;
}

export const VirtualizedTable: React.FC<VirtualizedTableProps> = ({
  connectionId,
  tableName,
  schema,
  onOpenExportModal,
  onRefreshSchema,
}) => {
  const [data, setData] = useState<QueryResult | null>(null);
  const [structure, setStructure] = useState<TableStructure | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pagination & Filter State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortBy, setSortBy] = useState<string | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC');
  const [filterColumn, setFilterColumn] = useState<string>('');
  const [filterOperator, setFilterOperator] = useState<any>('contains');
  const [filterValue, setFilterValue] = useState<string>('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Inline Cell Editing State
  const [editingCell, setEditingCell] = useState<{
    rowIndex: number;
    colName: string;
    initialValue: any;
    currentValue: string;
  } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Add Row Modal State
  const [isAddRowOpen, setIsAddRowOpen] = useState(false);
  const [newRowData, setNewRowData] = useState<Record<string, any>>({});
  const [isInserting, setIsInserting] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  useEffect(() => {
    let isMounted = true;
    ApiService.getTableStructure(connectionId, tableName, schema)
      .then((res) => {
        if (isMounted) setStructure(res);
      })
      .catch((err) => console.error('Failed to load table structure:', err));
    return () => {
      isMounted = false;
    };
  }, [connectionId, tableName, schema]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const opts: PaginationOptions = {
        page,
        pageSize,
        sortBy,
        sortOrder,
        filterColumn: filterColumn || undefined,
        filterOperator: filterColumn ? filterOperator : undefined,
        filterValue: filterColumn ? filterValue : undefined,
      };
      const res = await ApiService.getTableData(connectionId, tableName, schema, opts);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch table data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [connectionId, tableName, schema, page, pageSize, sortBy, sortOrder]);

  const handleSort = (colName: string) => {
    if (sortBy === colName) {
      if (sortOrder === 'ASC') {
        setSortOrder('DESC');
      } else {
        setSortBy(undefined);
        setSortOrder('ASC');
      }
    } else {
      setSortBy(colName);
      setSortOrder('ASC');
    }
    setPage(1);
  };

  const handleApplyFilter = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadData();
  };

  const handleClearFilter = () => {
    setFilterColumn('');
    setFilterValue('');
    setPage(1);
    setIsFilterOpen(false);
  };

  const primaryKeys = useMemo(() => {
    if (structure?.primaryKeys && structure.primaryKeys.length > 0) {
      return structure.primaryKeys;
    }
    const pks = (data?.columns || []).filter((c) => c.isPrimaryKey).map((c) => c.name);
    if (pks.length > 0) return pks;
    if (data?.columns.some((c) => c.name.toLowerCase() === 'id')) {
      return ['id'];
    }
    return [];
  }, [structure, data]);

  const startEditCell = (rowIndex: number, colName: string, val: any) => {
    setEditingCell({
      rowIndex,
      colName,
      initialValue: val,
      currentValue: val === null || val === undefined ? '' : String(val),
    });
  };

  const saveCell = async () => {
    if (!editingCell || !data) return;
    const { rowIndex, colName, currentValue, initialValue } = editingCell;

    if (String(initialValue) === currentValue) {
      setEditingCell(null);
      return;
    }

    const row = data.rows[rowIndex];
    if (!row) return;

    if (primaryKeys.length === 0) {
      alert('Cannot update cell: Table has no primary key defined.');
      setEditingCell(null);
      return;
    }

    const pkMap: Record<string, any> = {};
    primaryKeys.forEach((pk) => {
      pkMap[pk] = row[pk];
    });

    try {
      await ApiService.updateCell(connectionId, tableName, schema, pkMap, colName, currentValue);
      const updatedRows = [...data.rows];
      updatedRows[rowIndex] = {
        ...updatedRows[rowIndex],
        [colName]: currentValue,
      };
      setData({ ...data, rows: updatedRows });
      showToast(`Updated ${colName}`);
    } catch (err: any) {
      alert(`Update failed: ${err.message}`);
    } finally {
      setEditingCell(null);
    }
  };

  const handleDeleteRow = async (row: Record<string, any>) => {
    if (primaryKeys.length === 0) {
      alert('Cannot delete row: Table has no primary key defined.');
      return;
    }
    if (!confirm('Are you sure you want to delete this row?')) return;

    const pkMap: Record<string, any> = {};
    primaryKeys.forEach((pk) => {
      pkMap[pk] = row[pk];
    });

    try {
      await ApiService.deleteRow(connectionId, tableName, schema, pkMap);
      showToast('Row deleted');
      loadData();
      onRefreshSchema?.();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleInsertRow = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsInserting(true);
    try {
      const payload: Record<string, any> = {};
      Object.entries(newRowData).forEach(([k, v]) => {
        if (v !== undefined && v !== '') {
          payload[k] = v;
        }
      });
      await ApiService.insertRow(connectionId, tableName, schema, payload);
      showToast('Row inserted');
      setIsAddRowOpen(false);
      setNewRowData({});
      loadData();
      onRefreshSchema?.();
    } catch (err: any) {
      alert(`Insert failed: ${err.message}`);
    } finally {
      setIsInserting(false);
    }
  };

  const columns = data?.columns || structure?.columns || [];
  const totalPages = data?.totalCount ? Math.ceil(data.totalCount / pageSize) : 1;

  return (
    <div className="data-grid-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'absolute',
            bottom: '50px',
            right: '20px',
            background: 'var(--bg-surface-elevated)',
            color: '#34d399',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            padding: '6px 12px',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 100,
            fontSize: '0.775rem',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            animation: 'fadeIn 0.15s ease-out',
          }}
        >
          <Check size={13} /> {toastMessage}
        </div>
      )}

      {/* Toolbar */}
      <div className="data-grid-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.825rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-primary)' }}>
            <Database size={14} color="var(--accent-primary)" />
            {schema ? `${schema}.${tableName}` : tableName}
          </span>
          {data?.totalCount !== undefined && (
            <span
              style={{
                fontSize: '0.7rem',
                color: 'var(--text-dim)',
                background: 'rgba(255, 255, 255, 0.04)',
                padding: '2px 6px',
                borderRadius: 'var(--radius-xs)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {data.totalCount.toLocaleString()} rows
            </span>
          )}
          {data?.executionTimeMs !== undefined && (
            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              {data.executionTimeMs}ms
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <button
            className={`btn btn-sm ${isFilterOpen ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setIsFilterOpen(!isFilterOpen)}
          >
            <Filter size={12} />
            Filter
          </button>

          <button className="btn btn-secondary btn-sm" onClick={loadData} disabled={isLoading}>
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>

          <button className="btn btn-secondary btn-sm" onClick={() => setIsAddRowOpen(true)}>
            <Plus size={12} />
            Add Row
          </button>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => onOpenExportModal(tableName, schema)}
          >
            <Download size={12} />
            Export
          </button>
        </div>
      </div>

      {/* Filter Bar Dropdown */}
      {isFilterOpen && (
        <form
          onSubmit={handleApplyFilter}
          style={{
            padding: '8px 14px',
            background: 'var(--bg-sidebar)',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.775rem',
          }}
        >
          <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>WHERE</span>
          <select
            className="input-select"
            style={{ width: '160px', height: '28px', fontSize: '0.775rem', padding: '2px 8px' }}
            value={filterColumn}
            onChange={(e) => setFilterColumn(e.target.value)}
          >
            <option value="">Select column...</option>
            {columns.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.type})
              </option>
            ))}
          </select>

          <select
            className="input-select"
            style={{ width: '110px', height: '28px', fontSize: '0.775rem', padding: '2px 8px' }}
            value={filterOperator}
            onChange={(e) => setFilterOperator(e.target.value as any)}
          >
            <option value="contains">contains</option>
            <option value="equals">=</option>
            <option value="gt">&gt;</option>
            <option value="lt">&lt;</option>
            <option value="null">IS NULL</option>
            <option value="notNull">IS NOT NULL</option>
          </select>

          {filterOperator !== 'null' && filterOperator !== 'notNull' && (
            <input
              type="text"
              className="input-text"
              placeholder="Value..."
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
              style={{ width: '180px', height: '28px', fontSize: '0.775rem' }}
            />
          )}

          <button type="submit" className="btn btn-primary btn-sm">
            Apply
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleClearFilter}>
            Clear
          </button>
        </form>
      )}

      {/* Error Message */}
      {error && (
        <div style={{ padding: '8px 14px', background: 'var(--danger-bg)', color: 'var(--danger)', borderBottom: '1px solid var(--danger-border)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.775rem' }}>
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Main Table Viewport */}
      <div className="table-viewport">
        {isLoading && !data && (
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
            Loading records...
          </div>
        )}

        {data && (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '36px', textAlign: 'center' }}>#</th>
                <th style={{ width: '36px', textAlign: 'center' }}></th>
                {columns.map((col) => {
                  const isPk = primaryKeys.includes(col.name);
                  const isSorted = sortBy === col.name;

                  return (
                    <th
                      key={col.name}
                      onClick={() => handleSort(col.name)}
                      style={{ cursor: 'pointer' }}
                      title={`Sort by ${col.name}`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {isPk && <Key size={11} color="#fbbf24" />}
                          <span style={{ color: isPk ? '#fbbf24' : 'inherit' }}>{col.name}</span>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 400 }}>
                            {col.type}
                          </span>
                        </div>
                        {isSorted ? (
                          sortOrder === 'ASC' ? <ArrowUp size={11} color="var(--accent-primary)" /> : <ArrowDown size={11} color="var(--accent-primary)" />
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
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 2} style={{ textAlign: 'center', padding: '28px', color: 'var(--text-dim)' }}>
                    No records found matching query.
                  </td>
                </tr>
              ) : (
                data.rows.map((row, rIdx) => (
                  <tr key={rIdx}>
                    <td style={{ textAlign: 'center', color: 'var(--text-dim)', background: 'rgba(0,0,0,0.15)', fontSize: '0.75rem' }}>
                      {(page - 1) * pageSize + rIdx + 1}
                    </td>
                    <td style={{ textAlign: 'center', padding: '2px' }}>
                      <button
                        className="btn btn-ghost btn-sm btn-icon"
                        onClick={() => handleDeleteRow(row)}
                        title="Delete Row"
                        style={{ color: 'var(--danger)', height: '22px', width: '22px', padding: '2px' }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                    {columns.map((col) => {
                      const val = row[col.name];
                      const isEditingThis = editingCell?.rowIndex === rIdx && editingCell?.colName === col.name;
                      const isPk = primaryKeys.includes(col.name);

                      if (isEditingThis) {
                        return (
                          <td key={col.name} className="cell-editing">
                            <input
                              autoFocus
                              type="text"
                              value={editingCell.currentValue}
                              onChange={(e) =>
                                setEditingCell({ ...editingCell, currentValue: e.target.value })
                              }
                              onBlur={saveCell}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveCell();
                                if (e.key === 'Escape') setEditingCell(null);
                              }}
                            />
                          </td>
                        );
                      }

                      return (
                        <td
                          key={col.name}
                          onDoubleClick={() => startEditCell(rIdx, col.name, val)}
                          title="Double-click to inline edit"
                          style={{ cursor: 'cell' }}
                        >
                          {val === null || val === undefined ? (
                            <span className="cell-null">NULL</span>
                          ) : typeof val === 'boolean' ? (
                            <span style={{ color: val ? '#34d399' : '#f87171' }}>{String(val)}</span>
                          ) : typeof val === 'object' ? (
                            JSON.stringify(val)
                          ) : (
                            <span className={isPk ? 'cell-pk' : ''}>{String(val)}</span>
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
      </div>

      {/* Pagination Footer */}
      <div className="pagination-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>Page {page} of {Math.max(totalPages, 1)}</span>
          <select
            className="input-select"
            style={{ width: '95px', height: '24px', padding: '1px 6px', fontSize: '0.725rem' }}
            value={pageSize}
            onChange={(e) => {
              setPageSize(parseInt(e.target.value, 10));
              setPage(1);
            }}
          >
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
            <option value={500}>500 / page</option>
            <option value={1000}>1000 / page</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1 || isLoading}
            style={{ height: '24px', padding: '2px 6px', fontSize: '0.725rem' }}
          >
            <ChevronLeft size={13} /> Prev
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages || isLoading}
            style={{ height: '24px', padding: '2px 6px', fontSize: '0.725rem' }}
          >
            Next <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* Add Row Modal */}
      {isAddRowOpen && (
        <div className="modal-overlay" onClick={() => setIsAddRowOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600 }}>Insert Row: {tableName}</h3>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setIsAddRowOpen(false)}>
                <X size={15} />
              </button>
            </div>
            <form onSubmit={handleInsertRow}>
              <div className="modal-body" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
                {columns.map((col) => (
                  <div key={col.name}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '3px' }}>
                      {col.name} <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>({col.type})</span>
                      {col.isPrimaryKey && <span style={{ color: '#fbbf24', marginLeft: '4px', fontSize: '0.675rem', fontWeight: 600 }}>[PK]</span>}
                      {col.isAutoIncrement && <span style={{ color: '#34d399', marginLeft: '4px', fontSize: '0.675rem', fontWeight: 600 }}>[Auto Increment]</span>}
                    </label>
                    <input
                      type="text"
                      className="input-text"
                      value={newRowData[col.name] ?? ''}
                      onChange={(e) => setNewRowData({ ...newRowData, [col.name]: e.target.value })}
                      placeholder={col.isAutoIncrement ? '(Auto-generated / Leave blank)' : col.defaultValue ? `Default: ${col.defaultValue}` : 'NULL / value'}
                    />
                  </div>
                ))}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setIsAddRowOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isInserting}>
                  {isInserting ? 'Inserting...' : 'Insert Row'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
