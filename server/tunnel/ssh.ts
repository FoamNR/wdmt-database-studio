import net from 'node:net';
import { Client as SSHClient } from 'ssh2';
import { SSHTunnelConfig } from '../types.js';

export interface ActiveTunnel {
  localPort: number;
  close: () => Promise<void>;
}

export class SSHTunnelManager {
  public static async createTunnel(
    sshConfig: SSHTunnelConfig,
    targetHost: string,
    targetPort: number
  ): Promise<ActiveTunnel> {
    return new Promise((resolve, reject) => {
      const sshClient = new SSHClient();
      let server: net.Server | null = null;

      sshClient.on('ready', () => {
        server = net.createServer((socket) => {
          sshClient.forwardOut(
            '127.0.0.1',
            socket.remotePort || 0,
            targetHost,
            targetPort,
            (err, stream) => {
              if (err) {
                socket.destroy(err);
                return;
              }
              socket.pipe(stream);
              stream.pipe(socket);

              socket.on('error', () => stream.end());
              stream.on('error', () => socket.destroy());
            }
          );
        });

        // Listen on a random available port on localhost
        server.listen(0, '127.0.0.1', () => {
          const address = server!.address() as net.AddressInfo;
          const localPort = address.port;

          const close = async (): Promise<void> => {
            return new Promise((res) => {
              if (server) {
                server.close(() => {
                  sshClient.end();
                  res();
                });
              } else {
                sshClient.end();
                res();
              }
            });
          };

          resolve({
            localPort,
            close,
          });
        });

        server.on('error', (err) => {
          sshClient.end();
          reject(err);
        });
      });

      sshClient.on('error', (err) => {
        if (server) server.close();
        reject(new Error(`SSH Tunnel connection error: ${err.message}`));
      });

      try {
        const connectOpts: any = {
          host: sshConfig.host,
          port: sshConfig.port || 22,
          username: sshConfig.user,
          readyTimeout: 10000,
        };

        if (sshConfig.privateKey) {
          connectOpts.privateKey = sshConfig.privateKey;
          if (sshConfig.passphrase) {
            connectOpts.passphrase = sshConfig.passphrase;
          }
        } else if (sshConfig.password) {
          connectOpts.password = sshConfig.password;
        }

        sshClient.connect(connectOpts);
      } catch (err: any) {
        reject(new Error(`Failed to initiate SSH connection: ${err.message}`));
      }
    });
  }
}
