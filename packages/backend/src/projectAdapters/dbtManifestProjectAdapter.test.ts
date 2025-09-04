import {
    DEFAULT_SPOTLIGHT_CONFIG,
    SupportedDbtVersions,
    type WarehouseClient,
} from '@lightdash/common';
import { DbtManifestProjectAdapter } from './dbtManifestProjectAdapter';

const mockWarehouseClient = {
    test: jest.fn(),
    runQuery: jest.fn(),
    getAdapterType: jest.fn().mockReturnValue('postgres'),
} as unknown as WarehouseClient;

// Valid manifest JSON structure for testing
const validManifestData = {
    metadata: {
        dbt_schema_version: 'https://schemas.getdbt.com/dbt/manifest/v11.json',
        generated_at: '2023-01-01T00:00:00.000000Z',
        adapter_type: 'postgres',
    },
    nodes: {
        'model.test.example': {
            resource_type: 'model',
            unique_id: 'model.test.example',
            database: 'test_db',
            schema: 'test_schema',
            alias: 'example',
            meta: {
                lightdash: {
                    dimension: {
                        id: {
                            type: 'number',
                        },
                    },
                },
            },
        },
    },
    metrics: {},
    docs: {},
};

const mockManifestString = JSON.stringify(validManifestData);

const mockProjectAdapter = new DbtManifestProjectAdapter({
    warehouseClient: mockWarehouseClient,
    cachedWarehouse: {
        warehouseCatalog: undefined,
        onWarehouseCatalogChange: jest.fn(),
    },
    dbtVersion: SupportedDbtVersions.V1_8,
    manifest: mockManifestString,
});

describe('DbtManifestProjectAdapter', () => {
    it('should return the default lightdash project config', async () => {
        const config = await mockProjectAdapter.getLightdashProjectConfig();
        expect(config).toEqual({
            spotlight: DEFAULT_SPOTLIGHT_CONFIG,
        });
    });

    it('should test warehouse connection', async () => {
        await mockProjectAdapter.test();
        expect(mockWarehouseClient.test).toHaveBeenCalled();
    });

    it('should return undefined for dbt packages', async () => {
        const packages = await mockProjectAdapter.getDbtPackages();
        expect(packages).toBeUndefined();
    });

    it('should return valid manifest from dbt client', async () => {
        // Access the internal dbt client to test manifest retrieval
        const manifestResult =
            await mockProjectAdapter.dbtClient.getDbtManifest();

        expect(manifestResult).toBeDefined();
        expect(manifestResult.manifest).toBeDefined();
        expect(manifestResult.manifest.metadata).toEqual(
            validManifestData.metadata,
        );
        expect(manifestResult.manifest.nodes).toEqual(validManifestData.nodes);
        expect(manifestResult.manifest.metrics).toEqual(
            validManifestData.metrics,
        );
        expect(manifestResult.manifest.docs).toEqual(validManifestData.docs);
    });

    it('should throw error when manifest is invalid JSON', async () => {
        const invalidManifestAdapter = new DbtManifestProjectAdapter({
            warehouseClient: mockWarehouseClient,
            cachedWarehouse: {
                warehouseCatalog: undefined,
                onWarehouseCatalogChange: jest.fn(),
            },
            dbtVersion: SupportedDbtVersions.V1_8,
            manifest: 'invalid json',
        });

        await expect(
            invalidManifestAdapter.dbtClient.getDbtManifest(),
        ).rejects.toThrow();
    });

    it('should throw error when manifest is missing required fields', async () => {
        const incompleteManifest = JSON.stringify({
            metadata: {},
            // missing nodes, metrics, docs
        });

        const incompleteManifestAdapter = new DbtManifestProjectAdapter({
            warehouseClient: mockWarehouseClient,
            cachedWarehouse: {
                warehouseCatalog: undefined,
                onWarehouseCatalogChange: jest.fn(),
            },
            dbtVersion: SupportedDbtVersions.V1_8,
            manifest: incompleteManifest,
        });

        await expect(
            incompleteManifestAdapter.dbtClient.getDbtManifest(),
        ).rejects.toThrow(
            'Cannot read response from dbt, manifest.json not valid',
        );
    });
});
