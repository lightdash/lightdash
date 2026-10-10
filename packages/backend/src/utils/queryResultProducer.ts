import {
    AgentActorSurface,
    assertUnreachable,
    BigqueryAuthenticationType,
    DatabricksAuthenticationType,
    DuckdbConnectionType,
    DucklakeCatalogType,
    DucklakeDataPathType,
    getIntrinsicUserAttributeRegex,
    getParsedReference,
    getReferencedDimension,
    getReferencedMetric,
    getUserAttributeRegex,
    lightdashVariablePattern,
    parameterRegex,
    WarehouseTypes,
    type AgentIdentityClaim,
    type AuthType,
    type CreateWarehouseCredentials,
    type Explore,
    type MetricQuery,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type QueryHistory,
    type QueryResultCredentialOwner,
    type QueryResultProducer,
    type QueryResultReader,
    type UserAccessControls,
} from '@lightdash/common';
import { createHash } from 'crypto';
import { getWarehouseCredentialVersions } from './warehouseCredentialVersion';

const getDataPathRoute = (value: string): string[] | null => {
    try {
        const url = new URL(value);
        return [url.protocol, url.hostname, url.port, url.pathname];
    } catch {
        return null;
    }
};

const fingerprint = (value: unknown): string =>
    createHash('sha256').update(JSON.stringify(value)).digest('hex');

export const getModelAccessFingerprint = (explore: Explore): string => {
    const attributes = (value: Record<string, unknown> | undefined) =>
        Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b));
    return fingerprint(
        Object.entries({ ...explore.tables, ...explore.unfilteredTables })
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, table]) => [
                name,
                table.sqlWhere ?? null,
                attributes(table.requiredAttributes),
                attributes(table.anyAttributes),
                Object.entries({ ...table.dimensions, ...table.metrics })
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([id, field]) => [
                        id,
                        attributes(field.requiredAttributes),
                        attributes(field.anyAttributes),
                    ]),
            ]),
    );
};

export type ResultEntitlementScope = {
    executionExplores?: Explore[];
    explores: Explore[];
    projectParameterDefinitions: ParameterDefinitions;
    parameterValues: ParametersValuesMap;
};

const getResultUserAttributeNames = (
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

export const getResultEntitlementFingerprint = (
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
            ? getResultUserAttributeNames(resolvedScope, query)
            : null;
    return fingerprint([
        Object.entries(controls.userAttributes)
            .filter(([name]) => names === null || names.has(name))
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

export const getSqlResultEntitlementFingerprint = (
    controls: UserAccessControls,
    parameters: QueryHistory['requestParameters'] | undefined,
): string => {
    const names = new Set<string>();
    const resolvingParameters = new Set<string>();
    const scan = (value: unknown): boolean => {
        if (typeof value === 'string') {
            for (const match of value.matchAll(getUserAttributeRegex())) {
                names.add(match[1]);
            }
            for (const match of value.matchAll(parameterRegex)) {
                const name = match[1];
                const parameter = parameters?.parameters?.[name];
                if (parameter === undefined || resolvingParameters.has(name))
                    return false;
                resolvingParameters.add(name);
                const resolved = scan(parameter);
                resolvingParameters.delete(name);
                if (!resolved) return false;
            }
            const unresolved = value
                .replace(getUserAttributeRegex(), '')
                .replace(getIntrinsicUserAttributeRegex(), '')
                .replace(parameterRegex, '');
            return (
                !unresolved.includes('${') &&
                !unresolved.includes('{%') &&
                !unresolved.includes('{{')
            );
        }
        if (Array.isArray(value)) return value.every(scan);
        if (value !== null && typeof value === 'object')
            return Object.values(value).every(scan);
        return true;
    };
    let resolved = false;
    try {
        resolved =
            parameters !== undefined &&
            'sql' in parameters &&
            typeof parameters.sql === 'string' &&
            scan(
                Object.fromEntries(
                    Object.entries(parameters).filter(
                        ([key]) =>
                            ![
                                'parameters',
                                'resultProducer',
                                'resultEntitlementFingerprint',
                                'resultSource',
                                'resultArtifact',
                                'resultResearchRunUuid',
                                'queryUsage',
                                'aiSignInCredentialUuid',
                                'cacheSourceQueryUuid',
                                'externalSourceReferences',
                            ].includes(key),
                    ),
                ),
            );
    } catch {
        resolved = false;
    }
    return getResultEntitlementFingerprint({
        ...controls,
        userAttributes: resolved
            ? Object.fromEntries(
                  Object.entries(controls.userAttributes).filter(([name]) =>
                      names.has(name),
                  ),
              )
            : controls.userAttributes,
    });
};

export const getWarehouseIdentityFingerprint = (
    credentials: CreateWarehouseCredentials,
): string | null => {
    const opaqueIdentity = { kind: 'opaque' } as const;
    const identity = (() => {
        switch (credentials.type) {
            case WarehouseTypes.POSTGRES:
                return [
                    credentials.host,
                    credentials.port,
                    credentials.dbname,
                    credentials.schema,
                    credentials.user,
                    credentials.role ?? null,
                    'password',
                ];
            case WarehouseTypes.REDSHIFT:
                return [
                    credentials.host,
                    credentials.port,
                    credentials.dbname,
                    credentials.schema,
                    credentials.user,
                    credentials.authenticationType ?? 'password',
                    credentials.region ?? null,
                    credentials.clusterIdentifier ?? null,
                    credentials.workgroupName ?? null,
                    credentials.dbGroups ?? [],
                    credentials.assumeRoleArn ?? null,
                    credentials.awsSsoAccountId ?? null,
                    credentials.awsSsoRoleName ?? null,
                ];
            case WarehouseTypes.SNOWFLAKE:
                return [
                    credentials.account,
                    credentials.database,
                    credentials.schema,
                    credentials.warehouse,
                    credentials.user,
                    credentials.role ?? null,
                    credentials.authenticationType ?? 'password',
                ];
            case WarehouseTypes.BIGQUERY:
                if (
                    !credentials.keyfileContents?.client_email &&
                    (!credentials.keyfileContents?.client_id ||
                        credentials.authenticationType ===
                            BigqueryAuthenticationType.SSO)
                )
                    return [
                        opaqueIdentity,
                        credentials.project,
                        credentials.executionProject ?? null,
                        credentials.dataset,
                        credentials.location ?? null,
                        credentials.authenticationType ?? 'private_key',
                    ];
                return [
                    credentials.project,
                    credentials.executionProject ?? null,
                    credentials.dataset,
                    credentials.location ?? null,
                    credentials.authenticationType ?? 'private_key',
                    credentials.keyfileContents?.client_email ?? null,
                    credentials.keyfileContents?.client_id ?? null,
                ];
            case WarehouseTypes.DATABRICKS:
                if (
                    credentials.authenticationType !==
                        DatabricksAuthenticationType.OAUTH_M2M ||
                    !credentials.oauthClientId
                )
                    return [
                        opaqueIdentity,
                        credentials.serverHostName,
                        credentials.httpPath,
                        credentials.database,
                        credentials.catalog ?? null,
                        credentials.authenticationType ??
                            DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN,
                    ];
                return [
                    credentials.serverHostName,
                    credentials.httpPath,
                    credentials.database,
                    credentials.catalog ?? null,
                    credentials.authenticationType ??
                        DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN,
                    credentials.oauthClientId ?? null,
                ];
            case WarehouseTypes.TRINO:
                return [
                    credentials.host,
                    credentials.port,
                    credentials.dbname,
                    credentials.schema,
                    credentials.user,
                    credentials.http_scheme,
                ];
            case WarehouseTypes.CLICKHOUSE:
                return [
                    credentials.host,
                    credentials.port,
                    credentials.schema,
                    credentials.user,
                    credentials.secure ?? false,
                ];
            case WarehouseTypes.ATHENA:
                if (!credentials.assumeRoleArn)
                    return [
                        opaqueIdentity,
                        credentials.region,
                        credentials.database,
                        credentials.schema,
                        credentials.workGroup ?? null,
                        credentials.authenticationType ?? 'access_key',
                        credentials.webIdentityAudience ?? null,
                    ];
                return [
                    credentials.region,
                    credentials.database,
                    credentials.schema,
                    credentials.authenticationType ?? 'access_key',
                    credentials.assumeRoleArn ?? null,
                    credentials.webIdentityAudience ?? null,
                    credentials.workGroup ?? null,
                ];
            case WarehouseTypes.DUCKDB:
                switch (credentials.connectionType) {
                    case DuckdbConnectionType.MOTHERDUCK:
                        return [
                            opaqueIdentity,
                            credentials.connectionType,
                            credentials.database,
                            credentials.schema,
                        ];
                    case DuckdbConnectionType.EMBEDDED:
                        return [
                            credentials.connectionType,
                            credentials.dataset,
                            credentials.bundleVersion ?? null,
                            credentials.schema ?? null,
                        ];
                    case DuckdbConnectionType.ANALYTICS:
                        return [
                            credentials.connectionType,
                            credentials.database,
                        ];
                    case DuckdbConnectionType.DUCKLAKE: {
                        const catalog = (() => {
                            const value = credentials.catalog;
                            switch (value.type) {
                                case DucklakeCatalogType.POSTGRES:
                                    return [
                                        value.type,
                                        value.host,
                                        value.port,
                                        value.database,
                                        value.user,
                                    ];
                                case DucklakeCatalogType.SQLITE:
                                case DucklakeCatalogType.DUCKDB:
                                    return [value.type, value.path];
                                default:
                                    return assertUnreachable(
                                        value,
                                        'Unknown catalog type',
                                    );
                            }
                        })();
                        const dataPath = (() => {
                            const value = credentials.dataPath;
                            switch (value.type) {
                                case DucklakeDataPathType.S3:
                                    if (getDataPathRoute(value.url) === null)
                                        return null;
                                    return [
                                        opaqueIdentity,
                                        value.type,
                                        getDataPathRoute(value.url),
                                        value.endpoint ?? null,
                                        value.region ?? null,
                                        value.forcePathStyle ?? false,
                                        value.useSsl ?? true,
                                    ];
                                case DucklakeDataPathType.GCS:
                                    if (getDataPathRoute(value.url) === null)
                                        return null;
                                    return [
                                        opaqueIdentity,
                                        value.type,
                                        getDataPathRoute(value.url),
                                    ];
                                case DucklakeDataPathType.AZURE:
                                    if (getDataPathRoute(value.url) === null)
                                        return null;
                                    return [
                                        opaqueIdentity,
                                        value.type,
                                        getDataPathRoute(value.url),
                                        value.accountName ?? null,
                                    ];
                                case DucklakeDataPathType.LOCAL:
                                    return [value.type, value.path];
                                default:
                                    return assertUnreachable(
                                        value,
                                        'Unknown data path type',
                                    );
                            }
                        })();
                        if (dataPath === null) return null;
                        return [
                            ...(dataPath[0] === opaqueIdentity
                                ? [opaqueIdentity]
                                : []),
                            credentials.connectionType,
                            catalog,
                            dataPath,
                            credentials.schema,
                            credentials.catalogAlias ?? null,
                        ];
                    }
                    default:
                        return assertUnreachable(
                            credentials,
                            'Unknown DuckDB connection type',
                        );
                }
            default:
                return assertUnreachable(credentials, 'Unknown warehouse type');
        }
    })();
    const versions = getWarehouseCredentialVersions(credentials);
    if (identity === null) return null;
    const versionRequired =
        credentials.type !== WarehouseTypes.DUCKDB ||
        (credentials.connectionType !== DuckdbConnectionType.EMBEDDED &&
            credentials.connectionType !== DuckdbConnectionType.ANALYTICS);
    if (versionRequired && versions.length === 0) return null;
    return fingerprint([credentials.type, identity, versions]);
};

export const isSameResultCredentialOwner = (
    stored: QueryResultCredentialOwner,
    current: QueryResultCredentialOwner,
): boolean => {
    switch (stored.kind) {
        case 'shared_connection':
            return (
                current.kind === 'shared_connection' &&
                stored.identityFingerprint != null &&
                stored.identityFingerprint === current.identityFingerprint
            );
        case 'no_warehouse_data':
        case 'derived':
            return current.kind === stored.kind;
        case 'person':
            return (
                current.kind === 'person' &&
                stored.identityFingerprint != null &&
                stored.identityFingerprint === current.identityFingerprint &&
                stored.userUuid === current.userUuid &&
                stored.userWarehouseCredentialsUuid ===
                    current.userWarehouseCredentialsUuid
            );
        case 'ai_service_account':
            return (
                current.kind === 'ai_service_account' &&
                stored.credentialUuid === current.credentialUuid &&
                stored.generation === current.generation &&
                stored.sourceProjectUuid === current.sourceProjectUuid
            );
        case 'agent_sign_in':
            return (
                current.kind === 'agent_sign_in' &&
                stored.userUuid === current.userUuid &&
                stored.generation === current.generation
            );
        default:
            return assertUnreachable(stored, 'Unknown result credential owner');
    }
};

const getResultAgentId = (
    { act }: AgentIdentityClaim,
    authMethod: AuthType | null,
): string | null => {
    switch (act.surface) {
        case AgentActorSurface.IN_APP_AGENT:
            if (act.client_id === 'lightdash-autopilot')
                return act.agent_uuid ?? act.client_id;
            return act.client_id != null ? (act.agent_uuid ?? null) : null;
        case AgentActorSurface.SLACK_AGENT:
            return act.client_id != null ? (act.agent_uuid ?? null) : null;
        case AgentActorSurface.MCP:
            switch (authMethod) {
                case 'pat':
                    return act.client_id === null
                        ? 'personal_access_token'
                        : null;
                case 'session':
                case 'service-account':
                case 'jwt':
                    return act.client_id === null ? authMethod : null;
                case 'oauth':
                    return act.client_id ?? null;
                case null:
                    return null;
                default:
                    return assertUnreachable(
                        authMethod,
                        'Unknown authentication method',
                    );
            }
        case AgentActorSurface.API:
        case AgentActorSurface.CLI:
        case AgentActorSurface.DATA_APP:
        case AgentActorSurface.AI_SUMMARY:
            return act.client_id;
        default:
            return assertUnreachable(
                act.surface,
                'Unknown result agent surface',
            );
    }
};

export const isSameResultAgent = (
    stored: AgentIdentityClaim | null,
    current: AgentIdentityClaim,
    storedAuthMethod: AuthType | null = null,
    currentAuthMethod: AuthType | null = null,
): boolean =>
    stored !== null &&
    storedAuthMethod === currentAuthMethod &&
    getResultAgentId(current, currentAuthMethod) !== null &&
    getResultAgentId(stored, storedAuthMethod) ===
        getResultAgentId(current, currentAuthMethod) &&
    stored.sub === current.sub &&
    stored.subject.type === current.subject.type &&
    stored.subject.uuid === current.subject.uuid &&
    stored.act.sub === current.act.sub &&
    stored.act.surface === current.act.surface &&
    stored.act.client_id === current.act.client_id &&
    (stored.act.agent_uuid ?? null) === (current.act.agent_uuid ?? null);

export const isSameResultReader = (
    stored: QueryResultProducer,
    reader: QueryResultReader,
): boolean => {
    if (stored.authMethod == null || stored.authMethod !== reader.authMethod)
        return false;
    switch (reader.kind) {
        case 'person':
            return stored.agentIdentity === null;
        case 'agent':
            return isSameResultAgent(
                stored.agentIdentity,
                reader.claim,
                stored.authMethod,
                reader.authMethod,
            );
        default:
            return assertUnreachable(reader, 'Unknown result reader kind');
    }
};

export const isSameResultProducerOwner = (
    stored: QueryResultProducer,
    current: QueryResultProducer,
): boolean =>
    stored.version === current.version &&
    stored.authMethod === current.authMethod &&
    stored.warehouseConnectionUuid === current.warehouseConnectionUuid &&
    isSameResultCredentialOwner(
        stored.credentialOwner,
        current.credentialOwner,
    );

export const isSameResultProducer = (
    stored: QueryResultProducer,
    current: QueryResultProducer,
): boolean =>
    stored.entitlementFingerprint != null &&
    stored.entitlementFingerprint === current.entitlementFingerprint &&
    isSameResultProducerOwner(stored, current);
