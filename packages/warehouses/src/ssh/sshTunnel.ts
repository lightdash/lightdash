// Updates any configuration that includes host and port to include the ssh tunnel configuration
import {
    assertUnreachable,
    CreateWarehouseCredentials,
    WarehouseConnectionError,
    WarehouseTypes,
} from '@lightdash/common';
import * as crypto from 'crypto';
import * as net from 'net';
import * as ssh2 from 'ssh2';

class SSH2Tunnel {
    private readonly id: string;

    private readonly sshConnectConfig: ssh2.ConnectConfig;

    private readonly databaseHostOnRemote: string;

    private readonly databasePortOnRemote: number;

    private sshClient: ssh2.Client;

    private localTcpServer: net.Server;

    private error: Error | undefined = undefined;

    constructor(args: {
        sshHost: string;
        sshPort: number;
        sshUser: string;
        sshPrivateKey: string;
        databaseHostOnRemote: string;
        databasePortOnRemote: number;
    }) {
        this.id = crypto.randomBytes(8).toString('hex');
        this.databaseHostOnRemote = args.databaseHostOnRemote;
        this.databasePortOnRemote = args.databasePortOnRemote;
        this.sshConnectConfig = {
            username: args.sshUser,
            privateKey: args.sshPrivateKey,
            host: args.sshHost,
            port: args.sshPort,
        };
        this.sshClient = new ssh2.Client();
        this.localTcpServer = net.createServer();

        this.sshClient.on('error', (e: Error | undefined) => {
            console.error(
                `SSH tunnel ${this.id} error from ssh client: ${
                    e?.message || 'undefined'
                }`,
            );
            this.error = e;
            this.close();
        });

        this.localTcpServer.on('error', (e) => {
            console.error(
                `SSH tunnel ${this.id} error from local tcp server: ${e.message}`,
            );
            this.error = e;
            this.close();
        });

        this.sshClient.on('close', () => {
            console.log(`SSH tunnel ${this.id} closed by ssh client socket`);
            this.localTcpServer.close();
        });

        this.sshClient.on('end', () => {
            console.log(`SSH tunnel ${this.id} - ssh client received "end"`);
        });

        this.sshClient.on('handshake', () => {
            console.log(`SSH tunnel ${this.id} - ssh client handshake success`);
        });

        this.localTcpServer.on('close', () => {
            console.log(
                `SSH tunnel ${this.id} closed by local tcp server disconnecting`,
            );
            this.sshClient.end();
        });

        this.localTcpServer.on('drop', () => {
            console.log(
                `SSH tunnel ${this.id} - local tcp server dropped connection due to maxConnections`,
            );
        });

        this.localTcpServer.on('connection', (socket) => {
            console.log(
                `SSH tunnel ${this.id} - local tcp server received an incoming connection`,
            );
            if (this.error) {
                console.error(
                    `SSH tunnel ${this.id} - local tcp server received an incoming connection but has an error: ${this.error.message}`,
                );
                socket.destroy();
                return;
            }
            socket.on('error', (e) => {
                console.error(
                    `SSH tunnel ${this.id} - local tcp server connection error: ${e.message}`,
                );
                this.error = e;
                socket.destroy();
            });
            socket.setTimeout(60000 * 5, () => {
                console.log(
                    `SSH tunnel ${this.id} - local tcp server connection timed out after 5 minutes`,
                );
                socket.destroy();
            });
            if (!socket.remoteAddress || !socket.remotePort) {
                console.error(
                    `SSH tunnel ${this.id} - local tcp server connection does not have remote address/port`,
                );
                this.error = new Error(
                    'local tcp server connection does not have remote address/port',
                );
                socket.destroy();
                return;
            }
            this.sshClient.forwardOut(
                socket.remoteAddress,
                socket.remotePort,
                this.databaseHostOnRemote,
                this.databasePortOnRemote,
                (err, stream) => {
                    if (err) {
                        console.error(
                            `SSH tunnel ${this.id} - ssh client forwardOut error: ${err.message}`,
                        );
                        this.error = err;
                        socket.destroy();
                        return;
                    }
                    if (socket.destroyed) {
                        console.error(
                            `SSH tunnel ${this.id} - local tcp server socket destroyed before ssh client forwardOut success`,
                        );
                        stream.close();
                        return;
                    }
                    console.log(
                        `SSH tunnel ${this.id} - ssh client forwardOut success`,
                    );
                    socket
                        .on('error', () => {
                            stream.close();
                        })
                        .on('close', () => {
                            console.log(
                                `SSH tunnel ${this.id} - local tcp server socket closed`,
                            );
                            stream.close();
                        })
                        .pipe(stream)
                        .on('error', () => {
                            console.error(
                                `SSH tunnel ${this.id} - ssh client stream error`,
                            );
                            this.error = new Error('ssh client stream error');
                            socket.end();
                            this.close();
                        })
                        .on('close', () => {
                            console.log(
                                `SSH tunnel ${this.id} - ssh client stream closed`,
                            );
                            socket.end();
                        })
                        .pipe(socket);
                },
            );
        });
    }

    public close(onClose?: () => void) {
        this.sshClient.end();
        this.localTcpServer.close(onClose);
    }

    public async connect(): Promise<number> {
        return new Promise((resolve, reject) => {
            if (this.error) {
                reject(this.error);
            }
            this.localTcpServer.on('error', (e) => {
                reject(e);
            });
            this.sshClient.on('error', (e) => {
                reject(e);
            });

            this.sshClient.connect(this.sshConnectConfig);

            // When SSH Client has connected - start listening on local tcp server
            this.sshClient.on('ready', () => {
                console.log(`SSH tunnel ${this.id} - ssh client ready`);
                this.localTcpServer.listen(0); // random port
            });

            // When local tcp server is listening - resolve
            this.localTcpServer.on('listening', () => {
                const address = this.localTcpServer.address();
                if (address === null || typeof address === 'string') {
                    reject(new Error('local tcp server address has no port'));
                    return;
                }
                console.log(
                    `SSH tunnel ${this.id} - local tcp server listening on ${address.port}`,
                );
                resolve(address.port);
            });
        });
    }
}

export class SshTunnel<T extends CreateWarehouseCredentials> {
    readonly originalCredentials: T;

    overrideCredentials: T;

    localPort: number | undefined;

    private sshConnection: SSH2Tunnel | undefined;

    constructor(credentials: T) {
        this.originalCredentials = credentials;
        this.overrideCredentials = credentials;
        this.localPort = undefined;
        this.sshConnection = undefined;
    }

    connect = async (): Promise<T> => {
        const { type } = this.originalCredentials;
        switch (type) {
            case WarehouseTypes.POSTGRES:
            case WarehouseTypes.REDSHIFT:
                if (this.originalCredentials.useSshTunnel) {
                    try {
                        const remoteHostConfig = {
                            host: this.originalCredentials.sshTunnelHost || '',
                            port: this.originalCredentials.sshTunnelPort || 22,
                            username:
                                this.originalCredentials.sshTunnelUser || '',
                            privateKey:
                                this.originalCredentials.sshTunnelPrivateKey ||
                                '',
                            reconnect: false,
                        };

                        this.sshConnection = new SSH2Tunnel({
                            sshHost: remoteHostConfig.host,
                            sshPort: remoteHostConfig.port,
                            sshUser: remoteHostConfig.username,
                            sshPrivateKey: remoteHostConfig.privateKey,
                            databaseHostOnRemote: this.originalCredentials.host,
                            databasePortOnRemote: this.originalCredentials.port,
                        });
                        console.info(
                            `Opening SSH tunnel to remote host: ${this.originalCredentials.host}:${this.originalCredentials.port}`,
                        );
                        this.localPort = await this.sshConnection.connect();
                        this.overrideCredentials = {
                            ...this.originalCredentials,
                            host: '127.0.0.1',
                            port: this.localPort,
                        };
                    } catch (e) {
                        console.error(
                            `Failed to connect to remote host: ${this.originalCredentials.host}:${this.originalCredentials.port}`,
                        );

                        throw new WarehouseConnectionError(
                            `Could not open SSH tunnel: ${e.message}`,
                        );
                    }
                }
                break;
            case WarehouseTypes.DATABRICKS:
            case WarehouseTypes.TRINO:
            case WarehouseTypes.ATHENA:
            case WarehouseTypes.SNOWFLAKE:
            case WarehouseTypes.BIGQUERY:
                break;
            default:
                assertUnreachable(type, new Error('Unknown warehouse type'));
        }
        return this.overrideCredentials;
    };

    disconnect = async (): Promise<void> => {
        if (this.sshConnection) {
            this.sshConnection.close();
        }
    };
}
