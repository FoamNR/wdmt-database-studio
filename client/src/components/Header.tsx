import React from 'react';
import {
  Plus,
  Terminal,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Server,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  Network,
} from 'lucide-react';
import type { ConnectionConfig } from '../types';

interface HeaderProps {
  activeConnection: ConnectionConfig | null;
  connections?: ConnectionConfig[];
  isSidebarCollapsed: boolean;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onToggleSidebar: () => void;
  onOpenConnectionModal: (conn?: ConnectionConfig) => void;
  onNewQueryTab: () => void;
  onRefreshSchema: () => void;
  onOpenERD?: (schema?: string) => void;
  onGenerateSampleDb?: () => void;
  isLoadingSample?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeConnection,
  connections = [],
  isSidebarCollapsed,
  theme = 'light',
  onToggleTheme,
  onToggleSidebar,
  onOpenConnectionModal,
  onNewQueryTab,
  onRefreshSchema,
  onOpenERD,
  onGenerateSampleDb,
  isLoadingSample = false,
}) => {
  const getBadgeClass = (type?: string) => {
    switch (type) {
      case 'postgres':
        return 'badge-postgres';
      case 'mysql':
        return 'badge-mysql';
      case 'sqlite':
        return 'badge-sqlite';
      case 'mssql':
        return 'badge-mssql';
      default:
        return 'badge-postgres';
    }
  };

  return (
    <header className="app-header">
      {/* Left section: Sidebar toggle & Breadcrumbs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          className="btn btn-ghost btn-sm btn-icon"
          onClick={onToggleSidebar}
          title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isSidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>

        <div className="brand-badge">
          <img
            src="/logo.png"
            alt="WDMT Studio Logo"
            style={{
              width: '26px',
              height: '26px',
              objectFit: 'contain',
              filter: 'drop-shadow(0 2px 5px rgba(94, 106, 210, 0.3))',
            }}
          />
          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
            WDMT Studio
          </span>
        </div>

        {activeConnection && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>/</span>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--bg-surface-elevated)',
                padding: '3px 9px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <span className="status-dot active" />
              <Server size={13} color="var(--text-muted)" />
              <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                {activeConnection.name}
              </span>
              <span className={`badge ${getBadgeClass(activeConnection.type)}`}>
                {activeConnection.type}
              </span>
              {activeConnection.sshTunnel?.enabled && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    fontSize: '0.675rem',
                    color: '#10b981',
                    background: 'rgba(16, 185, 129, 0.08)',
                    padding: '1px 5px',
                    borderRadius: 'var(--radius-xs)',
                    border: '1px solid rgba(16,185,129,0.2)',
                  }}
                >
                  <ShieldCheck size={11} /> SSH
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right section: Quick actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {connections.length === 0 && onGenerateSampleDb && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={onGenerateSampleDb}
            disabled={isLoadingSample}
            style={{ borderColor: 'rgba(16, 185, 129, 0.3)', color: '#34d399' }}
            title="Create SQLite sample database"
          >
            <Sparkles size={13} />
            {isLoadingSample ? 'Generating...' : 'Load Sample SQLite DB'}
          </button>
        )}

        <button
          className="btn btn-secondary btn-sm"
          onClick={onRefreshSchema}
          disabled={!activeConnection}
          title="Refresh Schemas & Tables"
        >
          <RefreshCw size={13} />
          <span>Refresh</span>
        </button>

        {onOpenERD && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => onOpenERD()}
            disabled={!activeConnection}
            title="Open Interactive ER Diagram / Schema Visualizer"
            style={{
              borderColor: 'rgba(56, 189, 248, 0.3)',
              color: '#38bdf8',
              background: 'rgba(56, 189, 248, 0.06)',
            }}
          >
            <Network size={13} color="#38bdf8" />
            <span>ER Diagram</span>
          </button>
        )}

        <button
          className="btn btn-primary btn-sm"
          onClick={onNewQueryTab}
          disabled={!activeConnection}
          title="New SQL Query (Ctrl + T)"
        >
          <Terminal size={13} />
          <span>New Query</span>
        </button>

        <button
          className="btn btn-secondary btn-sm"
          onClick={() => onOpenConnectionModal()}
          style={{
            background: 'linear-gradient(135deg, rgba(94, 106, 210, 0.15), rgba(139, 92, 246, 0.15))',
            borderColor: 'rgba(94, 106, 210, 0.3)',
          }}
        >
          <Plus size={13} color="var(--accent-primary)" />
          <span>Connection</span>
        </button>

        {onToggleTheme && (
          <button
            className="btn btn-ghost btn-sm btn-icon"
            onClick={onToggleTheme}
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            style={{ marginLeft: '2px', color: 'var(--text-secondary)' }}
          >
            {theme === 'light' ? <Moon size={15} /> : <Sun size={15} color="#fbbf24" />}
          </button>
        )}
      </div>
    </header>
  );
};
