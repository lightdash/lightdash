import * as fs from 'fs';
import * as net from 'net';
import * as tls from 'tls';
import Logger from '../../logging/logger';
import { decodeBinaryParameter, encodeBinaryValue } from './binaryFormat';
import {
    countParameters,
    expandFormats,
    inlineParameters,
    isTextFormat,
    placeholderValues,
    readBindMessage,
    readCloseMessage,
    readDescribeMessage,
    readExecuteMessage,
    readParseMessage,
} from './extendedQuery';
import { PG_OID, TEXT_FORMAT } from './pgTypes';
import { PgWireServerError } from './PgWireServerError';
import { cstring, int16, int32, uint16 } from './wireEncoding';

export { PgWireServerError };

/**
 * A minimal implementation of the Postgres wire protocol (v3) frontend/backend
 * message flow, supporting cleartext password authentication, the simple query
 * protocol and the extended query protocol (Parse/Bind/Describe/Execute/Sync),
 * with binary parameters and result columns for the types this server emits.
 *
 * TLS: the pg handshake is StartTLS-style — a plaintext `SSLRequest` precedes
 * the TLS upgrade — so generic TLS-terminating load balancers cannot front
 * this server; TLS is terminated here. When TLS is configured it is REQUIRED:
 * a plaintext startup is rejected before a password is ever requested, so
 * credentials (which are Lightdash tokens) never cross the wire unencrypted.
 *
 * Protocol reference: https://www.postgresql.org/docs/current/protocol-message-formats.html
 */

const PROTOCOL_VERSION = 196608; // 3.0
const SSL_REQUEST_CODE = 80877103;
const GSSENC_REQUEST_CODE = 80877104;
const CANCEL_REQUEST_CODE = 80877102;
const MAX_MESSAGE_LENGTH = 1024 * 1024; // 1MB
/** Named prepared statements / portals a single connection may hold open */
const MAX_NAMED_OBJECTS = 1000;
/** Statement and portal text a single connection may keep, in UTF-16 code units */
const MAX_RETAINED_SQL_LENGTH = 16 * 1024 * 1024;

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
    /**
     * Throw PgWireServerError to return an error to the client. The command
     * tags `BEGIN`, `COMMIT`, `ROLLBACK` and `DISCARD ALL` are read back by
     * the server to track the transaction status it reports and the lifetime
     * of portals and prepared statements.
     */
    query: (session: TSession, sql: string) => Promise<PgWireQueryResult>;
    /**
     * Result columns of `sql` without running it; null when the statement
     * produces no rows. Answers Describe, so it must agree with `query`.
     */
    describe: (
        session: TSession,
        sql: string,
    ) => Promise<PgWireResultField[] | null>;
};

export type PgWireTlsOptions = {
    /** Path to the PEM server certificate (leaf first, then chain) */
    certPath: string;
    /** Path to the PEM private key */
    keyPath: string;
};

export type PgWireServerOptions = {
    /**
     * When set, TLS is terminated by this server and REQUIRED: `SSLRequest`
     * upgrades the socket and a plaintext startup message is rejected before
     * authentication is ever requested. When absent the server is
     * plaintext-only (explicit config opt-out).
     */
    tls?: PgWireTlsOptions;
};

/**
 * Loads the TLS cert/key eagerly (so a bad path or unreadable PEM fails at
 * boot) and transparently reloads them when the files change on disk, so
 * cert-manager style renewals apply without a restart. If a reload fails the
 * previous context is kept and an error is logged.
 */
class SecureContextProvider {
    private context: tls.SecureContext;

    private certMtimeMs: number;

    private keyMtimeMs: number;

    constructor(private options: PgWireTlsOptions) {
        const loaded = SecureContextProvider.load(options);
        this.context = loaded.context;
        this.certMtimeMs = loaded.certMtimeMs;
        this.keyMtimeMs = loaded.keyMtimeMs;
    }

    private static load(options: PgWireTlsOptions): {
        context: tls.SecureContext;
        certMtimeMs: number;
        keyMtimeMs: number;
    } {
        const certMtimeMs = fs.statSync(options.certPath).mtimeMs;
        const keyMtimeMs = fs.statSync(options.keyPath).mtimeMs;
        const context = tls.createSecureContext({
            cert: fs.readFileSync(options.certPath),
            key: fs.readFileSync(options.keyPath),
        });
        return { context, certMtimeMs, keyMtimeMs };
    }

    get(): tls.SecureContext {
        try {
            const certMtimeMs = fs.statSync(this.options.certPath).mtimeMs;
            const keyMtimeMs = fs.statSync(this.options.keyPath).mtimeMs;
            if (
                certMtimeMs !== this.certMtimeMs ||
                keyMtimeMs !== this.keyMtimeMs
            ) {
                const loaded = SecureContextProvider.load(this.options);
                this.context = loaded.context;
                this.certMtimeMs = loaded.certMtimeMs;
                this.keyMtimeMs = loaded.keyMtimeMs;
                Logger.info('pgwire: reloaded TLS certificate from disk');
            }
        } catch (e) {
            Logger.error(
                `pgwire: failed to reload TLS certificate, keeping the previous one: ${
                    e instanceof Error ? e.message : e
                }`,
            );
        }
        return this.context;
    }
}

// --- message encoding helpers ---

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
type TransactionStatus = 'I' | 'T';
const readyForQuery = (status: TransactionStatus) =>
    message('Z', Buffer.from(status));
const commandComplete = (tag: string) => message('C', cstring(tag));
const emptyQueryResponse = () => message('I');
const parseComplete = () => message('1');
const bindComplete = () => message('2');
const closeComplete = () => message('3');
const noData = () => message('n');
const portalSuspended = () => message('s');
const parameterDescription = (oids: number[]) =>
    message('t', uint16(oids.length), ...oids.map(int32));

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

/** `formats` has one code per field, or is empty for all-text */
const rowDescription = (
    fields: PgWireResultField[],
    formats: number[] = [],
): Buffer => {
    const parts: Buffer[] = [uint16(fields.length)];
    fields.forEach((field, index) => {
        parts.push(
            cstring(field.name),
            int32(0), // table oid
            int16(0), // attribute number
            int32(field.oid),
            int16(-1), // type length (variable)
            int32(-1), // type modifier
            int16(formats[index] ?? TEXT_FORMAT),
        );
    });
    return message('T', ...parts);
};

const dataRow = (
    values: (string | null)[],
    fields: PgWireResultField[],
    formats: number[] = [],
): Buffer => {
    const parts: Buffer[] = [uint16(values.length)];
    values.forEach((value, index) => {
        if (value === null) {
            parts.push(int32(-1));
            return;
        }
        const bytes = isTextFormat(formats[index] ?? TEXT_FORMAT)
            ? Buffer.from(value, 'utf8')
            : encodeBinaryValue(value, fields[index].oid);
        parts.push(int32(bytes.length), bytes);
    });
    return message('D', ...parts);
};

const toServerError = (e: unknown): PgWireServerError => {
    if (e instanceof PgWireServerError) return e;
    const errorMessage = e instanceof Error ? e.message : String(e);
    return new PgWireServerError(errorMessage);
};

type ConnectionPhase = 'startup' | 'password' | 'ready';

type PreparedStatement = {
    sql: string;
    /** highest `$n` in the SQL or the number of declared types, whichever is larger */
    parameterCount: number;
    /** only what the client declared (0 = unspecified); undeclared ones are text */
    declaredParameterOids: number[];
};

const parameterOidsOf = (statement: PreparedStatement): number[] =>
    Array.from(
        { length: statement.parameterCount },
        (_, index) => statement.declaredParameterOids[index] || PG_OID.text,
    );

/** Heap a statement or portal keeps alive, in the units of the budget */
const retainedSize = (object: {
    sql: string;
    declaredParameterOids?: number[];
}): number =>
    object.sql.length + (object.declaredParameterOids?.length ?? 0) * 4;

type Portal = {
    /** statement SQL with parameters inlined */
    sql: string;
    /** requested column formats as sent in Bind: none, one for all, or one per column */
    resultFormats: number[];
    /** set by the first Execute; later Executes resume from `cursor` */
    result: PgWireQueryResult | null;
    cursor: number;
};

const UNNAMED = '';

/** State machine for a single client connection */
class PgWireConnection<TSession> {
    private buffer: Buffer = Buffer.alloc(0);

    private phase: ConnectionPhase = 'startup';

    private startupParams: Record<string, string> = {};

    private session: TSession | null = null;

    /** serializes async message handling for this connection */
    private chain: Promise<void> = Promise.resolve();

    private socket: net.Socket;

    /** true once the socket has been upgraded to TLS */
    private isSecure = false;

    private statements = new Map<string, PreparedStatement>();

    private portals = new Map<string, Portal>();

    /** after an extended-protocol error, everything up to the next Sync is ignored */
    private skipUntilSync = false;

    /**
     * BEGIN/COMMIT are accepted as no-ops by the handlers, but drivers still
     * expect portals (fetchSize cursors) to survive Sync inside a transaction
     */
    private isInTransaction = false;

    private readonly onData = (chunk: Buffer): void => {
        try {
            this.buffer = Buffer.concat([this.buffer, chunk]);
            this.drainBuffer();
        } catch (e) {
            Logger.warn(
                `pgwire: closing connection after protocol error: ${
                    e instanceof Error ? e.message : e
                }`,
            );
            this.socket.destroy();
        }
    };

    constructor(
        socket: net.Socket,
        private handlers: PgWireHandlers<TSession>,
        private secureContextProvider: SecureContextProvider | null,
    ) {
        this.socket = socket;
        this.attachSocket(socket);
    }

    private attachSocket(socket: net.Socket): void {
        this.socket = socket;
        socket.on('data', this.onData);
        socket.on('error', (e) => {
            Logger.debug(`pgwire: socket error: ${e.message}`);
        });
    }

    /**
     * Perform the StartTLS-style upgrade: answer `SSLRequest` with 'S' and
     * wrap the raw socket in a TLS socket. The client re-sends its startup
     * message over the encrypted channel, so the connection stays in the
     * `startup` phase. Everything here is synchronous, so no data events can
     * slip through between detaching from the raw socket and the TLS wrap.
     */
    private startTls(provider: SecureContextProvider): void {
        const plainSocket = this.socket;
        plainSocket.removeListener('data', this.onData);
        plainSocket.write('S');
        const secureSocket = new tls.TLSSocket(plainSocket, {
            isServer: true,
            secureContext: provider.get(),
        });
        this.isSecure = true;
        this.attachSocket(secureSocket);
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
                if (code === SSL_REQUEST_CODE) {
                    if (this.isSecure) {
                        throw new Error(
                            'duplicate SSLRequest on an encrypted connection',
                        );
                    }
                    if (this.secureContextProvider === null) {
                        // TLS explicitly disabled: client falls back to plaintext
                        this.socket.write('N');
                    } else {
                        if (this.buffer.length > 0) {
                            // TLS-stripping defense (cf. CVE-2021-23214): no
                            // plaintext data may be pipelined behind SSLRequest
                            throw new Error(
                                'unexpected data pipelined after SSLRequest',
                            );
                        }
                        this.startTls(this.secureContextProvider);
                        return;
                    }
                } else if (code === GSSENC_REQUEST_CODE) {
                    // GSS encryption not supported; clients retry with SSLRequest
                    this.socket.write('N');
                } else if (code === CANCEL_REQUEST_CODE) {
                    this.socket.end();
                    return;
                } else if (code === PROTOCOL_VERSION) {
                    if (this.secureContextProvider !== null && !this.isSecure) {
                        // Reject before AuthenticationCleartextPassword is ever
                        // sent, so no client is prompted for credentials over
                        // an unencrypted connection.
                        this.socket.write(
                            errorResponse(
                                new PgWireServerError(
                                    'connection requires TLS',
                                    '28000',
                                    'Connect with sslmode=require (or verify-full)',
                                ),
                            ),
                        );
                        this.socket.end();
                        return;
                    }
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
        if (this.socket.destroyed) {
            return;
        }
        // Like Postgres: after an extended-protocol error only Sync (and
        // Terminate) are acted upon until the client resynchronises
        if (this.skipUntilSync && type !== 'S' && type !== 'X') {
            return;
        }
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
            case 'P':
            case 'B':
            case 'D':
            case 'E':
            case 'C':
            case 'H':
            case 'S':
                await this.handleExtendedMessage(type, payload);
                return;
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
                readyForQuery('I'),
            ]),
        );
    }

    private async handleExtendedMessage(
        type: string,
        payload: Buffer,
    ): Promise<void> {
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
        if (type === 'S') {
            this.sync();
            return;
        }
        try {
            switch (type) {
                case 'P':
                    this.parseStatement(payload);
                    return;
                case 'B':
                    this.bindPortal(payload);
                    return;
                case 'D':
                    await this.describe(payload);
                    return;
                case 'E':
                    await this.execute(payload);
                    return;
                case 'C':
                    this.closeTarget(payload);
                    return;
                case 'H': // Flush: every reply is written immediately
                    return;
                default:
                    return;
            }
        } catch (e) {
            this.socket.write(errorResponse(toServerError(e)));
            this.skipUntilSync = true;
        }
    }

    private sync(): void {
        this.endImplicitTransaction();
        this.skipUntilSync = false;
        this.socket.write(readyForQuery(this.transactionStatus()));
    }

    private transactionStatus(): TransactionStatus {
        return this.isInTransaction ? 'T' : 'I';
    }

    /** Outside an explicit transaction every statement is its own; portals end with it */
    private endImplicitTransaction(): void {
        if (!this.isInTransaction) {
            this.portals.clear();
        }
    }

    private trackTransaction(commandTag: string): void {
        if (commandTag === 'BEGIN') {
            this.isInTransaction = true;
        } else if (commandTag === 'COMMIT' || commandTag === 'ROLLBACK') {
            this.isInTransaction = false;
            this.portals.clear();
        } else if (commandTag === 'DISCARD ALL') {
            this.isInTransaction = false;
            this.portals.clear();
            this.statements.clear();
        }
    }

    private parseStatement(payload: Buffer): void {
        const { statementName, sql, parameterOids } = readParseMessage(payload);
        if (statementName !== UNNAMED && this.statements.has(statementName)) {
            throw new PgWireServerError(
                `prepared statement "${statementName}" already exists`,
                '42P05',
            );
        }
        // types the client left undeclared (0) or omitted entirely are text
        const parameterCount = Math.max(
            parameterOids.length,
            countParameters(sql),
        );
        this.assertCapacity(
            this.statements,
            statementName,
            'prepared statements',
        );
        const statement: PreparedStatement = {
            sql,
            parameterCount,
            declaredParameterOids: parameterOids,
        };
        this.assertRetainedSqlBudget(statement, {
            replacing: this.statements.get(statementName),
        });
        this.statements.set(statementName, statement);
        this.socket.write(parseComplete());
    }

    private bindPortal(payload: Buffer): void {
        const bind = readBindMessage(payload);
        const statement = this.statements.get(bind.statementName);
        if (!statement) {
            throw new PgWireServerError(
                `prepared statement "${bind.statementName}" does not exist`,
                '26000',
            );
        }
        if (bind.portalName !== UNNAMED && this.portals.has(bind.portalName)) {
            throw new PgWireServerError(
                `cursor "${bind.portalName}" already exists`,
                '42P03',
            );
        }
        if (bind.parameters.length !== statement.parameterCount) {
            throw new PgWireServerError(
                `bind message supplies ${bind.parameters.length} parameters, but prepared statement "${bind.statementName}" requires ${statement.parameterCount}`,
                '08P01',
            );
        }
        const parameterOids = parameterOidsOf(statement);
        const values = bind.parameters.map((value, index) => {
            if (value === null) {
                return null;
            }
            return isTextFormat(bind.parameterFormats[index])
                ? value.toString('utf8')
                : decodeBinaryParameter(value, parameterOids[index]);
        });
        this.assertCapacity(this.portals, bind.portalName, 'portals');
        const portal: Portal = {
            sql: inlineParameters(statement.sql, values, parameterOids),
            resultFormats: bind.resultFormats,
            result: null,
            cursor: 0,
        };
        this.assertRetainedSqlBudget(portal, {
            replacing: this.portals.get(bind.portalName),
        });
        this.portals.set(bind.portalName, portal);
        this.socket.write(bindComplete());
    }

    private async describe(payload: Buffer): Promise<void> {
        const { kind, name } = readDescribeMessage(payload);
        if (kind === 'S') {
            const statement = this.statements.get(name);
            if (!statement) {
                throw new PgWireServerError(
                    `prepared statement "${name}" does not exist`,
                    '26000',
                );
            }
            const parameterOids = parameterOidsOf(statement);
            const sql = inlineParameters(
                statement.sql,
                placeholderValues(parameterOids),
                parameterOids,
            );
            const fields = await this.describeSql(sql);
            this.socket.write(
                Buffer.concat([
                    parameterDescription(parameterOids),
                    fields ? rowDescription(fields) : noData(),
                ]),
            );
            return;
        }
        const portal = this.getPortal(name);
        const fields = await this.describeSql(portal.sql);
        this.socket.write(
            fields
                ? rowDescription(
                      fields,
                      expandFormats(
                          portal.resultFormats,
                          fields.length,
                          'result column',
                      ),
                  )
                : noData(),
        );
    }

    private async describeSql(
        sql: string,
    ): Promise<PgWireResultField[] | null> {
        if (sql.trim().length === 0) {
            return null;
        }
        return this.handlers.describe(this.session as TSession, sql);
    }

    private async execute(payload: Buffer): Promise<void> {
        const { portalName, maxRows } = readExecuteMessage(payload);
        const portal = this.getPortal(portalName);
        if (portal.sql.trim().length === 0) {
            this.socket.write(emptyQueryResponse());
            return;
        }
        const result =
            portal.result ??
            (await this.handlers.query(this.session as TSession, portal.sql));
        if (result.type === 'command') {
            this.portals.set(portalName, { ...portal, result });
            this.trackTransaction(result.commandTag);
            this.socket.write(commandComplete(result.commandTag));
            return;
        }
        const formats = expandFormats(
            portal.resultFormats,
            result.fields.length,
            'result column',
        );
        const end =
            maxRows > 0
                ? Math.min(portal.cursor + maxRows, result.rows.length)
                : result.rows.length;
        const isComplete = end >= result.rows.length;
        // a finished portal keeps its shape (re-Execute is legal) but not its rows
        this.portals.set(portalName, {
            ...portal,
            result: isComplete ? { ...result, rows: [] } : result,
            cursor: isComplete ? 0 : end,
        });
        this.socket.write(
            Buffer.concat([
                ...result.rows
                    .slice(portal.cursor, end)
                    .map((row) => dataRow(row, result.fields, formats)),
                isComplete
                    ? commandComplete(result.commandTag)
                    : portalSuspended(),
            ]),
        );
    }

    private closeTarget(payload: Buffer): void {
        const { kind, name } = readCloseMessage(payload);
        if (kind === 'S') {
            this.statements.delete(name);
        } else {
            this.portals.delete(name);
        }
        this.socket.write(closeComplete());
    }

    /** Statements and portals together may not pin more than the budget */
    private assertRetainedSqlBudget(
        incoming: PreparedStatement | Portal,
        { replacing }: { replacing: PreparedStatement | Portal | undefined },
    ): void {
        const kept = [
            ...this.statements.values(),
            ...this.portals.values(),
        ].reduce(
            (total, object) =>
                object === replacing ? total : total + retainedSize(object),
            0,
        );
        if (kept + retainedSize(incoming) > MAX_RETAINED_SQL_LENGTH) {
            throw new PgWireServerError(
                'too much statement text held open on this connection',
                '54000',
                'Close prepared statements and portals you no longer need',
            );
        }
    }

    /** The unnamed object is exempt (there is only ever one); named growth is capped */
    private assertCapacity(
        objects: Map<string, unknown>,
        name: string,
        subject: 'prepared statements' | 'portals',
    ): void {
        if (name === UNNAMED) {
            return;
        }
        if (objects.size >= MAX_NAMED_OBJECTS) {
            throw new PgWireServerError(
                `too many ${subject} open on this connection (max ${MAX_NAMED_OBJECTS})`,
                '54000',
                `Close ${subject} you no longer need`,
            );
        }
    }

    private getPortal(name: string): Portal {
        const portal = this.portals.get(name);
        if (!portal) {
            throw new PgWireServerError(
                `portal "${name}" does not exist`,
                '34000',
            );
        }
        return portal;
    }

    private async runQuery(sql: string): Promise<void> {
        if (sql.trim().length === 0) {
            this.socket.write(
                Buffer.concat([
                    emptyQueryResponse(),
                    readyForQuery(this.transactionStatus()),
                ]),
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
                    buffers.push(dataRow(row, result.fields));
                }
            }
            this.trackTransaction(result.commandTag);
            this.endImplicitTransaction();
            buffers.push(
                commandComplete(result.commandTag),
                readyForQuery(this.transactionStatus()),
            );
            this.socket.write(Buffer.concat(buffers));
        } catch (e) {
            this.socket.write(
                Buffer.concat([
                    errorResponse(toServerError(e)),
                    readyForQuery(this.transactionStatus()),
                ]),
            );
        }
    }
}

export class PostgresWireServer<TSession> {
    private server: net.Server;

    constructor(
        handlers: PgWireHandlers<TSession>,
        options: PgWireServerOptions = {},
    ) {
        // Loads the cert eagerly: a bad TLS config fails at boot, not at the
        // first connection.
        const secureContextProvider = options.tls
            ? new SecureContextProvider(options.tls)
            : null;
        this.server = net.createServer(
            (socket) =>
                new PgWireConnection(socket, handlers, secureContextProvider),
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

    /** Bound address, or null before listen() resolves (port 0 = ephemeral) */
    address(): net.AddressInfo | null {
        const address = this.server.address();
        return typeof address === 'object' ? address : null;
    }

    async close(): Promise<void> {
        return new Promise((resolve) => {
            this.server.close(() => resolve());
        });
    }
}
