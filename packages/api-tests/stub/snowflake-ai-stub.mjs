import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL, URL, URLSearchParams } from 'node:url';

const parameters = [
    { name: 'CLIENT_TELEMETRY_ENABLED', value: false },
    { name: 'CLIENT_SESSION_KEEP_ALIVE', value: false },
    { name: 'QUERY_CONTEXT_CACHE_SIZE', value: 0 },
];

const column = (name, type = 'text', scale = 0) => ({
    name,
    type,
    scale,
    precision: 38,
    nullable: true,
    length: 16777216,
});

const queryResult = (sql, agentActivated) => {
    if (/IS_AGENT_ACTIVATED/i.test(sql)) {
        return {
            rowtype: [
                column('IS_AGENT_ACTIVATED', 'boolean'),
                column('CURRENT_ROLE'),
                column('ACTIVE_RESTRICTED_SESSION_SCOPES'),
            ],
            rowset: [[agentActivated ? '1' : '0', 'AGENT_ROLE', 'READ']],
        };
    }
    if (/^\s*(ALTER\s+SESSION|USE)\b/i.test(sql)) {
        return { rowtype: [], rowset: [] };
    }
    const select = sql
        .trim()
        .replace(/;\s*$/, '')
        .match(/^SELECT\s+(.+?)(?:\s+LIMIT\s+\d+)?$/is);
    if (select) {
        const expressions =
            select[1].match(
                /'(?:''|[^'])*'(?:\s+AS\s+(?:"[^"]+"|\w+))?|[^,]+/gi,
            ) ?? [];
        const literals = expressions.map((expression) =>
            expression
                .trim()
                .match(
                    /^('(?:''|[^'])*'|-?\d+(?:\.\d+)?|TRUE|FALSE|NULL)(?:\s+AS\s+("[^"]+"|\w+))?$/i,
                ),
        );
        if (literals.length && literals.every(Boolean)) {
            return {
                rowtype: literals.map((literal) => {
                    const [, value, alias] = literal;
                    const name = alias?.startsWith('"')
                        ? alias.slice(1, -1)
                        : (alias ?? value).toUpperCase();
                    let type = 'fixed';
                    if (value.startsWith("'") || /^NULL$/i.test(value))
                        type = 'text';
                    else if (/^(TRUE|FALSE)$/i.test(value)) type = 'boolean';
                    return column(
                        name,
                        type,
                        value.includes('.') ? value.split('.')[1].length : 0,
                    );
                }),
                rowset: [
                    literals.map((literal) => {
                        const value = literal[1];
                        if (value.startsWith("'"))
                            return value.slice(1, -1).replace(/''/g, "'");
                        if (/^NULL$/i.test(value)) return null;
                        if (/^(TRUE|FALSE)$/i.test(value))
                            return /^TRUE$/i.test(value) ? '1' : '0';
                        return value;
                    }),
                ],
            };
        }
    }
    return { rowtype: [column('STUB')], rowset: [['ok']] };
};

const readBody = async (request) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    if (request.headers['content-encoding'] === 'gzip') {
        return new Response(
            new Blob([body])
                .stream()
                .pipeThrough(new DecompressionStream('gzip')),
        ).text();
    }
    return body.toString('utf8');
};

const json = (response, status, body) => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
};

const success = (response, data = {}) =>
    json(response, 200, { success: true, code: null, message: null, data });
const rejected = (response) =>
    json(response, 200, {
        success: false,
        code: '390303',
        message: 'Invalid OAuth access token',
        data: {},
    });

export const startStub = async ({ port = 0, host = '127.0.0.1' } = {}) => {
    const sessions = new Map();
    const masters = new Map();
    const queries = new Map();
    const consumedRefreshTokens = new Set();
    const failedRefreshTokens = new Set();
    const server = createServer(async (request, response) => {
        try {
            const url = new URL(request.url, 'http://stub');
            if (
                request.method === 'GET' &&
                url.pathname === '/oauth/authorize'
            ) {
                const redirect = new URL(url.searchParams.get('redirect_uri'));
                redirect.searchParams.set('code', randomUUID());
                const state = url.searchParams.get('state');
                if (state !== null) redirect.searchParams.set('state', state);
                response.writeHead(302, { Location: redirect.href });
                response.end();
                return;
            }
            const body = await readBody(request);
            if (
                request.method === 'POST' &&
                url.pathname === '/oauth/token-request'
            ) {
                const form = new URLSearchParams(body);
                const grant = form.get('grant_type');
                if (
                    grant !== 'authorization_code' &&
                    grant !== 'refresh_token'
                ) {
                    json(response, 400, { error: 'unsupported_grant_type' });
                    return;
                }
                const input = form.get(
                    grant === 'authorization_code' ? 'code' : 'refresh_token',
                );
                if (!input || input.startsWith('revoked')) {
                    json(response, 400, { error: 'invalid_grant' });
                    return;
                }
                if (grant === 'refresh_token') {
                    if (consumedRefreshTokens.has(input)) {
                        json(response, 400, { error: 'invalid_grant' });
                        return;
                    }
                    if (!failedRefreshTokens.has(input)) {
                        if (input.startsWith('unavailable-refresh')) {
                            failedRefreshTokens.add(input);
                            json(response, 503, { error: 'invalid_grant' });
                            return;
                        }
                        if (input.startsWith('network-drop-refresh')) {
                            failedRefreshTokens.add(input);
                            request.socket.destroy();
                            return;
                        }
                    }
                    if (input.startsWith('single-use-refresh'))
                        consumedRefreshTokens.add(input);
                }
                let refreshPrefix = 'refresh';
                if (input.startsWith('single-use'))
                    refreshPrefix = 'single-use-refresh';
                else if (
                    grant === 'authorization_code' &&
                    input.startsWith('unavailable')
                )
                    refreshPrefix = 'unavailable-refresh';
                else if (
                    grant === 'authorization_code' &&
                    input.startsWith('network-drop')
                )
                    refreshPrefix = 'network-drop-refresh';
                if (input.startsWith('revoking'))
                    refreshPrefix = 'revoked-refresh';
                else if (input.startsWith('plain'))
                    refreshPrefix = 'plain-refresh';
                json(response, 200, {
                    access_token: `${input.startsWith('plain') ? 'plain' : 'agent'}-${randomUUID()}`,
                    refresh_token: `${refreshPrefix}-${randomUUID()}`,
                    token_type: 'Bearer',
                    expires_in: 600,
                    refresh_token_expires_in: input.startsWith('expiring')
                        ? 1
                        : 7776000,
                    scope: form.get('scope') ?? 'refresh_token',
                    username: 'stub',
                });
                return;
            }
            let payload;
            try {
                payload = body ? JSON.parse(body) : {};
            } catch {
                json(response, 400, { error: 'invalid_json' });
                return;
            }
            const sessionToken = request.headers.authorization?.match(
                /Snowflake Token="([^"]+)"/i,
            )?.[1];
            if (
                request.method === 'POST' &&
                url.pathname === '/session/v1/login-request'
            ) {
                const { AUTHENTICATOR, TOKEN } = payload.data ?? {};
                if (
                    AUTHENTICATOR === 'OAUTH' &&
                    (!TOKEN || TOKEN.startsWith('revoked'))
                ) {
                    rejected(response);
                    return;
                }
                const agentActivated =
                    AUTHENTICATOR === 'OAUTH' && !TOKEN.startsWith('plain');
                const token = randomUUID();
                const masterToken = randomUUID();
                sessions.set(token, agentActivated);
                masters.set(masterToken, agentActivated);
                success(response, {
                    token,
                    masterToken,
                    validityInSeconds: 3600,
                    masterValidityInSeconds: 86400,
                    sessionId: 1,
                    parameters,
                    sessionInfo: {
                        databaseName: 'STUB',
                        schemaName: 'PUBLIC',
                        warehouseName: 'STUB',
                        roleName: 'AGENT_ROLE',
                    },
                    serverVersion: '9.0.0',
                });
                return;
            }
            if (
                request.method === 'POST' &&
                url.pathname === '/session/token-request'
            ) {
                if (
                    !sessions.has(payload.oldSessionToken) ||
                    !masters.has(sessionToken)
                ) {
                    rejected(response);
                    return;
                }
                const token = randomUUID();
                const masterToken = randomUUID();
                const agentActivated =
                    masters.get(sessionToken) ??
                    sessions.get(payload.oldSessionToken) ??
                    false;
                sessions.set(token, agentActivated);
                masters.set(masterToken, agentActivated);
                success(response, {
                    sessionToken: token,
                    masterToken,
                    validityInSecondsST: 3600,
                    validityInSecondsMT: 86400,
                });
                return;
            }
            if (
                request.method === 'POST' &&
                url.pathname === '/queries/v1/query-request'
            ) {
                if (!sessions.has(sessionToken)) {
                    rejected(response);
                    return;
                }
                const result = queryResult(
                    payload.sqlText ?? '',
                    sessions.get(sessionToken),
                );
                const data = {
                    ...result,
                    total: result.rowset.length,
                    returned: result.rowset.length,
                    queryId: randomUUID(),
                    statementTypeId: 0x1000,
                    version: 1,
                    parameters,
                    finalDatabaseName: 'STUB',
                    finalSchemaName: 'PUBLIC',
                    finalWarehouseName: 'STUB',
                    finalRoleName: 'AGENT_ROLE',
                };
                queries.set(data.queryId, data);
                success(response, data);
                return;
            }
            const resultId = url.pathname.match(
                /^\/queries\/([^/]+)\/result$/,
            )?.[1];
            const statusId = url.pathname.match(
                /^\/monitoring\/queries\/([^/]+)$/,
            )?.[1];
            if (request.method === 'GET' && (resultId || statusId)) {
                const data = queries.get(resultId ?? statusId);
                if (!data) {
                    json(response, 404, { error: 'unknown_query' });
                    return;
                }
                success(
                    response,
                    resultId
                        ? data
                        : {
                              queries: [{ id: statusId, status: 'SUCCESS' }],
                          },
                );
                return;
            }
            if (
                url.pathname === '/session' &&
                url.searchParams.get('delete') === 'true'
            ) {
                sessions.delete(sessionToken);
                success(response);
                return;
            }
            if (
                url.pathname === '/session/heartbeat' ||
                url.pathname === '/telemetry/send' ||
                url.pathname === '/monitoring/client-telemetry'
            ) {
                success(response);
                return;
            }
            json(response, 404, { error: 'unknown_endpoint' });
        } catch {
            json(response, 400, { error: 'invalid_request' });
        }
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, resolve);
    });
    const address = server.address();
    return {
        url: `http://${host}:${address.port}`,
        close: () =>
            new Promise((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
                server.closeAllConnections();
            }),
    };
};

export default startStub;

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    const stub = await startStub({
        port: Number(process.env.PORT ?? 3900),
        host: '0.0.0.0',
    });
    process.stdout.write(`Snowflake AI stub listening at ${stub.url}\n`);
    for (const signal of ['SIGINT', 'SIGTERM']) {
        process.once(signal, async () => {
            await stub.close();
        });
    }
}
