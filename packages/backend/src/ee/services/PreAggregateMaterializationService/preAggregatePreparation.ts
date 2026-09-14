import {
    assertUnreachable,
    BigqueryAuthenticationType,
    convertItemTypeToDimensionType,
    DatabricksAuthenticationType,
    DuckdbConnectionType,
    isAndFilterGroup,
    isFilterGroup,
    RedshiftAuthenticationType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CompiledField,
    type CompiledTable,
    type CreateWarehouseCredentials,
    type Explore,
    type FilterGroupItem,
    type FilterRule,
    type PhysicalOutputContract,
    type PreAggregateDef,
} from '@lightdash/common';
import { createHash } from 'crypto';
import { omit, pick } from 'lodash';
import { type QueryComposer } from '../../../utils/QueryBuilder/QueryComposer';

// Changing execution semantics requires a new version, even if the payload shape
// is unchanged. This is deliberately independent of the results-cache version.
export const PRE_AGGREGATE_COMPATIBILITY_VERSION = 2;

const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value)
                .filter(([, child]) => child !== undefined)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, child]) => [key, canonicalize(child)]),
        );
    }
    return value;
};

export const hashPreAggregateCompatibility = (payload: unknown): string =>
    createHash('sha256')
        .update(JSON.stringify(canonicalize(payload)))
        .digest('hex');

// Omit metadata only at its owning object, never recursively by key: parameter
// names and authored filter values may legitimately be "label", "format", or "id".
const presentationKeys = [
    'label',
    'tableLabel',
    'description',
    'format',
    'round',
    'compact',
    'groups',
    'groupLabel',
    'hidden',
    'urls',
    'colors',
    'tags',
    'aiHint',
    'spotlight',
    'customMeta',
    'ymlPath',
    'sqlPath',
] as const;

const withoutFilterId = <T extends { id: string }>(filter: T) =>
    omit(filter, 'id');

type DefinitionFilter =
    | Omit<FilterRule, 'id'>
    | {
          and: DefinitionFilter[];
      }
    | { or: DefinitionFilter[] };

const normalizeFilter = (filter: FilterGroupItem): DefinitionFilter => {
    if (!isFilterGroup(filter)) return withoutFilterId(filter);
    return isAndFilterGroup(filter)
        ? { ...omit(filter, 'id'), and: filter.and.map(normalizeFilter) }
        : { ...omit(filter, 'id'), or: filter.or.map(normalizeFilter) };
};

const normalizeField = (field: CompiledField) => ({
    ...omit(
        field,
        ...presentationKeys,
        'compiledSql',
        'compiledValueSql',
        'compiledRelativeDateFilters',
        'compiledTimestampFilters',
        'tablesReferences',
        'compiledSqlTemplate',
        'compiledValueSqlTemplate',
    ),
    ...(field.fieldType === 'metric'
        ? { filters: field.filters?.map(withoutFilterId) }
        : {}),
});

const normalizeTables = (tables: Record<string, CompiledTable>) =>
    Object.fromEntries(
        Object.entries(tables).map(([name, table]) => [
            name,
            {
                ...omit(
                    table,
                    ...presentationKeys,
                    'lineageGraph',
                    'uncompiledSqlWhere',
                ),
                sqlWhere: table.uncompiledSqlWhere ?? table.sqlWhere,
                requiredFilters: table.requiredFilters?.map(withoutFilterId),
                dimensions: Object.fromEntries(
                    Object.entries(table.dimensions).map(([key, field]) => [
                        key,
                        normalizeField(field),
                    ]),
                ),
                metrics: Object.fromEntries(
                    Object.entries(table.metrics).map(([key, field]) => [
                        key,
                        normalizeField(field),
                    ]),
                ),
            },
        ]),
    );

// Include the whole explore: always-joins, required filters and join paths can
// affect rows without appearing in the selected fields' tablesReferences.
const normalizeExplore = (explore: Explore) => ({
    ...omit(explore, ...presentationKeys, 'preAggregates'),
    tables: normalizeTables(explore.tables),
    unfilteredTables: explore.unfilteredTables
        ? normalizeTables(explore.unfilteredTables)
        : undefined,
    joinedTables: explore.joinedTables.map((join) =>
        omit(join, ...presentationKeys, 'compiledSqlOn', 'tablesReferences'),
    ),
});

/** Only allowlisted non-secret identity is compared; credential rotation is not
 * a query change. Opaque token identities cannot establish cross-deploy reuse. */
export const getWarehouseCompatibilityContext = (
    credentials: CreateWarehouseCredentials,
) => {
    const shared = pick(
        credentials,
        'type',
        'startOfWeek',
        'dataTimezone',
        'authenticationType',
    );
    switch (credentials.type) {
        case WarehouseTypes.BIGQUERY:
            return {
                verified:
                    (credentials.authenticationType ??
                        BigqueryAuthenticationType.PRIVATE_KEY) ===
                        BigqueryAuthenticationType.PRIVATE_KEY &&
                    (!credentials.keyfileContents.type ||
                        credentials.keyfileContents.type ===
                            'service_account') &&
                    Boolean(credentials.keyfileContents.client_email),
                values: {
                    ...shared,
                    ...pick(
                        credentials,
                        'project',
                        'dataset',
                        'executionProject',
                        'location',
                        'accessUrl',
                    ),
                    principal: credentials.keyfileContents.client_email,
                },
            };
        case WarehouseTypes.POSTGRES:
            return {
                verified: true,
                values: {
                    ...shared,
                    ...pick(
                        credentials,
                        'host',
                        'port',
                        'dbname',
                        'schema',
                        'user',
                        'role',
                        'searchPath',
                        'useSshTunnel',
                        'sshTunnelHost',
                        'sshTunnelPort',
                        'sshTunnelUser',
                    ),
                },
            };
        case WarehouseTypes.REDSHIFT:
            return {
                verified:
                    (credentials.authenticationType ??
                        RedshiftAuthenticationType.PASSWORD) ===
                        RedshiftAuthenticationType.PASSWORD &&
                    Boolean(credentials.user),
                values: {
                    ...shared,
                    ...pick(
                        credentials,
                        'host',
                        'port',
                        'dbname',
                        'schema',
                        'user',
                        'ra3Node',
                        'region',
                        'isServerless',
                        'autoCreate',
                        'dbGroups',
                        'assumeRoleArn',
                        'clusterIdentifier',
                        'workgroupName',
                        'useSshTunnel',
                        'sshTunnelHost',
                        'sshTunnelPort',
                        'sshTunnelUser',
                    ),
                },
            };
        case WarehouseTypes.SNOWFLAKE:
            return {
                verified:
                    credentials.authenticationType !==
                        SnowflakeAuthenticationType.SSO &&
                    credentials.authenticationType !==
                        SnowflakeAuthenticationType.EXTERNAL_BROWSER &&
                    credentials.authenticationType !==
                        SnowflakeAuthenticationType.OAUTH_AUTHORIZATION_CODE &&
                    Boolean(credentials.user),
                values: {
                    ...shared,
                    ...pick(
                        credentials,
                        'account',
                        'user',
                        'role',
                        'database',
                        'schema',
                        'warehouse',
                        'quotedIdentifiersIgnoreCase',
                        'disableTimestampConversion',
                        'override',
                        'accessUrl',
                    ),
                },
            };
        case WarehouseTypes.TRINO:
            return {
                verified: true,
                values: {
                    ...shared,
                    ...pick(
                        credentials,
                        'host',
                        'port',
                        'dbname',
                        'schema',
                        'user',
                        'http_scheme',
                        'source',
                    ),
                },
            };
        case WarehouseTypes.CLICKHOUSE:
            return {
                verified: true,
                values: {
                    ...shared,
                    ...pick(
                        credentials,
                        'host',
                        'port',
                        'schema',
                        'user',
                        'secure',
                    ),
                },
            };
        case WarehouseTypes.DATABRICKS:
            return {
                verified:
                    credentials.authenticationType ===
                        DatabricksAuthenticationType.OAUTH_M2M &&
                    Boolean(credentials.oauthClientId),
                values: {
                    ...shared,
                    ...pick(
                        credentials,
                        'catalog',
                        'database',
                        'serverHostName',
                        'httpPath',
                        'compute',
                        'oauthClientId',
                    ),
                },
            };
        case WarehouseTypes.ATHENA:
            return {
                verified: Boolean(credentials.assumeRoleArn),
                values: {
                    ...shared,
                    ...pick(
                        credentials,
                        'region',
                        'database',
                        'schema',
                        'assumeRoleArn',
                        'workGroup',
                        's3StagingDir',
                    ),
                },
            };
        case WarehouseTypes.DUCKDB:
            switch (credentials.connectionType) {
                case DuckdbConnectionType.EMBEDDED:
                    return {
                        verified: true,
                        values: {
                            ...shared,
                            ...pick(
                                credentials,
                                'connectionType',
                                'dataset',
                                'schema',
                            ),
                        },
                    };
                case DuckdbConnectionType.MOTHERDUCK:
                case DuckdbConnectionType.DUCKLAKE:
                case DuckdbConnectionType.ANALYTICS:
                    return {
                        verified: false,
                        values: {
                            ...shared,
                            connectionType: credentials.connectionType,
                        },
                    };
                default:
                    return assertUnreachable(
                        credentials,
                        'Unknown DuckDB connection',
                    );
            }
        default:
            return assertUnreachable(credentials, 'Unknown warehouse');
    }
};

export const prepareMaterializationFingerprint = ({
    composer,
    warehouseCredentials,
    preAggregateDef,
    format,
    resolvedAmbientPrincipal,
    unverifiedExecutionScope,
}: {
    composer: QueryComposer;
    warehouseCredentials: CreateWarehouseCredentials;
    preAggregateDef: PreAggregateDef;
    format: 'parquet' | 'jsonl';
    resolvedAmbientPrincipal?: string;
    unverifiedExecutionScope?: string;
}) => {
    const query = composer.getMetricQuery();
    const definition = {
        preAggregate: {
            ...omit(preAggregateDef, 'refresh'),
            filters: preAggregateDef.filters?.map(withoutFilterId),
        },
        explore: normalizeExplore(composer.getExplore()),
        query: {
            ...query,
            additionalMetrics: query.additionalMetrics?.map((metric) => ({
                ...omit(metric, ...presentationKeys),
                filters: metric.filters?.map(withoutFilterId),
            })),
            filters: Object.fromEntries(
                Object.entries(query.filters).map(([key, group]) => [
                    key,
                    group ? normalizeFilter(group) : undefined,
                ]),
            ),
        },
    };
    const configuredWarehouse =
        getWarehouseCompatibilityContext(warehouseCredentials);
    const warehouse =
        resolvedAmbientPrincipal &&
        (warehouseCredentials.type === WarehouseTypes.DATABRICKS ||
            (warehouseCredentials.type === WarehouseTypes.BIGQUERY &&
                warehouseCredentials.authenticationType ===
                    BigqueryAuthenticationType.ADC))
            ? {
                  verified: true,
                  values: {
                      ...configuredWarehouse.values,
                      principal: resolvedAmbientPrincipal,
                  },
              }
            : configuredWarehouse;
    const physicalOutputContract: PhysicalOutputContract = {
        columns: Object.entries(composer.getFields()).map(([name, field]) => ({
            name,
            type: convertItemTypeToDimensionType(field),
        })),
        grain: composer.getMetricQuery().dimensions,
        format,
    };
    const context = {
        warehouse: warehouse.values,
        access: composer.getUserAccessControls(),
        timezone: composer.getTimezone(),
        timezoneAwareDateTrunc: composer.getUseTimezoneAwareDateTrunc(),
        parameters: composer.getUsedParameters(),
        parameterDefinitions: composer.getAvailableParameterDefinitions(),
        warehouseOverride: composer.getExplore().warehouse,
        databricksCompute: composer.getExplore().databricksCompute,
    };
    // Pin the complete definition as well as access until warehouse submission.
    const pinnedContextHash =
        warehouse.verified || unverifiedExecutionScope
            ? hashPreAggregateCompatibility({
                  ...context,
                  version: PRE_AGGREGATE_COMPATIBILITY_VERSION,
                  definition,
                  physicalOutputContract,
                  unverifiedExecutionScope: warehouse.verified
                      ? undefined
                      : unverifiedExecutionScope,
              })
            : null;
    return {
        compatibilityHash:
            warehouse.verified &&
            composer.getUserAccessControls() !== undefined &&
            composer.compile().compilationErrors.length === 0 &&
            composer.getMissingParameterReferences().length === 0
                ? hashPreAggregateCompatibility({
                      version: PRE_AGGREGATE_COMPATIBILITY_VERSION,
                      definition,
                      physicalOutputContract,
                      context,
                  })
                : null,
        physicalOutputContract,
        pinnedContextHash,
    };
};
