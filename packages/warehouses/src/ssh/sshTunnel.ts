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

    private isConnected : boolean;

    constructor(credentials: T) {
        this.originalCredentials = credentials;
        this.overrideCredentials = credentials;
        this.localPort = undefined;
        this.sshConnection = undefined;
        this.isConnected = false; 
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
                            
                            } as SSHConfig;
                            
                        this.sshConnection = new SSH2Promise(remoteHostConfig);
                        console.info(
                            `Opening SSH tunnel to remote host: ${this.originalCredentials.host}:${this.originalCredentials.port}`,
                        );
                        const sshTunnel = await this.sshConnection.addTunnel({
                            remoteAddr: this.originalCredentials.host,
                            remotePort: this.originalCredentials.port,
                        })/*.catch(e => {
                            console.error('ERROR ON SH sshTunnel: ', e);
                            throw new WarehouseConnectionError(
                                `Could not open SSH tunnel: ${e.message}`,
                            );
                        });
*/
                        this.sshConnection.on('tunnel',  (message, config, err: any) => {
                            
                            if(message === 'disconnect') {
                                console.error('sshTunnel disconnected: ', message, err);

                            /*throw new WarehouseConnectionError(
                                    `SSH tunnel got disconnected: ${err}`,
                                );*/
                                this.isConnected = false; 

                                console.log('ssh tunnel', sshTunnel)

                            } else {
                                console.debug('SSH event ', message, err);

                            }
                        })
/*
                        this.sshConnection.on('ssh',  (message, config, err: any) => {
                            console.error('ssh event : ', message, config, err);

                         
                            this.isConnected = false; 
                            console.log('ssh tunnel', sshTunnel, this.sshConnection)
                        })*/
                       /* sshTunnel.server.on('error', (err: any) => {
                            console.error('SSH sshTunnel.server: ', err);
                        })
                        sshTunnel.server.on('tunnel', 'disconnect', (err: any) => {
                            console.error('SSH sshTunnel. disconnec ted: ', err);
                        })
                        sshTunnel.server.on('disconnect', (err: any) => {
                            console.error('SSH sshTunnel.server: ', err);
                        })
                        this.sshConnection.on('error', (err) => {
                            console.error('SSH connection error: ', err);
                        })
                        this.sshConnection.on('ssh:disconnect', (err) => {
                            console.error('SSH connection error: ', err);
                        })*/
                        console.info(
                            `SSH tunnel ready at ${sshTunnel.localPort}`,
                        );
                        this.localPort = sshTunnel.localPort;
                        this.overrideCredentials = {
                            ...this.originalCredentials,
                            host: '127.0.0.1',
                            port: sshTunnel.localPort,
                        };

                        this.isConnected = true 
                    } catch (e) {
                        console.error(
                            `Failed to connect to remote host: ${this.originalCredentials.host}:${this.originalCredentials.port}`,
                        );
                        this.isConnected = false 

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
            console.log('closing connection ')
            await this.sshConnection.close();
        }
    };

    testConnection = async (): Promise<void> => {
        const { type } = this.originalCredentials;
        switch (type) {
            case WarehouseTypes.POSTGRES:
            case WarehouseTypes.REDSHIFT:
                if (this.originalCredentials.useSshTunnel ) {
                   // if (!this.isConnected)   throw new Error('SSH tunnel got disconnected');
                    
                }
                break;
            default:
                break;
        }
    };
}
