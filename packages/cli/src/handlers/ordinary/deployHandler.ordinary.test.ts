import type { Explore } from '@lightdash/common';
import chalk from 'chalk';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import { tmpdir } from 'os';
import path from 'path';
import {
    OrdinaryServer,
    personalConfig,
    request,
    saveConfig,
} from './harness.mocks';

const location = vi.hoisted(() => ({ home: '', execa: vi.fn() }));
vi.mock('execa', () => ({ default: location.execa }));
vi.mock('os', async (original) => ({
    ...(await original<typeof import('os')>()),
    homedir: () => location.home,
}));
vi.mock('../../analytics/analytics', () => ({
    LightdashAnalytics: { track: vi.fn() },
}));
let server: OrdinaryServer;
let file: string;
let before: string;
const previousExit = process.exitCode;
beforeEach(async () => {
    vi.resetModules();
    for (const key of [
        'LIGHTDASH_AGENT_CONNECTION',
        'LIGHTDASH_API_KEY',
        'LIGHTDASH_PROJECT',
        'LIGHTDASH_URL',
        'LIGHTDASH_PROXY_AUTHORIZATION',
        'LIGHTDASH_API_TIMEOUT_MS',
    ])
        vi.stubEnv(key, undefined);
    vi.stubEnv('CI', 'true');
    vi.stubEnv('LIGHTDASH_DBT_VERSION', undefined);
    vi.stubEnv('TERM', 'dumb');
    location.execa.mockReset().mockResolvedValue({ all: 'installed: 1.8.0' });
    chalk.level = 0;
    location.home = await fs.mkdtemp(path.join(tmpdir(), 'ordinary-deploy-'));
    server = new OrdinaryServer();
    await server.start();
    file = await saveConfig(location.home, personalConfig(server.url));
    before = await fs.readFile(file, 'utf8');
    await fs.writeFile(
        path.join(location.home, 'lightdash.config.yml'),
        'spotlight:\n  default_visibility: show\n',
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Unexpected exit');
    });
    process.exitCode = undefined;
});
afterEach(async () => {
    vi.useRealTimers();
    await server.close();
    await fs.rm(location.home, { recursive: true, force: true });
    process.exitCode = previousExit;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});
const deployOptions = {
    projectDir: '/tmp/project',
    profilesDir: '',
    target: undefined,
    profile: undefined,
    vars: undefined,
    verbose: false,
    ignoreErrors: false,
    validateWarehouseColumns: false,
    projectUuid: 'project-uuid',
    skipWarehouseCatalog: true,
    skipDbtCompile: true,
    useDbtList: false,
    select: undefined,
    models: undefined,
    threads: undefined,
    noVersionCheck: false,
    exclude: undefined,
    selector: undefined,
    state: undefined,
    fullRefresh: false,
    defer: false,
    targetPath: undefined,
    favorState: false,
    combineManifest: undefined,
};

const yamlExplores = [
    {
        name: 'orders',
        label: 'Orders',
        tags: [],
        baseTable: 'orders',
        joinedTables: [],
        tables: {
            orders: {
                name: 'orders',
                label: 'Orders',
                database: 'db-error',
                schema: 'schema-error',
                sqlTable: 'public.orders',
                description: 'orders table',
                dimensions: {},
                metrics: {},
                orderFieldsBy: 'LABEL',
                requiredFilters: [],
                groupDetails: {},
                dbtPackageName: 'lightdash',
                ymlPath: 'models/orders.yml',
                sqlPath: 'models/orders.yml',
                lineageGraph: {
                    orders: [],
                },
            },
        },
        targetDatabase: 'postgres',
        ymlPath: 'models/orders.yml',
        sqlPath: 'models/orders.yml',
        spotlight: {
            visibility: 'show',
            categories: [],
        },
    },
];
it('deploys timestamp SQL using the named source extra Snowflake connection setting', async () => {
    await fs.mkdir(path.join(location.home, 'models'));
    await fs.writeFile(
        path.join(location.home, 'models/orders.yml'),
        `type: model\nname: orders\nsql_from: public.orders\ndimensions:\n  - name: created_at\n    type: timestamp\n    sql: \${TABLE}.created_at\n    time_intervals: []\n`,
    );
    await fs.writeFile(
        path.join(location.home, 'lightdash.config.yml'),
        'warehouse:\n  type: snowflake\nspotlight:\n  default_visibility: show\n',
    );
    const { CLI_VERSION } = await import('../../env');
    const { deployHandler } = await import('../deploy');
    const project = personalConfig(server.url).context!.project!;
    const projectUrl = `/api/v1/projects/${project}`;
    const trace = [
        request('GET', '/api/v1/health?skipMigrationCheck=true'),
        request('GET', `${projectUrl}/dbt-sources`),
        request('GET', projectUrl),
        request(
            'GET',
            `${projectUrl}/warehouse-connections/dbt-sources/bindings`,
        ),
        request('GET', `${projectUrl}/warehouse-connections/extra-connection`),
        request('PUT', `${projectUrl}/tags/yaml`, '[]'),
    ];
    server.replies.push(
        { ...trace[0], results: { version: CLI_VERSION } },
        {
            ...trace[1],
            results: [
                { name: 'finance', projectDbtSourceUuid: 'finance-source' },
            ],
        },
        {
            ...trace[2],
            results: {
                projectUuid: project,
                connectionRoute: 'multi',
                warehouseConnection: {
                    type: 'snowflake',
                    disableTimestampConversion: false,
                },
            },
        },
        {
            ...trace[3],
            results: {
                connections: [
                    {
                        warehouseConnectionUuid: 'original-connection',
                        name: 'Original',
                        isOriginal: true,
                    },
                    {
                        warehouseConnectionUuid: 'extra-connection',
                        name: 'Finance',
                        isOriginal: false,
                    },
                ],
                sources: [
                    {
                        projectDbtSourceUuid: 'finance-source',
                        warehouseConnectionUuid: 'extra-connection',
                    },
                ],
            },
        },
        {
            ...trace[4],
            results: {
                name: 'Finance',
                warehouseConnection: {
                    type: 'snowflake',
                    disableTimestampConversion: true,
                },
            },
        },
        {
            method: 'PUT',
            path: `${projectUrl}/explores?complete=true&sourceUuid=finance-source`,
            results: { exploreCount: 1 },
        },
        { ...trace[5], results: {} },
    );

    await deployHandler({
        ...deployOptions,
        projectDir: location.home,
        profilesDir: location.home,
        source: 'finance',
        batchedDeploy: false,
    });

    const deployed = server.requests[5];
    let explores: Explore[];
    try {
        explores = JSON.parse(deployed.body);
    } catch {
        throw new Error('Expected a JSON deploy payload');
    }
    expect(explores).toHaveLength(1);
    expect(explores[0].tables.orders.dimensions.created_at).toMatchObject({
        sql: `\${TABLE}.created_at`,
        compiledSql: '"orders".created_at',
    });
    expect(server.requests).toEqual([
        ...trace.slice(0, 5),
        request(
            'PUT',
            `${projectUrl}/explores?complete=true&sourceUuid=finance-source`,
            deployed.body,
        ),
        ...trace.slice(5),
    ]);
    server.expectComplete();
    expect(await fs.readFile(file, 'utf8')).toBe(before);
}, 20_000);

it.each([false, true])(
    'pins the YAML-only deploy handler with create=%s',
    async (create) => {
        const initialConfig = personalConfig(server.url);
        expect(before).toBe(yaml.dump(initialConfig));
        expect(await fs.readdir(path.dirname(file))).toEqual(['config.yaml']);
        await fs.mkdir(path.join(location.home, 'models'));
        await fs.writeFile(
            path.join(location.home, 'models/orders.yml'),
            'type: model\nname: orders\nsql_from: public.orders\ndimensions: []\n',
        );
        await fs.writeFile(
            path.join(location.home, 'lightdash.config.yml'),
            'warehouse:\n  type: postgres\nspotlight:\n  default_visibility: show\n',
        );
        const configModule = await import('../../config');
        const get = vi.spyOn(configModule, 'getConfig');
        const { CLI_VERSION } = await import('../../env');
        const { deployHandler } = await import('../deploy');
        const project = create
            ? '22222222-2222-4222-8222-222222222222'
            : initialConfig.context!.project!;
        const trace = [
            request('GET', '/api/v1/health?skipMigrationCheck=true'),
        ];
        server.replies.push({ ...trace[0], results: { version: CLI_VERSION } });
        if (create) {
            trace.push(
                request('GET', '/api/v1/user'),
                request(
                    'POST',
                    '/api/v1/org/projects',
                    JSON.stringify({
                        name: 'New',
                        type: 'DEFAULT',
                        copyWarehouseConnectionFromUpstreamProject: false,
                        dbtConnection: { type: 'none' },
                        dbtVersion: 'v1.12',
                        asyncCopyContent: false,
                    }),
                ),
            );
            server.replies.push(
                {
                    ...trace[1],
                    results: {
                        userUuid: 'person',
                        organizationUuid: 'org',
                        abilityRules: [
                            { action: 'create', subject: 'Project' },
                        ],
                    },
                },
                {
                    ...trace[2],
                    results: { project: { projectUuid: project, name: 'New' } },
                },
            );
        } else {
            trace.push(
                request('GET', `/api/v1/projects/${project}/dbt-sources`),
                request('GET', `/api/v1/projects/${project}`),
            );
            server.replies.push(
                {
                    ...trace[1],
                    results: [
                        {
                            name: 'finance',
                            projectDbtSourceUuid: 'finance-source',
                        },
                    ],
                },
                {
                    ...trace[2],
                    results: { projectUuid: project, name: 'Main' },
                },
            );
        }
        const deployTrace = [
            request(
                'PUT',
                `/api/v1/projects/${project}/explores?complete=true${create ? '' : '&sourceUuid=finance-source'}`,
                JSON.stringify(yamlExplores),
            ),
            request('PUT', `/api/v1/projects/${project}/tags/yaml`, '[]'),
        ];
        trace.push(...deployTrace);
        server.replies.push(
            ...deployTrace.map((entry) => ({
                ...entry,
                results: { exploreCount: 1 },
            })),
        );
        let spinnerOutput = '';
        vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
            spinnerOutput += String(chunk);
            return true;
        });
        await expect(
            deployHandler({
                ...deployOptions,
                projectDir: location.home,
                profilesDir: location.home,
                create: create ? ' New ' : undefined,
                batchedDeploy: false,
            }),
        ).resolves.toBeUndefined();
        expect(server.requests).toEqual(trace);
        server.expectComplete();
        expect(get.mock.calls).toEqual(Array.from({ length: 9 }, () => []));
        expect(await fs.readFile(file, 'utf8')).toBe(
            create
                ? yaml.dump({
                      ...initialConfig,
                      context: {
                          ...initialConfig.context,
                          project,
                          projectName: 'New',
                          source: undefined,
                      },
                  })
                : before,
        );
        expect(await fs.readdir(path.dirname(file))).toEqual(['config.yaml']);
        expect(vi.mocked(console.error).mock.calls).toEqual([
            ...(create ? [] : [['\nDeploying to project: "Main"\n']]),
            ['- SUCCESS> orders '],
            [''],
            ['Compiled 1 explores, SUCCESS=1 ERRORS=0'],
            ...(create ? [[''], ['']] : []),
            [
                'No parameters section in lightdash.config.yml; project parameters left unchanged (use `parameters: {}` to clear)',
            ],
            ['Successfully deployed project:'],
            [''],
            [
                `      ⚡️ ${server.url}${create ? `/createProject/cli?projectUuid=${project}` : `/projects/${project}/home`}`,
            ],
            [''],
        ]);
        expect(spinnerOutput).toBe(
            create
                ? '-   Creating new project New\n✔   New project New created\n\n'
                : '',
        );
        expect(location.execa.mock.calls).toEqual([
            [
                'dbt',
                ['--version'],
                { all: true, stdio: ['pipe', 'pipe', 'pipe'] },
            ],
        ]);
        expect(console.log).not.toHaveBeenCalled();
        expect(process.exit).not.toHaveBeenCalled();
        expect(process.exitCode).toBeUndefined();
    },
);
