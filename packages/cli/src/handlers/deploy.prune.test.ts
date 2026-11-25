import {
    DeploySessionStatus,
    LightdashError,
    SupportedDbtAdapter,
    type Explore,
} from '@lightdash/common';
import { getConfig } from '../config';
import { readAndLoadLightdashProjectConfig } from '../lightdash-config';
import { CliProjectType, detectProjectType } from '../lightdash/projectType';
import { compileProject } from './compile';
import { lightdashApi } from './dbt/apiClient';
import { deployHandler } from './deploy';
import { selectProject } from './selectProject';
import { getProjectDeploySettings } from './timestampConversion';

vi.mock('../analytics/analytics');
vi.mock('../lightdash-config');
vi.mock('../config');
vi.mock('./selectProject');
vi.mock('./timestampConversion');
vi.mock('../lightdash/projectType', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../lightdash/projectType')>()),
    detectProjectType: vi.fn(),
}));
vi.mock('./compile', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./compile')>()),
    compileProject: vi.fn(),
}));
vi.mock('./dbt/apiClient', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./dbt/apiClient')>()),
    lightdashApi: vi.fn(),
    checkLightdashVersion: vi.fn(),
}));

const compiledExplore: Explore = {
    name: 'orders',
    label: 'Orders',
    tags: [],
    tables: {},
    baseTable: 'orders',
    joinedTables: [],
    targetDatabase: SupportedDbtAdapter.POSTGRES,
};

const handlerOptions = {
    projectDir: '/tmp/project',
    profilesDir: '',
    target: undefined,
    profile: undefined,
    vars: undefined,
    verbose: false,
    ignoreErrors: false,
    validateWarehouseColumns: false,
    skipWarehouseCatalog: true,
    skipDbtCompile: true,
    useDbtList: false,
    select: ['orders'],
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

const finalizeResults = {
    exploreCount: 1,
    warnings: { warningCount: 0, exploresWithWarnings: [] },
    status: DeploySessionStatus.COMPLETED,
};

const singleSource = [{ name: 'main', projectDbtSourceUuid: 'main-source' }];

let dbtSources: () => unknown;

const requests = (method: string, urlPart: string) =>
    vi
        .mocked(lightdashApi)
        .mock.calls.map(([request]) => request)
        .filter(
            (request) =>
                request.method === method && request.url.includes(urlPart),
        );

describe('deploy --prune', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('Unexpected exit');
        });
        dbtSources = () => singleSource;
        vi.mocked(detectProjectType).mockResolvedValue({
            type: CliProjectType.Dbt,
            warehouseCredentials: false,
            skipDbtCompile: true,
            skipWarehouseCatalog: true,
        });
        vi.mocked(getConfig).mockResolvedValue({
            context: {
                serverUrl: 'http://lightdash.test',
                project: 'project-uuid',
            },
        });
        vi.mocked(selectProject).mockResolvedValue({
            projectUuid: 'project-uuid',
            isPreview: false,
        });
        vi.mocked(getProjectDeploySettings).mockResolvedValue({
            disableTimestampConversion: undefined,
            connectionRoute: undefined,
        });
        vi.mocked(compileProject).mockResolvedValue({
            explores: [compiledExplore],
            isProjectComplete: false,
            dbtModelNames: ['orders', 'customers'],
            fusionEmptyMeta: null,
        });
        vi.mocked(readAndLoadLightdashProjectConfig).mockResolvedValue({
            spotlight: { default_visibility: 'show' },
        });
        vi.mocked(lightdashApi).mockImplementation(async ({ url }) => {
            if (url.endsWith('/dbt-sources')) return dbtSources() as never;
            if (url.endsWith('/deploy/deploy-session-uuid/batch'))
                return { batchNumber: 0, exploreCount: 1 } as never;
            if (url.endsWith('/deploy/deploy-session-uuid/finalize'))
                return finalizeResults as never;
            if (url.endsWith('/deploy'))
                return { deploySessionUuid: 'deploy-session-uuid' } as never;
            if (url.includes('/explores'))
                return { exploreCount: 1, warnings: undefined } as never;
            return null as never;
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test.each([
        { prune: true, complete: true },
        { prune: undefined, complete: false },
    ])(
        'sends complete=$complete in every batch of a selective deploy when prune is $prune',
        async ({ prune, complete }) => {
            await deployHandler({ ...handlerOptions, prune });

            const batches = requests('POST', '/batch');
            expect(batches).toHaveLength(1);
            expect(JSON.parse(batches[0].body as string).complete).toBe(
                complete,
            );
        },
    );

    test.each([
        { prune: true, complete: true },
        { prune: undefined, complete: false },
    ])(
        'sends complete=$complete in a selective single-request deploy when prune is $prune',
        async ({ prune, complete }) => {
            await deployHandler({
                ...handlerOptions,
                prune,
                batchedDeploy: false,
            });

            const [deployRequest] = requests('PUT', '/api/v2/projects');
            expect(JSON.parse(deployRequest.body as string).complete).toBe(
                complete,
            );
        },
    );

    test.each([
        { prune: true, complete: true },
        { prune: undefined, complete: false },
    ])(
        'sends complete=$complete to the explores endpoint when prune is $prune',
        async ({ prune, complete }) => {
            vi.mocked(compileProject).mockResolvedValue({
                explores: [compiledExplore],
                isProjectComplete: false,
                dbtModelNames: undefined,
                fusionEmptyMeta: null,
            });

            await deployHandler({
                ...handlerOptions,
                prune,
                batchedDeploy: false,
            });

            expect(requests('PUT', '/explores')).toEqual([
                {
                    method: 'PUT',
                    url: `/api/v1/projects/project-uuid/explores?complete=${complete}`,
                    body: JSON.stringify([compiledExplore]),
                },
            ]);
        },
    );

    test('refuses a project with more than one dbt source before it uploads explores', async () => {
        dbtSources = () => [
            ...singleSource,
            { name: 'finance', projectDbtSourceUuid: 'finance-source' },
        ];

        await expect(
            deployHandler({ ...handlerOptions, prune: true }),
        ).rejects.toThrow(
            '--prune cannot be used on a project with more than one dbt source',
        );
        expect(compileProject).not.toHaveBeenCalled();
        expect(requests('POST', '/deploy')).toEqual([]);
        expect(requests('PUT', '/')).toEqual([]);
    });

    test('does not list dbt sources without prune', async () => {
        await deployHandler({ ...handlerOptions, prune: false });

        expect(requests('GET', '/dbt-sources')).toEqual([]);
    });

    test('refuses --combine-manifest before it compiles or calls the server', async () => {
        await expect(
            deployHandler({
                ...handlerOptions,
                prune: true,
                combineManifest: '/tmp/other/manifest.json',
            }),
        ).rejects.toThrow('--prune cannot be used with --combine-manifest');
        expect(compileProject).not.toHaveBeenCalled();
        expect(lightdashApi).not.toHaveBeenCalled();
    });

    test('prunes on a server that has no dbt sources endpoint', async () => {
        dbtSources = () => {
            throw new LightdashError({
                message: 'Not found',
                name: 'NotFoundError',
                statusCode: 404,
                data: {},
            });
        };

        await deployHandler({ ...handlerOptions, prune: true });

        const [batch] = requests('POST', '/batch');
        expect(JSON.parse(batch.body as string).complete).toBe(true);
    });

    test('stops when the dbt sources check fails for another reason', async () => {
        const failure = new LightdashError({
            message: 'Forbidden',
            name: 'ForbiddenError',
            statusCode: 403,
            data: {},
        });
        dbtSources = () => {
            throw failure;
        };

        await expect(
            deployHandler({ ...handlerOptions, prune: true }),
        ).rejects.toBe(failure);
        expect(requests('POST', '/deploy')).toEqual([]);
    });

    test('prune without a selector deploys like a full deploy', async () => {
        vi.mocked(compileProject).mockResolvedValue({
            explores: [compiledExplore],
            isProjectComplete: true,
            dbtModelNames: ['orders'],
            fusionEmptyMeta: null,
        });

        await deployHandler({
            ...handlerOptions,
            select: undefined,
            prune: true,
        });

        const [batch] = requests('POST', '/batch');
        expect(JSON.parse(batch.body as string).complete).toBe(true);
    });
});
