import {
    SupportedDbtVersions,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { warehouseClientMock } from '../utils/QueryBuilder/MetricQueryBuilder.mock';
import { DbtBitBucketProjectAdapter } from './dbtBitBucketProjectAdapter';

describe('DbtBitBucketProjectAdapter', () => {
    it('percent-encodes repository URL credentials', async () => {
        const adapter = new DbtBitBucketProjectAdapter({
            warehouseClient: warehouseClientMock,
            username: 'user/?#@:%',
            personalAccessToken: 'token/?#@:%',
            repository: 'org/repo',
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
            'https://user%2F%3F%23%40%3A%25:token%2F%3F%23%40%3A%25@bitbucket.org/org/repo.git',
        );
        await adapter.destroy();
    });
});
