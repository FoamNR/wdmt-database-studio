import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { ConnectionConfig } from '../types.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORAGE_FILE = path.join(DATA_DIR, 'connections.json');
const SECRET_KEY_FILE = path.join(DATA_DIR, '.vault_key');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getOrCreateVaultKey(): Buffer {
  ensureDataDir();
  if (fs.existsSync(SECRET_KEY_FILE)) {
    return fs.readFileSync(SECRET_KEY_FILE);
  }
  // Generate a random 32-byte key for AES-256-GCM
  const key = crypto.randomBytes(32);
  fs.writeFileSync(SECRET_KEY_FILE, key, { mode: 0o600 });
  return key;
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export function encrypt(text: string): string {
  if (!text) return '';
  const key = getOrCreateVaultKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decrypt(cipherText: string): string {
  if (!cipherText) return '';
  try {
    const key = getOrCreateVaultKey();
    const data = Buffer.from(cipherText, 'base64');
    if (data.length < IV_LENGTH + AUTH_TAG_LENGTH) return '';
    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted) + decipher.final('utf8');
  } catch (err) {
    console.error('Decryption failed:', err);
    return '';
  }
}

export class ConnectionVault {
  private static sanitizeForStorage(config: ConnectionConfig): ConnectionConfig {
    const cloned = JSON.parse(JSON.stringify(config)) as ConnectionConfig;
    if (cloned.password) {
      cloned.password = `ENC:${encrypt(cloned.password)}`;
    }
    if (cloned.sshTunnel?.password) {
      cloned.sshTunnel.password = `ENC:${encrypt(cloned.sshTunnel.password)}`;
    }
    if (cloned.sshTunnel?.privateKey) {
      cloned.sshTunnel.privateKey = `ENC:${encrypt(cloned.sshTunnel.privateKey)}`;
    }
    if (cloned.sshTunnel?.passphrase) {
      cloned.sshTunnel.passphrase = `ENC:${encrypt(cloned.sshTunnel.passphrase)}`;
    }
    return cloned;
  }

  private static desanitizeFromStorage(config: ConnectionConfig): ConnectionConfig {
    const cloned = JSON.parse(JSON.stringify(config)) as ConnectionConfig;
    if (cloned.password && cloned.password.startsWith('ENC:')) {
      cloned.password = decrypt(cloned.password.substring(4));
    }
    if (cloned.sshTunnel?.password && cloned.sshTunnel.password.startsWith('ENC:')) {
      cloned.sshTunnel.password = decrypt(cloned.sshTunnel.password.substring(4));
    }
    if (cloned.sshTunnel?.privateKey && cloned.sshTunnel.privateKey.startsWith('ENC:')) {
      cloned.sshTunnel.privateKey = decrypt(cloned.sshTunnel.privateKey.substring(4));
    }
    if (cloned.sshTunnel?.passphrase && cloned.sshTunnel.passphrase.startsWith('ENC:')) {
      cloned.sshTunnel.passphrase = decrypt(cloned.sshTunnel.passphrase.substring(4));
    }
    return cloned;
  }

  public static listConnections(includeSecrets: boolean = false): ConnectionConfig[] {
    ensureDataDir();
    if (!fs.existsSync(STORAGE_FILE)) {
      return [];
    }
    try {
      const raw = fs.readFileSync(STORAGE_FILE, 'utf8');
      const list = JSON.parse(raw) as ConnectionConfig[];
      return list.map((conn) => {
        const full = this.desanitizeFromStorage(conn);
        if (!includeSecrets) {
          // Mask sensitive fields
          return {
            ...full,
            password: full.password ? '••••••••' : undefined,
            sshTunnel: full.sshTunnel
              ? {
                  ...full.sshTunnel,
                  password: full.sshTunnel.password ? '••••••••' : undefined,
                  privateKey: full.sshTunnel.privateKey ? '[CONFIGURED]' : undefined,
                }
              : undefined,
          };
        }
        return full;
      });
    } catch (err) {
      console.error('Error reading connections vault:', err);
      return [];
    }
  }

  public static getConnectionById(id: string, includeSecrets: boolean = false): ConnectionConfig | null {
    const all = this.listConnections(true);
    const conn = all.find((c) => c.id === id);
    if (!conn) return null;
    if (!includeSecrets) {
      return {
        ...conn,
        password: conn.password ? '••••••••' : undefined,
        sshTunnel: conn.sshTunnel
          ? {
              ...conn.sshTunnel,
              password: conn.sshTunnel.password ? '••••••••' : undefined,
              privateKey: conn.sshTunnel.privateKey ? '[CONFIGURED]' : undefined,
            }
          : undefined,
      };
    }
    return conn;
  }

  public static saveConnection(conn: ConnectionConfig): ConnectionConfig {
    ensureDataDir();
    const existing = this.listConnections(true);
    const now = new Date().toISOString();

    let target = { ...conn };
    if (!target.id) {
      target.id = crypto.randomUUID();
      target.createdAt = now;
      target.updatedAt = now;
    } else {
      target.updatedAt = now;
      // If password is masked '••••••••', keep existing saved password
      const old = existing.find((c) => c.id === target.id);
      if (old) {
        if (target.password === '••••••••' || target.password === undefined) {
          target.password = old.password;
        }
        if (target.sshTunnel && old.sshTunnel) {
          if (target.sshTunnel.password === '••••••••') {
            target.sshTunnel.password = old.sshTunnel.password;
          }
          if (target.sshTunnel.privateKey === '[CONFIGURED]') {
            target.sshTunnel.privateKey = old.sshTunnel.privateKey;
          }
        }
      }
    }

    const index = existing.findIndex((c) => c.id === target.id);
    if (index >= 0) {
      existing[index] = target;
    } else {
      existing.push(target);
    }

    const toStore = existing.map((c) => this.sanitizeForStorage(c));
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(toStore, null, 2), 'utf8');

    return this.getConnectionById(target.id, false)!;
  }

  public static deleteConnection(id: string): boolean {
    ensureDataDir();
    const existing = this.listConnections(true);
    const filtered = existing.filter((c) => c.id !== id);
    if (filtered.length === existing.length) return false;

    const toStore = filtered.map((c) => this.sanitizeForStorage(c));
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(toStore, null, 2), 'utf8');
    return true;
  }
}
