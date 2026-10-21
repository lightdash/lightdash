import { AgentCapability, DOCUMENT_SCHEMA_VERSION } from '@lightdash/common';
import { promises as fs } from 'fs';
import { createServer, get } from 'http';
import * as yaml from 'js-yaml';
import { tmpdir } from 'os';
import path from 'path';
import { slotFixture } from './agentConnections/fixtures';
import { type AgentConnectionSlot } from './agentConnections/schema';
import { AgentConnectionStore } from './agentConnections/store';
import { runCliProcess } from './testing/cliProcess';

const project = '44444444-4444-4444-8444-444444444444';
const statuses = [
    200, 302, 400, 401, 403, 404, 409, 410, 422, 429, 500, 502, 503,
];
const contentTypes = ['application/json', 'text/html', 'text/plain', null];
type ResponseShape =
    | 'envelope'
    | 'html'
    | 'invalid-json'
    | 'wrong-shape'
    | 'aborted'
    | 'query-error'
    | 'query-status'
    | 'query-id'
    | 'version'
    | 'links'
    | 'success';
const shapes: ResponseShape[] = [
    'envelope',
    'html',
    'invalid-json',
    'wrong-shape',
    'aborted',
    'envelope',
];
const responses = statuses.flatMap((status, row) =>
    contentTypes.map((contentType, column) => ({
        status,
        contentType,
        shape: shapes[(row + column) % shapes.length],
    })),
);
const commands = [
    {
        name: 'connect',
        args: ['agent', 'connect', '--connection', '--name', 'new'],
        target: '/requests',
        selected: false,
    },
    {
        name: 'status',
        args: ['agent', 'status', '--name', 'default', '--json'],
        target: '/status',
        selected: false,
    },
    {
        name: 'revoke',
        args: ['agent', 'revoke', '--name', 'default', '--json'],
        target: '/33333333-3333-4333-8333-333333333333',
        selected: false,
    },
    {
        name: 'human-revoke',
        args: ['agent', 'revoke', '--name', 'default', '--human', '--json'],
        target: '/33333333-3333-4333-8333-333333333333',
        selected: false,
    },
    {
        name: 'provider',
        args: ['config', 'get-project'],
        target: '/user',
        selected: true,
    },
    {
        name: 'catalog',
        args: ['warehouse-catalog', '--json'],
        target: '/sqlRunner/tables',
        selected: true,
    },
    {
        name: 'sql',
        args: ['sql', 'select 1', '--output', 'results.csv'],
        target: '/query/sql',
        selected: true,
    },
    {
        name: 'safe-read',
        args: [
            'download',
            '--skip-spaces',
            '--skip-charts',
            '--skip-dashboards',
        ],
        target: '/health?skipMigrationCheck=true',
        selected: true,
    },
    {
        name: 'raw-manifest',
        args: [
            'compile',
            '--skip-dbt-compile',
            '--skip-warehouse-catalog',
            '--no-warehouse-credentials',
        ],
        target: '/dbt/manifest',
        selected: true,
    },
];
type ExtendedCell = {
    name: string;
    args: string[];
    target: string;
    selected: boolean;
    refresh?: boolean;
    connect?: boolean;
    bearerOnly?: boolean;
    deploy?: boolean;
    success: (marker: string, slot: AgentConnectionSlot) => unknown;
    evidence: string;
    successCode: number;
    errorEvidence?: string;
    errorCode?: number;
    saved?: boolean;
    raw?: boolean;
    expectedFile?: string;
    liveApp?: boolean;
};
const runCell = async (
    command: (typeof commands)[number],
    response: (typeof responses)[number],
    marker = 'X3 leak!',
    identifier = false,
    ordinaryAnalytics = false,
    extended?: ExtendedCell,
) => {
    const directory = await fs.mkdtemp(path.join(tmpdir(), 'cli-adversarial-'));
    const cwd = path.join(directory, 'cwd');
    const temporary = path.join(directory, 'tmp');
    const home = path.join(directory, 'home');
    const config = path.join(home, '.config/lightdash');
    await Promise.all(
        [cwd, temporary, config].map((p) => fs.mkdir(p, { recursive: true })),
    );
    const slot = slotFixture();
    slot.lastReported.approvedProjects = [
        {
            projectUuid: project,
            name: 'Project',
            approvedCapabilities: [AgentCapability.ReadDiscover],
        },
    ];
    slot.lastReported.effectiveProjects = [
        {
            projectUuid: project,
            capabilities: [
                {
                    capability: AgentCapability.ReadDiscover,
                    allowed: true,
                    reason: null,
                },
            ],
        },
    ];
    if (extended?.refresh)
        slot.tokens.accessTokenExpiresAt = new Date(
            Date.now() - 1000,
        ).toISOString();
    if (extended?.connect) {
        slot.name = 'new';
        slot.approvedAt = new Date().toISOString();
        slot.grantExpiresAt = new Date(Date.now() + 3_600_000).toISOString();
        slot.tokens.accessTokenExpiresAt = slot.grantExpiresAt;
    }
    const calls: string[] = [];
    const analytics: string[] = [];
    let targets = 0;
    const server = createServer((req, res) => {
        const url = req.url ?? '';
        calls.push(url);
        if (url.startsWith('/analytics')) {
            let body = '';
            req.on('data', (data) => {
                body += String(data);
            });
            req.on('end', () => {
                analytics.push(body);
                res.end('{}');
            });
            return;
        }
        for (const header of [
            'x-test-marker',
            'www-authenticate',
            'retry-after',
            'content-disposition',
            'lightdash-version',
            'location',
        ])
            res.setHeader(header, marker);
        res.statusMessage = marker;
        if (
            url.endsWith(command.target) &&
            (!extended?.bearerOnly ||
                req.headers.authorization?.startsWith('Bearer '))
        ) {
            targets += 1;
            res.statusCode = response.status;
            if (response.contentType)
                res.setHeader(
                    'content-type',
                    `${response.contentType}; marker="${marker}"`,
                );
            let envelope: unknown;
            switch (response.shape) {
                case 'success':
                    envelope = extended?.raw
                        ? extended.success(marker, slot)
                        : {
                              status: 'ok',
                              results: extended!.success(marker, slot),
                              ignored: marker,
                          };
                    break;
                case 'query-error':
                    envelope = {
                        status: 'ok',
                        results: { status: 'error', error: marker },
                    };
                    break;
                case 'query-status':
                    envelope = {
                        status: 'ok',
                        results: { status: marker, error: marker },
                    };
                    break;
                case 'query-id':
                    envelope = { status: 'ok', results: { queryUuid: marker } };
                    break;
                case 'version':
                    envelope = { status: 'ok', results: { version: marker } };
                    break;
                case 'links':
                    envelope = {
                        status: 'ok',
                        results: {
                            projectUuid: project,
                            warehouseConnectionUuid: null,
                            identity: null,
                            requirementSource: 'organization',
                            expiresAt: null,
                            refusal: {
                                reason: 'needs_sign_in',
                                connectUrl: `${slot.instanceUrl}/?token=${marker}`,
                                settingsUrl: `/?token=${marker}`,
                            },
                        },
                    };
                    break;
                default:
                    envelope = {
                        status: 'error',
                        error: {
                            message: marker,
                            name: marker,
                            code: marker,
                            data: { marker },
                        },
                        marker,
                    };
            }
            let body: string;
            switch (response.shape) {
                case 'html':
                    body = `<html>${marker}</html>`;
                    break;
                case 'invalid-json':
                    body = `${marker}{`;
                    break;
                case 'wrong-shape':
                    body = JSON.stringify([marker]);
                    break;
                default:
                    body = JSON.stringify(envelope);
            }
            if (response.shape === 'aborted') {
                res.write(`{"marker":"${marker}`);
                setTimeout(() => res.destroy(), 10);
            } else res.end(body);
            return;
        }
        if (extended?.connect && url.endsWith('/requests')) {
            let body = '';
            req.on('data', (chunk) => {
                body += String(chunk);
            });
            req.on('end', () => {
                const request = JSON.parse(body);
                res.setHeader('content-type', 'application/json');
                res.end(
                    JSON.stringify({
                        status: 'ok',
                        results: {
                            authorizationUrl: `${slot.instanceUrl}/api/v1/oauth/authorize?agent_request=${slot.grantUuid}`,
                            issuer: slot.instanceUrl,
                            resource: slot.instanceUrl,
                            expiresAt: new Date(
                                Date.now() + 60_000,
                            ).toISOString(),
                        },
                    }),
                );
                const callback = new URL(request.redirectUri);
                callback.searchParams.set('state', request.state);
                callback.searchParams.set('iss', slot.instanceUrl);
                callback.searchParams.set('code', 'test-authorization-code');
                callback.searchParams.set('grant_uuid', slot.grantUuid);
                get(callback, (reply) => reply.resume()).on('error', () => {});
            });
            return;
        }
        if (url.endsWith('/oauth/token')) {
            res.setHeader('content-type', 'application/json');
            res.end(
                JSON.stringify({
                    access_token: 'rotated-access-token',
                    refresh_token: 'rotated-refresh-token',
                    token_type: 'Bearer',
                    expires_in: 3600,
                    refresh_expires_in: 3600,
                    scope: 'read write',
                    agent_connection: { grant_uuid: slot.grantUuid },
                }),
            );
            return;
        }
        let results: unknown = {};
        if (url.endsWith('/user'))
            results = {
                userUuid: slot.personUuid,
                organizationUuid: slot.organizationUuid,
            };
        else if (url.endsWith('/status'))
            results = {
                ...slot.lastReported,
                grantUuid: slot.grantUuid,
                name: slot.name,
                clientId: slot.clientId,
                approvedAt: slot.approvedAt,
                expiresAt: slot.grantExpiresAt,
            };
        else if (
            url.endsWith('/query/sql') ||
            url.endsWith('/query/metric-query')
        )
            results = { queryUuid: '55555555-5555-4555-8555-555555555555' };
        else if (url.endsWith('/sqlRunner/tables'))
            results = { db: { public: { orders: {} } } };
        else if (url.endsWith('/deploy'))
            results = {
                deploySessionUuid: '55555555-5555-4555-8555-555555555555',
            };
        else if (url.endsWith('/batch'))
            results = { batchNumber: 0, exploreCount: 1 };
        else if (url.endsWith('/finalize'))
            results = { exploreCount: 1, status: 'completed' };
        else if (url.includes('/code/charts?'))
            results = {
                charts: [],
                spaces: [],
                missingIds: [],
                offset: 0,
                total: 0,
            };
        else if (url.includes('/code/sqlCharts?'))
            results = {
                sqlCharts: [],
                spaces: [],
                missingIds: [],
                offset: 0,
                total: 0,
            };
        else if (url.endsWith('/ai-access/me'))
            results = {
                projectUuid: project,
                warehouseConnectionUuid: null,
                identity: null,
                requirementSource: 'organization',
                expiresAt: null,
                refusal: {
                    reason: 'needs_sign_in',
                    connectUrl: null,
                    settingsUrl: null,
                },
            };
        else if (url.startsWith('/api/v1/health'))
            results = { version: '2.0.0' };
        else if (url === `/api/v1/projects/${project}`)
            results = {
                projectUuid: project,
                name: 'Project',
                slug: 'project',
            };
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ status: 'ok', results, ignored: marker }));
    });
    try {
        await new Promise<void>((resolve) => {
            server.listen(0, '127.0.0.1', resolve);
        });
        const address = server.address();
        if (!address || typeof address === 'string')
            throw new Error('No address');
        const instance = `http://127.0.0.1:${address.port}`;
        slot.instanceUrl = instance;
        slot.resource = instance;
        await fs.writeFile(
            path.join(config, 'config.yaml'),
            yaml.dump({
                user: {
                    anonymousUuid: 'test',
                    userUuid: slot.personUuid,
                    organizationUuid: slot.organizationUuid,
                },
                context: {
                    serverUrl: instance,
                    apiKey: 'personal-test-key',
                    project,
                },
            }),
        );
        await new AgentConnectionStore(
            path.join(config, 'agent-connections.yaml'),
        ).saveSlot(extended?.connect ? { ...slot, name: 'default' } : slot);
        await fs.mkdir(path.join(cwd, 'target'));
        await fs.writeFile(
            path.join(cwd, 'dbt_project.yml'),
            'name: test\nprofile: test\n',
        );
        await fs.writeFile(
            path.join(cwd, 'target/manifest.json'),
            JSON.stringify({
                metadata: {
                    dbt_schema_version:
                        'https://schemas.getdbt.com/dbt/manifest/v12.json',
                    adapter_type: 'postgres',
                    generated_at: '2026-01-01T00:00:00Z',
                },
                nodes: {},
                sources: {},
                metrics: {},
                semantic_models: {},
            }),
        );
        await fs.writeFile(
            path.join(cwd, 'chart.yml'),
            'name: Orders\ntableName: orders\nmetricQuery:\n  limit: 10\n',
        );
        if (extended?.liveApp) {
            await fs.mkdir(path.join(cwd, 'app/src'), { recursive: true });
            await fs.writeFile(
                path.join(cwd, 'app/lightdash-app.yml'),
                yaml.dump({
                    codeVersion: 1,
                    projectUuid: project,
                    slug: 'sample',
                    version: 1,
                    name: 'Sample',
                    description: '',
                    template: null,
                    downloadedAt: '2026-08-01T00:00:00.000Z',
                }),
            );
            await fs.writeFile(
                path.join(cwd, 'app/src/App.tsx'),
                "import { query } from '@lightdash/query-sdk'; query('orders').dimensions(['status']);",
            );
        }
        if (extended?.deploy) {
            await fs.unlink(path.join(cwd, 'dbt_project.yml'));
            await fs.mkdir(path.join(cwd, 'models'));
            await fs.writeFile(
                path.join(cwd, 'models/orders.yml'),
                'type: model\nname: orders\nsql_from: public.orders\ndimensions: []\n',
            );
            await fs.writeFile(
                path.join(cwd, 'lightdash.config.yml'),
                'warehouse:\n  type: postgres\nspotlight:\n  default_visibility: show\ndefaults: {}\ntable_groups: {}\n',
            );
        }
        const env: NodeJS.ProcessEnv = {
            ...process.env,
            HOME: home,
            TMPDIR: temporary,
            TMP: temporary,
            TEMP: temporary,
            LIGHTDASH_URL: instance,
            LIGHTDASH_API_KEY: 'personal-test-key',
            LIGHTDASH_DBT_VERSION: '1.8.0',
            CLI_TEST_PROJECT: project,
            FORCE_COLOR: '0',
            NO_COLOR: '1',
        };
        delete env.LIGHTDASH_AGENT_CONNECTION;
        delete env.LIGHTDASH_PROXY_AUTHORIZATION;
        if (command.selected) env.LIGHTDASH_AGENT_CONNECTION = slot.name;
        const result = await runCliProcess({
            args: [
                '--non-interactive',
                ...command.args,
                ...(command.name.includes('revoke') ? [] : ['--verbose']),
            ],
            cwd,
            env,
            preload: path.join(__dirname, 'connectionAdversarial.fixture.cjs'),
        });
        expect(targets > 0 ? null : { calls, result }).toBeNull();
        let expectedCode = ordinaryAnalytics ? 0 : 1;
        if (extended)
            expectedCode =
                response.shape === 'success'
                    ? extended.successCode
                    : (extended.errorCode ?? 1);
        expect({
            code: result.code,
            output: result.stdout + result.stderr,
        }).toMatchObject({ code: expectedCode });
        if (extended) {
            expect(result.stdout + result.stderr).toContain(
                response.shape === 'success'
                    ? extended.evidence
                    : (extended.errorEvidence ??
                          'The server rejected the agent connection request (status 200).'),
            );
            if (response.shape === 'success' && extended.saved) {
                const saved = await new AgentConnectionStore(
                    path.join(config, 'agent-connections.yaml'),
                ).readSlot(slot);
                expect(saved?.lastReported.approvedProjects[0]).toEqual({
                    projectUuid: project,
                    name: 'Project',
                    approvedCapabilities: [AgentCapability.ReadDiscover],
                });
                expect(saved?.tokens.accessToken).toBe('rotated-access-token');
                const bytes = await fs.readFile(
                    path.join(config, 'agent-connections.yaml'),
                );
                await new AgentConnectionStore(
                    path.join(config, 'agent-connections.yaml'),
                ).saveSlot(saved!);
                expect(
                    await fs.readFile(
                        path.join(config, 'agent-connections.yaml'),
                    ),
                ).toEqual(bytes);
            }
            if (response.shape === 'success' && extended.expectedFile)
                expect(
                    await fs.readFile(
                        path.join(cwd, extended.expectedFile),
                        'utf8',
                    ),
                ).toContain('exposures: []');
            if (
                response.shape === 'success' &&
                ['app-context', 'app-path'].includes(extended.name)
            ) {
                const appManifest = path.join(
                    cwd,
                    'lightdash',
                    'apps',
                    'sample',
                    'lightdash-app.yml',
                );
                if (extended.name === 'app-path') {
                    expect(await fs.readFile(appManifest, 'utf8')).toContain(
                        'slug: sample',
                    );
                    await expect(
                        fs.access(path.join(cwd, 'lightdash', 'apps', marker)),
                    ).rejects.toMatchObject({ code: 'ENOENT' });
                } else {
                    await expect(fs.access(appManifest)).rejects.toMatchObject({
                        code: 'ENOENT',
                    });
                }
            }
        }
        if (identifier)
            expect(result.stdout + result.stderr).toContain(
                'The server rejected the agent connection request (status 200).',
            );
        for (const value of [
            marker,
            encodeURIComponent(marker),
            new URLSearchParams({ marker }).toString().slice(7),
        ])
            expect(result.stdout + result.stderr).not.toContain(value);
        const inspect = async (dir: string): Promise<void> => {
            await Promise.all(
                (await fs.readdir(dir, { withFileTypes: true })).map(
                    async (entry) => {
                        const filename = path.join(dir, entry.name);
                        if (entry.isDirectory()) await inspect(filename);
                        else if (entry.isFile())
                            expect({
                                filename,
                                containsMarker: (
                                    await fs.readFile(filename)
                                ).includes(Buffer.from(marker)),
                            }).toEqual({ filename, containsMarker: false });
                    },
                ),
            );
        };
        await Promise.all([config, cwd, temporary].map(inspect));
        expect(analytics.join('\n')).not.toContain(marker);
        if (ordinaryAnalytics) {
            expect(analytics).toHaveLength(1);
            expect(JSON.parse(analytics[0]).event).toBe(
                'lightdash_cli.command.executed',
            );
        } else expect(analytics).toEqual([]);
    } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve) => {
            server.close(() => resolve());
        });
        await fs.rm(directory, { recursive: true, force: true });
    }
};
// Full grid on one issuer and one API command; the rest share those error paths.
const fullGridCommands = ['status', 'catalog'];
const sampledResponses = responses.filter((response) =>
    [200, 401, 500].includes(response.status),
);
describe.each(commands)('$name', (command) => {
    it.concurrent.each(
        fullGridCommands.includes(command.name) ? responses : sampledResponses,
    )(
        'omits error text for $status $contentType $shape in the real CLI',
        async (response) => runCell(command, response),
        45_000,
    );
});
it.concurrent(
    'omits an unknown identifier-shaped error code in a real request',
    async () =>
        runCell(
            commands.find((command) => command.name === 'catalog')!,
            { status: 200, contentType: 'application/json', shape: 'envelope' },
            'server_identifier_marker',
            true,
        ),
    45_000,
);

it.concurrent.each(['query-error', 'query-status', 'query-id'] as const)(
    'contains a successful envelope with %s',
    async (shape) => {
        const command = commands.find((entry) => entry.name === 'sql')!;
        await runCell(
            {
                ...command,
                target:
                    shape === 'query-id'
                        ? '/query/sql'
                        : '/query/55555555-5555-4555-8555-555555555555?pageSize=500',
            },
            { status: 200, contentType: 'application/json', shape },
        );
    },
    45_000,
);
it.concurrent(
    'contains a successful envelope with an invalid server version',
    async () =>
        runCell(commands.find((entry) => entry.name === 'safe-read')!, {
            status: 200,
            contentType: 'application/json',
            shape: 'version',
        }),
    45_000,
);
it.concurrent(
    'never prints server-supplied warehouse links in a successful status response',
    async () =>
        runCell(
            {
                ...commands.find((entry) => entry.name === 'status')!,
                target: '/ai-access/me',
            },
            { status: 200, contentType: 'application/json', shape: 'links' },
        ),
    45_000,
);

it.concurrent(
    'captures a real ordinary analytics request as a positive sink control',
    async () =>
        runCell(
            {
                ...commands.find((entry) => entry.name === 'provider')!,
                selected: false,
            },
            { status: 200, contentType: 'application/json', shape: 'envelope' },
            'X3 leak!',
            false,
            true,
        ),
    45_000,
);
it.concurrent.each(commands)(
    'contains an aborted HTTP 200 body for $name',
    async (command) =>
        runCell(command, {
            status: 200,
            contentType: 'application/json',
            shape: 'aborted',
        }),
    45_000,
);

const downloadArgs = [
    'download',
    '--skip-spaces',
    '--skip-charts',
    '--skip-dashboards',
];
const invalid = 'The server returned an invalid response.';
const projectPath = `/api/v1/projects/${project}`;
const report = (slot: AgentConnectionSlot) => ({
    ...slot.lastReported,
    name: slot.name,
    grantUuid: slot.grantUuid,
    clientId: slot.clientId,
    approvedAt: slot.approvedAt,
    expiresAt: slot.grantExpiresAt,
});
const extraReport = (marker: string, slot: AgentConnectionSlot) => ({
    ...report(slot),
    future: marker,
    approvedProjects: slot.lastReported.approvedProjects.map((entry) => ({
        ...entry,
        future: { marker },
    })),
    effectiveProjects: slot.lastReported.effectiveProjects.map((entry) => ({
        ...entry,
        future: marker,
        capabilities: entry.capabilities.map((action) => ({
            ...action,
            future: marker,
        })),
    })),
});
const extendedCells: ExtendedCell[] = [
    {
        name: 'spaces',
        args: ['download', '--spaces-only'],
        target: '/code/spaces',
        selected: true,
        success: (marker) => ({
            spaces: [],
            skipped: [{ slug: marker, reason: marker }],
        }),
        evidence: 'A space was skipped.',
        successCode: 0,
    },
    {
        name: 'homepages',
        args: [...downloadArgs, '--include-homepages'],
        target: '/code/homepages?',
        selected: true,
        success: (marker) => ({ homepages: [], missingNames: [marker] }),
        evidence: 'Some homepages were not found or are unpublished.',
        successCode: 1,
    },
    {
        name: 'app-context',
        args: ['download', '--apps-only', '--apps', 'sample'],
        target: '/apps/sample/download',
        selected: true,
        success: (marker) => ({
            manifest: { name: 'Sample', slug: marker },
            files: [],
        }),
        evidence: 'An app could not be downloaded.',
        errorEvidence: 'An app could not be downloaded.',
        successCode: 1,
    },
    {
        name: 'app-path',
        args: ['download', '--apps-only', '--apps', 'sample'],
        target: '/apps/sample/download',
        selected: true,
        success: (marker) => ({
            manifest: { name: 'Sample', slug: 'sample' },
            // A complete context: only the escaping file path can fail this app.
            context: {
                semanticLayer: {
                    path: '.lightdash/context/semantic-layer.yml',
                    contentBase64: '',
                },
                promptHistory: {
                    path: '.lightdash/context/prompt-history.md',
                    contentBase64: '',
                },
                theme: { assets: [] },
            },
            files: [{ path: `../${marker}`, contentBase64: '' }],
        }),
        evidence: 'An app could not be downloaded.',
        errorEvidence: 'An app could not be downloaded.',
        successCode: 1,
    },
    {
        name: 'virtual-views',
        args: [...downloadArgs, '--include-virtual-views'],
        target: '/code/virtualViews',
        selected: true,
        success: (marker) => ({
            virtualViews: [],
            missingSlugs: [marker],
            skipped: [{ slug: marker, reason: marker }],
        }),
        evidence: 'A virtual view was skipped.',
        successCode: 0,
    },
    ...['alerts', 'scheduledDeliveries', 'googleSheets'].map(
        (family, index): ExtendedCell => ({
            name: family,
            args: [
                ...downloadArgs,
                [
                    '--include-alerts',
                    '--include-scheduled-deliveries',
                    '--include-google-sheets',
                ][index],
            ],
            target: `/code/${family}`,
            selected: true,
            success: (marker) => ({
                [family === 'googleSheets' ? 'googleSheetsSyncs' : family]: [],
                skipped: [{ name: marker, reason: marker }],
            }),
            evidence: 'A scheduled item was skipped.',
            successCode: 0,
        }),
    ),
    {
        name: 'download-progress',
        args: ['download', '--skip-spaces', '--skip-dashboards'],
        target: '/code/charts?offset=0&languageMap=false',
        selected: true,
        success: (marker) => ({
            charts: [],
            missingIds: [],
            spaces: [],
            offset: marker,
            total: 0,
        }),
        evidence: invalid,
        successCode: 1,
    },
    {
        name: 'download-missing',
        args: ['download', '--skip-spaces', '--skip-dashboards'],
        target: '/code/charts?offset=0&languageMap=false',
        selected: true,
        success: (marker) => ({
            charts: [],
            missingIds: [marker],
            spaces: [],
            offset: 0,
            total: 0,
        }),
        evidence: 'Some requested items were not found.',
        successCode: 0,
    },
    ...['start', 'batch', 'finalize'].map(
        (stage): ExtendedCell => ({
            name: `deploy-${stage}`,
            args: ['deploy'],
            target: stage === 'start' ? '/deploy' : `/${stage}`,
            selected: true,
            deploy: true,
            success: (marker) =>
                stage === 'start'
                    ? { deploySessionUuid: marker }
                    : { exploreCount: marker, batchNumber: 0 },
            evidence: invalid,
            successCode: 1,
        }),
    ),
    {
        name: 'deploy-settings',
        args: ['deploy'],
        target: projectPath,
        selected: true,
        deploy: true,
        success: (marker) => ({
            projectUuid: project,
            warehouseConnection: {
                type: 'snowflake',
                disableTimestampConversion: marker,
            },
        }),
        evidence: invalid,
        successCode: 1,
    },
    ...['tags/yaml', 'parameters', 'defaults', 'table-groups'].map(
        (endpoint): ExtendedCell => ({
            name: `deploy-${endpoint}`,
            args: ['deploy'],
            target: `/${endpoint}`,
            selected: true,
            deploy: true,
            success: (marker) => ({ ignored: marker }),
            evidence: 'Deploy completed! 1 explores deployed.',
            successCode: 0,
            errorCode: 0,
        }),
    ),
    {
        name: 'live-apps',
        args: ['apps', 'validate', 'app', '--live', '--format', 'json'],
        target: '/explores',
        selected: true,
        liveApp: true,
        success: () => [],
        evidence: "Explore 'orders' does not exist",
        successCode: 1,
    },
    {
        name: 'external-connections',
        args: [...downloadArgs, '--include-external-connections'],
        target: '/code/externalConnections?offset=0',
        selected: true,
        success: (marker) => ({
            externalConnections: [],
            missingSlugs: [marker],
            offset: 0,
            total: 0,
        }),
        evidence: 'An external connection was not found.',
        successCode: 0,
    },
    {
        name: 'documents',
        args: [...downloadArgs, '--include-documents'],
        target: `/code/documents?offset=0&schemaVersion=${DOCUMENT_SCHEMA_VERSION}`,
        selected: true,
        success: (marker) => ({
            documents: [],
            missingSlugs: [marker],
            nextOffset: null,
        }),
        evidence: 'A document was not found.',
        successCode: 0,
    },
    {
        name: 'ai-agents',
        args: [...downloadArgs, '--include-agents'],
        target: '/code/aiAgents?offset=0',
        selected: true,
        success: (marker) => ({
            agents: [],
            missingIds: [marker],
            offset: 0,
            total: 0,
        }),
        evidence: 'An AI agent was not found.',
        successCode: 0,
    },
    {
        name: 'metric-submit',
        args: ['run-chart', '--path', 'chart.yml'],
        target: '/query/metric-query',
        selected: true,
        success: (marker) => ({ queryUuid: marker }),
        evidence: 'The server returned an invalid query identifier.',
        successCode: 1,
    },
    {
        name: 'metric-duration',
        args: ['run-chart', '--path', 'chart.yml'],
        target: '/query/55555555-5555-4555-8555-555555555555',
        selected: true,
        success: (marker) => ({
            status: 'ready',
            columns: {},
            rows: [],
            metadata: { performance: { initialQueryExecutionMs: marker } },
        }),
        evidence: invalid,
        successCode: 1,
    },
    {
        name: 'catalog-fields',
        args: [
            'warehouse-catalog',
            '--include-fields',
            '--database',
            'db',
            '--schema',
            'public',
            '--table',
            'orders',
            '--json',
        ],
        target: '/sqlRunner/fields?databaseName=db&schemaName=public&tableName=orders',
        selected: true,
        success: () => ({ amount: 'number' }),
        evidence: '"name": "amount"',
        successCode: 0,
    },
    {
        name: 'catalog-refresh',
        args: ['warehouse-catalog', '--refresh', '--json'],
        target: '/sqlRunner/refresh-catalog',
        selected: true,
        success: (marker) => ({ ignored: marker }),
        evidence: '"table": "orders"',
        successCode: 0,
    },
    {
        name: 'exposures',
        args: ['generate-exposures', '--output', 'exposures.yml'],
        target: '/dbt-exposures',
        selected: true,
        success: () => ({}),
        evidence: 'Found 0 exposures',
        expectedFile: 'exposures.yml',
        successCode: 0,
    },
    {
        name: 'provider-refresh-token',
        args: ['config', 'get-project'],
        target: '/oauth/token',
        selected: true,
        refresh: true,
        raw: true,
        success: (marker) => ({
            access_token: 'rotated-access-token',
            refresh_token: 'rotated-refresh-token',
            token_type: 'Bearer',
            expires_in: marker,
            scope: 'read write',
        }),
        evidence: 'Its refresh outcome is uncertain.',
        errorEvidence: 'Its refresh outcome is uncertain.',
        successCode: 1,
    },
    {
        name: 'provider-refresh-report',
        args: ['config', 'get-project'],
        target: '/status',
        selected: true,
        refresh: true,
        success: extraReport,
        evidence: '> Agent connection:',
        errorEvidence: 'Its refresh outcome is uncertain.',
        saved: true,
        successCode: 0,
    },
    {
        name: 'connect-exchange',
        args: ['agent', 'connect', '--connection', '--name', 'new'],
        target: '/oauth/token',
        selected: false,
        connect: true,
        raw: true,
        success: (marker) => ({
            access_token: 'rotated-access-token',
            refresh_token: 'rotated-refresh-token',
            token_type: marker,
            expires_in: 3600,
            scope: 'read write',
            agent_connection: {
                grant_uuid: '33333333-3333-4333-8333-333333333333',
            },
        }),
        evidence:
            'The server returned a token that is not bound to this agent connection.',
        errorEvidence: 'No credential was saved.',
        successCode: 1,
    },
    {
        name: 'connect-proof',
        args: ['agent', 'connect', '--connection', '--name', 'new'],
        target: '/status',
        selected: false,
        connect: true,
        success: extraReport,
        evidence: 'Agent connection saved: new',
        errorEvidence: 'No credential was saved.',
        saved: true,
        successCode: 0,
    },
    {
        name: 'connect-project-proof',
        args: [
            'agent',
            'connect',
            '--connection',
            '--name',
            'new',
            '--project',
            'project',
        ],
        target: '/oauth/token',
        raw: true,
        selected: false,
        connect: true,
        success: (marker) => ({
            access_token: 'rotated-access-token',
            refresh_token: 'rotated-refresh-token',
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_expires_in: 3600,
            scope: 'read write',
            agent_connection: {
                grant_uuid: '33333333-3333-4333-8333-333333333333',
                approved_projects: [{ project_uuid: project, slug: marker }],
            },
        }),
        evidence: 'No credential was saved.',
        errorEvidence: 'No credential was saved.',
        successCode: 1,
    },
    {
        name: 'connect-person-proof',
        args: ['agent', 'connect', '--connection', '--name', 'new'],
        target: '/user',
        selected: false,
        connect: true,
        bearerOnly: true,
        success: (marker) => ({
            userUuid: marker,
            organizationUuid: '11111111-1111-4111-8111-111111111111',
        }),
        evidence: 'No credential was saved.',
        errorEvidence: 'No credential was saved.',
        successCode: 1,
    },
    {
        name: 'version-advice',
        args: downloadArgs,
        target: '/health?skipMigrationCheck=true',
        selected: true,
        success: (marker) => ({ version: `999.0.0-${marker}` }),
        evidence:
            'The CLI and server use different major versions. Use a CLI version that matches your server.',
        successCode: 0,
    },
];
describe.each(extendedCells)('extended $name', (cell) => {
    it.concurrent.each(['envelope', 'success'] as const)(
        'reaches the formatter for %s',
        async (shape) =>
            runCell(
                cell,
                { status: 200, contentType: 'application/json', shape },
                cell.name === 'version-advice'
                    ? 'server-written-marker'
                    : 'X3 leak!',
                false,
                false,
                cell,
            ),
        45_000,
    );
});
