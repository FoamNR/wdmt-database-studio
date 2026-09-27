import React, { useState, useEffect } from 'react';
import {
  Key,
  Link,
  Layers,
  FileCode,
  Copy,
  Check,
  RefreshCw,
  AlertCircle,
  Table as TableIcon,
} from 'lucide-react';
import type { TableStructure } from '../../types';
import { ApiService } from '../../services/api';

interface TableStructureViewProps {
  connectionId: string;
  tableName: string;
  schema?: string;
}

export const TableStructureView: React.FC<TableStructureViewProps> = ({
  connectionId,
  tableName,
  schema,
}) => {
  const [structure, setStructure] = useState<TableStructure | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'columns' | 'foreignKeys' | 'indexes' | 'ddl'>('columns');
  const [copied, setCopied] = useState(false);

  const loadStructure = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await ApiService.getTableStructure(connectionId, tableName, schema);
      setStructure(res);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch table structure');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStructure();
  }, [connectionId, tableName, schema]);

  const copyDDL = () => {
    if (structure?.ddl) {
      navigator.clipboard.writeText(structure.ddl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: 'var(--bg-app)', overflow: 'hidden' }}>
      {/* Header bar */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-sidebar)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <TableIcon size={14} color="var(--accent-primary)" />
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {schema ? `${schema}.${tableName}` : tableName} <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>— Schema & DDL</span>
          </span>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadStructure} disabled={isLoading}>
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Sub-tabs Segmented Control */}
      <div style={{ display: 'flex', gap: '4px', padding: '8px 16px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-sidebar)' }}>
        <button
          className={`btn btn-sm ${activeTab === 'columns' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('columns')}
        >
          <Layers size={13} /> Columns ({structure?.columns.length || 0})
        </button>
        <button
          className={`btn btn-sm ${activeTab === 'foreignKeys' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('foreignKeys')}
        >
          <Link size={13} /> Foreign Keys ({structure?.foreignKeys.length || 0})
        </button>
        <button
          className={`btn btn-sm ${activeTab === 'indexes' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('indexes')}
        >
          <Key size={13} /> Indexes ({structure?.indexes.length || 0})
        </button>
        <button
          className={`btn btn-sm ${activeTab === 'ddl' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('ddl')}
        >
          <FileCode size={13} /> DDL / SQL
        </button>
      </div>

      {/* Error alert */}
      {error && (
        <div style={{ margin: '12px 16px', padding: '8px 12px', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--danger-border)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.775rem' }}>
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {isLoading && (
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
            Loading structure metadata...
          </div>
        )}

        {!isLoading && structure && activeTab === 'columns' && (
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: '36px', textAlign: 'center' }}>#</th>
                  <th>Column Name</th>
                  <th>Data Type</th>
                  <th>Nullable</th>
                  <th>Key / Identity</th>
                  <th>Auto Increment</th>
                  <th>Default Value</th>
                </tr>
              </thead>
              <tbody>
                {structure.columns.map((col, idx) => (
                  <tr key={col.name}>
                    <td style={{ textAlign: 'center', color: 'var(--text-dim)' }}>{idx + 1}</td>
                    <td style={{ fontWeight: 500, color: col.isPrimaryKey ? '#fbbf24' : 'var(--text-primary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        {col.isPrimaryKey && <Key size={12} color="#fbbf24" />}
                        {col.name}
                      </div>
                    </td>
                    <td style={{ color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>{col.type}</td>
                    <td>
                      {col.nullable ? (
                        <span style={{ color: 'var(--text-dim)' }}>YES</span>
                      ) : (
                        <span style={{ color: '#f43f5e', fontWeight: 500 }}>NOT NULL</span>
                      )}
                    </td>
                    <td>
                      {col.isPrimaryKey ? (
                        <span style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#fbbf24', padding: '1px 6px', borderRadius: '3px', fontSize: '0.675rem', fontWeight: 600 }}>
                          PRIMARY KEY
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-dim)' }}>-</span>
                      )}
                    </td>
                    <td>
                      {col.isAutoIncrement ? (
                        <span style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#34d399', padding: '1px 6px', borderRadius: '3px', fontSize: '0.675rem', fontWeight: 600 }}>
                          AUTO_INCREMENT
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-dim)' }}>-</span>
                      )}
                    </td>
                    <td style={{ color: col.defaultValue ? '#34d399' : 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                      {col.defaultValue ?? 'NULL'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && structure && activeTab === 'foreignKeys' && (
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
            {structure.foreignKeys.length === 0 ? (
              <div style={{ padding: '28px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                No foreign keys defined for this table.
              </div>
            ) : (
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Referenced Table</th>
                    <th>Referenced Column</th>
                    <th>Referenced Schema</th>
                  </tr>
                </thead>
                <tbody>
                  {structure.foreignKeys.map((fk, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 500, color: '#818cf8' }}>{fk.column}</td>
                      <td style={{ color: '#34d399' }}>{fk.referencedTable}</td>
                      <td style={{ color: '#38bdf8' }}>{fk.referencedColumn}</td>
                      <td style={{ color: 'var(--text-dim)' }}>{fk.referencedSchema || 'default'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {!isLoading && structure && activeTab === 'indexes' && (
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
            {structure.indexes.length === 0 ? (
              <div style={{ padding: '28px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                No explicit indexes found.
              </div>
            ) : (
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Index Name</th>
                    <th>Indexed Columns</th>
                    <th>Unique</th>
                    <th>Primary</th>
                  </tr>
                </thead>
                <tbody>
                  {structure.indexes.map((idx, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 500 }}>{idx.name}</td>
                      <td style={{ color: '#38bdf8' }}>{idx.columns.join(', ')}</td>
                      <td>
                        {idx.isUnique ? (
                          <span style={{ color: '#34d399', fontWeight: 600 }}>UNIQUE</span>
                        ) : (
                          <span style={{ color: 'var(--text-dim)' }}>NO</span>
                        )}
                      </td>
                      <td>
                        {idx.isPrimary ? (
                          <span style={{ color: '#fbbf24', fontWeight: 600 }}>YES</span>
                        ) : (
                          <span style={{ color: 'var(--text-dim)' }}>NO</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {!isLoading && structure && activeTab === 'ddl' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
              <button className="btn btn-secondary btn-sm" onClick={copyDDL}>
                {copied ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                {copied ? 'Copied to Clipboard!' : 'Copy SQL DDL'}
              </button>
            </div>
            <pre
              style={{
                background: 'var(--bg-surface)',
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                color: '#38bdf8',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8125rem',
                lineHeight: '1.6',
                overflowX: 'auto',
              }}
            >
              {structure.ddl || '-- No DDL available'}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
