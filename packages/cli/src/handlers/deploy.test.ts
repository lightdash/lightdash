import {
    DeploySessionStatus,
    LightdashError,
    SupportedDbtAdapter,
    type Explore,
} from '@lightdash/common';
import { LightdashAnalytics } from '../analytics/analytics';
import { readAndLoadLightdashProjectConfig } from '../lightdash-config';
import { lightdashApi } from './dbt/apiClient';
import { deploy } from './deploy';

vi.mock('../analytics/analytics');
vi.mock('../lightdash-config');
vi.mock('./dbt/apiClient', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./dbt/apiClient')>()),
    lightdashApi: vi.fn(),
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

describe('deploy completeness transport', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(readAndLoadLightdashProjectConfig).mockResolvedValue({
            spotlight: { default_visibility: 'show' },
        });
        vi.mocked(LightdashAnalytics.track).mockResolvedValue(undefined);
    });

    it.each([
        { complete: true, expected: 'true' },
        { complete: false, expected: 'false' },
        { complete: undefined, expected: 'false' },
    ])(
        'sends complete=$expected when batched deploy is disabled',
        async ({ complete, expected }) => {
            vi.mocked(lightdashApi).mockImplementation(async ({ url }) => {
                if (url.includes('/explores?')) {
                    return {
                        exploreCount: 1,
                        warnings: {
                            warningCount: 0,
                            exploresWithWarnings: [],
                        },
                    } as never;
                }
                return null as never;
            });

            await deploy([compiledExplore], {
                ...deployOptions,
                complete,
                batchedDeploy: false,
            });

            expect(lightdashApi).toHaveBeenCalledWith(
                expect.objectContaining({
                    method: 'PUT',
                    url: `/api/v1/projects/project-uuid/explores?complete=${expected}`,
                    body: JSON.stringify([compiledExplore]),
                }),
            );
        },
    );

    test('uses batched deploy by default and includes the completeness assertion in every batch body', async () => {
        vi.mocked(lightdashApi).mockImplementation(async ({ url }) => {
            if (url.endsWith('/deploy')) {
                return {
                    deploySessionUuid: 'deploy-session-uuid',
                } as never;
            }
            if (url.endsWith('/batch')) {
                return { batchNumber: 0, exploreCount: 1 } as never;
            }
            if (url.endsWith('/finalize')) {
                return {
                    exploreCount: 1,
                    warnings: {
                        warningCount: 0,
                        exploresWithWarnings: [],
                    },
                    status: DeploySessionStatus.COMPLETED,
                } as never;
            }
            return null as never;
        });

        await deploy([compiledExplore], {
            ...deployOptions,
            complete: false,
        });

        expect(lightdashApi).toHaveBeenCalledWith({
            method: 'POST',
            url: '/api/v2/projects/project-uuid/deploy/deploy-session-uuid/batch',
            body: JSON.stringify({
                explores: [compiledExplore],
                batchNumber: 0,
                complete: false,
            }),
        });
    });

    test('falls back to the legacy deploy when session creation returns 404', async () => {
        vi.mocked(lightdashApi).mockImplementation(async ({ url }) => {
            if (url.endsWith('/deploy')) {
                throw new LightdashError({
                    message: 'Not found',
                    name: 'NotFoundError',
                    statusCode: 404,
                    data: {},
                });
            }
            if (url.includes('/explores?')) {
                return {
                    exploreCount: 1,
                    warnings: {
                        warningCount: 0,
                        exploresWithWarnings: [],
                    },
                } as never;
            }
            return null as never;
        });

        await deploy([compiledExplore], deployOptions);

        expect(lightdashApi).toHaveBeenCalledWith({
            method: 'PUT',
            url: '/api/v1/projects/project-uuid/explores?complete=false',
            body: JSON.stringify([compiledExplore]),
        });
    });

    test('propagates non-404 session creation errors', async () => {
        const serverError = new LightdashError({
            message: 'Server unavailable',
            name: 'InternalServerError',
            statusCode: 500,
            data: {},
        });
        vi.mocked(lightdashApi).mockImplementation(async ({ url }) => {
            if (url.endsWith('/deploy')) {
                throw serverError;
            }
            return null as never;
        });

        await expect(deploy([compiledExplore], deployOptions)).rejects.toBe(
            serverError,
        );

        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'PUT',
                url: expect.stringContaining('/explores?'),
            }),
        );
    });
});
