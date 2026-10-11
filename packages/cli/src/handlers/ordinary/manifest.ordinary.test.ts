import {
    DimensionType,
    SupportedDbtVersions,
    type DbtManifest,
    type DbtModelNode,
} from '@lightdash/common';
import chalk from 'chalk';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import type { CompileHandlerOptions } from '../compile';
import {
    OrdinaryServer,
    personalConfig,
    request,
    saveConfig,
} from './harness.mocks';

const location = vi.hoisted(() => ({ home: '' }));
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
let config: ReturnType<typeof personalConfig>;
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
    chalk.level = 0;
    location.home = await fs.mkdtemp(path.join(tmpdir(), 'ordinary-deploy-'));
    server = new OrdinaryServer();
    await server.start();
    config = personalConfig(server.url);
    file = await saveConfig(location.home, config);
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

vi.mock('../../dbt/context');
vi.mock('../../dbt/manifest', async (original) => ({
    ...(await original<typeof import('../../dbt/manifest')>()),
    loadManifest: vi.fn(),
}));
vi.mock('../../dbt/validation');
vi.mock('../../lightdash/loader');
vi.mock('../dbt/compile');
vi.mock('../dbt/getDbtVersion');
const dbtNode = (
    uniqueId: string,
    resourceType: 'model' | 'seed',
    compiled: boolean,
    extra: Record<string, unknown> = {},
) => ({
    unique_id: uniqueId,
    name: uniqueId.split('.').at(-1) ?? uniqueId,
    resource_type: resourceType,
    package_name: 'test',
    path: `${uniqueId}.sql`,
    original_file_path: `models/${uniqueId}.sql`,
    alias: uniqueId.split('.').at(-1) ?? uniqueId,
    checksum: { name: 'sha256', checksum: uniqueId },
    tags: [],
    refs: [],
    sources: [],
    depends_on: { macros: [], nodes: [] },
    database: 'db',
    schema: 'public',
    fqn: ['test', uniqueId],
    raw_code: 'SELECT 1',
    columns: {
        id: {
            name: 'id',
            data_type: DimensionType.NUMBER,
            meta: {},
        },
    },
    meta: {},
    description: '',
    created_at: 0,
    language: 'sql',
    relation_name: `"db"."public"."${uniqueId}"`,
    config: { materialized: 'table' },
    compiled,
    ...extra,
});

const manifest = (
    nodes: Record<string, ReturnType<typeof dbtNode>>,
): DbtManifest =>
    ({
        metadata: {
            dbt_schema_version:
                'https://schemas.getdbt.com/dbt/manifest/v12.json',
            generated_at: '2026-01-01T00:00:00Z',
            adapter_type: 'postgres',
        },
        nodes,
        sources: {},
        macros: {},
        docs: {},
        exposures: {},
        metrics: {},
    }) as unknown as DbtManifest;

const compileOptions = (projectDir: string): CompileHandlerOptions => ({
    projectDir,
    profilesDir: '',
    target: undefined,
    profile: undefined,
    vars: undefined,
    verbose: false,
    startOfWeek: 0,
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
    warehouseCredentials: false,
    disableTimestampConversion: false,
});

it.each([404, 401, 403, 500, 'disconnect', 'invalid'] as const)(
    'pins automatic manifest failure %s with real transport',
    async (status) => {
        await fs.writeFile(
            path.join(location.home, 'dbt_project.yml'),
            'name: pin\nversion: "1.0"\nprofile: pin\n',
        );
        const { tryGetDbtVersion } = await import('../dbt/getDbtVersion');
        vi.mocked(tryGetDbtVersion).mockResolvedValue({
            success: true,
            version: {
                verboseVersion: '1.10.19',
                versionOption: SupportedDbtVersions.V1_10,
                isDbtCloudCLI: false,
                isDbtFusion: false,
            },
        });
        const { getDbtContext } = await import('../../dbt/context');
        vi.mocked(getDbtContext).mockResolvedValue({
            projectName: 'test_project',
            profileName: 'test_profile',
            targetDir: path.join(location.home, 'target'),
            modelsDir: 'models',
        });
        const { loadLightdashModels } = await import('../../lightdash/loader');
        vi.mocked(loadLightdashModels).mockResolvedValue([]);
        const { validateDbtModel } = await import('../../dbt/validation');
        vi.mocked(validateDbtModel).mockImplementation(
            async (_adapter, _version, models) => ({
                valid: models as DbtModelNode[],
                invalid: [],
                skipped: [],
            }),
        );
        const { loadManifest } = await import('../../dbt/manifest');
        vi.mocked(loadManifest).mockResolvedValue(
            manifest({
                'model.test.orders': dbtNode(
                    'model.test.orders',
                    'model',
                    true,
                ),
            }),
        );
        const { maybeCompileModelsAndJoins } = await import('../dbt/compile');
        vi.mocked(maybeCompileModelsAndJoins).mockResolvedValue({
            compiledModelIds: ['model.test.orders'],
            originallySelectedModelIds: undefined,
        });
        const configModule = await import('../../config');
        const get = vi.spyOn(configModule, 'getConfig');
        const { compileProject } = await import('../compile');
        const trace = request(
            'GET',
            `/api/v1/projects/${config.context!.project}/dbt/manifest`,
        );
        server.replies.push({
            ...trace,
            ...(() => {
                if (status === 'disconnect') {
                    return { disconnect: true };
                }
                if (status === 'invalid') {
                    return { results: {} };
                }
                return { status, error: 'manifest unavailable' };
            })(),
        });
        vi.spyOn(console, 'info').mockImplementation(() => {});
        const result = await compileProject({
            ...compileOptions(location.home),
            combineManifestProjectUuid: config.context!.project,
        });
        expect(result.explores.map((explore) => explore.name)).toEqual([
            'orders',
        ]);
        expect(server.requests).toEqual([trace]);
        server.expectComplete();
        expect(get.mock.calls).toEqual([[], []]);
        const reason = (() => {
            if (status === 'disconnect') {
                return `request to ${server.url}${trace.path} failed, reason: socket hang up`;
            }
            if (status === 'invalid') {
                return `${trace.path} returned an invalid manifest: expected an object with metadata and a nodes record`;
            }
            return 'manifest unavailable';
        })();
        expect(vi.mocked(console.error).mock.calls).toEqual([
            ...(status === 404
                ? []
                : [
                      [
                          `Could not fetch the server manifest; continuing with the preview manifest: ${reason}`,
                      ],
                  ]),
            [''],
            ['- SUCCESS> orders '],
            [''],
            ['Compiled 1 explores, SUCCESS=1 ERRORS=0'],
        ]);
        expect(vi.mocked(console.info).mock.calls).toEqual(
            status === 404
                ? [
                      [
                          'No server manifest found; continuing with the preview manifest',
                      ],
                  ]
                : [],
        );
        expect(await fs.readFile(file, 'utf8')).toBe(before);
        expect(await fs.readdir(path.dirname(file))).toEqual(['config.yaml']);
        expect(console.log).not.toHaveBeenCalled();
        expect(process.exit).not.toHaveBeenCalled();
        expect(process.exitCode).toBeUndefined();
    },
);
