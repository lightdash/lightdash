import { MissingConfigError } from '@lightdash/common';
import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type LightdashConfig } from '../../config/parseConfig';
import { warehouseClientMock } from '../../utils/QueryBuilder/MetricQueryBuilder.mock';
import {
    COMPOSE_ENGINE_MISSING_CA_BUNDLE_MESSAGE,
    COMPOSE_ENGINE_MISSING_EXTERNAL_SOURCES_STORAGE_MESSAGE,
    ComposeEngineClient,
    PRE_AGGREGATE_QUERY_INSTANCE_CACHE_KEY,
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

// The same instance with a pre-aggregates bucket in another region
const withPreAggregateBucket: LightdashConfig = {
    ...ossConfig,
    preAggregates: {
        ...ossConfig.preAggregates,
        s3: {
            endpoint: 'http://preagg.example.com:9000',
            bucket: 'preagg-bucket',
            region: 'preagg-region',
            accessKey: 'preagg-access-key',
            secretKey: 'preagg-secret-key',
            forcePathStyle: true,
        },
    },
};

const withHttpsPreAggregateBucket: LightdashConfig = {
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
};

const CA_BUNDLE = '/etc/ssl/certs/ca-certificates.crt';
const resolveCaCertFile = () => CA_BUNDLE;

const preAggregateSession = {
    endpoint: 'preagg.example.com:9000',
    region: 'preagg-region',
    accessKey: 'preagg-access-key',
    secretKey: 'preagg-secret-key',
    forcePathStyle: true,
    useSsl: false,
};

describe('ComposeEngineClient', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('preserves GCP OAuth and limits credentials to the pre-aggregates bucket', () => {
        const createDuckdbWarehouseClient = vi.fn(() => warehouseClientMock);
        const s3 = {
            endpoint: 'https://storage.googleapis.com',
            region: 'us-east4',
            bucket: 'storage-bucket',
            authMode: 'gcp_oauth' as const,
        };
        const client = new ComposeEngineClient({
            resolveCaCertFile,
            createDuckdbWarehouseClient,
            lightdashConfig: {
                ...ossConfig,
                preAggregates: { ...ossConfig.preAggregates, s3 },
            },
        });
        client.createExecutionWarehouseClient({
            storage: 'externalSources',
            scope: null,
        });
        expect(createDuckdbWarehouseClient).toHaveBeenLastCalledWith(
            expect.objectContaining({
                s3Config: expect.objectContaining({
                    authMode: 'gcp_oauth',
                    getAccessToken: expect.any(Function),
                    scope: ['s3://storage-bucket/'],
                }),
            }),
        );
        const object = 's3://storage-bucket/file.parquet';
        client.createExecutionWarehouseClient({
            storage: 'externalSources',
            scope: object,
        });
        expect(createDuckdbWarehouseClient).toHaveBeenLastCalledWith(
            expect.objectContaining({
                s3Config: expect.objectContaining({
                    authMode: 'gcp_oauth',
                    getAccessToken: expect.any(Function),
                    scope: [object],
                }),
            }),
        );
    });

    test('an external-source session gets the pre-aggregate bucket session, shared with managed pre-aggregates', () => {
        const createDuckdbWarehouseClient = vi.fn(() => warehouseClientMock);
        const client = new ComposeEngineClient({
            resolveCaCertFile,
            lightdashConfig: withPreAggregateBucket,
            createDuckdbWarehouseClient,
        });

        const first = client.createExecutionWarehouseClient({
            storage: 'externalSources',
            scope: null,
        });
        const second = client.createExecutionWarehouseClient({
            storage: 'externalSources',
            scope: null,
        });

        expect(first).toBe(warehouseClientMock);
        expect(second).toBe(first);
        expect(createDuckdbWarehouseClient).toHaveBeenCalledTimes(1);
        expect(createDuckdbWarehouseClient).toHaveBeenCalledWith({
            s3Config: preAggregateSession,
            sharedResourceLimits: undefined,
            instanceCacheKey: PRE_AGGREGATE_QUERY_INSTANCE_CACHE_KEY,
        });
    });

    test('a scoped external-source session uses the pre-aggregate bucket session and is never cached', () => {
        const createDuckdbWarehouseClient = vi.fn(() => warehouseClientMock);
        const client = new ComposeEngineClient({
            resolveCaCertFile,
            lightdashConfig: withPreAggregateBucket,
            createDuckdbWarehouseClient,
        });
        const scope = 's3://preagg-bucket/external-sources/file.parquet';

        client.createExecutionWarehouseClient({
            storage: 'externalSources',
            scope,
        });
        client.createExecutionWarehouseClient({
            storage: 'externalSources',
            scope,
        });

        expect(createDuckdbWarehouseClient).toHaveBeenCalledTimes(2);
        expect(createDuckdbWarehouseClient).toHaveBeenCalledWith({
            s3Config: { ...preAggregateSession, scope: [scope] },
            resourceLimits: { memoryLimit: '512MB', threads: 2 },
            organizationConcurrencyLimit:
                withPreAggregateBucket.externalSources
                    .maxConcurrentDuckdbQueriesPerOrganization,
        });
    });

    test('creates a real DuckDB client over the pre-aggregates bucket', () => {
        const createForPreAggregateSpy = vi.spyOn(
            DuckdbWarehouseClient,
            'createForPreAggregate',
        );
        const client = new ComposeEngineClient({
            resolveCaCertFile,
            lightdashConfig: withPreAggregateBucket,
        });

        const warehouseClient = client.createExecutionWarehouseClient({
            storage: 'externalSources',
            scope: null,
        });

        expect(warehouseClient).toBeInstanceOf(DuckdbWarehouseClient);
        expect(createForPreAggregateSpy).toHaveBeenCalledWith(
            { type: 'duckdb_s3', s3Config: preAggregateSession },
            expect.objectContaining({
                instanceCacheKey: PRE_AGGREGATE_QUERY_INSTANCE_CACHE_KEY,
                enableQueryProfiling: true,
            }),
        );
    });

    test('applies the shared memory budget to the engine instance', () => {
        const createDuckdbWarehouseClient = vi.fn(() => warehouseClientMock);
        const client = new ComposeEngineClient({
            resolveCaCertFile,
            lightdashConfig: {
                ...withPreAggregateBucket,
                preAggregates: {
                    ...withPreAggregateBucket.preAggregates,
                    duckdbQueryMemoryLimit: '2GB',
                },
            },
            createDuckdbWarehouseClient,
        });

        client.createExecutionWarehouseClient({
            storage: 'externalSources',
            scope: null,
        });

        expect(createDuckdbWarehouseClient).toHaveBeenCalledWith(
            expect.objectContaining({
                sharedResourceLimits: { memoryLimit: '2GB' },
            }),
        );
    });

    test('refuses an external-source session without the pre-aggregates configuration', () => {
        const createDuckdbWarehouseClient = vi.fn(() => warehouseClientMock);
        const client = new ComposeEngineClient({
            resolveCaCertFile,
            lightdashConfig: ossConfig,
            createDuckdbWarehouseClient,
        });

        expect(() =>
            client.createExecutionWarehouseClient({
                storage: 'externalSources',
                scope: null,
            }),
        ).toThrow(
            new MissingConfigError(
                COMPOSE_ENGINE_MISSING_EXTERNAL_SOURCES_STORAGE_MESSAGE,
            ),
        );
        expect(() =>
            client.createExecutionWarehouseClient({
                storage: 'externalSources',
                scope: 's3://bucket/file.parquet',
            }),
        ).toThrow(MissingConfigError);
        expect(createDuckdbWarehouseClient).not.toHaveBeenCalled();
    });

    test('refuses an HTTPS session when no CA bundle can be found', () => {
        const createDuckdbWarehouseClient = vi.fn(() => warehouseClientMock);
        const client = new ComposeEngineClient({
            resolveCaCertFile: () => null,
            lightdashConfig: withHttpsPreAggregateBucket,
            createDuckdbWarehouseClient,
        });

        expect(() =>
            client.createExecutionWarehouseClient({
                storage: 'externalSources',
                scope: null,
            }),
        ).toThrow(
            new MissingConfigError(COMPOSE_ENGINE_MISSING_CA_BUNDLE_MESSAGE),
        );
        expect(createDuckdbWarehouseClient).not.toHaveBeenCalled();
    });

    test('a plain HTTP session needs no CA bundle', () => {
        const createDuckdbWarehouseClient = vi.fn(() => warehouseClientMock);
        const client = new ComposeEngineClient({
            resolveCaCertFile: () => null,
            lightdashConfig: withPreAggregateBucket,
            createDuckdbWarehouseClient,
        });

        client.createExecutionWarehouseClient({
            storage: 'externalSources',
            scope: null,
        });

        expect(createDuckdbWarehouseClient).toHaveBeenCalledWith(
            expect.objectContaining({ s3Config: preAggregateSession }),
        );
    });
});
