import {
    RedshiftAuthenticationType,
    SshTunnelError,
    WarehouseTypes,
    type CreatePostgresCredentials,
    type CreateRedshiftCredentials,
} from '@lightdash/common';
import { generateKeyPairSync } from 'crypto';
import * as net from 'net';
import * as ssh2 from 'ssh2';
import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    test,
    vi,
} from 'vitest';
import { SshTunnel } from './sshTunnel';

const HOST = '127.0.0.1';
const SSH_USER = 'tunnel-test';
const BANNER = 'database-through-ssh\n';
const TEST_TIMEOUT = 15000;
const WAIT_OPTIONS = { timeout: 3000, interval: 10 };
const TUNNEL_OPTIONS = { staticIp: null, probeForward: false };

type Credentials = CreatePostgresCredentials | CreateRedshiftCredentials;

const generatePrivateKey = () =>
    generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
        publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
    }).privateKey;

const listen = async (server: net.Server): Promise<number> => {
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, HOST, () => {
            server.off('error', reject);
            resolve();
        });
    });
    const address = server.address();
    if (address === null || typeof address === 'string') {
        throw new Error('Expected a listening TCP server');
    }
    return address.port;
};

const closeServer = (server: net.Server): Promise<void> =>
    new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) reject(error);
            else resolve();
        });
    });

const readBanner = (port: number): Promise<string> =>
    new Promise((resolve, reject) => {
        const socket = net.connect({ host: HOST, port });
        let received = '';
        socket.setEncoding('utf8');
        socket.setTimeout(WAIT_OPTIONS.timeout, () => {
            socket.destroy(
                new Error('Timed out waiting for the database banner'),
            );
        });
        socket.on('error', reject);
        socket.on('data', (data: string) => {
            received += data;
            if (received.endsWith('\n')) {
                socket.destroy();
                resolve(received);
            }
        });
        socket.on('close', () => {
            reject(new Error('Connection closed before the database banner'));
        });
    });

const expectPortRefused = async (port: number) => {
    await vi.waitFor(async () => {
        const error = await new Promise<Error | null>((resolve) => {
            const socket = net.connect({ host: HOST, port });
            socket.once('connect', () => {
                socket.destroy();
                resolve(null);
            });
            socket.once('error', resolve);
            socket.setTimeout(500, () => {
                socket.destroy(new Error('Timed out checking the local port'));
            });
        });
        expect(error).toMatchObject({ code: 'ECONNREFUSED' });
    }, WAIT_OPTIONS);
};

describe('SshTunnel with a local SSH server', () => {
    let hostKey: string;
    let clientKey: string;
    let clientPublicKey: ssh2.ParsedKey;
    let databaseServer: net.Server;
    let sshServer: ssh2.Server;
    let databasePort: number;
    let sshPort: number;
    let databaseConnections: number;
    let sshConnections: number;
    let openedChannels: number;
    let endedClients: number;
    let sockets: Set<net.Socket>;
    let clients: Set<ssh2.Connection>;
    let tunnels: SshTunnel<Credentials>[];
    let fixtureErrors: Error[];

    beforeAll(() => {
        hostKey = generatePrivateKey();
        clientKey = generatePrivateKey();
        const parsedKey = ssh2.utils.parseKey(clientKey);
        if (parsedKey instanceof Error) throw parsedKey;
        clientPublicKey = parsedKey;
    }, TEST_TIMEOUT);

    const trackSocket = (socket: net.Socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
        socket.on('error', (error) => fixtureErrors.push(error));
        return socket;
    };

    beforeEach(async () => {
        databaseConnections = 0;
        sshConnections = 0;
        openedChannels = 0;
        endedClients = 0;
        sockets = new Set();
        clients = new Set();
        tunnels = [];
        fixtureErrors = [];
        databaseServer = net.createServer((socket) => {
            databaseConnections += 1;
            trackSocket(socket).write(BANNER);
        });
        databasePort = await listen(databaseServer);
        sshServer = new ssh2.Server({ hostKeys: [hostKey] }, (client) => {
            sshConnections += 1;
            clients.add(client);
            client.on('error', (error) => fixtureErrors.push(error));
            client.on('end', () => {
                endedClients += 1;
            });
            client.on('close', () => clients.delete(client));
            client.on('authentication', (context) => {
                if (
                    context.method !== 'publickey' ||
                    context.username !== SSH_USER ||
                    !context.key.data.equals(clientPublicKey.getPublicSSH())
                ) {
                    context.reject();
                    return;
                }
                const authentication: ssh2.PublicKeyAuthContext & {
                    hashAlgo?: string;
                } = context;
                if (
                    authentication.signature &&
                    (!authentication.blob ||
                        !clientPublicKey.verify(
                            authentication.blob,
                            authentication.signature,
                            authentication.hashAlgo,
                        ))
                ) {
                    context.reject();
                    return;
                }
                context.accept();
            });
            client.on('tcpip', (accept, reject, info) => {
                if (info.destIP !== HOST || info.destPort !== databasePort) {
                    reject();
                    return;
                }
                const channel = accept();
                openedChannels += 1;
                const upstream = trackSocket(
                    net.connect({ host: HOST, port: databasePort }),
                );
                channel.on('error', (error: Error) =>
                    fixtureErrors.push(error),
                );
                channel.on('close', () => upstream.destroy());
                upstream.on('close', () => channel.destroy());
                upstream.pipe(channel).pipe(upstream);
            });
        });
        sshPort = await listen(sshServer);
    });

    afterEach(async () => {
        await Promise.all(tunnels.map((tunnel) => tunnel.disconnect()));
        sockets.forEach((socket) => socket.destroy());
        clients.forEach((client) => client.end());
        await Promise.all([
            closeServer(sshServer),
            closeServer(databaseServer),
        ]);
        expect(fixtureErrors).toEqual([]);
    });

    const postgresCredentials = (): CreatePostgresCredentials => ({
        type: WarehouseTypes.POSTGRES,
        host: HOST,
        port: databasePort,
        user: 'database-user',
        password: 'database-password',
        dbname: 'warehouse',
        schema: 'public',
        useSshTunnel: true,
        sshTunnelHost: HOST,
        sshTunnelPort: sshPort,
        sshTunnelUser: SSH_USER,
        sshTunnelPrivateKey: clientKey,
    });

    const credentialCases = [
        { name: 'Postgres', credentials: postgresCredentials },
        {
            name: 'Redshift',
            credentials: (): CreateRedshiftCredentials => ({
                ...postgresCredentials(),
                type: WarehouseTypes.REDSHIFT,
                authenticationType: RedshiftAuthenticationType.PASSWORD,
            }),
        },
    ];

    const createTunnel = (credentials: Credentials) => {
        const tunnel = new SshTunnel(credentials, TUNNEL_OPTIONS);
        tunnels.push(tunnel);
        return tunnel;
    };

    test.each(credentialCases)(
        '$name returns local credentials without changing the originals',
        async ({ credentials }) => {
            const original = credentials();
            const snapshot = { ...original };
            const tunnel = createTunnel(original);
            const forwarded = await tunnel.connect();
            expect(forwarded.host).toBe(HOST);
            expect(forwarded.port).not.toBe(databasePort);
            expect(tunnel.localPort).toBe(forwarded.port);
            expect(tunnel.overrideCredentials).toBe(forwarded);
            expect(forwarded).toEqual({ ...snapshot, port: tunnel.localPort });
            expect(tunnel.originalCredentials).toBe(original);
            expect(original).toEqual(snapshot);
            expect(openedChannels).toBe(0);
        },
        TEST_TIMEOUT,
    );

    test.each(credentialCases)(
        '$name forwards the database banner through one SSH channel',
        async ({ credentials }) => {
            const tunnel = createTunnel(credentials());
            const { port } = await tunnel.connect();
            await expect(readBanner(port)).resolves.toBe(BANNER);
            expect(databaseConnections).toBe(1);
            expect(openedChannels).toBe(1);
        },
        TEST_TIMEOUT,
    );

    test.each(credentialCases)(
        '$name closes the local listener and SSH connection on disconnect',
        async ({ credentials }) => {
            const tunnel = createTunnel(credentials());
            const { port } = await tunnel.connect();
            await expect(readBanner(port)).resolves.toBe(BANNER);
            await tunnel.disconnect();
            await expectPortRefused(port);
            await vi.waitFor(() => {
                expect(endedClients).toBe(1);
                expect(clients.size).toBe(0);
            }, WAIT_OPTIONS);
        },
        TEST_TIMEOUT,
    );

    test.each(credentialCases)(
        '$name allows disconnect to be called twice',
        async ({ credentials }) => {
            const tunnel = createTunnel(credentials());
            const { port } = await tunnel.connect();
            await expect(tunnel.disconnect()).resolves.toBeUndefined();
            await expect(tunnel.disconnect()).resolves.toBeUndefined();
            await expectPortRefused(port);
        },
        TEST_TIMEOUT,
    );

    test.each(credentialCases)(
        '$name leaves no listeners after ten sequential connection cycles',
        async ({ credentials }) => {
            const tunnel = createTunnel(credentials());
            const localPorts: number[] = [];
            await Array.from({ length: 10 }).reduce(
                async (previous, _, index) => {
                    await previous;
                    const { port } = await tunnel.connect();
                    localPorts.push(port);
                    await expect(readBanner(port)).resolves.toBe(BANNER);
                    await tunnel.disconnect();
                    await expectPortRefused(port);
                    await vi.waitFor(() => {
                        expect(endedClients).toBe(index + 1);
                        expect(clients.size).toBe(0);
                    }, WAIT_OPTIONS);
                },
                Promise.resolve(),
            );
            expect(databaseConnections).toBe(10);
            expect(openedChannels).toBe(10);
            expect(sshConnections).toBe(10);
            await Promise.all(localPorts.map(expectPortRefused));
        },
        TEST_TIMEOUT,
    );

    test(
        'returns the same credentials without contacting SSH when disabled',
        async () => {
            const credentials = {
                ...postgresCredentials(),
                useSshTunnel: false,
            };
            const tunnel = createTunnel(credentials);
            await expect(tunnel.connect()).resolves.toBe(credentials);
            await expect(tunnel.disconnect()).resolves.toBeUndefined();
            expect(sshConnections).toBe(0);
            expect(openedChannels).toBe(0);
            expect(databaseConnections).toBe(0);
            expect(tunnel.localPort).toBeUndefined();
        },
        TEST_TIMEOUT,
    );

    test(
        'rejects a closed SSH port without leaving a local listener',
        async () => {
            const portReservation = net.createServer();
            const closedPort = await listen(portReservation);
            await closeServer(portReservation);
            const credentials = {
                ...postgresCredentials(),
                sshTunnelPort: closedPort,
            };
            const tunnel = createTunnel(credentials);
            await expect(tunnel.connect()).rejects.toBeInstanceOf(
                SshTunnelError,
            );
            expect(tunnel.localPort).toBeUndefined();
            expect(tunnel.overrideCredentials).toBe(credentials);
            const localServer = tunnel['sshConnection']!['localTcpServer'];
            expect(localServer.listening).toBe(false);
            expect(localServer.address()).toBeNull();
            expect(sshConnections).toBe(0);
            expect(databaseConnections).toBe(0);
        },
        TEST_TIMEOUT,
    );
});
