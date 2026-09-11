import {
    SupportedDbtVersions,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { warehouseClientMock } from '../utils/QueryBuilder/MetricQueryBuilder.mock';
import { DbtAzureDevOpsProjectAdapter } from './dbtAzureDevOpsProjectAdapter';

describe('DbtAzureDevOpsProjectAdapter', () => {
    it('percent-encodes repository URL credentials', async () => {
        const adapter = new DbtAzureDevOpsProjectAdapter({
            warehouseClient: warehouseClientMock,
            personalAccessToken: 'token/?#@:%',
            organization: 'org',
            project: 'project',
            repository: 'repo',
            branch: 'main',
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
            'https://token%2F%3F%23%40%3A%25@dev.azure.com/org/project/_git/repo',
        );
        await adapter.destroy();
    });
});
