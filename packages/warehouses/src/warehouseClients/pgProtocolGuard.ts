// ============================================================================
// pgProtocolGuard — crash protection for pg-protocol's Parser
// ============================================================================
//
// Regression for https://github.com/lightdash/lightdash/issues/22098
//
// ─── Background: the PostgreSQL wire protocol ─────────────────────────────────
//
// The `pg` library that both our Postgres and Redshift clients sit on top of
// speaks the PostgreSQL "Frontend/Backend" wire protocol v3. Every backend
// message sent over the socket has a fixed layout:
//
//     ┌──────┬──────────────┬──────────────────────────┐
//     │ byte │ UInt32BE len │ payload (len-4 bytes)    │
//     │ code │              │                          │
//     └──────┴──────────────┴──────────────────────────┘
//
// The first byte identifies the message type (e.g. 'R' = AuthenticationResponse,
// 'D' = DataRow, 'E' = ErrorResponse). `pg-protocol`'s Parser reads this byte
// in `handlePacket()` and dispatches to a specific sub-parser.
//
// During connection setup, the exchange goes:
//
//     Client ──► Server   StartupMessage (user, database, protocol version)
//     Client ◄── Server   AuthenticationResponse  (tell me what to send)
//                         └─ int32 sub-code:
//                              0  AuthenticationOk — auth succeeded
//                              3  CleartextPassword — send password plaintext
//                              5  MD5Password — send MD5(password+salt)
//                              10 SASL — start SCRAM negotiation
//                              11 SASLContinue
//                              12 SASLFinal
//     Client ──► Server   (credentials in the requested format)
//     Client ◄── Server   AuthenticationOk (sub-code 0)   ← auth really done
//     Client ◄── Server   ReadyForQuery
//
// pg-protocol's `parseAuthenticationResponse` only understands sub-codes 0,
// 3, 5, 10, 11, 12. It throws on anything else.
//
// ─── Why Redshift sends sub-code 13 ───────────────────────────────────────────
//
// AWS Redshift extends the PostgreSQL protocol with extra auth sub-codes for
// its IDP plugin family. Sub-code 13 in particular is used when the cluster
// or Serverless workgroup has IAM Identity Center integration enabled — the
// server opens the auth handshake by asking the client for an IC OIDC token.
// This happens *before* the client has a chance to present a password, so
// selecting "user & password" in Lightdash doesn't avoid it — the trigger is
// entirely server-side.
//
// ─── Why the throw crashes the backend ────────────────────────────────────────
//
// `pg` wires the parser into the TLS socket like this:
//
//     stream.on('data', buffer => parser.parse(buffer, callback));
//
// Node's EventEmitter invokes listeners synchronously. A synchronous throw
// from a listener is NOT caught by the emitter — it bubbles up to the event
// loop as an uncaught exception. There's no opportunity for pg.Client, pg.Pool,
// or our own try/catch around `pool.connect()` to intercept it, because all of
// those wrappers expect the driver to report errors *through* callbacks or
// events, not by throwing out of a socket data handler.
//
// Result: the pod dies. Every other tenant on that pod has their in-flight
// requests dropped. The autoscaler restarts it ~30–60s later.
//
// ─── What this guard does ─────────────────────────────────────────────────────
//
// We monkey-patch `Parser.prototype.parse` once, at module load. The wrapper
// invokes the original implementation unchanged — so on the happy path it is
// byte-for-byte identical. Only when the original throws do we intercept:
// we construct a DatabaseError with `name: 'error'` and deliver it through
// the same callback that pg-protocol would use for a real backend error.
//
// From there, pg's existing error plumbing takes over:
//     Parser callback → Connection.attachListeners → emits 'errorMessage'
//                     → Client._handleErrorMessage → _handleErrorWhileConnecting
//                     → rejects the connect() promise
//
// So a would-be process crash becomes a regular rejected promise, which the
// warehouse layer already knows how to turn into a user-visible error toast.
//
// ─── Scope / blast radius ─────────────────────────────────────────────────────
//
// The patch targets a singleton prototype, so it's process-wide. It affects:
//   • Postgres warehouses  (PostgresWarehouseClient)
//   • Redshift warehouses  (RedshiftWarehouseClient extends PostgresClient)
//   • The backend's internal DB connection (Knex, `pg` driver)
//
// It does NOT affect warehouses that use other SDKs — BigQuery, Snowflake,
// Databricks, Athena, Trino, Clickhouse, DuckDB — none of those load
// pg-protocol.
//
// The happy path is unchanged (`originalParse.call(this, ...)` runs exactly
// as before). The only behavior change is on throw: previously a crash, now
// a rejected promise with a clear error message. That's strictly safer.
//
// ─── Caveat ───────────────────────────────────────────────────────────────────
//
// This stops the crash. It does NOT make IC-based Redshift connections
// succeed — to do that we'd need to implement the IC token exchange (AWS's
// `redshift-connector-node` does this) or advise the customer to use a
// non-IC endpoint. The rewritten error message makes that action obvious.
// ============================================================================
import { BackendMessage, DatabaseError } from 'pg-protocol/dist/messages';
import { MessageCallback, Parser } from 'pg-protocol/dist/parser';

type Patchable = {
    lightdashGuarded?: boolean;
};

const prototype = Parser.prototype as typeof Parser.prototype & Patchable;

// pg-protocol's thrown wording for unknown auth sub-codes is misleading
// because every AuthenticationResponse message is initialized with
// `name: 'authenticationOk'` before the sub-code switch overwrites it — so
// the thrown string reads "Unknown authenticationOk message type 13" even
// though sub-code 13 is neither authenticationOk nor okay. Rewrite it to
// something a customer and an on-call engineer can both act on.
const rewriteParserError = (err: unknown): string => {
    const rawMessage = err instanceof Error ? err.message : String(err);
    const authCodeMatch = rawMessage.match(
        /Unknown authenticationOk message type (\d+)/,
    );
    if (authCodeMatch) {
        return `Warehouse server requested an unsupported authentication method (code ${authCodeMatch[1]}). This is commonly seen on AWS Redshift endpoints with IAM Identity Center enabled, which Lightdash does not support. Please use a Redshift endpoint configured for native username/password authentication.`;
    }
    return `Unsupported warehouse protocol message: ${rawMessage}`;
};

// Idempotent — Jest's module reset or accidental double-import should not
// stack wrappers and ship every thrown error through multiple try/catches.
if (!prototype.lightdashGuarded) {
    const originalParse = prototype.parse;

    prototype.parse = function guardedParse(
        buffer: Buffer,
        callback: MessageCallback,
    ) {
        try {
            // Happy path: exactly the original implementation, no behavior
            // change for valid messages.
            originalParse.call(this, buffer, callback);
        } catch (err) {
            // Convert the sync throw into a DatabaseError routed through
            // the same callback pg uses for real ErrorResponse messages.
            // `name: 'error'` is what makes Connection re-emit it as an
            // 'errorMessage' event, which Client then turns into a
            // connect-promise rejection.
            const databaseError = new DatabaseError(
                rewriteParserError(err),
                buffer?.length ?? 0,
                'error',
            );
            callback(databaseError as unknown as BackendMessage);
        }
    };

    prototype.lightdashGuarded = true;
}
