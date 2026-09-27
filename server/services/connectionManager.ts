import { ConnectionVault } from '../vault/storage.js';
import { DriverFactory } from '../drivers/factory.js';
import { IDatabaseDriver } from '../drivers/interface.js';

interface ActiveSession {
  driver: IDatabaseDriver;
  lastUsed: number;
}

export class ConnectionManager {
  private static sessions: Map<string, ActiveSession> = new Map();
  private static cleanupInterval: NodeJS.Timeout | null = null;

  private static startCleanupTimer() {
    if (this.cleanupInterval) return;
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const IDLE_TIMEOUT = 1000 * 60 * 15; // 15 minutes idle timeout

      for (const [id, session] of this.sessions.entries()) {
        if (now - session.lastUsed > IDLE_TIMEOUT) {
          session.driver.disconnect().catch(() => {});
          this.sessions.delete(id);
        }
      }
    }, 1000 * 60 * 2);
  }

  public static async getDriver(connectionId: string): Promise<IDatabaseDriver> {
    this.startCleanupTimer();

    const existing = this.sessions.get(connectionId);
    if (existing) {
      existing.lastUsed = Date.now();
      return existing.driver;
    }

    const config = ConnectionVault.getConnectionById(connectionId, true);
    if (!config) {
      throw new Error(`Connection profile not found for id: ${connectionId}`);
    }

    const driver = DriverFactory.createDriver(config);
    await driver.connect();

    this.sessions.set(connectionId, {
      driver,
      lastUsed: Date.now(),
    });

    return driver;
  }

  public static async closeDriver(connectionId: string): Promise<void> {
    const session = this.sessions.get(connectionId);
    if (session) {
      await session.driver.disconnect();
      this.sessions.delete(connectionId);
    }
  }

  public static async closeAll(): Promise<void> {
    for (const [id, session] of this.sessions.entries()) {
      await session.driver.disconnect().catch(() => {});
    }
    this.sessions.clear();
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}
