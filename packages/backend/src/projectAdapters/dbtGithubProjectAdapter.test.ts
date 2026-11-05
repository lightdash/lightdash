import {
    SupportedDbtVersions,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { toDbtTarget } from '../dbt/targets';
import { warehouseClientMock } from '../utils/QueryBuilder/MetricQueryBuilder.mock';
import { DbtGithubProjectAdapter } from './dbtGithubProjectAdapter';

describe('DbtGithubProjectAdapter', () => {
    it('uses a tokenless repository URL when no token is provided', async () => {
        const adapter = new DbtGithubProjectAdapter({
            warehouseClient: warehouseClientMock,
            githubPersonalAccessToken: '',
            githubRepository: 'org/repo',
            githubBranch: 'main',
            projectDirectorySubPath: '/',
            explicitCredentials: false,
            dbtTarget: toDbtTarget(
                {
                    type: WarehouseTypes.POSTGRES,
                    host: 'localhost',
                    port: 5432,
                    user: 'postgres',
                    password: 'password',
                    dbname: 'postgres',
                    schema: 'public',
                } as CreateWarehouseCredentials,
                { explicitCredentials: false },
            ),
            targetName: undefined,
            environment: undefined,
            environmentVariableAllowlist: [],
            partialParseBaselinePath: null,
            cachedWarehouse: {
                warehouseCatalog: {},
                onWarehouseCatalogChange: vi.fn(),
            },
            dbtVersion: SupportedDbtVersions.V1_7,
        });

        expect(adapter.remoteRepositoryUrl).toBe(
            'https://github.com/org/repo.git',
        );

        await adapter.destroy();
    });
});
