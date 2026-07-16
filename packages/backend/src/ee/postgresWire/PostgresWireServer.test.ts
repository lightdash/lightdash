import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as tls from 'tls';
import { afterEach, describe, expect, it } from 'vitest';
import {
    PgWireServerError,
    PostgresWireServer,
    type PgWireHandlers,
    type PgWireServerOptions,
} from './PostgresWireServer';

const FIXTURES = path.join(__dirname, 'testFixtures');
const CERT_A = path.join(FIXTURES, 'test-cert.pem');
const KEY_A = path.join(FIXTURES, 'test-key.pem');
const CERT_B = path.join(FIXTURES, 'test-cert-b.pem');
const KEY_B = path.join(FIXTURES, 'test-key-b.pem');

const PROTOCOL_VERSION = 196608;
const SSL_REQUEST_CODE = 80877103;

// --- frontend message encoding ---

const int32 = (n: number): Buffer => {
    const b = Buffer.alloc(4);
    b.writeInt32BE(n);
    return b;
};

const cstring = (s: string): Buffer =>
    Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from([0])]);

const startupMessage = (params: Record<string, string>): Buffer => {
    const body = Buffer.concat([
        int32(PROTOCOL_VERSION),
        ...Object.entries(params).flatMap(([k, v]) => [cstring(k), cstring(v)]),
        Buffer.from([0]),
    ]);
    return Buffer.concat([int32(body.length + 4), body]);
};

const sslRequest = (): Buffer =>
    Buffer.concat([int32(8), int32(SSL_REQUEST_CODE)]);

const typedMessage = (type: string, body: Buffer): Buffer =>
    Buffer.concat([Buffer.from(type), int32(body.length + 4), body]);

const passwordMessage = (password: string): Buffer =>
    typedMessage('p', cstring(password));

const queryMessage = (sql: string): Buffer => typedMessage('Q', cstring(sql));

// --- backend message reading ---

type BackendMessage = { type: string; payload: Buffer };

/** Collects socket data and yields parsed backend messages / raw bytes */
class MessageReader {
    private buffer: Buffer = Buffer.alloc(0);

    private waiters: (() => void)[] = [];

    private closed = false;

    constructor(socket: net.Socket) {
        socket.on('data', (chunk) => {
            this.buffer = Buffer.concat([this.buffer, chunk]);
            this.notify();
        });
        socket.on('close', () => {
            this.closed = true;
            this.notify();
        });
        socket.on('error', () => {
            this.closed = true;
            this.notify();
        });
    }

    private notify(): void {
        const waiters = [...this.waiters];
        this.waiters = [];
        waiters.forEach((w) => w());
    }

    private async waitFor<T>(tryRead: () => T | null): Promise<T> {
        for (;;) {
            const result = tryRead();
            if (result !== null) return result;
            if (this.closed) {
                throw new Error('connection closed while waiting for data');
            }
            // eslint-disable-next-line no-await-in-loop
            await new Promise<void>((resolve) => {
                this.waiters.push(resolve);
            });
        }
    }

    /** Read a single raw byte (the SSLRequest 'S'/'N' answer is untyped) */
    async readByte(): Promise<string> {
        return this.waitFor(() => {
            if (this.buffer.length < 1) return null;
            const byte = String.fromCharCode(this.buffer[0]);
            this.buffer = this.buffer.subarray(1);
            return byte;
        });
    }

    async readMessage(): Promise<BackendMessage> {
        return this.waitFor(() => {
            if (this.buffer.length < 5) return null;
            const type = String.fromCharCode(this.buffer[0]);
            const length = this.buffer.readInt32BE(1);
            if (this.buffer.length < length + 1) return null;
            const payload = Buffer.from(this.buffer.subarray(5, length + 1));
            this.buffer = this.buffer.subarray(length + 1);
            return { type, payload };
        });
    }

    /** Read messages until one of the given type arrives */
    async readUntil(type: string): Promise<BackendMessage> {
        for (;;) {
            // eslint-disable-next-line no-await-in-loop
            const message = await this.readMessage();
            if (message.type === type) return message;
        }
    }

    async waitForClose(): Promise<void> {
        while (!this.closed) {
            // eslint-disable-next-line no-await-in-loop
            await new Promise<void>((resolve) => {
                this.waiters.push(resolve);
            });
        }
    }

    get isClosed(): boolean {
        return this.closed;
    }
}

/** Parse the SQLSTATE code out of an ErrorResponse payload */
const errorCode = (payload: Buffer): string | null => {
    let offset = 0;
    while (offset < payload.length && payload[offset] !== 0) {
        const field = String.fromCharCode(payload[offset]);
        const end = payload.indexOf(0, offset + 1);
        const value = payload.toString('utf8', offset + 1, end);
        if (field === 'C') return value;
        offset = end + 1;
    }
    return null;
};

type TestSession = { user: string };

const testHandlers: PgWireHandlers<TestSession> = {
    authenticate: async ({ user, password }) => {
        if (password !== 'good-token') {
            throw new PgWireServerError(
                'password authentication failed',
                '28P01',
            );
        }
        return { user };
    },
    query: async (session) => ({
        type: 'rows',
        fields: [{ name: 'who', oid: 25 }],
        rows: [[session.user]],
        commandTag: 'SELECT 1',
    }),
};

const connect = async (port: number): Promise<net.Socket> =>
    new Promise((resolve, reject) => {
        const socket = net.connect({ host: '127.0.0.1', port }, () =>
            resolve(socket),
        );
        socket.on('error', reject);
    });

const upgradeToTls = async (socket: net.Socket): Promise<tls.TLSSocket> =>
    new Promise((resolve, reject) => {
        const secureSocket = tls.connect(
            { socket, rejectUnauthorized: false },
            () => resolve(secureSocket),
        );
        secureSocket.on('error', reject);
    });

describe('PostgresWireServer TLS', () => {
    const openSockets: net.Socket[] = [];
    const servers: PostgresWireServer<TestSession>[] = [];
    const tempDirs: string[] = [];

    const startServer = async (
        options?: PgWireServerOptions,
    ): Promise<number> => {
        const server = new PostgresWireServer(testHandlers, options);
        servers.push(server);
        await server.listen(0, '127.0.0.1');
        const address = server.address();
        if (!address) throw new Error('server has no address');
        return address.port;
    };

    const track = <T extends net.Socket>(socket: T): T => {
        openSockets.push(socket);
        return socket;
    };

    afterEach(async () => {
        // Destroy in reverse creation order so TLS wrappers are torn down
        // before the raw sockets they wrap (destroying the raw socket first
        // crashes the native TLSWrap).
        openSockets
            .splice(0)
            .reverse()
            .forEach((socket) => socket.destroy());
        await Promise.all(servers.splice(0).map((server) => server.close()));
        tempDirs
            .splice(0)
            .forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
    });

    it('rejects a plaintext startup before ever requesting a password', async () => {
        const port = await startServer({
            tls: { certPath: CERT_A, keyPath: KEY_A },
        });
        const socket = track(await connect(port));
        const reader = new MessageReader(socket);
        socket.write(startupMessage({ user: 'alice', database: 'db' }));

        const message = await reader.readMessage();
        expect(message.type).toBe('E');
        expect(errorCode(message.payload)).toBe('28000');
        await reader.waitForClose();
        expect(reader.isClosed).toBe(true);
    });

    it('upgrades on SSLRequest and authenticates over TLS', async () => {
        const port = await startServer({
            tls: { certPath: CERT_A, keyPath: KEY_A },
        });
        const socket = track(await connect(port));
        const rawReader = new MessageReader(socket);
        socket.write(sslRequest());
        expect(await rawReader.readByte()).toBe('S');

        const secureSocket = track(await upgradeToTls(socket));
        expect(secureSocket.getPeerCertificate().subject.CN).toBe(
            'pgwire-test-a',
        );

        const reader = new MessageReader(secureSocket);
        secureSocket.write(startupMessage({ user: 'alice', database: 'db' }));
        const authRequest = await reader.readMessage();
        expect(authRequest.type).toBe('R');
        expect(authRequest.payload.readInt32BE(0)).toBe(3); // cleartext password

        secureSocket.write(passwordMessage('good-token'));
        const authResult = await reader.readMessage();
        expect(authResult.type).toBe('R');
        expect(authResult.payload.readInt32BE(0)).toBe(0); // auth ok
        await reader.readUntil('Z');

        secureSocket.write(queryMessage('SELECT who'));
        const rowDescription = await reader.readMessage();
        expect(rowDescription.type).toBe('T');
        const dataRow = await reader.readMessage();
        expect(dataRow.type).toBe('D');
        expect(dataRow.payload.toString('utf8')).toContain('alice');
    });

    it('rejects bad credentials over TLS with 28P01', async () => {
        const port = await startServer({
            tls: { certPath: CERT_A, keyPath: KEY_A },
        });
        const socket = track(await connect(port));
        const rawReader = new MessageReader(socket);
        socket.write(sslRequest());
        expect(await rawReader.readByte()).toBe('S');

        const secureSocket = track(await upgradeToTls(socket));
        const reader = new MessageReader(secureSocket);
        secureSocket.write(startupMessage({ user: 'alice', database: 'db' }));
        await reader.readMessage(); // cleartext password request
        secureSocket.write(passwordMessage('wrong'));
        const error = await reader.readMessage();
        expect(error.type).toBe('E');
        expect(errorCode(error.payload)).toBe('28P01');
    });

    it('kills the connection when data is pipelined behind SSLRequest', async () => {
        const port = await startServer({
            tls: { certPath: CERT_A, keyPath: KEY_A },
        });
        const socket = track(await connect(port));
        const reader = new MessageReader(socket);
        // TLS-stripping attempt: startup smuggled in the same packet
        socket.write(
            Buffer.concat([
                sslRequest(),
                startupMessage({ user: 'alice', database: 'db' }),
            ]),
        );
        await reader.waitForClose();
        expect(reader.isClosed).toBe(true);
    });

    it('answers SSLRequest with N and allows plaintext when TLS is disabled', async () => {
        const port = await startServer();
        const socket = track(await connect(port));
        const reader = new MessageReader(socket);
        socket.write(sslRequest());
        expect(await reader.readByte()).toBe('N');

        socket.write(startupMessage({ user: 'alice', database: 'db' }));
        const authRequest = await reader.readMessage();
        expect(authRequest.type).toBe('R');
        expect(authRequest.payload.readInt32BE(0)).toBe(3);
        socket.write(passwordMessage('good-token'));
        const authResult = await reader.readMessage();
        expect(authResult.payload.readInt32BE(0)).toBe(0);
    });

    it('throws at construction when the cert files are missing', () => {
        expect(
            () =>
                new PostgresWireServer(testHandlers, {
                    tls: {
                        certPath: path.join(FIXTURES, 'does-not-exist.pem'),
                        keyPath: KEY_A,
                    },
                }),
        ).toThrow();
    });

    it('serves a renewed certificate without a restart', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgwire-tls-'));
        tempDirs.push(dir);
        const certPath = path.join(dir, 'cert.pem');
        const keyPath = path.join(dir, 'key.pem');
        fs.copyFileSync(CERT_A, certPath);
        fs.copyFileSync(KEY_A, keyPath);

        const port = await startServer({ tls: { certPath, keyPath } });

        const first = track(await connect(port));
        const firstReader = new MessageReader(first);
        first.write(sslRequest());
        await firstReader.readByte();
        const firstSecure = track(await upgradeToTls(first));
        expect(firstSecure.getPeerCertificate().subject.CN).toBe(
            'pgwire-test-a',
        );

        // Simulate a cert-manager renewal; bump mtime explicitly so the
        // change is visible even on filesystems with coarse timestamps.
        fs.copyFileSync(CERT_B, certPath);
        fs.copyFileSync(KEY_B, keyPath);
        const future = new Date(Date.now() + 10_000);
        fs.utimesSync(certPath, future, future);
        fs.utimesSync(keyPath, future, future);

        const second = track(await connect(port));
        const secondReader = new MessageReader(second);
        second.write(sslRequest());
        await secondReader.readByte();
        const secondSecure = track(await upgradeToTls(second));
        expect(secondSecure.getPeerCertificate().subject.CN).toBe(
            'pgwire-test-b',
        );
    });
});
