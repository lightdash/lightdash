// Updates any configuration that includes host and port to include the ssh tunnel configuration
import {
    assertUnreachable,
    CreateWarehouseCredentials,
    WarehouseConnectionError,
    WarehouseTypes,
} from '@lightdash/common';
import SSH2Promise from 'ssh2-promise';
import SSHConfig from 'ssh2-promise/lib/sshConfig';

export class SshTunnel<T extends CreateWarehouseCredentials> {
    readonly originalCredentials: T;

    overrideCredentials: T;

    localPort: number | undefined;

    private sshConnection: SSH2Promise | undefined;

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
                        } as SSHConfig;
                        this.sshConnection = new SSH2Promise(remoteHostConfig);
                        console.info(
                            `Opening SSH tunnel to remote host: ${this.originalCredentials.host}:${this.originalCredentials.port}`,
                        );
                        const sshTunnel = await this.sshConnection.addTunnel({
                            remoteAddr: this.originalCredentials.host,
                            remotePort: this.originalCredentials.port,
                        });
                        console.info(
                            `SSH tunnel ready at ${sshTunnel.localPort}`,
                        );
                        this.localPort = sshTunnel.localPort;
                        this.overrideCredentials = {
                            ...this.originalCredentials,
                            host: '127.0.0.1',
                            port: sshTunnel.localPort,
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
            await this.sshConnection.close();
        }
    };

    testConnection = async (): Promise<void> => {
        const { type } = this.originalCredentials;
        switch (type) {
            case WarehouseTypes.POSTGRES:
            case WarehouseTypes.REDSHIFT:
                if (
                    this.sshConnection &&
                    this.originalCredentials.useSshTunnel
                ) {
                    const port = await this.sshConnection.connect();
                    if (Object.keys(port.activeTunnels).length === 0) {
                        throw new Error('No active SSH tunnels');
                    }
                }
                break;
            default:
                break;
        }
    };
}
