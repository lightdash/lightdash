import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { Client, type QueryConfig } from 'pg';
import * as tls from 'tls';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    PgWireServerError,
    PostgresWireServer,
    type PgWireHandlers,
    type PgWireQueryResult,
    type PgWireServerOptions,
} from './PostgresWireServer';
import { cstring, int16, int32 } from './wireEncoding';

const FIXTURES = path.join(__dirname, 'testFixtures');
const CERT_A = path.join(FIXTURES, 'test-cert.pem');
const KEY_A = path.join(FIXTURES, 'test-key.pem');
const CERT_B = path.join(FIXTURES, 'test-cert-b.pem');
const KEY_B = path.join(FIXTURES, 'test-key-b.pem');

const PROTOCOL_VERSION = 196608;
const SSL_REQUEST_CODE = 80877103;

// --- frontend message encoding ---

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

const parseMessage = (
    name: string,
    sql: string,
    parameterOids: number[] = [],
): Buffer =>
    typedMessage(
        'P',
        Buffer.concat([
            cstring(name),
            cstring(sql),
            int16(parameterOids.length),
            ...parameterOids.map(int32),
        ]),
    );

type BindOptions = {
    portal?: string;
    statement?: string;
    parameterFormats?: number[];
    /** strings are sent as UTF-8; pass a Buffer for exact bytes */
    parameters?: (string | Buffer | null)[];
    resultFormats?: number[];
};

const bindMessage = ({
    portal = '',
    statement = '',
    parameterFormats = [],
    parameters = [],
    resultFormats = [],
}: BindOptions = {}): Buffer =>
    typedMessage(
        'B',
        Buffer.concat([
            cstring(portal),
            cstring(statement),
            int16(parameterFormats.length),
            ...parameterFormats.map(int16),
            int16(parameters.length),
            ...parameters.map((value) => {
                if (value === null) {
                    return int32(-1);
                }
                const bytes = Buffer.isBuffer(value)
                    ? value
                    : Buffer.from(value, 'utf8');
                return Buffer.concat([int32(bytes.length), bytes]);
            }),
            int16(resultFormats.length),
            ...resultFormats.map(int16),
        ]),
    );

const describeMessage = (kind: 'S' | 'P', name = ''): Buffer =>
    typedMessage('D', Buffer.concat([Buffer.from(kind), cstring(name)]));

const executeMessage = (portal = '', maxRows = 0): Buffer =>
    typedMessage('E', Buffer.concat([cstring(portal), int32(maxRows)]));

const closeMessage = (kind: 'S' | 'P', name = ''): Buffer =>
    typedMessage('C', Buffer.concat([Buffer.from(kind), cstring(name)]));

const syncMessage = (): Buffer => typedMessage('S', Buffer.alloc(0));

const flushMessage = (): Buffer => typedMessage('H', Buffer.alloc(0));

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

/** Read message types until ReadyForQuery, e.g. "12TDCZ" */
const readTypesUntilReady = async (reader: MessageReader): Promise<string> => {
    let types = '';
    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const message = await reader.readMessage();
        types += message.type;
        if (message.type === 'Z') return types;
    }
};

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

/** Records what the server asked the handlers, for assertions */
const handlerCalls: { kind: 'describe' | 'query'; sql: string }[] = [];

/**
 * Canned statements: `SELECT who` -> one row, `SELECT three` -> three rows,
 * `SET ...` -> command, `SELECT fail` -> error; anything else echoes the SQL
 */
const cannedResult = (session: TestSession, sql: string): PgWireQueryResult => {
    if (/^SET\b/i.test(sql)) {
        return { type: 'command', commandTag: 'SET' };
    }
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'DISCARD ALL') {
        return { type: 'command', commandTag: sql };
    }
    if (sql === 'SELECT fail') {
        throw new PgWireServerError('canned failure', 'XX001');
    }
    if (sql === 'SELECT nul') {
        throw new PgWireServerError('bad\u0000value', 'XX002', 'hint\u0000too');
    }
    if (sql === 'DISCARD PLANS') {
        return { type: 'command', commandTag: 'DISCARD' };
    }
    if (sql === 'SELECT three') {
        return {
            type: 'rows',
            fields: [{ name: 'n', oid: 23 }],
            rows: [['1'], ['2'], ['3']],
            commandTag: 'SELECT 3',
        };
    }
    if (sql === 'SELECT numeric') {
        return {
            type: 'rows',
            fields: [{ name: 'n', oid: 1700 }],
            rows: [['1.5']],
            commandTag: 'SELECT 1',
        };
    }
    if (sql === 'SELECT typed') {
        return {
            type: 'rows',
            fields: [
                { name: 'b', oid: 16 },
                { name: 'i', oid: 20 },
                { name: 'f', oid: 701 },
                { name: 'd', oid: 1082 },
                { name: 'ts', oid: 1114 },
                { name: 't', oid: 25 },
            ],
            rows: [
                [
                    't',
                    '42',
                    '2.5',
                    '2000-01-03',
                    '2000-01-01 00:00:01.5+00',
                    'x',
                ],
                [null, null, null, null, null, null],
            ],
            commandTag: 'SELECT 2',
        };
    }
    if (sql === 'SELECT who') {
        return {
            type: 'rows',
            fields: [{ name: 'who', oid: 25 }],
            rows: [[session.user]],
            commandTag: 'SELECT 1',
        };
    }
    return {
        type: 'rows',
        fields: [{ name: 'sql', oid: 25 }],
        rows: [[sql]],
        commandTag: 'SELECT 1',
    };
};

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
    describe: async (session, sql) => {
        handlerCalls.push({ kind: 'describe', sql });
        const result = cannedResult(session, sql);
        return result.type === 'rows' ? result.fields : null;
    },
    query: async (session, sql) => {
        handlerCalls.push({ kind: 'query', sql });
        return cannedResult(session, sql);
    },
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
        await reader.readUntil('Z');

        // the extended protocol runs over the upgraded socket too
        secureSocket.write(
            Buffer.concat([
                parseMessage('', 'SELECT who'),
                bindMessage(),
                describeMessage('P'),
                executeMessage(),
                syncMessage(),
            ]),
        );
        expect(await readTypesUntilReady(reader)).toBe('12TDCZ');
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

describe('PostgresWireServer extended query protocol', () => {
    const openSockets: net.Socket[] = [];
    const servers: PostgresWireServer<TestSession>[] = [];
    const clients: Client[] = [];

    const startServer = async (): Promise<number> => {
        const server = new PostgresWireServer(testHandlers);
        servers.push(server);
        await server.listen(0, '127.0.0.1');
        const address = server.address();
        if (!address) throw new Error('server has no address');
        return address.port;
    };

    /** Plaintext connection authenticated as alice, positioned after ReadyForQuery */
    const openSession = async (): Promise<{
        socket: net.Socket;
        reader: MessageReader;
    }> => {
        const port = await startServer();
        const socket = await connect(port);
        openSockets.push(socket);
        const reader = new MessageReader(socket);
        socket.write(startupMessage({ user: 'alice', database: 'db' }));
        await reader.readUntil('R');
        socket.write(passwordMessage('good-token'));
        await reader.readUntil('Z');
        return { socket, reader };
    };

    /** node-postgres client (uses the extended protocol whenever values are given) */
    const openClient = async (): Promise<Client> => {
        const port = await startServer();
        const client = new Client({
            host: '127.0.0.1',
            port,
            user: 'alice',
            password: 'good-token',
            database: 'db',
            ssl: false,
        });
        clients.push(client);
        await client.connect();
        return client;
    };

    const dataRowText = (payload: Buffer): string =>
        payload.subarray(6).toString('utf8'); // int16 count, int32 length, bytes

    beforeEach(() => {
        handlerCalls.splice(0);
    });

    afterEach(async () => {
        await Promise.all(clients.splice(0).map((client) => client.end()));
        openSockets.splice(0).forEach((socket) => socket.destroy());
        await Promise.all(servers.splice(0).map((server) => server.close()));
    });

    it('runs the pgjdbc-style one-shot flow: Parse, Bind, Describe portal, Execute, Sync', async () => {
        const { socket, reader } = await openSession();
        socket.write(
            Buffer.concat([
                parseMessage('', 'SELECT who'),
                bindMessage(),
                describeMessage('P'),
                executeMessage(),
                syncMessage(),
            ]),
        );
        expect(await reader.readMessage()).toMatchObject({ type: '1' });
        expect(await reader.readMessage()).toMatchObject({ type: '2' });
        const rowDescription = await reader.readMessage();
        expect(rowDescription.type).toBe('T');
        expect(rowDescription.payload.toString('utf8')).toContain('who');
        const dataRow = await reader.readMessage();
        expect(dataRow.type).toBe('D');
        expect(dataRowText(dataRow.payload)).toBe('alice');
        const complete = await reader.readMessage();
        expect(complete.type).toBe('C');
        expect(complete.payload.toString('utf8')).toBe('SELECT 1\0');
        expect(await reader.readMessage()).toMatchObject({ type: 'Z' });
        expect(handlerCalls).toEqual([
            { kind: 'describe', sql: 'SELECT who' },
            { kind: 'query', sql: 'SELECT who' },
        ]);
    });

    it('describes a statement before it is bound with ParameterDescription and RowDescription', async () => {
        const { socket, reader } = await openSession();
        socket.write(
            Buffer.concat([
                parseMessage(
                    's1',
                    'SELECT * FROM t WHERE a = $1 AND b = $2',
                    [23, 0],
                ),
                describeMessage('S', 's1'),
                syncMessage(),
            ]),
        );
        expect(await reader.readMessage()).toMatchObject({ type: '1' });
        const parameterDescription = await reader.readMessage();
        expect(parameterDescription.type).toBe('t');
        expect(parameterDescription.payload.readInt16BE(0)).toBe(2);
        expect(parameterDescription.payload.readInt32BE(2)).toBe(23);
        expect(parameterDescription.payload.readInt32BE(6)).toBe(25); // 0 -> text
        expect(await reader.readMessage()).toMatchObject({ type: 'T' });
        expect(await reader.readMessage()).toMatchObject({ type: 'Z' });
        // described with placeholder literals of the right shape
        expect(handlerCalls).toEqual([
            {
                kind: 'describe',
                sql: "SELECT * FROM t WHERE a = 1 AND b = ''",
            },
        ]);

        socket.write(
            Buffer.concat([
                bindMessage({ statement: 's1', parameters: ['7', "O'Brien"] }),
                executeMessage(),
                syncMessage(),
            ]),
        );
        expect(await readTypesUntilReady(reader)).toBe('2DCZ');
        expect(handlerCalls.at(-1)).toEqual({
            kind: 'query',
            sql: "SELECT * FROM t WHERE a = 7 AND b = 'O''Brien'",
        });
    });

    it('answers NoData and a bare CommandComplete for statements without rows', async () => {
        const { socket, reader } = await openSession();
        socket.write(
            Buffer.concat([
                parseMessage('', "SET application_name = 'x'"),
                bindMessage(),
                describeMessage('P'),
                executeMessage(),
                syncMessage(),
            ]),
        );
        expect(await readTypesUntilReady(reader)).toBe('12nCZ');
    });

    it('answers EmptyQueryResponse for an empty statement', async () => {
        const { socket, reader } = await openSession();
        socket.write(
            Buffer.concat([
                parseMessage('', '   '),
                bindMessage(),
                describeMessage('P'),
                executeMessage(),
                syncMessage(),
            ]),
        );
        expect(await readTypesUntilReady(reader)).toBe('12nIZ');
        expect(handlerCalls).toEqual([]);
    });

    it('suspends and resumes a portal when Execute limits rows', async () => {
        const { socket, reader } = await openSession();
        socket.write(
            Buffer.concat([
                parseMessage('', 'SELECT three'),
                bindMessage({ portal: 'c1' }),
                executeMessage('c1', 2),
                flushMessage(),
            ]),
        );
        expect(await reader.readMessage()).toMatchObject({ type: '1' });
        expect(await reader.readMessage()).toMatchObject({ type: '2' });
        expect(dataRowText((await reader.readMessage()).payload)).toBe('1');
        expect(dataRowText((await reader.readMessage()).payload)).toBe('2');
        expect(await reader.readMessage()).toMatchObject({ type: 's' });

        socket.write(Buffer.concat([executeMessage('c1', 2), syncMessage()]));
        expect(dataRowText((await reader.readMessage()).payload)).toBe('3');
        expect(await reader.readMessage()).toMatchObject({ type: 'C' });
        expect(await reader.readMessage()).toMatchObject({ type: 'Z' });
        // the query ran once; the second Execute resumed from the cursor
        expect(handlerCalls.filter((c) => c.kind === 'query')).toHaveLength(1);
    });

    it('ignores everything after an error until Sync, then recovers', async () => {
        const { socket, reader } = await openSession();
        socket.write(
            Buffer.concat([
                parseMessage('', 'SELECT fail'),
                bindMessage(),
                describeMessage('P'),
                executeMessage(),
                closeMessage('P'),
                queryMessage('SELECT who'), // ignored too, like Postgres
                syncMessage(),
            ]),
        );
        expect(await reader.readMessage()).toMatchObject({ type: '1' });
        expect(await reader.readMessage()).toMatchObject({ type: '2' });
        const error = await reader.readMessage();
        expect(error.type).toBe('E');
        expect(errorCode(error.payload)).toBe('XX001');
        expect(await reader.readMessage()).toMatchObject({ type: 'Z' });

        socket.write(queryMessage('SELECT who'));
        expect(await readTypesUntilReady(reader)).toBe('TDCZ');
    });

    it('decodes binary parameters and encodes binary result columns', async () => {
        const { socket, reader } = await openSession();
        const int4 = Buffer.alloc(4);
        int4.writeInt32BE(-7);
        const float8 = Buffer.alloc(8);
        float8.writeDoubleBE(2.5);
        socket.write(
            Buffer.concat([
                parseMessage('', 'SELECT $1, $2, $3, $4', [23, 701, 16, 25]),
                bindMessage({
                    parameterFormats: [1, 1, 1, 0],
                    parameters: [int4, float8, Buffer.from([1]), 'plain'],
                }),
                executeMessage(),
                syncMessage(),
            ]),
        );
        expect(await readTypesUntilReady(reader)).toBe('12DCZ');
        expect(handlerCalls.at(-1)).toEqual({
            kind: 'query',
            sql: "SELECT -7, 2.5, TRUE, 'plain'",
        });

        socket.write(
            Buffer.concat([
                parseMessage('', 'SELECT typed'),
                bindMessage({ resultFormats: [1] }),
                describeMessage('P'),
                executeMessage(),
                syncMessage(),
            ]),
        );
        expect(await reader.readMessage()).toMatchObject({ type: '1' });
        expect(await reader.readMessage()).toMatchObject({ type: '2' });
        const rowDescription = await reader.readMessage();
        expect(rowDescription.type).toBe('T');
        // last int16 of the first field entry is its format code
        expect(rowDescription.payload.readInt16BE(2 + 2 + 18 - 2)).toBe(1);
        const row = await reader.readMessage();
        expect(row.type).toBe('D');
        let offset = 2;
        const next = (): Buffer => {
            const length = row.payload.readInt32BE(offset);
            const value = row.payload.subarray(offset + 4, offset + 4 + length);
            offset += 4 + length;
            return value;
        };
        expect(next()).toEqual(Buffer.from([1])); // bool
        expect(next().readBigInt64BE(0)).toBe(42n); // int8
        expect(next().readDoubleBE(0)).toBe(2.5); // float8
        expect(next().readInt32BE(0)).toBe(2); // date: days since 2000-01-01
        expect(next().readBigInt64BE(0)).toBe(1_500_000n); // timestamp: micros since 2000-01-01
        expect(next().toString('utf8')).toBe('x'); // text
        const nullRow = await reader.readMessage();
        expect(nullRow.payload.readInt32BE(2)).toBe(-1);
        expect(await readTypesUntilReady(reader)).toBe('CZ');
    });

    it('rejects binary formats for types it cannot encode, and malformed binary parameters', async () => {
        const { socket, reader } = await openSession();
        socket.write(
            Buffer.concat([
                parseMessage('', 'SELECT numeric'),
                bindMessage({ resultFormats: [1] }),
                executeMessage(),
                syncMessage(),
            ]),
        );
        expect(await reader.readMessage()).toMatchObject({ type: '1' });
        expect(await reader.readMessage()).toMatchObject({ type: '2' });
        const resultError = await reader.readMessage();
        expect(errorCode(resultError.payload)).toBe('0A000');
        expect(await reader.readMessage()).toMatchObject({ type: 'Z' });

        socket.write(
            Buffer.concat([
                parseMessage('', 'SELECT $1', [23]),
                bindMessage({
                    parameterFormats: [1],
                    parameters: [Buffer.from([0])],
                }),
                syncMessage(),
            ]),
        );
        expect(await reader.readMessage()).toMatchObject({ type: '1' });
        const paramError = await reader.readMessage();
        expect(errorCode(paramError.payload)).toBe('22P03');
        expect(await reader.readMessage()).toMatchObject({ type: 'Z' });

        socket.write(
            Buffer.concat([
                parseMessage('', 'SELECT $1', [1700]),
                bindMessage({
                    parameterFormats: [1],
                    parameters: [Buffer.from([0])],
                }),
                syncMessage(),
            ]),
        );
        expect(await reader.readMessage()).toMatchObject({ type: '1' });
        const numericError = await reader.readMessage();
        expect(errorCode(numericError.payload)).toBe('0A000');
        expect(await reader.readMessage()).toMatchObject({ type: 'Z' });
    });

    it('keeps portals alive across Sync inside a transaction and reports the status', async () => {
        const { socket, reader } = await openSession();
        socket.write(queryMessage('BEGIN'));
        const begin = await reader.readMessage();
        expect(begin.type).toBe('C');
        const inTransaction = await reader.readMessage();
        expect(inTransaction.payload.toString('utf8')).toBe('T');

        socket.write(
            Buffer.concat([
                parseMessage('', 'SELECT three'),
                bindMessage({ portal: 'C_1' }),
                executeMessage('C_1', 2),
                syncMessage(),
                executeMessage('C_1', 2),
                syncMessage(),
            ]),
        );
        expect(await readTypesUntilReady(reader)).toBe('12DDsZ');
        expect(await readTypesUntilReady(reader)).toBe('DCZ');

        socket.write(queryMessage('COMMIT'));
        await reader.readUntil('C');
        const idle = await reader.readMessage();
        expect(idle.payload.toString('utf8')).toBe('I');
        socket.write(Buffer.concat([executeMessage('C_1'), syncMessage()]));
        expect(await readTypesUntilReady(reader)).toBe('EZ');
    });

    it('reports statement and portal bookkeeping errors with Postgres SQLSTATEs', async () => {
        const { socket, reader } = await openSession();
        const expectError = async (
            frontend: Buffer,
            code: string,
        ): Promise<void> => {
            socket.write(Buffer.concat([frontend, syncMessage()]));
            const error = await reader.readUntil('E');
            expect(errorCode(error.payload)).toBe(code);
            await reader.readUntil('Z');
        };

        await expectError(bindMessage({ statement: 'missing' }), '26000');
        await expectError(executeMessage('missing'), '34000');
        await expectError(describeMessage('S', 'missing'), '26000');
        await expectError(describeMessage('P', 'missing'), '34000');
        await expectError(
            Buffer.concat([
                parseMessage('', 'SELECT $1', [23]),
                bindMessage({ parameters: [] }),
            ]),
            '08P01',
        );
        await expectError(
            Buffer.concat([
                parseMessage('dup', 'SELECT who'),
                parseMessage('dup', 'SELECT who'),
            ]),
            '42P05',
        );
        await expectError(
            Buffer.concat([
                parseMessage('', 'SELECT who'),
                bindMessage({ portal: 'p' }),
                bindMessage({ portal: 'p' }),
            ]),
            '42P03',
        );
    });

    it('closes statements and portals, and clears portals on Sync', async () => {
        const { socket, reader } = await openSession();
        socket.write(
            Buffer.concat([
                parseMessage('s1', 'SELECT who'),
                bindMessage({ portal: 'p1', statement: 's1' }),
                closeMessage('P', 'p1'),
                closeMessage('P', 'never-existed'),
                executeMessage('p1'),
                syncMessage(),
            ]),
        );
        expect(await reader.readMessage()).toMatchObject({ type: '1' });
        expect(await reader.readMessage()).toMatchObject({ type: '2' });
        expect(await reader.readMessage()).toMatchObject({ type: '3' });
        expect(await reader.readMessage()).toMatchObject({ type: '3' });
        expect(errorCode((await reader.readMessage()).payload)).toBe('34000');
        expect(await reader.readMessage()).toMatchObject({ type: 'Z' });

        // statement survives Sync, a portal does not
        socket.write(
            Buffer.concat([
                bindMessage({ portal: 'p2', statement: 's1' }),
                syncMessage(),
                executeMessage('p2'),
                syncMessage(),
            ]),
        );
        expect(await readTypesUntilReady(reader)).toBe('2Z');
        expect(await readTypesUntilReady(reader)).toBe('EZ');

        socket.write(
            Buffer.concat([
                closeMessage('S', 's1'),
                bindMessage({ statement: 's1' }),
                syncMessage(),
            ]),
        );
        expect(await readTypesUntilReady(reader)).toBe('3EZ');
    });

    it('rejects protocol violations in Bind with 08P01 before touching the query', async () => {
        const { socket, reader } = await openSession();
        const expectError = async (
            frontend: Buffer,
            code: string,
        ): Promise<void> => {
            socket.write(Buffer.concat([frontend, syncMessage()]));
            const error = await reader.readUntil('E');
            expect(errorCode(error.payload)).toBe(code);
            await reader.readUntil('Z');
        };
        // two parameter formats for three parameters
        await expectError(
            Buffer.concat([
                parseMessage('', 'SELECT $1, $2, $3'),
                bindMessage({
                    parameterFormats: [0, 1],
                    parameters: ['a', 'b', 'c'],
                }),
            ]),
            '08P01',
        );
        // format code other than 0/1
        await expectError(
            Buffer.concat([
                parseMessage('', 'SELECT who'),
                bindMessage({ resultFormats: [2] }),
            ]),
            '08P01',
        );
        // parameter length below -1
        const corruptBind = typedMessage(
            'B',
            Buffer.concat([
                cstring(''),
                cstring(''),
                int16(0),
                int16(1),
                int32(-2),
                int16(0),
            ]),
        );
        await expectError(
            Buffer.concat([parseMessage('', 'SELECT $1'), corruptBind]),
            '08P01',
        );
        // more result formats than columns is caught at Describe, before Execute
        socket.write(
            Buffer.concat([
                parseMessage('', 'SELECT who'),
                bindMessage({ resultFormats: [0, 0] }),
                describeMessage('P'),
                executeMessage(),
                syncMessage(),
            ]),
        );
        expect(await readTypesUntilReady(reader)).toBe('12EZ');
        expect(handlerCalls.filter((c) => c.kind === 'query')).toEqual([]);
    });

    it('rejects absurd placeholder numbers with 54023 without allocating for them', async () => {
        const { socket, reader } = await openSession();
        socket.write(
            Buffer.concat([
                parseMessage('', 'SELECT $4000000000'),
                syncMessage(),
            ]),
        );
        const error = await reader.readMessage();
        expect(errorCode(error.payload)).toBe('54023');
        expect(await reader.readMessage()).toMatchObject({ type: 'Z' });
    });

    it('refuses statements that grow past 1MB after parameter substitution with 54000', async () => {
        const { socket, reader } = await openSession();
        const placeholders = Array.from({ length: 64 }, () => '$1').join(',');
        socket.write(
            Buffer.concat([
                parseMessage('', `SELECT ${placeholders}`),
                bindMessage({ parameters: ['x'.repeat(20_000)] }),
                syncMessage(),
            ]),
        );
        expect(await reader.readMessage()).toMatchObject({ type: '1' });
        const error = await reader.readMessage();
        expect(errorCode(error.payload)).toBe('54000');
        expect(await reader.readMessage()).toMatchObject({ type: 'Z' });
    });

    it('describes statements with more than 32767 parameters (counts are unsigned)', async () => {
        const { socket, reader } = await openSession();
        socket.write(
            Buffer.concat([
                parseMessage('', 'SELECT $40000'),
                describeMessage('S'),
                syncMessage(),
            ]),
        );
        expect(await reader.readMessage()).toMatchObject({ type: '1' });
        const parameterDescription = await reader.readMessage();
        expect(parameterDescription.type).toBe('t');
        expect(parameterDescription.payload.readUInt16BE(0)).toBe(40000);
        expect(await readTypesUntilReady(reader)).toBe('TZ');
    });

    it('strips NUL bytes from outbound strings so error fields stay intact', async () => {
        const { socket, reader } = await openSession();
        socket.write(queryMessage('SELECT nul'));
        const error = await reader.readMessage();
        expect(error.type).toBe('E');
        expect(error.payload.toString('utf8')).toContain('Mbadvalue\0');
        expect(error.payload.toString('utf8')).toContain('Hhinttoo\0');
        await reader.readUntil('Z');
    });

    it('budgets the SQL held by statements and portals together with 54000', async () => {
        const { socket, reader } = await openSession();
        // ~1MB of inlined SQL per portal, kept alive by the transaction
        const placeholders = Array.from({ length: 100 }, () => '$1').join(',');
        socket.write(queryMessage('BEGIN'));
        await reader.readUntil('Z');
        socket.write(
            Buffer.concat([
                parseMessage('big', `SELECT ${placeholders}`),
                ...Array.from({ length: 17 }, (_, i) =>
                    bindMessage({
                        portal: `p${i}`,
                        statement: 'big',
                        parameters: ['x'.repeat(10_000)],
                    }),
                ),
                syncMessage(),
            ]),
        );
        expect(await readTypesUntilReady(reader)).toBe(`1${'2'.repeat(16)}EZ`);
        // closing a portal frees its share
        socket.write(
            Buffer.concat([
                closeMessage('P', 'p0'),
                bindMessage({
                    portal: 'p17',
                    statement: 'big',
                    parameters: ['x'.repeat(10_000)],
                }),
                syncMessage(),
            ]),
        );
        expect(await readTypesUntilReady(reader)).toBe('32Z');
    });

    it('caps named statements and portals per connection with 54000', async () => {
        const { socket, reader } = await openSession();
        const batch = Buffer.concat(
            Array.from({ length: 1000 }, (_, i) =>
                parseMessage(`s${i}`, 'SELECT who'),
            ),
        );
        socket.write(Buffer.concat([batch, syncMessage()]));
        expect(await readTypesUntilReady(reader)).toBe(`${'1'.repeat(1000)}Z`);

        socket.write(
            Buffer.concat([
                parseMessage('one-too-many', 'SELECT who'),
                syncMessage(),
            ]),
        );
        expect(await readTypesUntilReady(reader)).toBe('EZ');
        // the unnamed statement is exempt
        socket.write(
            Buffer.concat([
                parseMessage('', 'SELECT who'),
                bindMessage({ statement: 's999' }),
                syncMessage(),
            ]),
        );
        expect(await readTypesUntilReady(reader)).toBe('12Z');

        // portals are capped the same way (inside a transaction they survive Sync)
        socket.write(queryMessage('BEGIN'));
        await reader.readUntil('Z');
        socket.write(
            Buffer.concat([
                ...Array.from({ length: 1000 }, (_, i) =>
                    bindMessage({ portal: `p${i}`, statement: 's1' }),
                ),
                bindMessage({ portal: 'one-too-many', statement: 's1' }),
                syncMessage(),
            ]),
        );
        expect(await readTypesUntilReady(reader)).toBe(`${'2'.repeat(1000)}EZ`);
        socket.write(queryMessage('DISCARD PLANS')); // not ALL: nothing dropped
        await reader.readUntil('Z');
        socket.write(
            Buffer.concat([
                bindMessage({ portal: 'still-full', statement: 's1' }),
                syncMessage(),
            ]),
        );
        expect(await readTypesUntilReady(reader)).toBe('EZ');

        // DISCARD ALL frees everything
        socket.write(queryMessage('DISCARD ALL'));
        await reader.readUntil('Z');
        socket.write(
            Buffer.concat([
                parseMessage('s1', 'SELECT who'), // was taken before DISCARD
                syncMessage(),
            ]),
        );
        expect(await readTypesUntilReady(reader)).toBe('1Z');
    });

    it('encodes mixed per-column result formats', async () => {
        const { socket, reader } = await openSession();
        socket.write(
            Buffer.concat([
                parseMessage('', 'SELECT typed'),
                bindMessage({ resultFormats: [1, 0, 0, 0, 0, 0] }),
                executeMessage(),
                syncMessage(),
            ]),
        );
        expect(await reader.readMessage()).toMatchObject({ type: '1' });
        expect(await reader.readMessage()).toMatchObject({ type: '2' });
        const row = await reader.readMessage();
        expect(row.type).toBe('D');
        // first column binary bool (1 byte), second column text '42'
        expect(row.payload.readInt32BE(2)).toBe(1);
        expect(row.payload[6]).toBe(1);
        expect(row.payload.readInt32BE(7)).toBe(2);
        expect(row.payload.subarray(11, 13).toString('utf8')).toBe('42');
        await reader.readUntil('Z');
    });

    it('runs two pipelined batches when the first one fails', async () => {
        const { socket, reader } = await openSession();
        socket.write(
            Buffer.concat([
                parseMessage('', 'SELECT fail'),
                bindMessage(),
                executeMessage(),
                syncMessage(),
                parseMessage('', 'SELECT who'),
                bindMessage(),
                executeMessage(),
                syncMessage(),
            ]),
        );
        expect(await readTypesUntilReady(reader)).toBe('12EZ');
        expect(await readTypesUntilReady(reader)).toBe('12DCZ');
    });

    it('re-executing a finished portal completes again without rows', async () => {
        const { socket, reader } = await openSession();
        socket.write(queryMessage('BEGIN'));
        await reader.readUntil('Z');
        socket.write(
            Buffer.concat([
                parseMessage('', 'SELECT three'),
                bindMessage({ portal: 'p' }),
                executeMessage('p'),
                syncMessage(),
                executeMessage('p'),
                syncMessage(),
            ]),
        );
        expect(await readTypesUntilReady(reader)).toBe('12DDDCZ');
        expect(await readTypesUntilReady(reader)).toBe('CZ');
        expect(
            handlerCalls.filter(
                (c) => c.kind === 'query' && c.sql === 'SELECT three',
            ),
        ).toHaveLength(1);
    });

    it('rejects extended messages before authentication', async () => {
        const port = await startServer();
        const socket = await connect(port);
        openSockets.push(socket);
        const reader = new MessageReader(socket);
        socket.write(startupMessage({ user: 'alice', database: 'db' }));
        await reader.readUntil('R');
        socket.write(parseMessage('', 'SELECT who'));
        const error = await reader.readMessage();
        expect(errorCode(error.payload)).toBe('08P01');
        await reader.waitForClose();
    });

    it('serves node-postgres parameterised queries', async () => {
        const client = await openClient();
        const result = await client.query('SELECT who', []);
        expect(result.rows).toEqual([{ who: 'alice' }]);
        expect(result.command).toBe('SELECT');

        const withParams = await client.query(
            'SELECT * FROM t WHERE a = $1 AND b = $2 AND c = $3',
            ['x', 42, null],
        );
        expect(withParams.rows).toEqual([
            { sql: "SELECT * FROM t WHERE a = 'x' AND b = '42' AND c = NULL" },
        ]);
    });

    it('inlines multibyte text parameters from node-postgres and serves binary rows', async () => {
        const client = await openClient();
        const unicode = await client.query('SELECT * FROM t WHERE name = $1', [
            'héllo 日本 ✓',
        ]);
        expect(unicode.rows).toEqual([
            { sql: "SELECT * FROM t WHERE name = 'héllo 日本 ✓'" },
        ]);

        // node-postgres supports `binary` but its types don't declare it
        const binary = await client.query({
            text: 'SELECT typed',
            values: [],
            binary: true,
        } as unknown as QueryConfig);
        expect(binary.rows[0]).toMatchObject({
            b: true,
            i: '42', // node-postgres keeps int8 as string
            f: 2.5,
            t: 'x',
        });
        expect(binary.rows[0].d.toISOString().slice(0, 10)).toBe('2000-01-03');
        expect(binary.rows[1]).toEqual({
            b: null,
            i: null,
            f: null,
            d: null,
            ts: null,
            t: null,
        });
    });

    it('serves node-postgres named prepared statements across queries', async () => {
        const client = await openClient();
        const first = await client.query({
            name: 'named',
            text: 'SELECT who',
            values: [],
        });
        const second = await client.query({
            name: 'named',
            text: 'SELECT who',
            values: [],
        });
        expect(first.rows).toEqual([{ who: 'alice' }]);
        expect(second.rows).toEqual([{ who: 'alice' }]);
        expect(handlerCalls.filter((c) => c.kind === 'query')).toHaveLength(2);
    });

    it('surfaces handler errors to node-postgres and keeps the connection usable', async () => {
        const client = await openClient();
        await expect(client.query('SELECT fail', [])).rejects.toMatchObject({
            code: 'XX001',
            message: 'canned failure',
        });
        const after = await client.query('SELECT who', []);
        expect(after.rows).toEqual([{ who: 'alice' }]);
    });

    it('still serves simple queries from node-postgres', async () => {
        const client = await openClient();
        const result = await client.query('SELECT who');
        expect(result.rows).toEqual([{ who: 'alice' }]);
        expect(handlerCalls).toEqual([{ kind: 'query', sql: 'SELECT who' }]);
    });
});
