import {
    SupportedDbtVersions,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { warehouseClientMock } from '../utils/QueryBuilder/MetricQueryBuilder.mock';
import { DbtGitlabProjectAdapter } from './dbtGitlabProjectAdapter';

describe('DbtGitlabProjectAdapter', () => {
    it('percent-encodes repository URL credentials', async () => {
        const adapter = new DbtGitlabProjectAdapter({
            warehouseClient: warehouseClientMock,
            gitlabPersonalAccessToken: 'token/?#@:%',
            gitlabRepository: 'org/repo',
            gitlabBranch: 'main',
            projectDirectorySubPath: '/',
            warehouseCredentials: {
                type: WarehouseTypes.POSTGRES,
                host: 'localhost',
                port: 5432,
                user: 'postgres',
                password: 'password',
                dbname: 'postgres',
                schema: 'public',
            } as CreateWarehouseCredentials,
            targetName: undefined,
            environment: undefined,
            environmentVariableAllowlist: [],
            cachedWarehouse: {
                warehouseCatalog: {},
                onWarehouseCatalogChange: vi.fn(),
            },
            dbtVersion: SupportedDbtVersions.V1_7,
        });

        expect(adapter.remoteRepositoryUrl).toBe(
            'https://lightdash:token%2F%3F%23%40%3A%25@gitlab.com/org/repo.git',
        );
        await adapter.destroy();
    });
});
