import * as net from 'net';
import Logger from '../../logging/logger';

/**
 * A minimal implementation of the Postgres wire protocol (v3) frontend/backend
 * message flow, supporting cleartext password authentication and the simple
 * query protocol. Enough for psql, node-postgres and most drivers that don't
 * force the extended protocol for parameterless queries.
 *
 * Protocol reference: https://www.postgresql.org/docs/current/protocol-message-formats.html
 */

const PROTOCOL_VERSION = 196608; // 3.0
const SSL_REQUEST_CODE = 80877103;
const GSSENC_REQUEST_CODE = 80877104;
const CANCEL_REQUEST_CODE = 80877102;
const MAX_MESSAGE_LENGTH = 1024 * 1024; // 1MB

export class PgWireServerError extends Error {
    constructor(
        message: string,
        public readonly code: string = 'XX000',
        public readonly hint?: string,
    ) {
        super(message);
        this.name = 'PgWireServerError';
    }
}

export type PgWireResultField = {
    name: string;
    /** Postgres type OID (e.g. 25 text, 701 float8) */
    oid: number;
};

export type PgWireQueryResult =
    | {
          type: 'rows';
          fields: PgWireResultField[];
          /** row values pre-serialized to Postgres text format; null for SQL NULL */
          rows: (string | null)[][];
          commandTag: string;
      }
    | { type: 'command'; commandTag: string };

export type PgWireHandlers<TSession> = {
    /** Throw PgWireServerError to reject the connection */
    authenticate: (params: {
        user: string;
        database: string;
        password: string;
    }) => Promise<TSession>;
    /** Throw PgWireServerError to return an error to the client */
    query: (session: TSession, sql: string) => Promise<PgWireQueryResult>;
};

// --- message encoding helpers ---

const cstring = (s: string): Buffer =>
    Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from([0])]);

const int16 = (n: number): Buffer => {
    const b = Buffer.alloc(2);
    b.writeInt16BE(n);
    return b;
};

const int32 = (n: number): Buffer => {
    const b = Buffer.alloc(4);
    b.writeInt32BE(n);
    return b;
};

const message = (type: string, ...parts: Buffer[]): Buffer => {
    const body = Buffer.concat(parts);
    return Buffer.concat([Buffer.from(type), int32(body.length + 4), body]);
};

const authenticationCleartextPassword = () => message('R', int32(3));
const authenticationOk = () => message('R', int32(0));
const parameterStatus = (name: string, value: string) =>
    message('S', cstring(name), cstring(value));
const backendKeyData = (pid: number, secret: number) =>
    message('K', int32(pid), int32(secret));
const readyForQuery = () => message('Z', Buffer.from('I'));
const commandComplete = (tag: string) => message('C', cstring(tag));
const emptyQueryResponse = () => message('I');

const errorResponse = (error: PgWireServerError): Buffer => {
    const parts: Buffer[] = [
        Buffer.from('S'),
        cstring('ERROR'),
        Buffer.from('V'),
        cstring('ERROR'),
        Buffer.from('C'),
        cstring(error.code),
        Buffer.from('M'),
        cstring(error.message),
    ];
    if (error.hint) {
        parts.push(Buffer.from('H'), cstring(error.hint));
    }
    parts.push(Buffer.from([0]));
    return message('E', ...parts);
};

const rowDescription = (fields: PgWireResultField[]): Buffer => {
    const parts: Buffer[] = [int16(fields.length)];
    for (const field of fields) {
        parts.push(
            cstring(field.name),
            int32(0), // table oid
            int16(0), // attribute number
            int32(field.oid),
            int16(-1), // type length (variable)
            int32(-1), // type modifier
            int16(0), // text format
        );
    }
    return message('T', ...parts);
};

const dataRow = (values: (string | null)[]): Buffer => {
    const parts: Buffer[] = [int16(values.length)];
    for (const value of values) {
        if (value === null) {
            parts.push(int32(-1));
        } else {
            const bytes = Buffer.from(value, 'utf8');
            parts.push(int32(bytes.length), bytes);
        }
    }
    return message('D', ...parts);
};

const toServerError = (e: unknown): PgWireServerError => {
    if (e instanceof PgWireServerError) return e;
    const errorMessage = e instanceof Error ? e.message : String(e);
    return new PgWireServerError(errorMessage);
};

type ConnectionPhase = 'startup' | 'password' | 'ready';

/** State machine for a single client connection */
class PgWireConnection<TSession> {
    private buffer: Buffer = Buffer.alloc(0);

    private phase: ConnectionPhase = 'startup';

    private startupParams: Record<string, string> = {};

    private session: TSession | null = null;

    /** serializes async message handling for this connection */
    private chain: Promise<void> = Promise.resolve();

    constructor(
        private socket: net.Socket,
        private handlers: PgWireHandlers<TSession>,
    ) {
        socket.on('data', (chunk) => {
            try {
                this.buffer = Buffer.concat([this.buffer, chunk]);
                this.drainBuffer();
            } catch (e) {
                Logger.warn(
                    `pgwire: closing connection after protocol error: ${
                        e instanceof Error ? e.message : e
                    }`,
                );
                socket.destroy();
            }
        });
        socket.on('error', (e) => {
            Logger.debug(`pgwire: socket error: ${e.message}`);
        });
    }

    /** Extract complete frontend messages from the buffer and queue them */
    private drainBuffer(): void {
        for (;;) {
            if (this.phase === 'startup') {
                // untyped startup packet: int32 length, int32 code
                if (this.buffer.length < 8) return;
                const length = this.buffer.readInt32BE(0);
                if (length > MAX_MESSAGE_LENGTH || length < 8) {
                    throw new Error(`invalid startup packet length ${length}`);
                }
                if (this.buffer.length < length) return;
                const code = this.buffer.readInt32BE(4);
                const payload = this.buffer.subarray(8, length);
                this.buffer = this.buffer.subarray(length);
                if (code === SSL_REQUEST_CODE || code === GSSENC_REQUEST_CODE) {
                    // SSL/GSS not supported: client falls back to plaintext
                    this.socket.write('N');
                } else if (code === CANCEL_REQUEST_CODE) {
                    this.socket.end();
                    return;
                } else if (code === PROTOCOL_VERSION) {
                    this.handleStartup(payload);
                } else {
                    throw new Error(`unsupported protocol version ${code}`);
                }
            } else {
                // typed message: byte type, int32 length (includes itself)
                if (this.buffer.length < 5) return;
                const type = String.fromCharCode(this.buffer[0]);
                const length = this.buffer.readInt32BE(1);
                if (length > MAX_MESSAGE_LENGTH || length < 4) {
                    throw new Error(`invalid message length ${length}`);
                }
                if (this.buffer.length < length + 1) return;
                const payload = Buffer.from(
                    this.buffer.subarray(5, length + 1),
                );
                this.buffer = this.buffer.subarray(length + 1);
                this.enqueue(type, payload);
            }
        }
    }

    private handleStartup(payload: Buffer): void {
        const params: Record<string, string> = {};
        let offset = 0;
        while (offset < payload.length) {
            const keyEnd = payload.indexOf(0, offset);
            if (keyEnd === -1 || keyEnd === offset) break;
            const key = payload.toString('utf8', offset, keyEnd);
            const valueEnd = payload.indexOf(0, keyEnd + 1);
            if (valueEnd === -1) break;
            params[key] = payload.toString('utf8', keyEnd + 1, valueEnd);
            offset = valueEnd + 1;
        }
        this.startupParams = params;
        this.phase = 'password';
        this.socket.write(authenticationCleartextPassword());
    }

    private enqueue(type: string, payload: Buffer): void {
        this.chain = this.chain
            .then(() => this.handleMessage(type, payload))
            .catch((e) => {
                Logger.error(
                    `pgwire: unexpected error handling message: ${
                        e instanceof Error ? e.stack : e
                    }`,
                );
                this.socket.destroy();
            });
    }

    private async handleMessage(type: string, payload: Buffer): Promise<void> {
        if (this.socket.destroyed) return;
        switch (type) {
            case 'p': {
                if (this.phase !== 'password') return;
                const end = payload.indexOf(0);
                const password = payload.toString(
                    'utf8',
                    0,
                    end === -1 ? payload.length : end,
                );
                await this.authenticate(password);
                return;
            }
            case 'Q': {
                if (this.phase !== 'ready') {
                    this.socket.write(
                        errorResponse(
                            new PgWireServerError(
                                'connection not authenticated',
                                '08P01',
                            ),
                        ),
                    );
                    this.socket.end();
                    return;
                }
                const end = payload.indexOf(0);
                const sql = payload.toString(
                    'utf8',
                    0,
                    end === -1 ? payload.length : end,
                );
                await this.runQuery(sql);
                return;
            }
            case 'X': // Terminate
                this.socket.end();
                return;
            case 'P': // extended query protocol not supported
            case 'B':
            case 'D':
            case 'E':
            case 'C':
            case 'H':
            case 'S': {
                this.socket.write(
                    errorResponse(
                        new PgWireServerError(
                            'the extended query protocol is not supported',
                            '0A000',
                            'Use simple queries without bind parameters',
                        ),
                    ),
                );
                // Sync: let the client recover
                if (type === 'S') this.socket.write(readyForQuery());
                return;
            }
            default:
                this.socket.write(
                    errorResponse(
                        new PgWireServerError(
                            `unsupported message type "${type}"`,
                            '08P01',
                        ),
                    ),
                );
        }
    }

    private async authenticate(password: string): Promise<void> {
        const user = this.startupParams.user ?? '';
        const database = this.startupParams.database ?? user;
        try {
            this.session = await this.handlers.authenticate({
                user,
                database,
                password,
            });
        } catch (e) {
            const error =
                e instanceof PgWireServerError
                    ? e
                    : new PgWireServerError(
                          e instanceof Error ? e.message : String(e),
                          '28P01',
                      );
            this.socket.write(errorResponse(error));
            this.socket.end();
            return;
        }
        this.phase = 'ready';
        this.socket.write(
            Buffer.concat([
                authenticationOk(),
                parameterStatus('server_version', '16.3 (Lightdash)'),
                parameterStatus('server_encoding', 'UTF8'),
                parameterStatus('client_encoding', 'UTF8'),
                parameterStatus('DateStyle', 'ISO, MDY'),
                parameterStatus('TimeZone', 'UTC'),
                parameterStatus('integer_datetimes', 'on'),
                parameterStatus('standard_conforming_strings', 'on'),
                backendKeyData(
                    process.pid,
                    Math.floor(Math.random() * 2 ** 31),
                ),
                readyForQuery(),
            ]),
        );
    }

    private async runQuery(sql: string): Promise<void> {
        if (sql.trim().length === 0) {
            this.socket.write(
                Buffer.concat([emptyQueryResponse(), readyForQuery()]),
            );
            return;
        }
        try {
            const result = await this.handlers.query(
                this.session as TSession,
                sql,
            );
            const buffers: Buffer[] = [];
            if (result.type === 'rows') {
                buffers.push(rowDescription(result.fields));
                for (const row of result.rows) {
                    buffers.push(dataRow(row));
                }
            }
            buffers.push(commandComplete(result.commandTag), readyForQuery());
            this.socket.write(Buffer.concat(buffers));
        } catch (e) {
            this.socket.write(
                Buffer.concat([
                    errorResponse(toServerError(e)),
                    readyForQuery(),
                ]),
            );
        }
    }
}

export class PostgresWireServer<TSession> {
    private server: net.Server;

    constructor(handlers: PgWireHandlers<TSession>) {
        this.server = net.createServer(
            (socket) => new PgWireConnection(socket, handlers),
        );
    }

    async listen(port: number, host?: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server.once('error', reject);
            this.server.listen(port, host, () => {
                this.server.removeListener('error', reject);
                resolve();
            });
        });
    }

    async close(): Promise<void> {
        return new Promise((resolve) => {
            this.server.close(() => resolve());
        });
    }
}
