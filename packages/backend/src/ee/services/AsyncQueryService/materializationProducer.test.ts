import { type QueryResultProducer } from '@lightdash/common';
import { type S3ResultsFileStorageClient } from '../../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import {
    metricQueryMock,
    preAggregateExplore,
} from '../../../services/ProjectService/ProjectService.mock';
import { warehouseClientMock } from '../../../utils/QueryBuilder/MetricQueryBuilder.mock';
import { type PreAggregateModel } from '../../models/PreAggregateModel';
import {
    readMaterializationProducer,
    writeMaterializationProducer,
} from './materializationProducer';
import { PreAggregateStrategy } from './PreAggregateStrategy';
import { PreAggregationDuckDbClient } from './PreAggregationDuckDbClient';

const producer: QueryResultProducer = {
    version: 1,
    authMethod: 'session',
    warehouseConnectionUuid: 'connection',
    credentialOwner: {
        kind: 'shared_connection',
        identityFingerprint: 'owner',
    },
    agentIdentity: null,
    entitlementFingerprint: 'build-without-reader-attributes',
};
const fixture = () => {
    const files = new Map<string, string>();
    const uploadResults = vi.fn(async (key: string, body: string) => {
        files.set(key, body);
    });
    const getResults = vi.fn(async (key: string) => ({
        Body: { transformToString: async () => files.get(key) },
    }));
    const storage = {
        uploadResults,
        getResults,
    } as unknown as S3ResultsFileStorageClient;
    const write = () =>
        writeMaterializationProducer(storage, {
            projectUuid: 'project',
            queryUuid: 'build-query',
            resultsFileName: 'folder/results',
            producer,
        });
    const materialization = {
        materializationUuid: 'materialization',
        queryUuid: 'build-query',
        materializationUri: 's3://bucket/folder/results.jsonl',
        format: 'jsonl' as const,
        columns: null,
        materializedAt: new Date(0),
        totalBytes: 100,
    };
    const getExploreFromCache = vi.fn(async () => ({
        ...preAggregateExplore,
        tables: {
            ...preAggregateExplore.tables,
            a: {
                ...preAggregateExplore.tables.a,
                sqlWhere:
                    '"a"."a_dim1" = ${lightdash.attributes.region} AND ${lightdash.user.email} = \'allowed@example.test\'',
                uncompiledSqlWhere:
                    '"a"."a_dim1" = ${lightdash.attributes.region} AND ${lightdash.user.email} = \'allowed@example.test\'',
            },
        },
    }));
    const createDuckdbWarehouseClient = vi.fn(() => warehouseClientMock);
    const duckDbClient = new PreAggregationDuckDbClient({
        lightdashConfig: {
            ...lightdashConfigMock,
            preAggregates: {
                ...lightdashConfigMock.preAggregates,
                enabled: true,
            },
        },
        preAggregateModel: {
            getActiveMaterialization: vi.fn(async () => materialization),
        } as unknown as PreAggregateModel,
        projectModel: { getExploreFromCache },
        createDuckdbWarehouseClient,
    });
    const strategy = new PreAggregateStrategy({
        preAggregationDuckDbClient: duckDbClient,
        preAggregationExternalResolver: {} as never,
        preAggregateDailyStatsModel: {} as never,
        preAggregateResultsStorageClient: storage,
        isEnabled: () => true,
        dashboardModel: {} as never,
        savedChartModel: {} as never,
        projectService: {} as never,
    });
    const args = {
        projectUuid: 'project',
        queryUuid: 'reader-query',
        warehouseQuery: 'SELECT warehouse',
        preAggregationRoute: {
            sourceExploreName: 'valid_explore',
            preAggregateName: 'rollup',
            mode: 'opportunistic' as const,
        },
        resolveArgs: {
            metricQuery: { ...metricQueryMock, tableCalculations: [] },
            timezone: 'UTC',
            dateZoom: undefined,
            parameters: undefined,
            fieldsMap: {},
            pivotConfiguration: undefined,
            startOfWeek: undefined,
            userAccessControls: {
                userAttributes: { region: ['EU'] },
                intrinsicUserAttributes: { email: 'reader@example.test' },
            },
            availableParameterDefinitions: {},
            resultProducer: {
                ...producer,
                entitlementFingerprint: 'reader-controls',
            },
        },
    };
    return {
        files,
        storage,
        uploadResults,
        getResults,
        write,
        args,
        strategy,
        materialization,
        getExploreFromCache,
        createDuckdbWarehouseClient,
    };
};

describe('managed materialization producer provenance', () => {
    test.each(['jsonl', 'parquet'] as const)(
        'a %s sidecar retains the build owner and permits reader attributes at serving time',
        async (format) => {
            const f = fixture();
            await f.write();
            f.materialization.materializationUri = `s3://bucket/folder/results.${format}`;
            const result = await f.strategy.resolveExecution(f.args);
            expect(result.resolved).toBe(true);
            if (!result.resolved) throw new Error(result.reason);
            expect(result.execution).toBe('duckdb');
            expect(result.query).toContain('"a"."a_dim1"');
            expect(result.query).toContain('EU');
            expect(result.query).toContain('reader@example.test');
            expect(result.query).not.toContain('${lightdash.user.email}');
            expect(result.query).not.toContain(
                '${lightdash.attributes.region}',
            );
            expect(f.getResults).toHaveBeenCalledExactlyOnceWith(
                'folder/results.producer',
            );
            expect(f.createDuckdbWarehouseClient).toHaveBeenCalledOnce();
            expect(f.uploadResults).toHaveBeenCalledBefore(f.getResults);
        },
    );

    test.each([
        'missing',
        'corrupt',
        'other-project',
        'other-query',
        'other-owner',
        'other-connection',
        'personal',
        'agent',
    ] as const)(
        '%s provenance bypasses ordinary queries and refuses direct explores',
        async (change) => {
            const f = fixture();
            if (change !== 'missing') await f.write();
            if (change === 'corrupt')
                f.files.set('folder/results.producer', '{');
            if (change === 'other-project') f.args.projectUuid = 'other';
            if (change === 'other-query') f.materialization.queryUuid = 'other';
            if (change === 'other-owner')
                f.args.resolveArgs.resultProducer.credentialOwner = {
                    kind: 'shared_connection',
                    identityFingerprint: 'replacement',
                };
            if (change === 'other-connection')
                f.args.resolveArgs.resultProducer.warehouseConnectionUuid =
                    'replacement';
            if (change === 'personal')
                f.args.resolveArgs.resultProducer.credentialOwner = {
                    kind: 'person',
                    userUuid: 'user',
                    userWarehouseCredentialsUuid: 'personal',
                    identityFingerprint: 'owner',
                };
            if (change === 'agent')
                f.args.resolveArgs.resultProducer.agentIdentity = {
                    sub: 'agent',
                } as NonNullable<QueryResultProducer['agentIdentity']>;
            const result = await f.strategy.resolveExecution(f.args);
            expect(result).toMatchObject({
                resolved: false,
                isFatal: false,
                reason: expect.stringContaining(
                    'no compatible producer provenance',
                ),
            });
            const direct = await f.strategy.resolveExecution({
                ...f.args,
                preAggregationRoute: {
                    ...f.args.preAggregationRoute,
                    mode: 'required',
                },
            });
            expect(direct).toMatchObject({ resolved: false, isFatal: true });
            expect(f.getExploreFromCache).not.toHaveBeenCalled();
            expect(f.createDuckdbWarehouseClient).not.toHaveBeenCalled();
        },
    );

    test('flag-off resolution needs no sidecar and keeps the reader attribute filter', async () => {
        const f = fixture();
        const { resultProducer: _resultProducer, ...resolveArgs } =
            f.args.resolveArgs;
        const result = await f.strategy.resolveExecution({
            ...f.args,
            resolveArgs,
        });
        expect(result.resolved).toBe(true);
        expect(f.getResults).not.toHaveBeenCalled();
    });

    test('missing and invalid sidecars never produce an owner', async () => {
        const f = fixture();
        f.files.set(
            'folder/results.producer',
            JSON.stringify({
                version: 1,
                projectUuid: 'project',
                queryUuid: 'build-query',
                warehouseConnectionUuid: null,
                identityFingerprint: null,
            }),
        );
        await expect(
            readMaterializationProducer(f.storage, {
                projectUuid: 'project',
                queryUuid: 'build-query',
                materializationUri: f.materialization.materializationUri,
            }),
        ).resolves.toBeNull();
    });
});
