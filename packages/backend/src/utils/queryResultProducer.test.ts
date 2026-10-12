import {
    AgentActorSurface,
    BigqueryAuthenticationType,
    buildAgentIdentityClaim,
    DatabricksAuthenticationType,
    DuckdbConnectionType,
    getIntrinsicUserAttributeRegex,
    getParsedReference,
    getReferencedDimension,
    getReferencedMetric,
    getUserAttributeRegex,
    InlineErrorType,
    lightdashVariablePattern,
    parameterRegex,
    RedshiftAuthenticationType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type AgentConnectionExecution,
    type CreateWarehouseCredentials,
    type Explore,
    type MetricQuery,
    type QueryHistory,
    type UserAccessControls,
} from '@lightdash/common';
import { createHash } from 'crypto';
import { QueryHistoryModel } from '../models/QueryHistoryModel/QueryHistoryModel';
import { aiServiceAccountPlanMock } from '../services/AiAccessService/AiAccessService.mock';
import {
    metricQueryMock,
    validExplore,
} from '../services/ProjectService/ProjectService.mock';
import { WarehouseClientFactory } from '../services/WarehouseClientFactory/WarehouseClientFactory';
import { buildCacheHash } from './cacheUtils';
import { replaceUserAttributesRaw } from './QueryBuilder/utils';
import {
    assertQueryConnectionBinding,
    getModelAccessFingerprint,
    getResultEntitlementFingerprint,
    getResultEntitlementFingerprintForms,
    getSqlResultEntitlementFingerprint,
    getWarehouseIdentityFingerprint,
    isSameResultAgent,
    isSameResultCredentialOwner,
    isSameResultProducerOwner,
    isSameResultReader,
    matchesResultEntitlementFingerprint,
    type ResultEntitlementScope,
} from './queryResultProducer';
import { withNewWarehouseCredentialVersion } from './warehouseCredentialVersion';

const postgres: CreateWarehouseCredentials = withNewWarehouseCredentialVersion({
    type: WarehouseTypes.POSTGRES,
    host: 'warehouse',
    port: 5432,
    dbname: 'db',
    schema: 'public',
    user: 'user',
    password: 'secret',
    role: 'reader',
});

const oldFingerprint = (value: unknown): string =>
    createHash('sha256').update(JSON.stringify(value)).digest('hex');

const oldResultUserAttributeNames = (
    scope: ResultEntitlementScope,
    query: MetricQuery | null,
): Set<string> | null => {
    const names = new Set<string>();
    const resolvingParameters = new Set<string>();
    const scan = (
        value: unknown,
        exploreContext?: Explore,
        tableContext?: string,
    ): boolean => {
        if (typeof value === 'string') {
            for (const match of value.matchAll(getUserAttributeRegex())) {
                names.add(match[1]);
            }
            for (const match of value.matchAll(parameterRegex)) {
                const name = match[1];
                const parameter = scope.parameterValues[name];
                if (parameter === undefined || resolvingParameters.has(name))
                    return false;
                resolvingParameters.add(name);
                const resolved = scan(parameter, exploreContext, tableContext);
                resolvingParameters.delete(name);
                if (!resolved) return false;
            }
            const unresolved = value
                .replace(getUserAttributeRegex(), '')
                .replace(getIntrinsicUserAttributeRegex(), '')
                .replace(parameterRegex, '')
                .replace(lightdashVariablePattern, (placeholder, reference) => {
                    if (reference === 'TABLE') return '';
                    return (exploreContext
                        ? [exploreContext]
                        : scope.explores
                    ).some((explore) => {
                        const { refTable, refName } = getParsedReference(
                            reference,
                            tableContext ?? explore.baseTable,
                        );
                        const tables = {
                            ...explore.tables,
                            ...explore.unfilteredTables,
                        };
                        return (
                            getReferencedDimension(refTable, refName, tables) ||
                            getReferencedMetric(refTable, refName, tables)
                        );
                    })
                        ? ''
                        : placeholder;
                });
            return (
                !unresolved.includes('${') &&
                !unresolved.includes('{%') &&
                !unresolved.includes('{{')
            );
        }
        if (Array.isArray(value))
            return value.every((child) =>
                scan(child, exploreContext, tableContext),
            );
        if (value !== null && typeof value === 'object') {
            return Object.entries(value).every(([key, child]) => {
                if (key === 'requiredAttributes' || key === 'anyAttributes') {
                    if (child === undefined || child === null) return true;
                    if (typeof child !== 'object' || Array.isArray(child))
                        return false;
                    Object.keys(child).forEach((name) => names.add(name));
                }
                if (
                    (key === 'tables' || key === 'unfilteredTables') &&
                    child !== undefined
                ) {
                    if (
                        !child ||
                        typeof child !== 'object' ||
                        Array.isArray(child)
                    )
                        return false;
                    return Object.entries(child).every(([name, table]) =>
                        scan(table, exploreContext, name),
                    );
                }
                const currentTable =
                    'table' in value && typeof value.table === 'string'
                        ? value.table
                        : tableContext;
                return scan(child, exploreContext, currentTable);
            });
        }
        return true;
    };
    try {
        if (
            scope.explores.length === 0 ||
            [...scope.explores, ...(scope.executionExplores ?? [])].some(
                (explore) =>
                    !explore.tables[explore.baseTable] ||
                    (explore.warnings?.length ?? 0) > 0 ||
                    Object.values(explore.tables).some(
                        (table) => (table.warnings?.length ?? 0) > 0,
                    ),
            )
        )
            return null;
        return [...scope.explores, ...(scope.executionExplores ?? [])].every(
            (explore) => scan(explore, explore),
        ) &&
            scan(scope.projectParameterDefinitions) &&
            scan(scope.parameterValues) &&
            scan(
                query,
                scope.executionExplores?.[0] ??
                    scope.explores.find(
                        (explore) => explore.name === query?.exploreName,
                    ),
            )
            ? names
            : null;
    } catch {
        return null;
    }
};

const oldResultEntitlementFingerprint = (
    controls: UserAccessControls,
    explore: Explore | null = null,
    query: MetricQuery | null = null,
    scope: ResultEntitlementScope | null | undefined = undefined,
): string => {
    const resolvedScope =
        scope === undefined &&
        explore &&
        !explore.preAggregateSource &&
        (explore.preAggregates?.length ?? 0) === 0
            ? {
                  explores: [explore],
                  projectParameterDefinitions: {},
                  parameterValues: {},
              }
            : scope;
    const names =
        explore && resolvedScope
            ? oldResultUserAttributeNames(resolvedScope, query)
            : null;
    return oldFingerprint([
        Object.entries(controls.userAttributes)
            .filter(
                ([name, values]) =>
                    values.length > 0 && (names === null || names.has(name)),
            )
            .sort(([a], [b]) => a.localeCompare(b)),
        Object.entries(controls.intrinsicUserAttributes).sort(([a], [b]) =>
            a.localeCompare(b),
        ),
        ...(explore
            ? [
                  (resolvedScope?.explores ?? [explore])
                      .map((source) => [
                          source.name,
                          getModelAccessFingerprint(source),
                      ])
                      .sort(([a], [b]) => a.localeCompare(b)),
              ]
            : []),
    ]);
};

describe('warehouse result identity fingerprints', () => {
    test.each(['user', 'role', 'host', 'dbname'] as const)(
        'an in-place %s update changes every identity cache key',
        (field) => {
            const credentials = {
                ...postgres,
                userWarehouseCredentialsUuid: 'same-credential',
            };
            const producer = () =>
                WarehouseClientFactory.getResultProducer(
                    {
                        warehouseCredentials: credentials,
                        warehouseConnectionUuid: 'same-connection',
                        aiPlan: null,
                    },
                    'person',
                    null,
                    'entitlement',
                );
            const cacheKeys = () => [
                QueryHistoryModel.getCacheKey('project', {
                    sql: 'select 1',
                    userUuid: 'person',
                    resultIdentity: {
                        organizationUuid: 'org',
                        producer: producer(),
                    },
                }),
                buildCacheHash(['project', 'person', 'select 1', 'UTC'], {
                    organizationUuid: 'org',
                    producer: producer(),
                }),
                buildCacheHash(
                    ['autocomplete', 'project', 'person', 'select 1', 'UTC'],
                    { organizationUuid: 'org', producer: producer() },
                ),
            ];
            const before = cacheKeys();
            credentials[field] = 'replacement';
            const after = cacheKeys();
            expect(after.every((key, i) => key !== before[i])).toBe(true);
            expect(producer().warehouseConnectionUuid).toBe('same-connection');
            expect(producer().credentialOwner).toMatchObject({
                userWarehouseCredentialsUuid: 'same-credential',
            });
        },
    );

    test('a typed warehouse identity with missing versions cannot compare equal', () => {
        const { resultIdentityVersion, ...credentials } =
            withNewWarehouseCredentialVersion(postgres);
        expect(resultIdentityVersion).toBeDefined();
        expect(getWarehouseIdentityFingerprint(credentials)).toBeNull();
        expect(
            isSameResultCredentialOwner(
                {
                    kind: 'shared_connection',
                    identityFingerprint:
                        getWarehouseIdentityFingerprint(credentials),
                },
                {
                    kind: 'shared_connection',
                    identityFingerprint: getWarehouseIdentityFingerprint({
                        ...credentials,
                    }),
                },
            ),
        ).toBe(false);
    });

    test('opaque warehouse principals cannot establish compatible ownership', () => {
        const databricks: CreateWarehouseCredentials = {
            type: WarehouseTypes.DATABRICKS,
            serverHostName: 'host',
            httpPath: 'path',
            database: 'db',
            personalAccessToken: 'token',
        };
        expect(getWarehouseIdentityFingerprint(databricks)).toBeNull();
        expect(
            getWarehouseIdentityFingerprint({
                ...databricks,
                authenticationType: DatabricksAuthenticationType.OAUTH_U2M,
                token: 'access',
                oauthClientId: 'application-client',
            }),
        ).toBeNull();
        expect(
            getWarehouseIdentityFingerprint({
                ...databricks,
                authenticationType: DatabricksAuthenticationType.OAUTH_M2M,
                oauthClientId: 'principal-client',
                ...withNewWarehouseCredentialVersion({}),
            }),
        ).not.toBeNull();
        expect(
            getWarehouseIdentityFingerprint({
                type: WarehouseTypes.DUCKDB,
                connectionType: DuckdbConnectionType.MOTHERDUCK,
                database: 'db',
                schema: 'main',
                token: 'token',
            }),
        ).toBeNull();
        expect(
            isSameResultCredentialOwner(
                { kind: 'shared_connection', identityFingerprint: null },
                { kind: 'shared_connection', identityFingerprint: null },
            ),
        ).toBe(false);
    });

    test.each([
        {
            type: WarehouseTypes.DATABRICKS,
            serverHostName: 'host',
            httpPath: 'path',
            database: 'db',
            personalAccessToken: 'secret',
        },
        {
            type: WarehouseTypes.DATABRICKS,
            serverHostName: 'host',
            httpPath: 'path',
            database: 'db',
            authenticationType: DatabricksAuthenticationType.OAUTH_U2M,
            token: 'secret',
            refreshToken: 'refresh',
        },
        {
            type: WarehouseTypes.BIGQUERY,
            project: 'project',
            dataset: 'dataset',
            authenticationType: BigqueryAuthenticationType.SSO,
            keyfileContents: {
                client_id: 'application',
                client_secret: 'secret',
                refresh_token: 'refresh',
            },
        },
        {
            type: WarehouseTypes.ATHENA,
            region: 'region',
            database: 'db',
            schema: 'schema',
            accessKeyId: 'key',
            secretAccessKey: 'secret',
        },
        {
            type: WarehouseTypes.DUCKDB,
            connectionType: DuckdbConnectionType.MOTHERDUCK,
            database: 'db',
            schema: 'main',
            token: 'secret',
        },
        {
            type: WarehouseTypes.DUCKDB,
            connectionType: DuckdbConnectionType.DUCKLAKE,
            catalog: {
                type: 'postgres',
                host: 'host',
                port: 5432,
                database: 'catalog',
                user: 'user',
                password: 'secret',
            },
            dataPath: {
                type: 's3',
                url: 's3://bucket',
                accessKeyId: 'key',
                secretAccessKey: 'secret',
            },
            schema: 'main',
        },
    ] as CreateWarehouseCredentials[])(
        'opaque $type versions isolate every cache namespace and ignore refreshed secrets',
        (opaque) => {
            let credentials = {
                ...withNewWarehouseCredentialVersion(opaque),
                userWarehouseCredentialsUuid: 'same-personal-uuid',
            };
            const producer = () =>
                WarehouseClientFactory.getResultProducer(
                    {
                        warehouseCredentials: credentials,
                        warehouseConnectionUuid: 'same-connection',
                        aiPlan: null,
                    },
                    'person',
                    null,
                    'entitlement',
                );
            const keys = () => [
                QueryHistoryModel.getCacheKey('project', {
                    sql: 'select 1',
                    userUuid: 'person',
                    resultIdentity: {
                        organizationUuid: 'org',
                        producer: producer(),
                    },
                }),
                buildCacheHash(['project', 'person', 'select 1', 'UTC'], {
                    organizationUuid: 'org',
                    producer: producer(),
                }),
                buildCacheHash(
                    ['autocomplete', 'project', 'person', 'select 1', 'UTC'],
                    { organizationUuid: 'org', producer: producer() },
                ),
            ];
            const before = keys();
            const first = producer();
            expect(first.credentialOwner).toMatchObject({
                identityFingerprint: expect.any(String),
            });
            credentials = {
                ...credentials,
                ...{
                    personalAccessToken: 'new-secret',
                    token: 'new-secret',
                    refreshToken: 'new-refresh',
                    secretAccessKey: 'new-secret',
                },
            };
            if (credentials.type === WarehouseTypes.BIGQUERY)
                credentials = {
                    ...credentials,
                    keyfileContents: {
                        ...credentials.keyfileContents,
                        refresh_token: 'new-nested-refresh',
                        client_secret: 'new-nested-secret',
                    },
                };
            if (
                credentials.type === WarehouseTypes.DUCKDB &&
                credentials.connectionType === DuckdbConnectionType.DUCKLAKE &&
                credentials.dataPath.type === 's3'
            )
                credentials = {
                    ...credentials,
                    dataPath: {
                        ...credentials.dataPath,
                        accessKeyId: 'new-key',
                        secretAccessKey: 'new-nested-secret',
                    },
                };
            expect(keys()).toEqual(before);
            expect(
                isSameResultCredentialOwner(
                    first.credentialOwner,
                    producer().credentialOwner,
                ),
            ).toBe(true);
            credentials = withNewWarehouseCredentialVersion(credentials);
            expect(keys().every((key, index) => key !== before[index])).toBe(
                true,
            );
            expect(
                isSameResultCredentialOwner(
                    first.credentialOwner,
                    producer().credentialOwner,
                ),
            ).toBe(false);
        },
    );

    test('a model row restriction changes all three cache namespaces with unchanged reader controls', () => {
        const explore = structuredClone(validExplore);
        const keys = () => {
            const producer = WarehouseClientFactory.getResultProducer(
                {
                    warehouseCredentials: postgres,
                    warehouseConnectionUuid: null,
                    aiPlan: null,
                },
                'person',
                null,
                getResultEntitlementFingerprint(
                    { userAttributes: {}, intrinsicUserAttributes: {} },
                    explore,
                    metricQueryMock,
                ),
            );
            const identity = { organizationUuid: 'org', producer };
            return [
                QueryHistoryModel.getCacheKey('project', {
                    sql: 'select 1',
                    userUuid: 'person',
                    resultIdentity: identity,
                }),
                buildCacheHash(['project', 'select 1'], identity),
                buildCacheHash(
                    ['autocomplete', 'project', 'select 1'],
                    identity,
                ),
            ];
        };
        const before = keys();
        explore.tables.a.sqlWhere = "region = 'EU'";
        expect(keys().every((key, index) => key !== before[index])).toBe(true);
    });

    test.each([
        'sqlWhere',
        'uncompiledSqlWhere',
        'sqlTable',
        'field sql',
        'field compiledSql',
        'table requiredAttributes',
        'table anyAttributes',
        'field requiredAttributes',
        'field anyAttributes',
        'join sqlOn',
        'join compiledSqlOn',
        'table calculation',
    ])('semantic entitlement keeps %s attribute dependencies', (source) => {
        const explore = structuredClone(validExplore);
        const query = structuredClone(metricQueryMock);
        const sql = '${ld.attr.region}';
        switch (source) {
            case 'sqlWhere':
            case 'uncompiledSqlWhere':
            case 'sqlTable':
                explore.tables.a[source] = sql;
                break;
            case 'field sql':
                explore.tables.a.dimensions.dim1.sql = sql;
                break;
            case 'field compiledSql':
                explore.tables.a.dimensions.dim1.compiledSql = sql;
                break;
            case 'table requiredAttributes':
                explore.tables.a.requiredAttributes = { region: 'EU' };
                break;
            case 'table anyAttributes':
                explore.tables.a.anyAttributes = { region: 'EU' };
                break;
            case 'field requiredAttributes':
                explore.tables.a.dimensions.dim1.requiredAttributes = {
                    region: 'EU',
                };
                break;
            case 'field anyAttributes':
                explore.tables.a.dimensions.dim1.anyAttributes = {
                    region: 'EU',
                };
                break;
            case 'join sqlOn':
                explore.joinedTables[0].always = true;
                explore.joinedTables[0].sqlOn = sql;
                break;
            case 'join compiledSqlOn':
                explore.joinedTables[0].always = true;
                explore.joinedTables[0].compiledSqlOn = sql;
                break;
            case 'table calculation':
                query.tableCalculations = [
                    { name: 'region', displayName: 'Region', sql },
                ];
                break;
            default:
                throw new Error('Unknown attribute dependency');
        }
        const scope = (region: string, customerId: string) =>
            getResultEntitlementFingerprint(
                {
                    userAttributes: {
                        region: [region],
                        customer_id: [customerId],
                    },
                    intrinsicUserAttributes: { email: 'person@example.test' },
                },
                explore,
                query,
            );
        expect(scope('EU', '20')).toBe(scope('EU', '30'));
        expect(scope('EU', '20')).not.toBe(scope('US', '20'));
    });

    describe.each(['semantic', 'SQL'] as const)('%s value ordering', (kind) => {
        const hash = (controls: UserAccessControls) =>
            kind === 'SQL'
                ? getSqlResultEntitlementFingerprint(controls, {
                      sql: 'SELECT ${ld.attr.region}, ${ld.attr.territory}',
                  })
                : getResultEntitlementFingerprint(controls);
        test.each<UserAccessControls['userAttributes']>([
            { region: ['US', 'EU'] },
            { region: ['US', 'EU', 'US'] },
            { region: ['US', 'EU'], territory: ['z', 'A', 'ä', 'Z'] },
        ])('sorts copies and preserves duplicates: %j', (userAttributes) => {
            const controls = {
                userAttributes,
                intrinsicUserAttributes: { email: 'person@example.test' },
            };
            const before = structuredClone(controls);
            const reversed = {
                ...controls,
                userAttributes: Object.fromEntries(
                    Object.entries(userAttributes).map(([name, values]) => [
                        name,
                        [...values].reverse(),
                    ]),
                ),
            };
            expect(hash(controls)).toBe(hash(reversed));
            expect(controls).toEqual(before);
            expect(hash(controls)).toBe(
                oldResultEntitlementFingerprint({
                    ...controls,
                    userAttributes: Object.fromEntries(
                        Object.entries(userAttributes).map(([name, values]) => [
                            name,
                            [...values].sort(),
                        ]),
                    ),
                }),
            );
        });
        test('keeps duplicate values in the fingerprint', () => {
            const controls = {
                userAttributes: { region: ['EU', 'US', 'US'] },
                intrinsicUserAttributes: {},
            };
            expect(hash(controls)).not.toBe(
                hash({ ...controls, userAttributes: { region: ['EU', 'US'] } }),
            );
        });
    });

    describe('stored fingerprint compatibility', () => {
        const controls = (values: string[]): UserAccessControls => ({
            userAttributes: { region: values },
            intrinsicUserAttributes: { email: 'person@example.test' },
        });
        test.each([
            {
                name: 'same unsorted values',
                before: ['US', 'EU'],
                after: ['US', 'EU'],
                allowed: true,
            },
            {
                name: 'single value',
                before: ['EU'],
                after: ['EU'],
                allowed: true,
            },
            {
                name: 'real change',
                before: ['US', 'EU'],
                after: ['US', 'UK'],
                allowed: false,
            },
            {
                name: 'old unsorted values now sorted still refuse',
                before: ['US', 'EU'],
                after: ['EU', 'US'],
                allowed: false,
            },
        ])('old record: $name', ({ before, after, allowed }) => {
            expect(
                matchesResultEntitlementFingerprint(
                    oldResultEntitlementFingerprint(controls(before)),
                    getResultEntitlementFingerprintForms(controls(after)),
                ),
            ).toBe(allowed);
        });
        test.each([
            {
                name: 'already sorted values allow',
                values: ['EU', 'US'],
                allowed: true,
            },
            { name: 'single value allows', values: ['EU'], allowed: true },
            {
                name: 'unsorted values refuse until all old pods stop',
                values: ['US', 'EU'],
                allowed: false,
            },
        ])(
            'rolling update: old reader with new record and $name',
            ({ values, allowed }) => {
                expect(
                    getResultEntitlementFingerprint(controls(values)) ===
                        oldResultEntitlementFingerprint(controls(values)),
                ).toBe(allowed);
            },
        );
        test.each([
            {
                name: 'changed value',
                before: controls(['US', 'EU']),
                after: controls(['UK', 'EU']),
            },
            {
                name: 'added value',
                before: controls(['EU']),
                after: controls(['US', 'EU']),
            },
            {
                name: 'removed value',
                before: controls(['US', 'EU']),
                after: controls(['EU']),
            },
            {
                name: 'different attribute',
                before: controls(['US', 'EU']),
                after: {
                    ...controls([]),
                    userAttributes: { territory: ['US', 'EU'] },
                },
            },
            {
                name: 'different verified email',
                before: controls(['US', 'EU']),
                after: {
                    ...controls(['US', 'EU']),
                    intrinsicUserAttributes: { email: 'another@example.test' },
                },
            },
        ])('both stored forms refuse a $name', ({ before, after }) => {
            const forms = getResultEntitlementFingerprintForms(after);
            expect(forms.valueOrderDependent).toBe(
                oldResultEntitlementFingerprint(after),
            );
            expect(
                matchesResultEntitlementFingerprint(
                    oldResultEntitlementFingerprint(before),
                    forms,
                ),
            ).toBe(false);
            expect(
                matchesResultEntitlementFingerprint(
                    getResultEntitlementFingerprint(before),
                    forms,
                ),
            ).toBe(false);
        });
    });

    test('attribute value order does not change the entitlement fingerprint', () => {
        const controls = {
            userAttributes: { region: ['EU', 'US'] },
            intrinsicUserAttributes: { email: 'person@example.test' },
        };
        expect(
            getResultEntitlementFingerprint({
                ...controls,
                userAttributes: { region: ['US', 'EU'] },
            }),
        ).toBe(getResultEntitlementFingerprint(controls));
    });

    describe.each([
        'requiredAttributes',
        'anyAttributes',
        'semantic fallback',
        'SQL',
        'SQL fallback',
    ] as const)('%s empty attribute canonicalisation', (variant) => {
        const scope = (
            userAttributes: UserAccessControls['userAttributes'],
        ) => {
            const controls = {
                userAttributes,
                intrinsicUserAttributes: { email: 'person@example.test' },
            };
            if (variant === 'SQL' || variant === 'SQL fallback') {
                return getSqlResultEntitlementFingerprint(
                    controls,
                    variant === 'SQL'
                        ? { sql: 'SELECT ${ld.attr.region}' }
                        : undefined,
                );
            }
            const explore = structuredClone(validExplore);
            if (variant !== 'semantic fallback') {
                explore.tables.a.dimensions.dim1[variant] = { region: 'a' };
            }
            return getResultEntitlementFingerprint(
                controls,
                explore,
                metricQueryMock,
                variant === 'semantic fallback' ? null : undefined,
            );
        };

        test.each<{
            change: string;
            before: UserAccessControls['userAttributes'];
            after: UserAccessControls['userAttributes'];
        }>([
            { change: 'created', before: {}, after: { region: [] } },
            { change: 'deleted', before: { region: [] }, after: {} },
        ])(
            'keeps the fingerprint when an empty definition is $change',
            ({ before, after }) => {
                expect(scope(after)).toBe(scope(before));
            },
        );

        test.each<{
            change: string;
            before: UserAccessControls['userAttributes'];
            after: UserAccessControls['userAttributes'];
        }>([
            {
                change: 'changed',
                before: { region: ['a'] },
                after: { region: ['b'] },
            },
            {
                change: 'added to empty',
                before: { region: [] },
                after: { region: ['a'] },
            },
            { change: 'added to absent', before: {}, after: { region: ['a'] } },
            {
                change: 'removed to empty',
                before: { region: ['a'] },
                after: { region: [] },
            },
            {
                change: 'removed to absent',
                before: { region: ['a'] },
                after: {},
            },
        ])(
            'changes the fingerprint when a value is $change',
            ({ before, after }) => {
                expect(scope(after)).not.toBe(scope(before));
            },
        );
    });

    test.each(
        ['lightdash', 'ld'].flatMap((prefix) =>
            ['attribute', 'attributes', 'attr'].flatMap((alias) =>
                ['region', 'Region_2'].map((name) => ({
                    placeholder: `\${${prefix}.${alias}.${name}}`,
                    name,
                })),
            ),
        ),
    )(
        'round 23 uses compiler attribute syntax $placeholder',
        ({ placeholder, name }) => {
            const explore = structuredClone(validExplore);
            explore.tables.b.hidden = true;
            explore.tables.b.dimensions.dim1.hidden = true;
            explore.tables.b.dimensions.dim1.sql = placeholder;
            expect(
                [...placeholder.matchAll(getUserAttributeRegex())][0][1],
            ).toBe(name);
            expect(
                replaceUserAttributesRaw(placeholder, {}, { [name]: ['EU'] }),
            ).toBe('EU');
            const scope = (value: string) =>
                getResultEntitlementFingerprint(
                    {
                        userAttributes: {
                            [name]: [value],
                            unrelated: ['same'],
                        },
                        intrinsicUserAttributes: {},
                    },
                    explore,
                    {
                        ...metricQueryMock,
                        dimensions: ['a_dim1'],
                        metrics: [],
                        filters: {},
                        sorts: [],
                    },
                );
            expect(scope('EU')).not.toBe(scope('US'));
        },
    );

    test.each([
        '${LD.attr.region}',
        '${ld.ATTR.region}',
        '${ ld.attr.region }',
        '${ld.attr. region}',
        '${ld.attr.region }',
        '${lightdash.attributes.my-attr}',
        '${ld.attr.region',
        '{% unknown_attribute_syntax %}',
        '{{ unknown_attribute_syntax }}',
    ])('round 23 falls back for unresolved syntax %s', (sql) => {
        const explore = structuredClone(validExplore);
        explore.tables.b.sqlTable = sql;
        expect(replaceUserAttributesRaw(sql, {}, { region: ['EU'] })).toBe(sql);
        const scope = (value: string) =>
            getResultEntitlementFingerprint(
                {
                    userAttributes: { unrelated: [value] },
                    intrinsicUserAttributes: {},
                },
                explore,
                metricQueryMock,
            );
        expect(scope('EU')).not.toBe(scope('US'));
    });

    test('round 23 compiled warnings retain the full attribute comparison', () => {
        const explore = structuredClone(validExplore);
        explore.warnings = [
            {
                type: InlineErrorType.FIELD_ERROR,
                message: 'Field SQL cannot be compiled',
            },
        ];
        const scope = (value: string) =>
            getResultEntitlementFingerprint(
                {
                    userAttributes: { unrelated: [value] },
                    intrinsicUserAttributes: {},
                },
                explore,
                metricQueryMock,
            );
        expect(scope('EU')).not.toBe(scope('US'));
    });

    test('equivalent recompiled explores retain their access digest', () => {
        const explore = structuredClone(validExplore);
        explore.tables.a.requiredAttributes = { region: 'EU', tier: 'gold' };
        const scope = () =>
            getResultEntitlementFingerprint(
                {
                    userAttributes: { region: ['EU'], tier: ['gold'] },
                    intrinsicUserAttributes: {},
                },
                explore,
                metricQueryMock,
            );
        const before = scope();
        explore.tables = Object.fromEntries(
            Object.entries(explore.tables).reverse(),
        );
        explore.tables.a.dimensions = Object.fromEntries(
            Object.entries(explore.tables.a.dimensions).reverse(),
        );
        explore.tables.a.requiredAttributes = { tier: 'gold', region: 'EU' };
        explore.tables.a.label = 'New label';
        explore.tables.a.dimensions.dim1.compiledSql =
            'different SQL without an access attribute';
        expect(scope()).toBe(before);
        explore.tables.a.requiredAttributes.region = 'US';
        expect(scope()).not.toBe(before);
    });

    test('every joined-table access rule invalidates the explore scope', () => {
        const explore = structuredClone(validExplore);
        const scope = () =>
            getResultEntitlementFingerprint(
                { userAttributes: {}, intrinsicUserAttributes: {} },
                explore,
                {
                    ...metricQueryMock,
                    dimensions: ['a_dim1'],
                    metrics: [],
                    filters: {},
                    sorts: [],
                },
            );
        const before = scope();
        explore.tables.b.sqlWhere = "region = 'EU'";
        expect(scope()).not.toBe(before);
        explore.tables.a.sqlWhere = "region = 'EU'";
        expect(scope()).not.toBe(before);
    });

    test('cloud data routes omit credentials and signed URL query parameters', () => {
        const credentials = withNewWarehouseCredentialVersion({
            type: WarehouseTypes.DUCKDB,
            connectionType: DuckdbConnectionType.DUCKLAKE,
            catalog: { type: 'sqlite', path: 'catalog.db' },
            dataPath: {
                type: 's3',
                url: 's3://private:secret@bucket/path?signature=old',
                secretAccessKey: 'secret',
            },
            schema: 'main',
        } as CreateWarehouseCredentials);
        const first = getWarehouseIdentityFingerprint(credentials);
        expect(
            getWarehouseIdentityFingerprint({
                ...credentials,
                dataPath: {
                    type: 's3',
                    url: 's3://different:rotated@bucket/path?signature=new',
                    secretAccessKey: 'new-secret',
                },
            } as CreateWarehouseCredentials),
        ).toBe(first);
        expect(
            getWarehouseIdentityFingerprint({
                ...credentials,
                dataPath: { type: 's3', url: 's3://bucket/new-path' },
            } as CreateWarehouseCredentials),
        ).not.toBe(first);
    });

    test('password rotation preserves the logical warehouse identity', () => {
        expect(
            getWarehouseIdentityFingerprint({
                ...postgres,
                password: 'new-secret',
            }),
        ).toBe(getWarehouseIdentityFingerprint(postgres));
    });

    test('Snowflake token refresh preserves identity but a role or auth change does not', () => {
        const credentials: CreateWarehouseCredentials =
            withNewWarehouseCredentialVersion({
                type: WarehouseTypes.SNOWFLAKE,
                account: 'account',
                user: 'person',
                role: 'reader',
                database: 'db',
                warehouse: 'wh',
                schema: 'public',
                authenticationType: SnowflakeAuthenticationType.SSO,
                token: 'token',
                refreshToken: 'refresh',
            });
        const identity = getWarehouseIdentityFingerprint(credentials);
        expect(
            getWarehouseIdentityFingerprint({
                ...credentials,
                token: 'new-token',
                refreshToken: 'new-refresh',
            }),
        ).toBe(identity);
        expect(
            getWarehouseIdentityFingerprint({
                ...credentials,
                role: 'restricted',
            }),
        ).not.toBe(identity);
        expect(
            getWarehouseIdentityFingerprint({
                ...credentials,
                authenticationType: SnowflakeAuthenticationType.PASSWORD,
            }),
        ).not.toBe(identity);
    });

    test('BigQuery uses the service account identity and ignores its private key', () => {
        const credentials: CreateWarehouseCredentials =
            withNewWarehouseCredentialVersion({
                type: WarehouseTypes.BIGQUERY,
                project: 'project',
                dataset: 'dataset',
                authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
                keyfileContents: {
                    client_email: 'person@example.test',
                    client_id: 'client',
                    private_key: 'secret',
                },
                timeoutSeconds: undefined,
                priority: undefined,
                retries: undefined,
                location: undefined,
                maximumBytesBilled: undefined,
            });
        const identity = getWarehouseIdentityFingerprint(credentials);
        expect(
            getWarehouseIdentityFingerprint({
                ...credentials,
                keyfileContents: {
                    ...credentials.keyfileContents,
                    private_key: 'rotated-secret',
                },
            }),
        ).toBe(identity);
        expect(
            getWarehouseIdentityFingerprint({
                ...credentials,
                keyfileContents: {
                    ...credentials.keyfileContents,
                    client_email: 'other@example.test',
                },
            }),
        ).not.toBe(identity);
        expect(identity).not.toContain('secret');
    });

    test('entitlement fingerprints include current user and intrinsic attributes in stable key order', () => {
        const first = getResultEntitlementFingerprint({
            userAttributes: { region: ['EU'], tier: ['gold'] },
            intrinsicUserAttributes: { email: 'person@example.test' },
        });
        expect(
            getResultEntitlementFingerprint({
                userAttributes: { tier: ['gold'], region: ['EU'] },
                intrinsicUserAttributes: { email: 'person@example.test' },
            }),
        ).toBe(first);
        expect(
            getResultEntitlementFingerprint({
                userAttributes: { tier: ['gold'], region: ['US'] },
                intrinsicUserAttributes: { email: 'person@example.test' },
            }),
        ).not.toBe(first);
        expect(
            getResultEntitlementFingerprint({
                userAttributes: { region: ['EU'], tier: ['gold'] },
                intrinsicUserAttributes: {},
            }),
        ).not.toBe(first);
    });
});

describe('AI service account result producers', () => {
    test.each([
        { ...postgres, type: WarehouseTypes.POSTGRES },
        {
            ...postgres,
            type: WarehouseTypes.REDSHIFT,
            authenticationType: RedshiftAuthenticationType.PASSWORD,
        },
        {
            type: WarehouseTypes.TRINO,
            host: 'warehouse',
            port: 443,
            dbname: 'catalog',
            schema: 'public',
            user: 'agent',
            password: 'secret',
            http_scheme: 'https',
        },
        {
            type: WarehouseTypes.ATHENA,
            region: 'eu-west-1',
            database: 'catalog',
            schema: 'public',
            accessKeyId: 'key',
            secretAccessKey: 'secret',
            assumeRoleArn: 'arn:aws:iam::123456789012:role/agent',
            s3StagingDir: 's3://results/',
        },
    ] satisfies CreateWarehouseCredentials[])(
        '%s retains the service account generation and complete agent claim',
        (credentials) => {
            const claim = buildAgentIdentityClaim({
                subject: { type: 'user', uuid: 'person' },
                surface: AgentActorSurface.IN_APP_AGENT,
                clientId: 'lightdash-chat',
                agentUuid: 'agent',
            });
            const producer = WarehouseClientFactory.getResultProducer(
                {
                    warehouseCredentials: credentials,
                    warehouseConnectionUuid: 'connection',
                    aiPlan: { ...aiServiceAccountPlanMock, credentials },
                },
                'person',
                claim,
                'entitlement',
            );
            expect(producer.credentialOwner).toEqual({
                kind: 'ai_service_account',
                credentialUuid: 'slot-row',
                generation: 'slot-generation',
                sourceProjectUuid: 'project',
            });
            expect(producer.agentIdentity).toBe(claim);
            expect(producer.agentIdentity?.act.agent_uuid).toBe('agent');
            expect(JSON.stringify(producer)).not.toContain('secret');
            expect(
                getWarehouseIdentityFingerprint(
                    withNewWarehouseCredentialVersion(credentials),
                ),
            ).not.toBeNull();
        },
    );
});

describe('result agent identity', () => {
    test.each(Object.values(AgentActorSurface))(
        'permits a null client only for PAT authentication on the MCP surface: %s',
        (surface) => {
            const claim = buildAgentIdentityClaim({
                subject: { type: 'user', uuid: 'user' },
                surface,
                clientId: null,
                agentUuid: 'agent',
            });
            expect(isSameResultAgent(claim, claim, 'pat', 'pat')).toBe(
                surface === AgentActorSurface.MCP,
            );
        },
    );
    test('PAT MCP claims isolate the subject, surface and OAuth client', () => {
        const pat = buildAgentIdentityClaim({
            subject: { type: 'user', uuid: 'user' },
            surface: AgentActorSurface.MCP,
            clientId: null,
        });
        const oauth = buildAgentIdentityClaim({
            subject: pat.subject,
            surface: AgentActorSurface.MCP,
            clientId: 'oauth-client',
        });
        expect(isSameResultAgent(pat, pat, 'pat', 'pat')).toBe(true);
        expect(isSameResultAgent(null, pat, 'pat', 'pat')).toBe(false);
        expect(isSameResultAgent(oauth, pat, 'oauth', 'pat')).toBe(false);
        expect(isSameResultAgent(pat, oauth, 'pat', 'oauth')).toBe(false);
        expect(
            isSameResultAgent(
                { ...pat, subject: { type: 'user', uuid: 'other' } },
                pat,
                'pat',
                'pat',
            ),
        ).toBe(false);
        expect(
            isSameResultAgent(
                { ...pat, act: { ...pat.act, surface: AgentActorSurface.API } },
                pat,
                'pat',
                'pat',
            ),
        ).toBe(false);
    });
    test.each([
        AgentActorSurface.API,
        AgentActorSurface.MCP,
        AgentActorSurface.CLI,
        AgentActorSurface.DATA_APP,
        AgentActorSurface.AI_SUMMARY,
    ])('preserves client identity for %s', (surface) => {
        const claim = buildAgentIdentityClaim({
            subject: { type: 'user', uuid: 'user' },
            surface,
            clientId: 'client',
        });
        expect(isSameResultAgent(claim, claim, 'oauth', 'oauth')).toBe(true);
        const differentClient = buildAgentIdentityClaim({
            subject: { type: 'user', uuid: 'user' },
            surface,
            clientId: 'different-client',
        });
        expect(
            isSameResultAgent(claim, differentClient, 'oauth', 'oauth'),
        ).toBe(false);
    });
});

test.each(['session', 'oauth', 'service-account', 'jwt', null] as const)(
    'a null MCP client cannot establish PAT provenance from %s',
    (authMethod) => {
        const claim = buildAgentIdentityClaim({
            subject: { type: 'user', uuid: 'user' },
            surface: AgentActorSurface.MCP,
            clientId: null,
        });
        expect(isSameResultAgent(claim, claim, authMethod, 'pat')).toBe(false);
        expect(isSameResultAgent(claim, claim, 'pat', authMethod)).toBe(false);
        expect(isSameResultAgent(claim, claim, authMethod, authMethod)).toBe(
            authMethod !== null && authMethod !== 'oauth',
        );
    },
);

test.each(['lightdash-autopilot', 'lightdash-chat', 'untrusted'])(
    'round 18 only the singleton managed client %s can read without a configured agent UUID',
    (clientId) => {
        const claim = buildAgentIdentityClaim({
            subject: { type: 'user', uuid: 'person' },
            surface: AgentActorSurface.IN_APP_AGENT,
            clientId,
            agentUuid: null,
        });
        expect(isSameResultAgent(claim, claim, 'session', 'session')).toBe(
            clientId === 'lightdash-autopilot',
        );
    },
);

test('round 18 configured summary agents cannot read each other results', () => {
    const summary = (agentUuid: string) =>
        buildAgentIdentityClaim({
            subject: { type: 'user', uuid: 'person' },
            surface: AgentActorSurface.AI_SUMMARY,
            clientId: 'lightdash-ai-summary',
            agentUuid,
        });
    expect(
        isSameResultAgent(summary('a'), summary('a'), 'session', 'session'),
    ).toBe(true);
    expect(
        isSameResultAgent(summary('a'), summary('b'), 'session', 'session'),
    ).toBe(false);
});

describe('connection result identity', () => {
    const claim = (reference: { grantUuid: string; revision: number } | null) =>
        buildAgentIdentityClaim({
            subject: { type: 'user', uuid: 'user' },
            surface: AgentActorSurface.CLI,
            clientId: 'lightdash-cli',
            agentConnectionGrant: reference,
        });
    const producer = (agentIdentity: ReturnType<typeof claim> | null) =>
        WarehouseClientFactory.getResultProducer(
            {
                warehouseCredentials: postgres,
                warehouseConnectionUuid: 'shared',
                aiPlan: null,
            },
            'user',
            agentIdentity,
            null,
            'oauth',
        );
    test.each([
        { grantUuid: 'other', revision: 1 },
        { grantUuid: 'grant', revision: 2 },
        null,
    ])(
        'separates connection %j in both directions despite the shared warehouse owner',
        (reference) => {
            const a = claim({ grantUuid: 'grant', revision: 1 });
            const b = claim(reference);
            for (const [stored, current] of [
                [a, b],
                [b, a],
            ]) {
                expect(
                    isSameResultAgent(stored, current, 'oauth', 'oauth'),
                ).toBe(false);
                expect(
                    isSameResultReader(producer(stored), {
                        kind: 'agent',
                        claim: current,
                        authMethod: 'oauth',
                    }),
                ).toBe(false);
                expect(
                    isSameResultProducerOwner(
                        producer(stored),
                        producer(current),
                    ),
                ).toBe(false);
            }
        },
    );
    test('the same connection matches after token refresh and person comparisons remain isolated', () => {
        const a = claim({ grantUuid: 'grant', revision: 1 });
        const refreshed = claim({ grantUuid: 'grant', revision: 1 });
        expect(isSameResultAgent(a, refreshed, 'oauth', 'oauth')).toBe(true);
        expect(
            isSameResultProducerOwner(producer(a), producer(refreshed)),
        ).toBe(true);
        expect(
            isSameResultReader(producer(a), {
                kind: 'person',
                authMethod: 'oauth',
            }),
        ).toBe(false);
        expect(
            isSameResultReader(producer(null), {
                kind: 'agent',
                claim: a,
                authMethod: 'oauth',
            }),
        ).toBe(false);
        expect(isSameResultProducerOwner(producer(a), producer(null))).toBe(
            false,
        );
        expect(isSameResultProducerOwner(producer(null), producer(a))).toBe(
            false,
        );
        expect(
            isSameResultProducerOwner(producer(null), producer(claim(null))),
        ).toBe(true);
    });
    test('cache keys distinguish connections and revisions', () => {
        const key = (grantUuid: string, revision: number) =>
            QueryHistoryModel.getCacheKey('project', {
                sql: 'SELECT 1',
                userUuid: null,
                resultIdentity: {
                    organizationUuid: 'org',
                    producer: producer(claim({ grantUuid, revision })),
                },
            });
        expect(key('grant', 1)).toBe(key('grant', 1));
        expect(
            new Set([key('grant', 1), key('other', 1), key('grant', 2)]).size,
        ).toBe(3);
    });
});

describe('durable connection binding', () => {
    const envelope: AgentConnectionExecution = {
        grantUuid: 'grant',
        revision: 1,
        subjectUserUuid: 'user',
        organizationUuid: 'org',
        clientId: 'lightdash-cli',
        resource: 'https://server.example',
        refreshFamilyUuid: 'family',
        scopes: ['read'],
        operation: {
            kind: 'rest',
            key: 'QueryController.executeAsyncSqlQuery',
        },
    };
    const row = (): QueryHistory => {
        const claim = buildAgentIdentityClaim({
            subject: { type: 'user', uuid: 'user' },
            surface: AgentActorSurface.CLI,
            clientId: 'lightdash-cli',
            agentConnectionGrant: { grantUuid: 'grant', revision: 1 },
        });
        return {
            agentIdentity: claim,
            organizationUuid: 'org',
            createdByUserUuid: 'user',
            createdByActorType: 'oauth',
            requestParameters: {
                sql: 'select 1',
                agentConnectionExecution: envelope,
                resultProducer: {
                    version: 1,
                    authMethod: 'oauth',
                    agentIdentity: claim,
                    warehouseConnectionUuid: null,
                    credentialOwner: { kind: 'no_warehouse_data' },
                },
            },
        } as QueryHistory;
    };
    test.each([
        'history',
        'producer',
        'envelope',
        'missing_envelope',
        'missing_history',
        'subject',
        'organization',
        'auth',
    ])('refuses inconsistent %s before storage', async (reason) => {
        const query = row();
        if (reason === 'history')
            query.agentIdentity = {
                ...query.agentIdentity!,
                act: {
                    ...query.agentIdentity!.act,
                    agent_connection_grant: { grantUuid: 'other', revision: 1 },
                },
            };
        if (reason === 'producer')
            query.requestParameters.resultProducer!.agentIdentity = null;
        if (reason === 'envelope')
            query.requestParameters.agentConnectionExecution = {
                ...envelope,
                revision: 2,
            };
        if (reason === 'missing_envelope')
            delete query.requestParameters.agentConnectionExecution;
        if (reason === 'missing_history') query.agentIdentity = null;
        if (reason === 'subject') query.createdByUserUuid = 'other';
        if (reason === 'organization') query.organizationUuid = 'other';
        if (reason === 'auth') query.createdByActorType = 'session';
        const storage = vi.fn();
        await expect(
            Promise.resolve()
                .then(() => assertQueryConnectionBinding(query))
                .then(storage),
        ).rejects.toThrow();
        expect(storage).not.toHaveBeenCalled();
    });
    test('accepts a consistent binding and legacy unbound rows', () => {
        expect(assertQueryConnectionBinding(row())).toEqual(envelope);
        expect(
            assertQueryConnectionBinding({
                agentIdentity: null,
                requestParameters: {},
            } as QueryHistory),
        ).toBeNull();
    });
});
