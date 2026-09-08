// Updates any configuration that includes host and port to include the ssh tunnel configuration
import {
    assertUnreachable,
    CreateWarehouseCredentials,
    getErrorMessage,
    SshTunnelError,
    SshTunnelStage,
    WarehouseTypes,
} from '@lightdash/common';
import * as crypto from 'crypto';
import * as net from 'net';
import * as ssh2 from 'ssh2';
import {
    classifySshClientError,
    describeSshTunnelFailure,
    SshClientError,
    sshClientErrorMessage,
} from './sshTunnelFailure';

// ssh2 default is 20s. A bastion that drops packets should classify as a
// tcp failure in a few seconds, not hang the connection test.
const SSH_READY_TIMEOUT_MS = 15000;

class SshTunnelStageFailure extends Error {
    readonly stage: SshTunnelStage;

    constructor(stage: SshTunnelStage, cause: string) {
        super(cause);
        this.name = 'SshTunnelStageFailure';
        this.stage = stage;
    }
}

class SSH2Tunnel {
    private readonly id: string;

    private readonly sshConnectConfig: ssh2.ConnectConfig;

    private readonly databaseHostOnRemote: string;

    private readonly databasePortOnRemote: number;

    private sshClient: ssh2.Client;

    private localTcpServer: net.Server;

    private error: Error | undefined = undefined;

    private handshakeCompleted = false;

    // Wall-clock (ms) when this tunnel was constructed. Used only for logging:
    // how long a connection survived before it was closed / dropped / timed out.
    private readonly openedAt: number = Date.now();

    private readonly probeForwardOnConnect: boolean;

    constructor(args: {
        sshHost: string;
        sshPort: number;
        sshUser: string;
        sshPrivateKey: string;
        databaseHostOnRemote: string;
        databasePortOnRemote: number;
        probeForward: boolean;
    }) {
        this.id = crypto.randomBytes(8).toString('hex');
        this.probeForwardOnConnect = args.probeForward;
        this.databaseHostOnRemote = args.databaseHostOnRemote;
        this.databasePortOnRemote = args.databasePortOnRemote;
        this.sshConnectConfig = {
            username: args.sshUser,
            privateKey: args.sshPrivateKey,
            host: args.sshHost,
            port: args.sshPort,
            readyTimeout: SSH_READY_TIMEOUT_MS,
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
            this.handshakeCompleted = true;
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
                // A query that scanned without streaming rows back sends no
                // bytes on this socket, so bytesToClient stays ~0 and
                // elapsedSinceOpen ~= 5 minutes. Destroying the socket here is
                // what surfaces to pg as "Connection terminated unexpectedly",
                // so log elapsed + byte counts to make such drops measurable
                // rather than inferred.
                console.warn(
                    `[ssh-tunnel] ${this.id} local socket idle timeout after ` +
                        `5 minutes (elapsedSinceOpen=${Date.now() - this.openedAt}ms ` +
                        `bytesFromClient=${socket.bytesRead} ` +
                        `bytesToClient=${socket.bytesWritten}) - destroying ` +
                        `pg<->tunnel socket`,
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

    // Opens one forward to the database host and closes it straight away, so
    // a bastion that cannot reach the database fails here as a "forward"
    // stage instead of later as an opaque database error.
    private probeForward(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.sshClient.forwardOut(
                '127.0.0.1',
                0,
                this.databaseHostOnRemote,
                this.databasePortOnRemote,
                (err, stream) => {
                    if (err) {
                        console.error(
                            `SSH tunnel ${this.id} - forward probe to ${this.databaseHostOnRemote}:${this.databasePortOnRemote} failed: ${err.message}`,
                        );
                        reject(
                            new SshTunnelStageFailure('forward', err.message),
                        );
                        return;
                    }
                    console.log(
                        `SSH tunnel ${this.id} - forward probe to ${this.databaseHostOnRemote}:${this.databasePortOnRemote} succeeded`,
                    );
                    stream.close();
                    resolve();
                },
            );
        });
    }

    public async connect(): Promise<number> {
        return new Promise((resolve, reject) => {
            let settled = false;
            const fail = (stage: SshTunnelStage, cause: string) => {
                if (settled) return;
                settled = true;
                reject(new SshTunnelStageFailure(stage, cause));
            };
            if (this.error) {
                fail('tcp', this.error.message);
                return;
            }
            this.localTcpServer.on('error', (e) => {
                fail('forward', e.message);
            });
            this.sshClient.on('error', (e: SshClientError) => {
                fail(
                    classifySshClientError(e, this.handshakeCompleted),
                    sshClientErrorMessage(e),
                );
            });

            this.sshClient.connect(this.sshConnectConfig);

            // When SSH Client has connected and the forward works - start
            // listening on local tcp server
            this.sshClient.on('ready', () => {
                console.log(`SSH tunnel ${this.id} - ssh client ready`);
                const probe = this.probeForwardOnConnect
                    ? this.probeForward()
                    : Promise.resolve();
                probe
                    .then(() => {
                        this.localTcpServer.listen(0); // random port
                    })
                    .catch((e: unknown) => {
                        this.close();
                        if (e instanceof SshTunnelStageFailure) {
                            fail(e.stage, e.message);
                        } else {
                            fail('forward', getErrorMessage(e));
                        }
                    });
            });

            // When local tcp server is listening - resolve
            this.localTcpServer.on('listening', () => {
                const address = this.localTcpServer.address();
                if (address === null || typeof address === 'string') {
                    fail('forward', 'local tcp server address has no port');
                    return;
                }
                console.log(
                    `SSH tunnel ${this.id} - local tcp server listening on ${address.port}`,
                );
                settled = true;
                resolve(address.port);
            });
        });
    }
}

export type SshTunnelOptions = {
    // Egress IP Lightdash connects from, shown in failure messages so the
    // bastion admin knows what to allow-list.
    staticIp: string | null;
    // Open and close one forward to the database at connect time so a bastion
    // that cannot reach the database fails as a "forward" stage. Used by
    // connection tests only; the query path keeps the lazy forward.
    probeForward: boolean;
};

const DEFAULT_SSH_TUNNEL_OPTIONS: SshTunnelOptions = {
    staticIp: null,
    probeForward: false,
};

export class SshTunnel<T extends CreateWarehouseCredentials> {
    readonly originalCredentials: T;

    overrideCredentials: T;

    localPort: number | undefined;

    private sshConnection: SSH2Tunnel | undefined;

    private readonly options: SshTunnelOptions;

    constructor(
        credentials: T,
        options: SshTunnelOptions = DEFAULT_SSH_TUNNEL_OPTIONS,
    ) {
        this.originalCredentials = credentials;
        this.overrideCredentials = credentials;
        this.localPort = undefined;
        this.sshConnection = undefined;
        this.options = options;
    }

    connect = async (): Promise<T> => {
        const { type } = this.originalCredentials;
        switch (type) {
            case WarehouseTypes.POSTGRES:
            case WarehouseTypes.REDSHIFT:
                if (this.originalCredentials.useSshTunnel) {
                    const remoteHostConfig = {
                        host: this.originalCredentials.sshTunnelHost || '',
                        port: this.originalCredentials.sshTunnelPort || 22,
                        username: this.originalCredentials.sshTunnelUser || '',
                        privateKey:
                            this.originalCredentials.sshTunnelPrivateKey || '',
                        reconnect: false,
                    };
                    try {
                        this.sshConnection = new SSH2Tunnel({
                            sshHost: remoteHostConfig.host,
                            sshPort: remoteHostConfig.port,
                            sshUser: remoteHostConfig.username,
                            sshPrivateKey: remoteHostConfig.privateKey,
                            databaseHostOnRemote: this.originalCredentials.host,
                            databasePortOnRemote: this.originalCredentials.port,
                            probeForward: this.options.probeForward,
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
                    } catch (e: unknown) {
                        console.error(
                            `Failed to connect to remote host: ${this.originalCredentials.host}:${this.originalCredentials.port}`,
                        );
                        const stage: SshTunnelStage =
                            e instanceof SshTunnelStageFailure
                                ? e.stage
                                : 'tcp';
                        const cause = getErrorMessage(e);
                        throw new SshTunnelError(
                            describeSshTunnelFailure({
                                stage,
                                sshHost: remoteHostConfig.host,
                                sshPort: remoteHostConfig.port,
                                sshUser: remoteHostConfig.username,
                                databaseHost: this.originalCredentials.host,
                                databasePort: this.originalCredentials.port,
                                staticIp: this.options.staticIp,
                                cause,
                            }),
                            {
                                stage,
                                sshHost: remoteHostConfig.host,
                                sshPort: remoteHostConfig.port,
                                sshUser: remoteHostConfig.username,
                                cause,
                            },
                        );
                    }
                }
                break;
            case WarehouseTypes.DATABRICKS:
            case WarehouseTypes.TRINO:
            case WarehouseTypes.SNOWFLAKE:
            case WarehouseTypes.BIGQUERY:
            case WarehouseTypes.CLICKHOUSE:
            case WarehouseTypes.ATHENA:
            case WarehouseTypes.DUCKDB:
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
