import {
    DeploySessionStatus,
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
        'sends complete=$expected on the default upload',
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

    test('includes the completeness assertion in every batch body', async () => {
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
            useBatchedDeploy: true,
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
});
