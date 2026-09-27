import React, { useState } from 'react';
import { X, Download, FileSpreadsheet, FileJson, FileCode } from 'lucide-react';
import { ApiService } from '../services/api';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
  tableName?: string;
  schema?: string;
  sqlQuery?: string;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  connectionId,
  tableName,
  schema,
  sqlQuery,
}) => {
  const [format, setFormat] = useState<'csv' | 'json' | 'sql'>('csv');

  if (!isOpen) return null;

  const handleDownload = () => {
    const url = ApiService.getExportUrl(connectionId, {
      table: tableName,
      schema,
      format,
      sql: sqlQuery,
    });
    window.open(url, '_blank');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Download size={16} color="var(--accent-primary)" />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>
              Export {tableName ? `Table: ${tableName}` : 'Query Results'}
            </h3>
          </div>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        <div className="modal-body">
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Choose Format
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setFormat('csv')}
              style={{
                padding: '14px 10px',
                borderRadius: 'var(--radius-sm)',
                border: format === 'csv' ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                background: format === 'csv' ? 'rgba(94, 106, 210, 0.15)' : 'var(--bg-input)',
                color: format === 'csv' ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                transition: 'all var(--transition-fast)',
                boxShadow: format === 'csv' ? '0 0 12px rgba(94, 106, 210, 0.25)' : 'none',
              }}
            >
              <FileSpreadsheet size={20} color="#10b981" />
              <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>CSV</span>
              <span style={{ fontSize: '0.675rem', color: 'var(--text-dim)' }}>Spreadsheets</span>
            </button>

            <button
              type="button"
              onClick={() => setFormat('json')}
              style={{
                padding: '14px 10px',
                borderRadius: 'var(--radius-sm)',
                border: format === 'json' ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                background: format === 'json' ? 'rgba(94, 106, 210, 0.15)' : 'var(--bg-input)',
                color: format === 'json' ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                transition: 'all var(--transition-fast)',
                boxShadow: format === 'json' ? '0 0 12px rgba(94, 106, 210, 0.25)' : 'none',
              }}
            >
              <FileJson size={20} color="#38bdf8" />
              <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>JSON</span>
              <span style={{ fontSize: '0.675rem', color: 'var(--text-dim)' }}>Raw records</span>
            </button>

            <button
              type="button"
              onClick={() => setFormat('sql')}
              style={{
                padding: '14px 10px',
                borderRadius: 'var(--radius-sm)',
                border: format === 'sql' ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                background: format === 'sql' ? 'rgba(94, 106, 210, 0.15)' : 'var(--bg-input)',
                color: format === 'sql' ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                transition: 'all var(--transition-fast)',
                boxShadow: format === 'sql' ? '0 0 12px rgba(94, 106, 210, 0.25)' : 'none',
              }}
            >
              <FileCode size={20} color="#fbbf24" />
              <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>SQL</span>
              <span style={{ fontSize: '0.675rem', color: 'var(--text-dim)' }}>INSERT dump</span>
            </button>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleDownload}>
            <Download size={13} /> Download {format.toUpperCase()}
          </button>
        </div>
      </div>
    </div>
  );
};
