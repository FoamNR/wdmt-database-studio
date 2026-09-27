import React, { useState, useEffect } from 'react';
import {
  X,
  Database,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  Lock,
  Zap,
} from 'lucide-react';
import type { ConnectionConfig, DatabaseType } from '../types';
import { ApiService } from '../services/api';

interface ConnectionModalProps {
  initialConfig?: ConnectionConfig | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (conn: ConnectionConfig) => void;
}

export const ConnectionModal: React.FC<ConnectionModalProps> = ({
  initialConfig,
  isOpen,
  onClose,
  onSaved,
}) => {
  const [name, setName] = useState('My Database');
  const [type, setType] = useState<DatabaseType>('postgres');
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState<number>(5432);
  const [user, setUser] = useState('postgres');
  const [password, setPassword] = useState('');
  const [database, setDatabase] = useState('postgres');
  const [filePath, setFilePath] = useState('./data/my_database.sqlite');
  const [ssl, setSsl] = useState(false);

  // SSH Tunnel state
  const [sshEnabled, setSshEnabled] = useState(false);
  const [sshHost, setSshHost] = useState('');
  const [sshPort, setSshPort] = useState(22);
  const [sshUser, setSshUser] = useState('');
  const [sshPassword, setSshPassword] = useState('');
  const [sshPrivateKey, setSshPrivateKey] = useState('');
  const [sshAuthType, setSshAuthType] = useState<'password' | 'key'>('password');

  // Test connection state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; version?: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (initialConfig) {
      setName(initialConfig.name);
      setType(initialConfig.type);
      setHost(initialConfig.host || 'localhost');
      setPort(initialConfig.port || getDefaultPort(initialConfig.type));
      setUser(initialConfig.user || '');
      setPassword(initialConfig.password || '');
      setDatabase(initialConfig.database || '');
      setFilePath(initialConfig.filePath || '');
      setSsl(initialConfig.ssl || false);

      if (initialConfig.sshTunnel) {
        setSshEnabled(initialConfig.sshTunnel.enabled);
        setSshHost(initialConfig.sshTunnel.host || '');
        setSshPort(initialConfig.sshTunnel.port || 22);
        setSshUser(initialConfig.sshTunnel.user || '');
        setSshPassword(initialConfig.sshTunnel.password || '');
        setSshPrivateKey(initialConfig.sshTunnel.privateKey || '');
        setSshAuthType(initialConfig.sshTunnel.privateKey ? 'key' : 'password');
      } else {
        setSshEnabled(false);
      }
    } else {
      setName('Local Postgres');
      setType('postgres');
      setHost('localhost');
      setPort(5432);
      setUser('postgres');
      setPassword('');
      setDatabase('postgres');
      setFilePath('./data/app.sqlite');
      setSsl(false);
      setSshEnabled(false);
    }
    setTestResult(null);
  }, [initialConfig, isOpen]);

  const getDefaultPort = (dbType: DatabaseType) => {
    switch (dbType) {
      case 'postgres':
        return 5432;
      case 'mysql':
        return 3306;
      case 'mssql':
        return 1433;
      default:
        return 5432;
    }
  };

  const handleTypeChange = (newType: DatabaseType) => {
    setType(newType);
    setPort(getDefaultPort(newType));
    if (!initialConfig) {
      if (newType === 'postgres') {
        setName('Local Postgres');
        setUser('postgres');
        setDatabase('postgres');
      } else if (newType === 'mysql') {
        setName('Local MySQL');
        setUser('root');
        setDatabase('mysql');
      } else if (newType === 'sqlite') {
        setName('Local SQLite');
        setFilePath('./data/app.sqlite');
      } else if (newType === 'mssql') {
        setName('SQL Server');
        setUser('sa');
        setDatabase('master');
      }
    }
  };

  const buildConfigPayload = (): Partial<ConnectionConfig> => {
    return {
      id: initialConfig?.id || undefined,
      name,
      type,
      host: type !== 'sqlite' ? host : undefined,
      port: type !== 'sqlite' ? port : undefined,
      user: type !== 'sqlite' ? user : undefined,
      password: type !== 'sqlite' ? password : undefined,
      database: type !== 'sqlite' ? database : undefined,
      filePath: type === 'sqlite' ? filePath : undefined,
      ssl,
      sshTunnel: sshEnabled
        ? {
            enabled: true,
            host: sshHost,
            port: sshPort,
            user: sshUser,
            password: sshAuthType === 'password' ? sshPassword : undefined,
            privateKey: sshAuthType === 'key' ? sshPrivateKey : undefined,
          }
        : undefined,
    };
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const payload = buildConfigPayload();
      const res = await ApiService.testConnection(payload);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Test failed' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = buildConfigPayload();
      const saved = await ApiService.saveConnection(payload);
      onSaved(saved);
      onClose();
    } catch (err: any) {
      alert(`Error saving connection: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '580px' }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={16} color="var(--accent-primary)" />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>
              {initialConfig ? 'Edit Connection Profile' : 'New Connection Profile'}
            </h3>
          </div>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
            {/* Database Engine Selector */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Database Engine
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                {(['postgres', 'mysql', 'sqlite', 'mssql'] as DatabaseType[]).map((dbType) => {
                  const isSelected = type === dbType;
                  return (
                    <button
                      key={dbType}
                      type="button"
                      onClick={() => handleTypeChange(dbType)}
                      style={{
                        padding: '8px 6px',
                        borderRadius: 'var(--radius-sm)',
                        border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                        background: isSelected ? 'rgba(94, 106, 210, 0.15)' : 'var(--bg-input)',
                        color: isSelected ? '#fff' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all var(--transition-fast)',
                        boxShadow: isSelected ? '0 0 10px rgba(94, 106, 210, 0.25)' : 'none',
                      }}
                    >
                      <HardDrive size={15} color={isSelected ? 'var(--accent-primary)' : 'var(--text-dim)'} />
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase' }}>
                        {dbType}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Profile Name */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '3px' }}>
                Connection Name
              </label>
              <input
                type="text"
                className="input-text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g. Production DB"
              />
            </div>

            {/* Fields for SQLite */}
            {type === 'sqlite' ? (
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '3px' }}>
                  Database File Path
                </label>
                <input
                  type="text"
                  className="input-text"
                  value={filePath}
                  onChange={(e) => setFilePath(e.target.value)}
                  required
                  placeholder="./data/app.sqlite or :memory:"
                />
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '3px' }}>
                  Tip: Use <code>:memory:</code> for an in-memory database.
                </div>
              </div>
            ) : (
              /* Fields for Postgres / MySQL / MSSQL */
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '3px' }}>
                      Host
                    </label>
                    <input
                      type="text"
                      className="input-text"
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      required
                      placeholder="127.0.0.1"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '3px' }}>
                      Port
                    </label>
                    <input
                      type="number"
                      className="input-text"
                      value={port}
                      onChange={(e) => setPort(parseInt(e.target.value, 10))}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '3px' }}>
                      Username
                    </label>
                    <input
                      type="text"
                      className="input-text"
                      value={user}
                      onChange={(e) => setUser(e.target.value)}
                      placeholder="user"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '3px' }}>
                      Password
                    </label>
                    <input
                      type="password"
                      className="input-text"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '3px' }}>
                    Database Name
                  </label>
                  <input
                    type="text"
                    className="input-text"
                    value={database}
                    onChange={(e) => setDatabase(e.target.value)}
                    placeholder="database"
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="checkbox"
                    id="sslCheck"
                    checked={ssl}
                    onChange={(e) => setSsl(e.target.checked)}
                  />
                  <label htmlFor="sslCheck" style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    Enable SSL / TLS Encryption
                  </label>
                </div>
              </>
            )}

            {/* SSH Bastion Tunnel Section */}
            {type !== 'sqlite' && (
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <ShieldCheck size={14} color="#10b981" />
                    <span style={{ fontSize: '0.775rem', fontWeight: 600, color: 'var(--text-primary)' }}>SSH Bastion Tunnel</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={sshEnabled}
                    onChange={(e) => setSshEnabled(e.target.checked)}
                  />
                </div>

                {sshEnabled && (
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: 'var(--radius-sm)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '2px' }}>
                          SSH Host / IP
                        </label>
                        <input
                          type="text"
                          className="input-text"
                          value={sshHost}
                          onChange={(e) => setSshHost(e.target.value)}
                          placeholder="bastion.host"
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '2px' }}>
                          SSH Port
                        </label>
                        <input
                          type="number"
                          className="input-text"
                          value={sshPort}
                          onChange={(e) => setSshPort(parseInt(e.target.value, 10))}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '2px' }}>
                          SSH User
                        </label>
                        <input
                          type="text"
                          className="input-text"
                          value={sshUser}
                          onChange={(e) => setSshUser(e.target.value)}
                          placeholder="ubuntu"
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '2px' }}>
                          Auth Type
                        </label>
                        <select
                          className="input-select"
                          value={sshAuthType}
                          onChange={(e) => setSshAuthType(e.target.value as any)}
                        >
                          <option value="password">Password</option>
                          <option value="key">Private Key</option>
                        </select>
                      </div>
                    </div>

                    {sshAuthType === 'password' ? (
                      <div>
                        <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '2px' }}>
                          SSH Password
                        </label>
                        <input
                          type="password"
                          className="input-text"
                          value={sshPassword}
                          onChange={(e) => setSshPassword(e.target.value)}
                          placeholder="••••••••"
                        />
                      </div>
                    ) : (
                      <div>
                        <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '2px' }}>
                          Private Key (PEM)
                        </label>
                        <textarea
                          className="input-textarea"
                          rows={3}
                          value={sshPrivateKey}
                          onChange={(e) => setSshPrivateKey(e.target.value)}
                          placeholder="-----BEGIN RSA PRIVATE KEY-----"
                          style={{ fontFamily: 'var(--font-mono)', fontSize: '0.725rem' }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Test Connection Feedback */}
            {testResult && (
              <div
                style={{
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: testResult.success ? 'var(--success-bg)' : 'var(--danger-bg)',
                  border: `1px solid ${testResult.success ? 'var(--success-border)' : 'var(--danger-border)'}`,
                  color: testResult.success ? '#34d399' : '#f87171',
                }}
              >
                {testResult.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <strong>{testResult.success ? 'Connected: ' : 'Failed: '}</strong>
                  {testResult.message}
                  {testResult.version && <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{testResult.version}</div>}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleTest}
              disabled={isTesting}
            >
              <Zap size={13} />
              <span>{isTesting ? 'Testing...' : 'Test'}</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSaving}
            >
              <Lock size={13} />
              <span>{isSaving ? 'Saving...' : 'Save & Connect'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
