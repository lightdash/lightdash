import {
    DbtProjectType,
    SupportedDbtVersions,
    WarehouseTypes,
    type DbtGithubProjectConfig,
    type DbtProjectConfig,
} from '@lightdash/common';
import fs from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { analyticsMock } from '../analytics/LightdashAnalytics.mock';
import { DbtCliClient } from '../dbt/dbtCliClient';
import { toDbtTarget } from '../dbt/targets';
import { warehouseClientMock } from '../utils/QueryBuilder/MetricQueryBuilder.mock';
import { GitRepository, type GitCheckoutMode } from './gitRepository';
import { projectAdapterFromConfig } from './projectAdapter';

vi.mock('./gitRepository', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./gitRepository')>();
    return {
        ...actual,
        GitRepository: vi.fn(
            class RecordingGitRepository extends actual.GitRepository {
                constructor(
                    ...args: ConstructorParameters<typeof actual.GitRepository>
                ) {
                    super(...args);
                    this.refresh = async () => {
                        const project = path.join(args[1], 'analytics/dbt');
                        await fs.mkdir(project, { recursive: true });
                        await fs.writeFile(
                            path.join(project, 'dbt_project.yml'),
                            'name: fixture\nmodel-paths: [models]\n',
                        );
                    };
                }
            },
        ),
    };
});

const githubConnection = {
    type: DbtProjectType.GITHUB,
    authorization_method: 'personal_access_token',
    repository: 'fixture/repository',
    branch: 'main',
    personal_access_token: 'ghp_fixture',
    project_sub_path: 'analytics/dbt',
} satisfies DbtGithubProjectConfig;

const createAdapter = (
    config: DbtProjectConfig = githubConnection,
    gitCheckout: GitCheckoutMode = 'sparse',
) =>
    projectAdapterFromConfig(
        config,
        warehouseClientMock,
        { warehouseCatalog: undefined, onWarehouseCatalogChange: vi.fn() },
        SupportedDbtVersions.V1_10,
        [],
        null,
        {
            resolve: () =>
                toDbtTarget(
                    {
                        type: WarehouseTypes.POSTGRES,
                        host: 'localhost',
                        port: 5432,
                        user: 'fixture',
                        password: 'fixture',
                        dbname: 'fixture',
                        schema: 'public',
                    },
                    { explicitCredentials: false },
                ),
            policy: { explicitCredentials: false },
        },
        analyticsMock,
        { gitCheckout },
    );

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(DbtCliClient.prototype, 'installDeps').mockResolvedValue(
        undefined,
    );
});

afterEach(() => vi.restoreAllMocks());

it('defaults an existing seven-argument GitHub factory call to full checkout', async () => {
    const adapter = await projectAdapterFromConfig(
        githubConnection,
        warehouseClientMock,
        { warehouseCatalog: undefined, onWarehouseCatalogChange: vi.fn() },
        SupportedDbtVersions.V1_10,
        [],
        null,
        {
            resolve: () =>
                toDbtTarget(
                    {
                        type: WarehouseTypes.POSTGRES,
                        host: 'localhost',
                        port: 5432,
                        user: 'fixture',
                        password: 'fixture',
                        dbname: 'fixture',
                        schema: 'public',
                    },
                    { explicitCredentials: false },
                ),
            policy: { explicitCredentials: false },
        },
    );
    try {
        await adapter.prepareDbtSource();
        expect(vi.mocked(GitRepository).mock.calls.at(-1)?.[6]).toEqual({
            kind: 'full',
        });
    } finally {
        await adapter.destroy();
    }
});

it('preserves the existing analytics and manifest options argument positions', async () => {
    const projectDir = await fs.mkdtemp(
        path.join(tmpdir(), 'dbt-factory-options-'),
    );
    const track = vi.spyOn(analyticsMock, 'track');
    try {
        await fs.writeFile(
            path.join(projectDir, 'lightdash.config.yml'),
            'spotlight:\n  default_visibility: hide\n',
        );
        const adapter = await projectAdapterFromConfig(
            {
                type: DbtProjectType.MANIFEST,
                manifest: '{}',
                hideRefreshButton: true,
            },
            warehouseClientMock,
            { warehouseCatalog: undefined, onWarehouseCatalogChange: vi.fn() },
            SupportedDbtVersions.V1_10,
            [],
            null,
            null,
            analyticsMock,
            { projectDir },
        );
        try {
            await expect(
                adapter.getLightdashProjectConfig({
                    userUuid: 'fixture-user',
                    projectUuid: 'fixture-project',
                    organizationUuid: 'fixture-organization',
                }),
            ).resolves.toMatchObject({
                spotlight: { default_visibility: 'hide' },
            });
            expect(track).toHaveBeenCalledWith(
                expect.objectContaining({ event: 'lightdashconfig.loaded' }),
            );
        } finally {
            await adapter.destroy();
        }
    } finally {
        await fs.rm(projectDir, { recursive: true, force: true });
    }
});

it.each([
    { config: githubConnection, mode: 'full' },
    { config: { ...githubConnection, project_sub_path: '/' }, mode: 'sparse' },
    {
        config: { ...githubConnection, host_domain: 'ghe.example.test' },
        mode: 'sparse',
    },
    {
        config: {
            type: DbtProjectType.GITLAB,
            repository: 'fixture/repository',
            branch: 'main',
            project_sub_path: 'analytics/dbt',
            personal_access_token: 'glpat_fixture',
        },
        mode: 'sparse',
    },
    {
        config: {
            type: DbtProjectType.BITBUCKET,
            username: 'fixture',
            repository: 'fixture/repository',
            branch: 'main',
            project_sub_path: 'analytics/dbt',
            personal_access_token: 'fixture',
        },
        mode: 'sparse',
    },
    {
        config: {
            type: DbtProjectType.AZURE_DEVOPS,
            organization: 'fixture',
            project: 'fixture',
            repository: 'repository',
            branch: 'main',
            project_sub_path: 'analytics/dbt',
            personal_access_token: 'fixture',
        },
        mode: 'sparse',
    },
] satisfies { config: DbtProjectConfig; mode: GitCheckoutMode }[])(
    'keeps $config.type full for $mode / $config.host_domain / $config.project_sub_path',
    async ({ config, mode }) => {
        const adapter = await createAdapter(config, mode);
        try {
            await adapter.prepareDbtSource();
            expect(vi.mocked(GitRepository).mock.calls.at(-1)?.[6]).toEqual({
                kind: 'full',
            });
        } finally {
            await adapter.destroy();
        }
    },
);

it.each([
    { ...githubConnection, semanticLayer: 'lightdash' },
    {
        type: DbtProjectType.BITBUCKET,
        semanticLayer: 'lightdash',
        username: 'fixture',
        repository: 'fixture/repository',
        branch: 'main',
        project_sub_path: 'analytics/dbt',
        personal_access_token: 'fixture',
    },
] satisfies DbtProjectConfig[])(
    'keeps native $type projects on the default full Git transport',
    async (config) => {
        const adapter = await createAdapter(config);
        try {
            expect(GitRepository).toHaveBeenCalledOnce();
            expect(
                vi.mocked(GitRepository).mock.calls.at(-1)?.[6],
            ).toBeUndefined();
        } finally {
            await adapter.destroy();
        }
    },
);

it.each([
    { type: DbtProjectType.NONE },
    { type: DbtProjectType.MANIFEST, manifest: '{}', hideRefreshButton: true },
] satisfies DbtProjectConfig[])(
    'does not construct a Git repository for $type',
    async (config) => {
        const adapter = await createAdapter(config);
        try {
            await adapter.prepareDbtSource();
            expect(GitRepository).not.toHaveBeenCalled();
        } finally {
            await adapter.destroy();
        }
    },
);

it('the public factory prepares a sparse GitHub.com dbt subdirectory', async () => {
    const adapter = await createAdapter();
    try {
        await adapter.prepareDbtSource();
        expect(vi.mocked(GitRepository).mock.calls.at(-1)?.[6]).toEqual({
            kind: 'sparse',
            directories: ['analytics/dbt'],
        });
    } finally {
        await adapter.destroy();
    }
});
