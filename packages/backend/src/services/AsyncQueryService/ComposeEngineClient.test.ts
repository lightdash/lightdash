import { MissingConfigError } from '@lightdash/common';
import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type LightdashConfig } from '../../config/parseConfig';
import { warehouseClientMock } from '../../utils/QueryBuilder/MetricQueryBuilder.mock';
import {
    COMPOSE_ENGINE_INSTANCE_CACHE_KEY,
    COMPOSE_ENGINE_MISSING_RESULTS_STORAGE_MESSAGE,
    ComposeEngineClient,
} from './ComposeEngineClient';

// An OSS instance: results storage only, no pre-aggregate bucket
const ossConfig: LightdashConfig = {
    ...lightdashConfigMock,
    results: {
        ...lightdashConfigMock.results,
        s3: {
            endpoint: 'https://results.example.com',
            bucket: 'results-bucket',
            region: 'results-region',
            accessKey: 'results-access-key',
            secretKey: 'results-secret-key',
        },
    },
    preAggregates: {
        ...lightdashConfigMock.preAggregates,
        s3: undefined,
    },
};

const resultsSession = {
    endpoint: 'results.example.com',
    region: 'results-region',
    accessKey: 'results-access-key',
    secretKey: 'results-secret-key',
    forcePathStyle: false,
    useSsl: true,
};

describe('ComposeEngineClient', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('configures the shared engine session from the results S3 config', () => {
        const createDuckdbWarehouseClient = vi.fn(() => warehouseClientMock);
        const client = new ComposeEngineClient({
            lightdashConfig: ossConfig,
            createDuckdbWarehouseClient,
        });

        const first = client.createExecutionWarehouseClient();
        const second = client.createExecutionWarehouseClient();

        expect(first).toBe(warehouseClientMock);
        expect(second).toBe(first);
        expect(createDuckdbWarehouseClient).toHaveBeenCalledTimes(1);
        expect(createDuckdbWarehouseClient).toHaveBeenCalledWith({
            s3Config: resultsSession,
            sharedResourceLimits: undefined,
            instanceCacheKey: COMPOSE_ENGINE_INSTANCE_CACHE_KEY,
        });
    });

    test('prefers the results config over a configured pre-aggregate bucket', () => {
        const createDuckdbWarehouseClient = vi.fn(() => warehouseClientMock);
        const client = new ComposeEngineClient({
            lightdashConfig: {
                ...ossConfig,
                preAggregates: {
                    ...ossConfig.preAggregates,
                    s3: {
                        endpoint: 'https://preagg.example.com',
                        bucket: 'preagg-bucket',
                        region: 'preagg-region',
                        accessKey: 'preagg-access-key',
                        secretKey: 'preagg-secret-key',
                    },
                },
            },
            createDuckdbWarehouseClient,
        });

        client.createExecutionWarehouseClient();

        expect(createDuckdbWarehouseClient).toHaveBeenCalledWith(
            expect.objectContaining({ s3Config: resultsSession }),
        );
    });

    test('creates a real DuckDB client that may read result files', () => {
        const createForPreAggregateSpy = vi.spyOn(
            DuckdbWarehouseClient,
            'createForPreAggregate',
        );
        const client = new ComposeEngineClient({ lightdashConfig: ossConfig });

        const warehouseClient = client.createExecutionWarehouseClient();

        expect(warehouseClient).toBeInstanceOf(DuckdbWarehouseClient);
        expect(createForPreAggregateSpy).toHaveBeenCalledWith(
            { type: 'duckdb_s3', s3Config: resultsSession },
            expect.objectContaining({
                instanceCacheKey: COMPOSE_ENGINE_INSTANCE_CACHE_KEY,
                enableQueryProfiling: true,
            }),
        );
    });

    test('applies the shared memory budget to the engine instance', () => {
        const createDuckdbWarehouseClient = vi.fn(() => warehouseClientMock);
        const client = new ComposeEngineClient({
            lightdashConfig: {
                ...ossConfig,
                preAggregates: {
                    ...ossConfig.preAggregates,
                    duckdbQueryMemoryLimit: '2GB',
                },
            },
            createDuckdbWarehouseClient,
        });

        client.createExecutionWarehouseClient();

        expect(createDuckdbWarehouseClient).toHaveBeenCalledWith(
            expect.objectContaining({
                sharedResourceLimits: { memoryLimit: '2GB' },
            }),
        );
    });

    test('a scoped session is isolated, URI-scoped and never cached', () => {
        const createDuckdbWarehouseClient = vi.fn(() => warehouseClientMock);
        const client = new ComposeEngineClient({
            lightdashConfig: ossConfig,
            createDuckdbWarehouseClient,
        });

        client.createExecutionWarehouseClient(
            's3://results-bucket/file.parquet',
        );
        client.createExecutionWarehouseClient(
            's3://results-bucket/file.parquet',
        );

        expect(createDuckdbWarehouseClient).toHaveBeenCalledTimes(2);
        expect(createDuckdbWarehouseClient).toHaveBeenCalledWith({
            s3Config: {
                ...resultsSession,
                scope: 's3://results-bucket/file.parquet',
            },
            resourceLimits: { memoryLimit: '512MB', threads: 2 },
            organizationConcurrencyLimit:
                ossConfig.externalSources
                    .maxConcurrentDuckdbQueriesPerOrganization,
        });
    });

    test('refuses with the missing results storage configuration', () => {
        const createDuckdbWarehouseClient = vi.fn(() => warehouseClientMock);
        const client = new ComposeEngineClient({
            lightdashConfig: {
                ...ossConfig,
                results: { ...ossConfig.results, s3: undefined },
            },
            createDuckdbWarehouseClient,
        });

        expect(() => client.createExecutionWarehouseClient()).toThrow(
            new MissingConfigError(
                COMPOSE_ENGINE_MISSING_RESULTS_STORAGE_MESSAGE,
            ),
        );
        expect(() =>
            client.createExecutionWarehouseClient('s3://bucket/file.parquet'),
        ).toThrow(MissingConfigError);
        expect(createDuckdbWarehouseClient).not.toHaveBeenCalled();
    });
});
