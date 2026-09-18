import {
    assertUnreachable,
    BigqueryAuthenticationType,
    convertItemTypeToDimensionType,
    DatabricksAuthenticationType,
    DuckdbConnectionType,
    RedshiftAuthenticationType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type PhysicalOutputContract,
} from '@lightdash/common';
import { createHash } from 'crypto';
import { pick } from 'lodash';
import { type QueryComposer } from '../../../utils/QueryBuilder/QueryComposer';

// Changing compiler semantics requires a new version, even if the payload shape
// is unchanged. This is deliberately independent of the results-cache version.
export const PRE_AGGREGATE_COMPATIBILITY_VERSION = 1;

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
    columnLimit,
    format,
    resolvedAmbientPrincipal,
    unverifiedExecutionScope,
}: {
    composer: QueryComposer;
    warehouseCredentials: CreateWarehouseCredentials;
    columnLimit: number;
    format: 'parquet' | 'jsonl';
    resolvedAmbientPrincipal?: string;
    unverifiedExecutionScope?: string;
}) => {
    const compiled = composer.getMaterializationFingerprint({ columnLimit });
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
        timezone: composer.getTimezone(),
        timezoneAwareDateTrunc: composer.getUseTimezoneAwareDateTrunc(),
        parameters: composer.getUsedParameters(),
        warehouseOverride: composer.getExplore().warehouse,
        databricksCompute: composer.getExplore().databricksCompute,
    };
    // Consumed attributes are already represented in comparison SQL. Including
    // every attribute in compatibility would make the triggering actor matter.
    // The execution guard additionally pins access until warehouse submission.
    const pinnedContextHash =
        warehouse.verified || unverifiedExecutionScope
            ? hashPreAggregateCompatibility({
                  ...context,
                  access: composer.getUserAccessControls(),
                  unverifiedExecutionScope: warehouse.verified
                      ? undefined
                      : unverifiedExecutionScope,
              })
            : null;
    return {
        compatibilityHash:
            compiled.status === 'reusable' && warehouse.verified
                ? hashPreAggregateCompatibility({
                      version: PRE_AGGREGATE_COMPATIBILITY_VERSION,
                      compiled,
                      physicalOutputContract,
                      context,
                  })
                : null,
        physicalOutputContract,
        pinnedContextHash,
    };
};
