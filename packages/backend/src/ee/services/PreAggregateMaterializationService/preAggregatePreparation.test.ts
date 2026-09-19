import {
    AthenaAuthenticationType,
    BigqueryAuthenticationType,
    DatabricksAuthenticationType,
    DimensionType,
    ExploreCompiler,
    FieldType,
    FilterOperator,
    MetricType,
    preAggregateMaterialization,
    SnowflakeAuthenticationType,
    UnitOfTime,
    WarehouseTypes,
    WeekDay,
    type CreateAthenaCredentials,
    type CreatePostgresCredentials,
    type CreateSnowflakeCredentials,
    type CreateWarehouseCredentials,
    type Dimension,
    type Explore,
    type Metric,
    type MetricFilterRule,
    type MetricQuery,
    type PreAggregateDef,
    type Table,
} from '@lightdash/common';
import {
    EXPLORE,
    warehouseClientMock,
} from '../../../utils/QueryBuilder/MetricQueryBuilder.mock';
import { QueryComposer } from '../../../utils/QueryBuilder/QueryComposer';
import {
    getWarehouseCompatibilityContext,
    prepareMaterializationFingerprint,
} from './preAggregatePreparation';

const credentials: CreatePostgresCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'warehouse.example.com',
    port: 5432,
    dbname: 'analytics',
    schema: 'public',
    user: 'materializer',
    password: 'test-password',
};

const relativeFilter: MetricFilterRule = {
    id: 'relative',
    target: { fieldRef: 'created_at' },
    operator: FilterOperator.IN_THE_PAST,
    values: [7],
    settings: { unitOfTime: UnitOfTime.days, completed: true },
};

const dimension = (name: string, type: DimensionType): Dimension => ({
    name,
    type,
    table: 'table1',
    tableLabel: 'Table',
    label: name,
    fieldType: FieldType.DIMENSION,
    sql: `\${TABLE}.${name}`,
    hidden: false,
});

const prepare = (
    options: {
        credentials?: CreateWarehouseCredentials;
        filters?: MetricFilterRule[];
        grain?: string[];
        metricType?: MetricType;
        derivedSql?: string;
        metricSql?: string;
        sqlWhere?: string;
        metricLabel?: string;
        metricDescription?: string;
        metricFormat?: string;
        timezone?: string;
        actorEmail?: string;
        unusedAttribute?: string;
        displayTimezone?: string;
        format?: 'jsonl' | 'parquet';
        definition?: Partial<PreAggregateDef>;
        transformExplore?: (explore: Explore) => Explore;
        transformQuery?: (query: MetricQuery) => MetricQuery;
    } = {},
) => {
    const warehouseCredentials = options.credentials ?? credentials;
    const sqlBuilder = {
        ...warehouseClientMock,
        getStartOfWeek: () =>
            warehouseCredentials.startOfWeek === WeekDay.SUNDAY
                ? WeekDay.SUNDAY
                : WeekDay.MONDAY,
    };
    const compiler = new ExploreCompiler(sqlBuilder);
    const total: Metric = {
        ...EXPLORE.tables.table1.metrics.metric1,
        name: 'total',
        type: options.metricType ?? MetricType.SUM,
        sql: options.metricSql ?? '${TABLE}.amount',
        filters: options.filters ?? [relativeFilter],
        label: options.metricLabel ?? 'Total',
        description: options.metricDescription,
        format: options.metricFormat,
    };
    const derived: Metric = {
        ...total,
        name: 'derived',
        type: MetricType.NUMBER,
        sql: options.derivedSql ?? '${total} * 100',
        filters: undefined,
    };
    const metrics = options.derivedSql ? [total, derived] : [total];
    const table: Table = {
        ...EXPLORE.tables.table1,
        primaryKey: undefined,
        sqlWhere: options.sqlWhere,
        dimensions: {
            created_at: dimension('created_at', DimensionType.TIMESTAMP),
            region: dimension('region', DimensionType.STRING),
            amount: dimension('amount', DimensionType.NUMBER),
        },
        metrics: Object.fromEntries(
            metrics.map((metric) => [metric.name, metric]),
        ),
    };
    const tables = { table1: table };
    const initialExplore: Explore = {
        ...EXPLORE,
        joinedTables: [],
        tables: {
            table1: {
                ...table,
                dimensions: Object.fromEntries(
                    Object.values(table.dimensions).map((field) => [
                        field.name,
                        compiler.compileDimension(field, tables, []),
                    ]),
                ),
                metrics: Object.fromEntries(
                    metrics.map((metric) => [
                        metric.name,
                        compiler.compileMetric(metric, tables, []),
                    ]),
                ),
            },
        },
    };
    const explore =
        options.transformExplore?.(initialExplore) ?? initialExplore;
    const preAggregateDef: PreAggregateDef = {
        name: 'daily',
        dimensions: options.grain ?? [],
        metrics: metrics.map(({ name }) => name),
        ...options.definition,
    };
    const { metricQuery: initialQuery } =
        preAggregateMaterialization.buildMaterializationMetricQuery({
            sourceExplore: explore,
            preAggregateDef,
            materializationConfig: { maxRows: null },
        });
    const metricQuery = options.transformQuery?.(initialQuery) ?? initialQuery;
    const composer = new QueryComposer(
        { metricQuery },
        {
            explore,
            warehouseSqlBuilder: sqlBuilder,
            timezone: options.timezone ?? 'UTC',
            displayTimezone: options.displayTimezone,
            intrinsicUserAttributes: {
                email: options.actorEmail ?? 'actor@example.com',
            },
            userAttributes: { unused: [options.unusedAttribute ?? 'one'] },
        },
    );
    return {
        composer,
        prepared: prepareMaterializationFingerprint({
            composer,
            warehouseCredentials,
            preAggregateDef,
            format: options.format ?? 'jsonl',
        }),
    };
};

describe('pre-aggregate materialization compatibility payload', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-04T04:12:11Z'));
    });
    afterEach(() => vi.useRealTimers());

    test('keeps compatibility stable as relative windows advance, but executes fresh boundaries', () => {
        const first = prepare();
        expect(first.prepared.compatibilityHash).not.toBeNull();
        const firstSql = first.composer.getSql({ columnLimit: 100 });
        vi.setSystemTime(new Date('2026-06-04T04:12:11Z'));
        const next = prepare();
        expect(next.prepared.compatibilityHash).toBe(
            first.prepared.compatibilityHash,
        );
        expect(next.composer.getSql({ columnLimit: 100 })).not.toBe(firstSql);
    });

    test('detects warehouse target, principal, tunnel, date context, grain, and component changes', () => {
        const original = prepare().prepared.compatibilityHash;
        const changed = [
            prepare({
                credentials: { ...credentials, host: 'another.example.com' },
            }),
            prepare({
                credentials: { ...credentials, user: 'different-role' },
            }),
            prepare({ credentials: { ...credentials, role: 'restricted' } }),
            prepare({
                credentials: {
                    ...credentials,
                    useSshTunnel: true,
                    sshTunnelHost: 'bastion.example.com',
                },
            }),
            prepare({
                credentials: {
                    ...credentials,
                    dataTimezone: 'America/New_York',
                },
            }),
            prepare({
                credentials: { ...credentials, startOfWeek: WeekDay.SUNDAY },
            }),
            prepare({ timezone: 'America/New_York' }),
            prepare({ grain: ['region'] }),
            prepare({ metricType: MetricType.AVERAGE }),
            prepare({ format: 'parquet' }),
        ];
        changed.forEach(({ prepared }) => {
            expect(prepared.compatibilityHash).not.toBeNull();
            expect(prepared.compatibilityHash).not.toBe(original);
        });
    });

    test('password rotation and presentation changes preserve reuse; effective access changes rebuild', () => {
        const original = prepare().prepared;
        const rotated = prepare({
            credentials: { ...credentials, password: 'rotated-test-password' },
        }).prepared;
        expect(rotated).toEqual(original);
        const cosmetic = prepare({
            metricLabel: 'Revenue',
            metricDescription: 'New description',
            metricFormat: '$#,##0.00',
            displayTimezone: 'Asia/Tokyo',
        }).prepared;
        expect(cosmetic.compatibilityHash).toBe(original.compatibilityHash);
        const actor = prepare({
            actorEmail: 'cron-owner@example.com',
            unusedAttribute: 'two',
        }).prepared;
        expect(actor.compatibilityHash).not.toBe(original.compatibilityHash);
        expect(actor.pinnedContextHash).not.toBe(original.pinnedContextHash);
    });

    test('effective intrinsic attributes remain part of compatibility', () => {
        const first = prepare({
            sqlWhere: "'${lightdash.user.email}' = 'actor@example.com'",
        }).prepared;
        const changed = prepare({
            sqlWhere: "'${lightdash.user.email}' = 'actor@example.com'",
            actorEmail: 'other@example.com',
        }).prepared;
        expect(changed.compatibilityHash).not.toBe(first.compatibilityHash);
    });

    test('uses physical numeric types and conservatively rebuilds on serving-only formula changes', () => {
        const average = prepare({ metricType: MetricType.AVERAGE }).prepared;
        expect(average.physicalOutputContract.columns).toEqual([
            { name: 'table1_total__sum', type: DimensionType.NUMBER },
            { name: 'table1_total__count', type: DimensionType.NUMBER },
        ]);
        expect(prepare({ derivedSql: '${total} * 100' }).prepared).not.toEqual(
            prepare({ derivedSql: '${total} * 200' }).prepared,
        );
    });

    test('ignores generated filter IDs at every supported filter location', () => {
        const withIds = (id: string) =>
            prepare({
                filters: [{ ...relativeFilter, id }],
                transformExplore: (source) => {
                    const explore = structuredClone(source);
                    explore.tables.table1.requiredFilters = [
                        { ...relativeFilter, id },
                    ];

                    return explore;
                },
                transformQuery: (source) => {
                    const query = structuredClone(source);
                    query.filters = {
                        dimensions: {
                            id,
                            and: [
                                {
                                    id,
                                    or: [
                                        {
                                            ...relativeFilter,
                                            id,
                                            target: {
                                                fieldId: 'table1_created_at',
                                            },
                                        },
                                    ],
                                },
                            ],
                        },
                    };

                    return query;
                },
            }).prepared;
        expect(withIds('first')).toEqual(withIds('second'));
        expect(withIds('first').compatibilityHash).not.toBeNull();
    });

    test('changes to an unselected always-joined table invalidate reuse', () => {
        const withTable = (sqlTable: string) =>
            prepare({
                transformExplore: (source) => {
                    const explore = structuredClone(source);
                    explore.tables.audit = {
                        ...explore.tables.table1,
                        name: 'audit',
                        sqlTable,
                    };
                    explore.joinedTables = [
                        {
                            table: 'audit',
                            sqlOn: 'TRUE',
                            compiledSqlOn: 'TRUE',
                            always: true,
                        },
                    ];

                    return explore;
                },
            }).prepared;
        expect(withTable('audit_a').compatibilityHash).not.toBeNull();
        expect(withTable('audit_a').compatibilityHash).not.toBe(
            withTable('audit_b').compatibilityHash,
        );
    });

    test('retains model-required filter semantics', () => {
        const original = prepare().prepared.compatibilityHash;
        const changed = prepare({
            transformExplore: (source) => {
                const explore = structuredClone(source);
                explore.tables.table1.requiredFilters = [
                    { ...relativeFilter, values: [8] },
                ];

                return explore;
            },
        }).prepared;
        expect(changed.compatibilityHash).not.toBeNull();
        expect(changed.compatibilityHash).not.toBe(original);
    });

    test('preserves authored data with metadata-like keys', () => {
        const withValue = (value: string) =>
            prepare({
                transformExplore: (source) => {
                    const explore = structuredClone(source);
                    explore.savedParameterValues = {
                        id: value,
                        label: value,
                        format: value,
                    };

                    return explore;
                },
            }).prepared;
        expect(withValue('one').compatibilityHash).not.toBe(
            withValue('two').compatibilityHash,
        );
    });

    test('metric SQL changes invalidate compatibility and the queued execution guard', () => {
        const first = prepare().prepared;
        const changed = prepare({ metricSql: '${TABLE}.amount * 2' }).prepared;
        expect(changed.compatibilityHash).not.toBe(first.compatibilityHash);
        expect(changed.pinnedContextHash).not.toBe(first.pinnedContextHash);
    });

    test('normalizes object key order', () => {
        const original = prepare().prepared;
        const reordered = prepare({
            transformExplore: (source) => {
                const explore = structuredClone(source);
                explore.tables.table1.dimensions = Object.fromEntries(
                    Object.entries(explore.tables.table1.dimensions).reverse(),
                );

                return explore;
            },
        }).prepared;
        expect(reordered).toEqual(original);
    });

    test('definition filters retain semantics but exclude generated IDs', () => {
        const withFilter = (id: string, days: number) =>
            prepare({
                definition: {
                    filters: [{ ...relativeFilter, id, values: [days] }],
                },
            }).prepared;
        expect(withFilter('first', 7).compatibilityHash).not.toBeNull();
        expect(withFilter('first', 7)).toEqual(withFilter('second', 7));
        expect(withFilter('first', 7).compatibilityHash).not.toBe(
            withFilter('first', 8).compatibilityHash,
        );
    });

    test('changing only the refresh schedule preserves compatibility', () => {
        expect(
            prepare({ definition: { refresh: { cron: '0 * * * *' } } })
                .prepared,
        ).toEqual(
            prepare({ definition: { refresh: { cron: '0 0 * * *' } } })
                .prepared,
        );
    });

    test('missing effective access cannot establish reusable evidence', () => {
        const { composer } = prepare();
        vi.spyOn(composer, 'getUserAccessControls').mockReturnValue(undefined);
        expect(
            prepareMaterializationFingerprint({
                composer,
                warehouseCredentials: credentials,
                preAggregateDef: {
                    name: 'daily',
                    dimensions: [],
                    metrics: ['total'],
                },
                format: 'jsonl',
            }).compatibilityHash,
        ).toBeNull();
    });

    test('different relative semantics cannot collide merely because one comparison window coincides', () => {
        const month = prepare({
            filters: [
                {
                    ...relativeFilter,
                    values: [1],
                    settings: {
                        unitOfTime: UnitOfTime.months,
                        completed: false,
                    },
                },
            ],
        });
        const days = prepare({
            filters: [
                {
                    ...relativeFilter,
                    values: [31],
                    settings: { unitOfTime: UnitOfTime.days, completed: false },
                },
            ],
        });
        expect(month.prepared.compatibilityHash).not.toBe(
            days.prepared.compatibilityHash,
        );
    });

    test('changing an authored absolute filter is a definition change', () => {
        const filter = {
            ...relativeFilter,
            operator: FilterOperator.GREATER_THAN,
            values: ['2026-04-01'],
            settings: undefined,
        };
        const first = prepare({ filters: [filter] }).prepared;
        expect(
            prepare({ filters: [{ ...filter, values: ['2026-04-02'] }] })
                .prepared.compatibilityHash,
        ).not.toBe(first.compatibilityHash);
    });

    test('Athena comparison tracks the actual result staging directory and ignores unused s3DataDir', () => {
        const athena: CreateAthenaCredentials = {
            type: WarehouseTypes.ATHENA,
            authenticationType: AthenaAuthenticationType.IAM_ROLE,
            assumeRoleArn: 'arn:aws:iam::123456789012:role/materializer',
            region: 'us-east-1',
            database: 'AwsDataCatalog',
            schema: 'analytics',
            s3StagingDir: 's3://results/original/',
        };
        const original = prepare({ credentials: athena }).prepared;
        expect(original.compatibilityHash).not.toBeNull();
        expect(
            prepare({
                credentials: { ...athena, s3StagingDir: 's3://results/new/' },
            }).prepared.compatibilityHash,
        ).not.toBe(original.compatibilityHash);
        expect(
            prepare({ credentials: { ...athena, s3DataDir: 's3://unused/' } })
                .prepared,
        ).toEqual(original);
    });

    test('Snowflake warehouse override policy is part of both compatibility and execution context', () => {
        const snowflake: CreateSnowflakeCredentials = {
            type: WarehouseTypes.SNOWFLAKE,
            account: 'account',
            user: 'materializer',
            password: 'test-password',
            database: 'analytics',
            schema: 'public',
            warehouse: 'SMALL',
        };
        const original = prepare({ credentials: snowflake }).prepared;
        const overridden = prepare({
            credentials: { ...snowflake, override: true },
        }).prepared;
        expect(original.compatibilityHash).not.toBeNull();
        expect(overridden.compatibilityHash).not.toBe(
            original.compatibilityHash,
        );
        expect(overridden.pinnedContextHash).not.toBe(
            original.pinnedContextHash,
        );
    });

    test('Snowflake SSO cannot use the ignored configured username as a reusable identity', () => {
        const snowflake: CreateSnowflakeCredentials = {
            type: WarehouseTypes.SNOWFLAKE,
            authenticationType: SnowflakeAuthenticationType.SSO,
            account: 'account',
            user: 'stale-password-user',
            role: 'stale-password-role',
            token: 'current-user-token',
            refreshToken: 'current-user-refresh',
            database: 'analytics',
            schema: 'public',
            warehouse: 'SMALL',
        };
        expect(getWarehouseCompatibilityContext(snowflake).verified).toBe(
            false,
        );
        expect(
            prepare({ credentials: snowflake }).prepared.compatibilityHash,
        ).toBeNull();
    });

    test.each(['authorized_user', 'external_account'])(
        'cannot prove a service-account principal from %s keyfile JSON with a stale email',
        (keyfileType) => {
            expect(
                getWarehouseCompatibilityContext({
                    type: WarehouseTypes.BIGQUERY,
                    project: 'project',
                    dataset: 'dataset',
                    timeoutSeconds: undefined,
                    priority: undefined,
                    retries: undefined,
                    location: undefined,
                    maximumBytesBilled: undefined,
                    authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
                    keyfileContents: {
                        type: keyfileType,
                        client_email: 'unused-service-account@example.com',
                    },
                }).verified,
            ).toBe(false);
        },
    );

    test('opaque active authentication cannot reuse a stale principal from another auth method', () => {
        const bigquery = getWarehouseCompatibilityContext({
            type: WarehouseTypes.BIGQUERY,
            project: 'project',
            dataset: 'dataset',
            timeoutSeconds: undefined,
            priority: undefined,
            retries: undefined,
            location: undefined,
            maximumBytesBilled: undefined,
            authenticationType: BigqueryAuthenticationType.ADC,
            keyfileContents: { client_email: 'stale-key@example.com' },
        });
        expect(bigquery.verified).toBe(false);
        const databricks = getWarehouseCompatibilityContext({
            type: WarehouseTypes.DATABRICKS,
            database: 'schema',
            serverHostName: 'workspace.example.com',
            httpPath: '/sql/endpoint',
            authenticationType: DatabricksAuthenticationType.OAUTH_U2M,
            oauthClientId: 'application-not-user',
            token: 'test-user-token',
        });
        expect(databricks.verified).toBe(false);
    });
});
