import { ConnectionConfig } from '../types.js';
import { IDatabaseDriver } from './interface.js';
import { PostgresDriver } from './postgres.js';
import { MySQLDriver } from './mysql.js';
import { SQLiteDriver } from './sqlite.js';
import { MSSQLDriver } from './mssql.js';

export class DriverFactory {
  public static createDriver(config: ConnectionConfig): IDatabaseDriver {
    switch (config.type) {
      case 'postgres':
        return new PostgresDriver(config);
      case 'mysql':
        return new MySQLDriver(config);
      case 'sqlite':
        return new SQLiteDriver(config);
      case 'mssql':
        return new MSSQLDriver(config);
      default:
        throw new Error(`Unsupported database type: ${(config as any).type}`);
    }
  }
}
