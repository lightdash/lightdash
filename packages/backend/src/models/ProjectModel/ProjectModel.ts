import {
    AgentSqlScope,
    AlreadyExistsError,
    AnyType,
    AthenaAuthenticationType,
    BigqueryAuthenticationType,
    CompiledTable,
    Connection,
    CreateProject,
    CreateProjectOptionalCredentials,
    CreateSnowflakeCredentials,
    createVirtualView,
    CreateVirtualViewPayload,
    CreateWarehouseCredentials,
    CreateWarehouseCredentialsWithOptionalSecrets,
    DbtProjectConfig,
    DEFAULT_USER_SPACES_PARENT_NAME,
    DuckdbConnectionType,
    Explore,
    ExploreError,
    ExploreSplitError,
    ExploreType,
    ExternalSourceScope,
    generateSlug,
    getExploreSplitCandidates,
    getLtreePathFromSlug,
    GroupType,
    IdContentMapping,
    isExploreError,
    isUserManagedExplore,
    MultipleConnectionsError,
    normalizeWarehouseCredentials,
    NotFoundError,
    OrganizationMemberRole,
    OrganizationProject,
    ParameterError,
    PreviewContentMapping,
    Project,
    ProjectDefaults,
    ProjectGroupAccess,
    ProjectMemberProfile,
    ProjectMemberRole,
    ProjectSummary,
    ProjectType,
    sensitiveCredentialsFieldNames,
    sensitiveDbtCredentialsFieldNames,
    ServiceAccountProjectAccessInput,
    ServiceAccountProjectGrant,
    ServiceAccountScope,
    SnowflakeAuthenticationType,
    SpaceMemberRole,
    SpaceSummary,
    stripDucklakeNestedSensitive,
    SupportedDbtVersions,
    TablesConfiguration,
    UnexpectedServerError,
    UpdateMetadata,
    UpdateProject,
    UpdateProjectDetails,
    UpdateQueryTimezoneSettings,
    UpdateSchedulerSettings,
    UpdateVirtualViewPayload,
    USER_MANAGED_EXPLORE_TYPES,
    WarehouseClient,
    WarehouseCredentials,
    WarehouseTypes,
    type SummaryExplore,
} from '@lightdash/common';
import {
    buildMotherduckConnectionString,
    MotherduckInstanceCache,
    WarehouseCatalog,
    warehouseClientFromCredentials,
} from '@lightdash/warehouses';
import { Knex } from 'knex';
import isEqual from 'lodash/isEqual';
import NodeCache from 'node-cache';
import { DatabaseError } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { LightdashConfig } from '../../config/parseConfig';
import {
    CatalogTableName,
    MetricsTreeEdgesTableName,
    MetricsTreeNodesTableName,
    MetricsTreesTableName,
} from '../../database/entities/catalog';
import { DashboardTileCommentsTableName } from '../../database/entities/comments';
import {
    DashboardsTableName,
    DashboardTabsTableName,
    DashboardTileChartTableName,
    DashboardTileDataAppsTableName,
    DashboardTileHeadingsTableName,
    DashboardTileLoomsTableName,
    DashboardTileMarkdownsTableName,
    DashboardTileSqlChartTableName,
    DashboardTilesTableName,
    DashboardVersionsTableName,
    DashboardViewsTableName,
    DbDashboard,
    DbDashboardTabs,
} from '../../database/entities/dashboards';
import { DashboardSlugMappingsTableName } from '../../database/entities/dashboardSlugMappings';
import {
    ExternalSourcesTableName,
    ExternalSourceTablesTableName,
} from '../../database/entities/externalSources';
import { GroupMembershipTableName } from '../../database/entities/groupMemberships';
import { GroupTableName } from '../../database/entities/groups';
import { OrganizationMembershipCustomRolesTableName } from '../../database/entities/organizationMembershipCustomRoles';
import { OrganizationMembershipsTableName } from '../../database/entities/organizationMemberships';
import {
    DbOrganization,
    OrganizationTableName,
} from '../../database/entities/organizations';
import {
    PinnedChartTableName,
    PinnedDashboardTableName,
    PinnedListTableName,
    PinnedSpaceTableName,
} from '../../database/entities/pinnedList';
import { ProjectGroupAccessTableName } from '../../database/entities/projectGroupAccess';
import { ProjectGroupAccessCustomRolesTableName } from '../../database/entities/projectGroupAccessCustomRoles';
import { ProjectMembershipCustomRolesTableName } from '../../database/entities/projectMembershipCustomRoles';
import {
    DbProjectMembership,
    ProjectMembershipsTableName,
} from '../../database/entities/projectMemberships';
import {
    ProjectConnectionManifestsTable,
    ProjectMergedManifestsTable,
} from '../../database/entities/projectMergedManifests';
import {
    CachedExploresTableName,
    CachedExploreStagingTableName,
    CachedExploreTableName,
    CachedWarehouseTableName,
    DbCachedWarehouse,
    DbProject,
    ProjectConnectionCatalogCacheTableName,
    ProjectTableName,
    type DbCachedExplore,
    type DbCachedExploreStaging,
} from '../../database/entities/projects';
import { RolesTableName } from '../../database/entities/roles';
import {
    DbSavedChart,
    InsertChart,
    SavedChartCustomSqlDimensionsTableName,
    SavedChartsTableName,
} from '../../database/entities/savedCharts';
import { SavedChartSlugMappingsTableName } from '../../database/entities/savedChartSlugMappings';
import {
    DbSavedSql,
    InsertSql,
    SavedSqlTableName,
    SavedSqlVersionsTableName,
} from '../../database/entities/savedSql';
import {
    DbSpace,
    SpaceTableName,
    SpaceUserAccessTableName,
} from '../../database/entities/spaces';
import { TagsTableName } from '../../database/entities/tags';
import { DbUser, UserTableName } from '../../database/entities/users';
import {
    WarehouseCredentialTableName,
    warehouseTypeDisplayNames,
} from '../../database/entities/warehouseCredentials';
import {
    AiPromptTableName,
    AiThreadTableName,
    AiWebAppThreadTableName,
} from '../../ee/database/entities/ai';
import {
    AiAgentGroupAccessTableName,
    AiAgentInstructionVersionsTableName,
    AiAgentIntegrationTableName,
    AiAgentSlackIntegrationTableName,
    AiAgentTableName,
    AiAgentUserAccessTableName,
    type DbAiAgent,
} from '../../ee/database/entities/aiAgent';
import {
    AiDeepResearchEventsTableName,
    AiDeepResearchRunsTableName,
} from '../../ee/database/entities/aiDeepResearch';
import { ServiceAccountsTableName } from '../../ee/database/entities/serviceAccounts';
import {
    newExploreCacheReadContext,
    summarizeExploreCacheRead,
    type ExploreCacheReadContext,
} from '../../logging/exploreCacheReadMetrics';
import Logger from '../../logging/logger';
import { measureTime } from '../../logging/measureTime';
import { wrapSentryTransaction, wrapSentryTransactionSync } from '../../utils';
import {
    chunkAsyncRowsByBytes,
    chunkRowsByBytes,
} from '../../utils/chunkRowsByBytes';
import {
    hasSameDbtCredentialDestination,
    hasSameWarehouseCredentialDestination,
} from '../../utils/credentialDestination';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import {
    acquireProjectSlugLock,
    generateUniqueProjectSlug,
    generateUniqueSlugScopedToProject,
} from '../../utils/SlugUtils';
import { ConnectionModel } from '../ConnectionModel/ConnectionModel';
import { clearProjectExtraRoles } from '../roleSetUtils';
import { omitProjectUuid, replaceProjectUuid } from './previewContent';
import Transaction = Knex.Transaction;

export type ProjectModelArguments = {
    database: Knex;
    lightdashConfig: LightdashConfig;
    encryptionUtil: EncryptionUtil;
};

const CACHED_EXPLORES_PG_LOCK_NAMESPACE = 1;
// Initialize cache for warehouse credentials with 30 seconds TTL
const warehouseCredentialsCache =
    process.env.EXPERIMENTAL_CACHE === 'true'
        ? new NodeCache({
              stdTTL: 30, // time to live in seconds
              checkperiod: 60, // cleanup interval in seconds
          })
        : undefined;

type WarehouseCredentialsCacheEntry = {
    revision: string;
    credentials: CreateWarehouseCredentials;
};

const getWarehouseCredentialsCacheKey = (
    projectUuid: string,
    connectionUuid: string,
) => `${projectUuid}:${connectionUuid}`;

const deleteWarehouseCredentialsCacheForProject = (projectUuid: string) => {
    warehouseCredentialsCache
        ?.keys()
        .filter((key) => key.startsWith(`${projectUuid}:`))
        .forEach((key) => warehouseCredentialsCache.del(key));
};

const INSERT_BATCH_SIZE = 1000;

const getMotherduckConnectionString = (
    credentials: CreateWarehouseCredentials,
): string | undefined =>
    credentials.type === WarehouseTypes.DUCKDB &&
    credentials.connectionType === DuckdbConnectionType.MOTHERDUCK
        ? buildMotherduckConnectionString(credentials)
        : undefined;

const normalizeAdditionalDatabases = (databases: string[] = []): string[] => [
    ...new Set(databases.map((database) => database.trim()).filter(Boolean)),
];

const getExploreStoredConnectionUuid = (
    explore: Explore | ExploreError,
): string | null =>
    explore.tables?.[explore.baseTable ?? explore.name]?.connectionUuid ?? null;

const stampExploreConnectionUuid = (
    explore: Explore | ExploreError,
    connectionUuid?: string | null,
) => {
    const baseTable = explore.tables?.[explore.baseTable ?? explore.name];
    if (baseTable && connectionUuid) {
        baseTable.connectionUuid = connectionUuid;
    }
};

async function chunkedInsertReturning<T extends Record<string, unknown>>(
    trx: Transaction,
    tableName: string,
    rows: Record<string, unknown>[],
): Promise<T[]> {
    const results: T[] = [];
    for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
        const batch = rows.slice(i, i + INSERT_BATCH_SIZE);
        // eslint-disable-next-line no-await-in-loop -- chunked inserts must run sequentially to bound payload size
        const inserted = await trx(tableName).insert(batch).returning('*');
        results.push(...(inserted as T[]));
    }
    return results;
}

type RawSummaryRow = {
    name: Explore['name'];
    label: Explore['label'];
    tags: Explore['tags'];
    groupLabel: Explore['groupLabel'] | null;
    groups: Explore['groups'] | null;
    type: Explore['type'] | null;
    preAggregateSource: Explore['preAggregateSource'] | null;
    externalSource: Explore['externalSource'] | null;
    errors: ExploreError['errors'] | null; // Fatal errors from ExploreError
    warnings: Explore['warnings'] | null; // Non-fatal warnings from partial compilation
    baseTable: Explore['baseTable'];
    baseTableDatabase: Explore['tables'][string]['database'];
    baseTableSchema: Explore['tables'][string]['schema'];
    baseTableDescription: Explore['tables'][string]['description'] | null;
    connectionUuid: string | null;
    baseTableRequiredAttributes:
        | Explore['tables'][string]['requiredAttributes']
        | null;
    baseTableAnyAttributes: Explore['tables'][string]['anyAttributes'] | null;
    aiHint: Explore['aiHint'] | null;
    customMeta: Explore['customMeta'] | null;
};

export type ExploreTableSummary = Pick<
    CompiledTable,
    | 'name'
    | 'originalName'
    | 'database'
    | 'schema'
    | 'description'
    | 'sqlTable'
    | 'ymlPath'
    | 'dbtSourceUuid'
>;

export type ExploreTableSummaryRecord = {
    name: string;
    type: ExploreType | undefined;
    baseTable: string;
    tables: Record<string, ExploreTableSummary>;
} & ({ errors: true } | { errors?: never });

type RawExploreTableSummaryRow = {
    exploreName: string;
    exploreType: ExploreType | null;
    baseTable: string | null;
    hasErrors: boolean;
    tableKey: string | null;
    tableName: unknown;
    originalName: unknown;
    database: unknown;
    schema: unknown;
    description: unknown;
    hasDescription: boolean;
    sqlTable: unknown;
    ymlPath: unknown;
    dbtSourceUuid: unknown;
};

type CachedExploreStorageStats = {
    exploreCount: number;
    totalBytes: number;
};

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const toOptionalJsonScalarText = (value: unknown): string | undefined =>
    value == null ? undefined : String(value);

export const toPreviewConnectionUuid = (
    connectionUuid: string | null,
    connectionUuidMap: Map<string, string>,
): string | null => {
    if (connectionUuid === null) return null;
    const previewConnectionUuid = connectionUuidMap.get(connectionUuid);
    if (previewConnectionUuid === undefined) {
        throw new ParameterError(
            `The preview has no copy of connection ${connectionUuid}`,
        );
    }
    return previewConnectionUuid;
};

export const toExploreTableSummaryRecord = (
    explore: unknown,
): ExploreTableSummaryRecord | undefined => {
    if (!isJsonObject(explore) || typeof explore.name !== 'string') {
        return undefined;
    }

    const tables = Object.create(null) as Record<string, ExploreTableSummary>;
    if (isJsonObject(explore.tables)) {
        Object.entries(explore.tables).forEach(([tableKey, table]) => {
            if (!isJsonObject(table)) {
                return;
            }
            tables[tableKey] = {
                name: (table.name ?? null) as string,
                database: (table.database ?? null) as string,
                schema: (table.schema ?? null) as string,
                sqlTable: (table.sqlTable ?? null) as string,
                ...(table.originalName
                    ? { originalName: table.originalName as string }
                    : {}),
                ...(Object.hasOwn(table, 'description')
                    ? { description: table.description as string }
                    : {}),
                ...(table.ymlPath ? { ymlPath: table.ymlPath as string } : {}),
                ...(table.dbtSourceUuid == null
                    ? {}
                    : { dbtSourceUuid: table.dbtSourceUuid as string }),
            };
        });
    }

    return {
        name: explore.name,
        type: toOptionalJsonScalarText(explore.type) as ExploreType | undefined,
        baseTable: toOptionalJsonScalarText(explore.baseTable) ?? '',
        tables,
        ...(Object.hasOwn(explore, 'errors') ? { errors: true as const } : {}),
    };
};

export const reduceExploreTableSummaryRows = (
    rows: RawExploreTableSummaryRow[],
): Record<string, ExploreTableSummaryRecord> =>
    rows.reduce<Record<string, ExploreTableSummaryRecord>>(
        (acc, row) => {
            const explore = acc[row.exploreName] ?? {
                name: row.exploreName,
                type: row.exploreType ?? undefined,
                baseTable: row.baseTable ?? '',
                tables: Object.create(null) as Record<
                    string,
                    ExploreTableSummary
                >,
                ...(row.hasErrors ? { errors: true as const } : {}),
            };

            if (row.tableKey !== null) {
                explore.tables[row.tableKey] = {
                    name: row.tableName as string,
                    database: row.database as string,
                    schema: row.schema as string,
                    sqlTable: row.sqlTable as string,
                    ...(row.originalName
                        ? { originalName: row.originalName as string }
                        : {}),
                    ...(row.hasDescription
                        ? { description: row.description as string }
                        : {}),
                    ...(row.ymlPath ? { ymlPath: row.ymlPath as string } : {}),
                    ...(row.dbtSourceUuid === null
                        ? {}
                        : { dbtSourceUuid: row.dbtSourceUuid as string }),
                };
            }

            acc[row.exploreName] = explore;
            return acc;
        },
        Object.create(null) as Record<string, ExploreTableSummaryRecord>,
    );

type PreviewChartUuidMapping = {
    sourceChartUuid: string;
    previewChartUuid: string;
};

export class ProjectModel {
    /** Serializes create-or-get across API pods without relying on a slug. */
    async runInAnalyticsProvisioningLock<T>(
        organizationUuid: string,
        callback: () => Promise<T>,
    ): Promise<T> {
        return this.database.transaction(async (trx) => {
            const organization = await trx(OrganizationTableName)
                .where('organization_uuid', organizationUuid)
                .select('organization_id')
                .first();
            if (!organization)
                throw new NotFoundError('Cannot find organization');
            await trx.raw('SELECT pg_advisory_xact_lock(?, ?)', [
                19350431,
                organization.organization_id,
            ]);
            return callback();
        });
    }

    protected database: Knex;

    protected lightdashConfig: LightdashConfig;

    private encryptionUtil: EncryptionUtil;

    private connectionModel: ConnectionModel;

    constructor(args: ProjectModelArguments) {
        this.database = args.database;
        this.lightdashConfig = args.lightdashConfig;
        this.encryptionUtil = args.encryptionUtil;
        this.connectionModel = new ConnectionModel({
            database: args.database,
            encryptionUtil: args.encryptionUtil,
        });
    }

    private async resolveConnectionScope(
        projectUuid: string,
        connectionUuid?: string | null,
    ): Promise<{ connection: Connection; isSole: boolean }> {
        const connections =
            await this.connectionModel.listByProject(projectUuid);
        if (connectionUuid) {
            const connection = await this.resolveConnection(
                projectUuid,
                connectionUuid,
            );
            return { connection, isSole: connections.length === 1 };
        }
        if (connections.length === 0) {
            throw new NotFoundError(
                'Cannot find any warehouse credentials for project.',
            );
        }
        if (connections.length > 1) throw new MultipleConnectionsError();
        return {
            connection: await this.resolveConnection(projectUuid),
            isSole: true,
        };
    }

    async resolveConnection(
        projectUuid: string,
        connectionUuid?: string | null,
    ): Promise<Connection> {
        return connectionUuid
            ? this.connectionModel.getByUuid(projectUuid, connectionUuid)
            : this.connectionModel.resolveSole(projectUuid);
    }

    /**
     * Resolves a portable connection name from a content-as-code definition.
     * Without a name the project must have exactly one connection, so an
     * import never silently lands on the wrong warehouse.
     */
    async resolveConnectionByName(
        projectUuid: string,
        connectionName?: string,
    ): Promise<Connection> {
        const connections =
            await this.connectionModel.listByProject(projectUuid);
        if (connections.length === 0) {
            throw new NotFoundError(
                'Cannot find any warehouse credentials for project.',
            );
        }
        const available = connections.map(({ name }) => `"${name}"`).join(', ');
        if (connectionName === undefined) {
            if (connections.length > 1) {
                throw new ParameterError(
                    `This project has several connections. Name one in the definition: ${available}.`,
                );
            }
            return connections[0];
        }
        const match = connections.find(({ name }) => name === connectionName);
        if (match === undefined) {
            throw new ParameterError(
                `Connection "${connectionName}" does not exist in this project. Available connections: ${available}.`,
            );
        }
        return match;
    }

    async getConnectionNamesByUuid(
        projectUuid: string,
    ): Promise<Map<string, string>> {
        const connections =
            await this.connectionModel.listByProject(projectUuid);
        return new Map(
            connections.map(({ connectionUuid, name }) => [
                connectionUuid,
                name,
            ]),
        );
    }

    async upsertMergedManifest(
        projectUuid: string,
        manifest: Buffer,
        connectionUuid?: string,
    ): Promise<void> {
        const { connection, isSole } = await this.resolveConnectionScope(
            projectUuid,
            connectionUuid,
        );
        await this.database.transaction(async (trx) => {
            await ProjectConnectionManifestsTable(trx)
                .insert({
                    project_uuid: projectUuid,
                    connection_uuid: connection.connectionUuid,
                    manifest,
                    created_at: trx.fn.now() as unknown as Date,
                })
                .onConflict(['project_uuid', 'connection_uuid'])
                .merge({
                    manifest,
                    created_at: trx.fn.now() as unknown as Date,
                });
            if (isSole) {
                await ProjectMergedManifestsTable(trx)
                    .insert({
                        project_uuid: projectUuid,
                        manifest,
                        created_at: trx.fn.now() as unknown as Date,
                    })
                    .onConflict('project_uuid')
                    .merge({
                        manifest,
                        created_at: trx.fn.now() as unknown as Date,
                    });
            }
        });
    }

    async getMergedManifest(
        projectUuid: string,
        connectionUuid?: string,
    ): Promise<Buffer> {
        const { connection, isSole } = await this.resolveConnectionScope(
            projectUuid,
            connectionUuid,
        );
        const artifact = await ProjectConnectionManifestsTable(this.database)
            .select('manifest')
            .where('project_uuid', projectUuid)
            .where('connection_uuid', connection.connectionUuid)
            .first();
        if (artifact) return artifact.manifest;

        if (isSole) {
            const legacyArtifact = await ProjectMergedManifestsTable(
                this.database,
            )
                .select('manifest')
                .where('project_uuid', projectUuid)
                .first();
            if (legacyArtifact) return legacyArtifact.manifest;
        }

        throw new NotFoundError(
            'No merged dbt manifest has been persisted for this project',
        );
    }

    async replaceMergedManifests(
        projectUuid: string,
        manifests: { connectionUuid: string; manifest: Buffer }[],
    ): Promise<void> {
        const connections =
            await this.connectionModel.listByProject(projectUuid);
        const liveConnectionUuids = new Set(
            connections.map(({ connectionUuid }) => connectionUuid),
        );
        if (
            manifests.some(
                ({ connectionUuid }) =>
                    !liveConnectionUuids.has(connectionUuid),
            )
        ) {
            throw new NotFoundError('Connection not found');
        }

        await this.database.transaction(async (trx) => {
            await ProjectConnectionManifestsTable(trx)
                .where('project_uuid', projectUuid)
                .delete();
            if (manifests.length > 0) {
                await ProjectConnectionManifestsTable(trx).insert(
                    manifests.map(({ connectionUuid, manifest }) => ({
                        project_uuid: projectUuid,
                        connection_uuid: connectionUuid,
                        manifest,
                        created_at: trx.fn.now() as unknown as Date,
                    })),
                );
            }
            if (connections.length === 1) {
                const soleManifest = manifests.find(
                    ({ connectionUuid }) =>
                        connectionUuid === connections[0].connectionUuid,
                );
                if (soleManifest) {
                    await ProjectMergedManifestsTable(trx)
                        .insert({
                            project_uuid: projectUuid,
                            manifest: soleManifest.manifest,
                            created_at: trx.fn.now() as unknown as Date,
                        })
                        .onConflict('project_uuid')
                        .merge({
                            manifest: soleManifest.manifest,
                            created_at: trx.fn.now() as unknown as Date,
                        });
                } else {
                    await ProjectMergedManifestsTable(trx)
                        .where('project_uuid', projectUuid)
                        .delete();
                }
            }
        });
    }

    async deleteMergedManifest(projectUuid: string): Promise<void> {
        await this.database.transaction(async (trx) => {
            await ProjectConnectionManifestsTable(trx)
                .where('project_uuid', projectUuid)
                .delete();
            await ProjectMergedManifestsTable(trx)
                .where('project_uuid', projectUuid)
                .delete();
        });
    }

    static mergeMissingDbtConfigSecrets(
        incompleteConfig: DbtProjectConfig,
        completeConfig: DbtProjectConfig,
    ): DbtProjectConfig {
        if (
            !hasSameDbtCredentialDestination(incompleteConfig, completeConfig)
        ) {
            return incompleteConfig;
        }
        return {
            ...incompleteConfig,
            ...sensitiveDbtCredentialsFieldNames.reduce(
                (sum, secretKey) =>
                    !(incompleteConfig as AnyType)[secretKey] &&
                    (completeConfig as AnyType)[secretKey]
                        ? {
                              ...sum,
                              [secretKey]: (completeConfig as AnyType)[
                                  secretKey
                              ],
                          }
                        : sum,
                {},
            ),
        };
    }

    static mergeMissingWarehouseSecrets<
        T extends CreateWarehouseCredentialsWithOptionalSecrets =
            CreateWarehouseCredentials,
    >(incompleteConfig: T, completeConfig: CreateWarehouseCredentials): T {
        if (
            !hasSameWarehouseCredentialDestination(
                incompleteConfig,
                completeConfig,
            ) ||
            // BigQuery ADC authentication does not require credentials to be set
            (incompleteConfig.type === WarehouseTypes.BIGQUERY &&
                incompleteConfig.authenticationType ===
                    BigqueryAuthenticationType.ADC) ||
            // Athena IAM role authentication should not merge old access keys
            (incompleteConfig.type === WarehouseTypes.ATHENA &&
                incompleteConfig.authenticationType ===
                    AthenaAuthenticationType.IAM_ROLE)
        ) {
            return incompleteConfig;
        }
        // DuckLake nests secrets inside catalog/dataPath — see stripDucklakeNestedSensitive.
        if (
            incompleteConfig.type === WarehouseTypes.DUCKDB &&
            completeConfig.type === WarehouseTypes.DUCKDB &&
            incompleteConfig.connectionType === DuckdbConnectionType.DUCKLAKE &&
            completeConfig.connectionType === DuckdbConnectionType.DUCKLAKE
        ) {
            const mergeNested = (
                incomplete: Record<string, AnyType>,
                complete: Record<string, AnyType>,
                fields: readonly string[],
            ): Record<string, AnyType> => {
                if (incomplete.type !== complete.type) return incomplete;
                const result = { ...incomplete };
                fields.forEach((f) => {
                    const cur = result[f];
                    if ((cur === undefined || cur === '') && complete[f]) {
                        result[f] = complete[f];
                    }
                });
                return result;
            };
            const mergedCatalog = mergeNested(
                incompleteConfig.catalog as Record<string, AnyType>,
                completeConfig.catalog as Record<string, AnyType>,
                ['user', 'password'],
            );
            const mergedDataPath = mergeNested(
                incompleteConfig.dataPath as Record<string, AnyType>,
                completeConfig.dataPath as Record<string, AnyType>,
                [
                    'accessKeyId',
                    'secretAccessKey',
                    'hmacKeyId',
                    'hmacSecret',
                    'connectionString',
                    'accountKey',
                ],
            );
            return {
                ...incompleteConfig,
                catalog: mergedCatalog,
                dataPath: mergedDataPath,
            } as T;
        }
        return {
            ...incompleteConfig,
            ...sensitiveCredentialsFieldNames.reduce((sum, secretKey) => {
                const newConfigSecretValue = (incompleteConfig as AnyType)[
                    secretKey
                ];
                const isSecretMissingInNewConfig =
                    newConfigSecretValue === undefined ||
                    newConfigSecretValue === ''; // Null values are not considered missing
                const isSecretPresentInSavedConfig = !!(
                    completeConfig as AnyType
                )[secretKey];
                if (
                    isSecretMissingInNewConfig &&
                    isSecretPresentInSavedConfig
                ) {
                    // merge missing secret
                    return {
                        ...sum,
                        [secretKey]: (completeConfig as AnyType)[secretKey],
                    };
                }
                return sum;
            }, {}),
        };
    }

    static mergeMissingProjectConfigSecrets(
        incompleteProjectConfig: UpdateProject & {
            warehouseConnection: CreateWarehouseCredentials;
        },
        completeProjectConfig: Project & {
            warehouseConnection?: CreateWarehouseCredentials;
        },
    ): UpdateProject & { warehouseConnection: CreateWarehouseCredentials };
    static mergeMissingProjectConfigSecrets(
        incompleteProjectConfig: UpdateProject,
        completeProjectConfig: Project & {
            warehouseConnection?: CreateWarehouseCredentials;
        },
    ): UpdateProject;
    static mergeMissingProjectConfigSecrets(
        incompleteProjectConfig: UpdateProject,
        completeProjectConfig: Project & {
            warehouseConnection?: CreateWarehouseCredentials;
        },
    ): UpdateProject {
        const incomingWarehouse = incompleteProjectConfig.warehouseConnection;
        const savedWarehouse = completeProjectConfig.warehouseConnection;
        if (!incomingWarehouse) {
            return {
                ...incompleteProjectConfig,
                dbtConnection: ProjectModel.mergeMissingDbtConfigSecrets(
                    incompleteProjectConfig.dbtConnection,
                    completeProjectConfig.dbtConnection,
                ),
            };
        }

        // CLI credential refreshes omit project-only settings. Preserve the
        // opt-in unless the update explicitly enables or disables it.
        const warehouseConnection =
            incomingWarehouse.type === WarehouseTypes.BIGQUERY &&
            savedWarehouse?.type === WarehouseTypes.BIGQUERY
                ? {
                      ...incomingWarehouse,
                      allowUserCredentials:
                          incomingWarehouse.allowUserCredentials ??
                          savedWarehouse.allowUserCredentials,
                  }
                : incomingWarehouse;
        return {
            ...incompleteProjectConfig,
            dbtConnection: ProjectModel.mergeMissingDbtConfigSecrets(
                incompleteProjectConfig.dbtConnection,
                completeProjectConfig.dbtConnection,
            ),
            warehouseConnection: savedWarehouse
                ? ProjectModel.mergeMissingWarehouseSecrets(
                      warehouseConnection,
                      savedWarehouse,
                  )
                : warehouseConnection,
        };
    }

    async getSingleProjectUuidInInstance(): Promise<string> {
        const projects = await this.database('projects').select('*');
        if (projects.length === 0) {
            throw new NotFoundError('Cannot find project');
        }
        if (projects.length > 1) {
            throw new ParameterError(
                'There are multiple projects in the instance',
            );
        }
        return projects[0].project_uuid;
    }

    async getDbtSourceIdentity(projectUuid: string): Promise<{
        dbtSourceUuid: string;
        dbtSourceName: string;
    }> {
        const [project] = await this.database(ProjectTableName)
            .select('project_uuid', 'dbt_source_uuid', 'dbt_source_name')
            .where('project_uuid', projectUuid);

        if (!project) {
            throw new NotFoundError(
                `Cannot find project with id: ${projectUuid}`,
            );
        }

        return {
            dbtSourceUuid: project.dbt_source_uuid ?? project.project_uuid,
            dbtSourceName: project.dbt_source_name,
        };
    }

    async updateDbtSourceName(
        projectUuid: string,
        dbtSourceName: string,
    ): Promise<void> {
        const updatedProjects = await this.database(ProjectTableName)
            .where('project_uuid', projectUuid)
            .update({ dbt_source_name: dbtSourceName })
            .returning('project_uuid');

        if (updatedProjects.length === 0) {
            throw new NotFoundError('Project not found');
        }
    }

    async getAllByOrganizationUuid(
        organizationUuid: string,
    ): Promise<OrganizationProject[]> {
        const orgs = await this.database('organizations')
            .where('organization_uuid', organizationUuid)
            .select('*');
        if (orgs.length === 0) {
            throw new NotFoundError('Cannot find organization');
        }

        const organizationId = orgs[0].organization_id;

        const liveProjectConnections = this.database(
            WarehouseCredentialTableName,
        )
            .select(
                'project_id',
                this.database.raw(
                    'CASE WHEN COUNT(*) = 1 THEN MIN(warehouse_type::text) ELSE NULL END AS warehouse_type',
                ),
            )
            .whereNull('superseded_at')
            .groupBy('project_id')
            .as('live_project_connections');

        const projects = await this.database
            .with('agg_project_group_access_counts', (q) => {
                void q
                    .select(
                        'projects.project_uuid',
                        this.database.raw(
                            `COUNT(distinct ${GroupMembershipTableName}.user_id) as member_count`,
                        ),
                    )
                    .from(ProjectGroupAccessTableName)
                    .groupBy('projects.project_uuid')
                    .leftJoin(
                        'projects',
                        'projects.project_uuid',
                        `${ProjectGroupAccessTableName}.project_uuid`,
                    )
                    .leftJoin(
                        GroupMembershipTableName,
                        `${GroupMembershipTableName}.group_uuid`,
                        `${ProjectGroupAccessTableName}.group_uuid`,
                    )
                    .where('projects.organization_id', organizationId);
            })
            .with('agg_project_membership_counts', (q) => {
                void q
                    .select(
                        'projects.project_uuid',
                        this.database.raw(
                            `COUNT(distinct ${ProjectMembershipsTableName}.user_id) as member_count`,
                        ),
                    )
                    .from(ProjectMembershipsTableName)
                    .groupBy('projects.project_uuid')
                    .leftJoin(
                        'projects',
                        'projects.project_id',
                        `${ProjectMembershipsTableName}.project_id`,
                    )
                    .where('projects.organization_id', organizationId);
            })
            .from('projects')
            .leftJoin(
                liveProjectConnections,
                'projects.project_id',
                'live_project_connections.project_id',
            )
            .leftJoin(
                'users',
                'projects.created_by_user_uuid',
                'users.user_uuid',
            )
            .select(
                'projects.project_uuid',
                'projects.slug',
                'projects.name',
                'projects.project_type',
                'projects.created_at',
                `projects.copied_from_project_uuid`,
                `projects.created_by_user_uuid`,
                'projects.expires_at',
                'projects.provisioning_source',
                'live_project_connections.warehouse_type',
                this.database.raw(
                    "TRIM(CONCAT(users.first_name, ' ', users.last_name)) as created_by_user_name",
                ),
                this.database.raw(
                    '(agg_project_group_access_counts.member_count + agg_project_membership_counts.member_count) as member_count',
                ),
            )
            .leftJoin(
                'agg_project_group_access_counts',
                'projects.project_uuid',
                'agg_project_group_access_counts.project_uuid',
            )
            .leftJoin(
                'agg_project_membership_counts',
                'projects.project_uuid',
                'agg_project_membership_counts.project_uuid',
            )
            .where('organization_id', organizationId)
            .orderByRaw(
                `
                    CASE
                        WHEN projects.project_type = 'DEFAULT' THEN 0
                        ELSE 1
                    END,
                    member_count DESC,
                    projects.created_at ASC
                `,
            );

        return projects.map<OrganizationProject>(
            ({
                name,
                project_uuid,
                slug,
                project_type,
                created_at,
                created_by_user_uuid,
                created_by_user_name,
                copied_from_project_uuid,
                warehouse_type,
                expires_at,
                provisioning_source,
            }) => ({
                name,
                projectUuid: project_uuid,
                slug,
                type: project_type,
                createdByUserUuid: created_by_user_uuid,
                createdByUserName: created_by_user_name ?? null,
                createdAt: created_at,
                upstreamProjectUuid: copied_from_project_uuid,
                warehouseType:
                    warehouse_type !== null
                        ? (warehouse_type as WarehouseTypes)
                        : undefined,
                expiresAt: expires_at ?? null,
                provisioningSource: provisioning_source ?? null,
            }),
        );
    }

    async setProvisioningSource(
        projectUuid: string,
        provisioningSource: string,
    ): Promise<void> {
        await this.database('projects')
            .where('project_uuid', projectUuid)
            .update({ provisioning_source: provisioningSource });
    }

    private async upsertWarehouseConnection(
        trx: Transaction,
        projectId: number,
        data: CreateWarehouseCredentials,
        organizationWarehouseCredentialsUuid?: string,
    ): Promise<void> {
        const {
            listAllDatabases = false,
            additionalDatabases = [],
            ...credentials
        } = normalizeWarehouseCredentials(data);
        let encryptedCredentials: Buffer | null = null;
        if (!organizationWarehouseCredentialsUuid) {
            try {
                encryptedCredentials = this.encryptionUtil.encrypt(
                    JSON.stringify(credentials),
                );
            } catch (e) {
                throw new UnexpectedServerError('Could not save credentials.');
            }
        }

        const connection = {
            project_id: projectId,
            warehouse_type: credentials.type,
            name: warehouseTypeDisplayNames[credentials.type],
            encrypted_credentials: encryptedCredentials,
            organization_warehouse_credentials_uuid:
                organizationWarehouseCredentialsUuid ?? null,
            list_all_databases: listAllDatabases,
            additional_databases:
                normalizeAdditionalDatabases(additionalDatabases),
        };
        const updates = {
            warehouse_type: connection.warehouse_type,
            organization_warehouse_credentials_uuid:
                connection.organization_warehouse_credentials_uuid,
            list_all_databases: connection.list_all_databases,
            additional_databases: connection.additional_databases,
            ...(encryptedCredentials
                ? { encrypted_credentials: encryptedCredentials }
                : {}),
        };

        // A project can hold several connections, so there is no project_id
        // uniqueness to conflict on. Target the live row explicitly.
        const liveRows = await trx(WarehouseCredentialTableName)
            .select<{ warehouse_credentials_id: number }[]>(
                'warehouse_credentials_id',
            )
            .where('project_id', projectId)
            .whereNull('superseded_at');
        if (liveRows.length > 1) {
            throw new MultipleConnectionsError();
        }
        if (liveRows.length === 0) {
            await trx(WarehouseCredentialTableName).insert(connection);
            return;
        }
        await trx(WarehouseCredentialTableName)
            .where(
                'warehouse_credentials_id',
                liveRows[0].warehouse_credentials_id,
            )
            .update(updates);
    }

    async hasAnyProjects(): Promise<boolean> {
        const results = await this.database('projects')
            .count('project_uuid as count')
            .first<{ count: string }>();
        return parseInt(results.count, 10) > 0;
    }

    async getDefaultProjectUuids(): Promise<string[]> {
        const projects = await this.database('projects')
            .where('project_type', ProjectType.DEFAULT)
            .select('project_uuid');
        return projects.map((project) => project.project_uuid);
    }

    async getDefaultProjectUuidsByName(name: string): Promise<string[]> {
        const projects = await this.database('projects')
            .where('project_type', ProjectType.DEFAULT)
            .where('name', name)
            .select('project_uuid');
        return projects.map((project) => project.project_uuid);
    }

    async hasProjects(organizationUuid: string): Promise<boolean> {
        const orgs = await this.database('organizations')
            .where('organization_uuid', organizationUuid)
            .select('*');
        if (orgs.length === 0) {
            throw new NotFoundError('Cannot find organization');
        }

        const projects = await this.database('projects')
            .where('organization_id', orgs[0].organization_id)
            .select('project_uuid');
        return projects.length > 0;
    }

    async create(
        userUuid: string,
        organizationUuid: string,
        data: CreateProject,
        expiresAt?: Date | null,
    ): Promise<string> {
        return this.createWithOptionalCredentials(
            userUuid,
            organizationUuid,
            data,
            expiresAt,
        );
    }

    async createWithOptionalCredentials(
        userUuid: string,
        organizationUuid: string,
        data: CreateProjectOptionalCredentials,
        expiresAt?: Date | null,
        provisioningSource?: string,
    ): Promise<string> {
        const orgs = await this.database('organizations')
            .where('organization_uuid', organizationUuid)
            .select('*');
        if (orgs.length === 0) {
            throw new NotFoundError('Cannot find organization');
        }
        return this.database.transaction(async (trx) => {
            const projectSlug = await generateUniqueProjectSlug(
                trx,
                orgs[0].organization_id,
                data.name,
            );
            let encryptedCredentials: Buffer;
            try {
                encryptedCredentials = this.encryptionUtil.encrypt(
                    JSON.stringify(data.dbtConnection),
                );
            } catch (e) {
                throw new UnexpectedServerError('Could not save credentials.');
            }

            // Make sure the project to copy exists and is owned by the same organization
            const copiedProjects = data.upstreamProjectUuid
                ? await trx('projects')
                      .where('organization_id', orgs[0].organization_id)
                      .andWhere('project_uuid', data.upstreamProjectUuid)
                : [];
            const [project] = await trx('projects')
                .insert({
                    name: data.name,
                    slug: projectSlug,
                    project_type: data.type,
                    organization_id: orgs[0].organization_id,
                    dbt_connection_type: data.dbtConnection.type,
                    dbt_connection: encryptedCredentials,
                    copied_from_project_uuid:
                        copiedProjects.length === 1
                            ? copiedProjects[0].project_uuid
                            : null,
                    dbt_version: data.dbtVersion,
                    ...(copiedProjects.length === 1
                        ? {
                              scheduler_timezone:
                                  copiedProjects[0].scheduler_timezone,
                              query_timezone: copiedProjects[0].query_timezone,
                              use_project_timezone_in_filters:
                                  copiedProjects[0]
                                      .use_project_timezone_in_filters,
                          }
                        : {}),
                    created_by_user_uuid: userUuid,
                    organization_warehouse_credentials_uuid:
                        data.organizationWarehouseCredentialsUuid ?? null,
                    provisioning_source: provisioningSource ?? null,
                    ...(data.requireUserCredentials === undefined
                        ? {}
                        : {
                              require_user_credentials:
                                  data.requireUserCredentials,
                          }),
                    ...(expiresAt !== undefined
                        ? { expires_at: expiresAt }
                        : {}),
                })
                .returning('*');

            if (data.warehouseConnection) {
                await this.upsertWarehouseConnection(
                    trx,
                    project.project_id,
                    data.warehouseConnection,
                    data.organizationWarehouseCredentialsUuid,
                );
            }

            if (data.type !== ProjectType.PREVIEW) {
                const slug = await generateUniqueSlugScopedToProject(
                    trx,
                    project.project_id,
                    SpaceTableName,
                    'Shared',
                );

                const path = getLtreePathFromSlug(slug);

                await trx(SpaceTableName).insert({
                    project_id: project.project_id,
                    name: 'Shared',
                    slug,
                    parent_space_uuid: null,
                    path,
                    inherit_parent_permissions: true,
                    is_default_user_space: false,
                });
            }

            return project.project_uuid;
        });
    }

    async updateProjectDefaults(
        projectUuid: string,
        projectDefaults: ProjectDefaults,
    ): Promise<void> {
        await this.database('projects')
            .update({
                project_defaults: projectDefaults,
            })
            .where('project_uuid', projectUuid);
    }

    async updateColorPalette(
        projectUuid: string,
        colorPaletteUuid: string | null,
    ): Promise<void> {
        await this.database('projects')
            .update({
                color_palette_uuid: colorPaletteUuid,
            })
            .where('project_uuid', projectUuid);
    }

    async findProjectDefaults(
        projectUuid: string,
    ): Promise<ProjectDefaults | null> {
        const [row] = await this.database(ProjectTableName)
            .select('project_defaults')
            .where('project_uuid', projectUuid);
        return row?.project_defaults ?? null;
    }

    async getTableGroups(
        projectUuid: string,
    ): Promise<Record<string, GroupType>> {
        const [row] = await this.database(ProjectTableName)
            .select('table_groups')
            .where('project_uuid', projectUuid);
        return row?.table_groups ?? {};
    }

    async setTableGroups(
        projectUuid: string,
        tableGroups: Record<string, GroupType> | undefined,
    ): Promise<void> {
        await this.database(ProjectTableName)
            .update({
                table_groups:
                    tableGroups && Object.keys(tableGroups).length > 0
                        ? tableGroups
                        : null,
            })
            .where('project_uuid', projectUuid);
    }

    async getPreviewExpirationSettings(projectUuid: string): Promise<{
        defaultPreviewExpirationHours: number;
        maxPreviewExpirationHours: number;
    }> {
        const row = await this.database(ProjectTableName)
            .where('project_uuid', projectUuid)
            .select(
                'default_preview_expiration_hours',
                'max_preview_expiration_hours',
            )
            .first();

        if (!row) {
            throw new NotFoundError(
                `Cannot find project with id: ${projectUuid}`,
            );
        }

        return {
            defaultPreviewExpirationHours: row.default_preview_expiration_hours,
            maxPreviewExpirationHours: row.max_preview_expiration_hours,
        };
    }

    async updatePreviewExpirationSettings(
        projectUuid: string,
        settings: {
            defaultPreviewExpirationHours: number;
            maxPreviewExpirationHours: number;
        },
    ): Promise<void> {
        await this.database(ProjectTableName)
            .where('project_uuid', projectUuid)
            .update({
                default_preview_expiration_hours:
                    settings.defaultPreviewExpirationHours,
                max_preview_expiration_hours:
                    settings.maxPreviewExpirationHours,
            });
    }

    async getResultsCacheSettings(
        projectUuid: string,
    ): Promise<{ cacheTtlSeconds: number | null }> {
        const row = await this.database(ProjectTableName)
            .where('project_uuid', projectUuid)
            .select('results_cache_ttl_seconds')
            .first();

        if (!row) {
            throw new NotFoundError(
                `Cannot find project with id: ${projectUuid}`,
            );
        }

        return { cacheTtlSeconds: row.results_cache_ttl_seconds };
    }

    async updateResultsCacheSettings(
        projectUuid: string,
        settings: { cacheTtlSeconds: number | null },
    ): Promise<void> {
        const affectedRows = await this.database(ProjectTableName)
            .where('project_uuid', projectUuid)
            .update({ results_cache_ttl_seconds: settings.cacheTtlSeconds });
        if (affectedRows === 0) {
            throw new NotFoundError(
                `Cannot find project with id: ${projectUuid}`,
            );
        }
    }

    async getEffectiveResultsCacheTtlSeconds(
        projectUuid: string,
    ): Promise<number> {
        const { cacheTtlSeconds } =
            await this.getResultsCacheSettings(projectUuid);
        return (
            cacheTtlSeconds ??
            this.lightdashConfig.results.cacheStateTimeSeconds
        );
    }

    async updateExpiresAt(projectUuid: string, expiresAt: Date): Promise<void> {
        await this.database(ProjectTableName)
            .where('project_uuid', projectUuid)
            .update({ expires_at: expiresAt });
    }

    async update(projectUuid: string, data: UpdateProject): Promise<void> {
        let previousConnectionString: string | undefined;
        if (data.warehouseConnection) {
            try {
                previousConnectionString = getMotherduckConnectionString(
                    await this.getWarehouseCredentialsForProject(projectUuid),
                );
            } catch (e) {
                if (!(e instanceof NotFoundError)) throw e;
            }
            deleteWarehouseCredentialsCacheForProject(projectUuid);
        }
        const nextConnectionString = data.warehouseConnection
            ? getMotherduckConnectionString(data.warehouseConnection)
            : undefined;

        await this.database.transaction(async (trx) => {
            let encryptedCredentials: Buffer;
            try {
                encryptedCredentials = this.encryptionUtil.encrypt(
                    JSON.stringify(data.dbtConnection),
                );
            } catch (e) {
                throw new UnexpectedServerError('Could not save credentials.');
            }

            const projects = await trx('projects')
                .update({
                    name: data.name,
                    dbt_connection_type: data.dbtConnection.type,
                    dbt_connection: encryptedCredentials,
                    dbt_version: data.dbtVersion,
                    ...(data.warehouseConnection
                        ? {
                              organization_warehouse_credentials_uuid:
                                  data.organizationWarehouseCredentialsUuid,
                          }
                        : {}),
                    project_defaults: data.projectDefaults ?? null,
                    ...(data.requireUserCredentials === undefined
                        ? {}
                        : {
                              require_user_credentials:
                                  data.requireUserCredentials,
                          }),
                })
                .where('project_uuid', projectUuid)
                .returning('*');
            if (projects.length === 0) {
                throw new UnexpectedServerError('Could not update project.');
            }
            if (data.warehouseConnection) {
                const [project] = projects;
                await this.upsertWarehouseConnection(
                    trx,
                    project.project_id,
                    data.warehouseConnection,
                    data.organizationWarehouseCredentialsUuid,
                );
            }
        });

        if (
            previousConnectionString &&
            previousConnectionString !== nextConnectionString
        ) {
            MotherduckInstanceCache.invalidateByConnectionString(
                previousConnectionString,
                'credentials_updated',
            );
        }
    }

    async updateDetails(
        projectUuid: string,
        details: UpdateProjectDetails,
    ): Promise<void> {
        const { requireUserCredentials, ...projectDetails } = details;
        const updatedProjects = await this.database(ProjectTableName)
            .where('project_uuid', projectUuid)
            .update({
                ...projectDetails,
                ...(requireUserCredentials === undefined
                    ? {}
                    : {
                          require_user_credentials: requireUserCredentials,
                      }),
            })
            .returning('project_uuid');

        if (updatedProjects.length === 0) {
            throw new NotFoundError('Project not found');
        }
    }

    async getExpiredPreviewProjects(): Promise<
        { projectUuid: string; organizationUuid: string }[]
    > {
        const results = await this.database('projects')
            .join(
                'organizations',
                'projects.organization_id',
                'organizations.organization_id',
            )
            .where('projects.project_type', ProjectType.PREVIEW)
            .whereNotNull('projects.expires_at')
            .where('projects.expires_at', '<=', this.database.fn.now())
            .select('projects.project_uuid', 'organizations.organization_uuid');

        return results.map((r) => ({
            projectUuid: r.project_uuid,
            organizationUuid: r.organization_uuid,
        }));
    }

    /**
     * Give a training copy the seeded deep research, as the learner's own:
     * a run lives in a thread, and a thread belongs to the person who asked,
     * so the copy's thread, prompt and run are owned by the learner (the
     * source's stay with the seed user). The copy's agent is found by slug.
     */
    async copyDeepResearchForTrainingCopy(
        sourceProjectUuid: string,
        previewProjectUuid: string,
        learnerUserUuid: string,
        seedUserUuid: string | null,
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            // Only the seed's runs (made by whoever enabled Learn) travel
            // into copies; nothing another learner or admin ran afterwards.
            const runs = await trx(AiDeepResearchRunsTableName)
                .where('project_uuid', sourceProjectUuid)
                .where('created_by_user_uuid', seedUserUuid ?? '')
                .where('status', 'completed');
            // eslint-disable-next-line no-restricted-syntax
            for (const run of runs) {
                // eslint-disable-next-line no-await-in-loop
                const sourceAgent = await trx(AiAgentTableName)
                    .where('ai_agent_uuid', run.agent_uuid)
                    .first();
                if (!sourceAgent) continue; // eslint-disable-line no-continue
                // eslint-disable-next-line no-await-in-loop
                const agent = await trx(AiAgentTableName)
                    .where({
                        project_uuid: previewProjectUuid,
                        slug: sourceAgent.slug,
                    })
                    .first();
                if (!agent) continue; // eslint-disable-line no-continue
                // eslint-disable-next-line no-await-in-loop
                const thread = await trx(AiThreadTableName)
                    .where('ai_thread_uuid', run.ai_thread_uuid)
                    .first();
                // eslint-disable-next-line no-await-in-loop
                const prompt = await trx(AiPromptTableName)
                    .where('ai_prompt_uuid', run.prompt_uuid)
                    .first();
                if (!thread || !prompt) continue; // eslint-disable-line no-continue
                const runUuid = uuidv4();
                // eslint-disable-next-line no-await-in-loop
                const [{ ai_thread_uuid: threadUuid }] = await trx(
                    AiThreadTableName,
                )
                    .insert({
                        organization_uuid: thread.organization_uuid,
                        project_uuid: previewProjectUuid,
                        created_from: thread.created_from,
                        agent_uuid: agent.ai_agent_uuid,
                    })
                    .returning('ai_thread_uuid');
                // eslint-disable-next-line no-await-in-loop
                await trx(AiThreadTableName)
                    .where('ai_thread_uuid', threadUuid)
                    .update({
                        title: thread.title,
                        title_generated_at: thread.title_generated_at,
                    });
                // eslint-disable-next-line no-await-in-loop
                await trx(AiWebAppThreadTableName).insert({
                    ai_thread_uuid: threadUuid,
                    user_uuid: learnerUserUuid,
                });
                // eslint-disable-next-line no-await-in-loop
                const [{ ai_prompt_uuid: promptUuid }] = await trx(
                    AiPromptTableName,
                )
                    .insert({
                        ai_thread_uuid: threadUuid,
                        created_by_user_uuid: learnerUserUuid,
                        prompt: prompt.prompt,
                        execution_mode: prompt.execution_mode,
                    })
                    .returning('ai_prompt_uuid');
                const {
                    ai_deep_research_run_uuid: _sourceRunUuid,
                    created_at: _createdAt,
                    updated_at: _updatedAt,
                    ...runColumns
                } = run;
                // eslint-disable-next-line no-await-in-loop
                await trx(AiDeepResearchRunsTableName).insert({
                    ...runColumns,
                    ai_deep_research_run_uuid: runUuid,
                    project_uuid: previewProjectUuid,
                    created_by_user_uuid: learnerUserUuid,
                    agent_uuid: agent.ai_agent_uuid,
                    ai_thread_uuid: threadUuid,
                    prompt_uuid: promptUuid,
                    // A copy is a finished report, never a resumable run.
                    resume_from_run_uuid: null,
                    budget_snapshot: JSON.stringify(run.budget_snapshot),
                    execution_context_snapshot: JSON.stringify(
                        run.execution_context_snapshot,
                    ),
                });
                // eslint-disable-next-line no-await-in-loop
                const events = await trx(AiDeepResearchEventsTableName)
                    .where(
                        'ai_deep_research_run_uuid',
                        run.ai_deep_research_run_uuid,
                    )
                    .orderBy('created_at', 'asc');
                if (events.length > 0) {
                    // eslint-disable-next-line no-await-in-loop
                    await trx(AiDeepResearchEventsTableName).insert(
                        events.map((event) => ({
                            ai_deep_research_run_uuid: runUuid,
                            event_type: event.event_type,
                            payload: JSON.stringify(event.payload),
                            created_at: event.created_at,
                        })),
                    );
                }
            }
        });
    }

    /**
     * Give a training copy its own dashboard tile uuids, and its own copies
     * of the comments on those tiles. A preview normally keeps the source's
     * tile uuids, and tile comments are keyed by tile uuid alone, so a
     * comment posted or resolved in one learner's copy would show in the
     * shared training project and in every other copy. With their own
     * uuids, a copy's comments start as clones of the seeded ones and stay
     * its own; they go with the copy's charts when it is removed.
     */
    async giveTrainingCopyOwnTiles(
        previewProjectUuid: string,
        seedUserUuid: string | null,
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            const versions = await trx(DashboardVersionsTableName)
                .join(
                    DashboardsTableName,
                    `${DashboardsTableName}.dashboard_id`,
                    `${DashboardVersionsTableName}.dashboard_id`,
                )
                .join(
                    SpaceTableName,
                    `${SpaceTableName}.space_id`,
                    `${DashboardsTableName}.space_id`,
                )
                .join(
                    ProjectTableName,
                    `${ProjectTableName}.project_id`,
                    `${SpaceTableName}.project_id`,
                )
                .where(`${ProjectTableName}.project_uuid`, previewProjectUuid)
                .select<{ dashboard_version_id: number; config: unknown }[]>(
                    `${DashboardVersionsTableName}.dashboard_version_id`,
                    `${DashboardVersionsTableName}.config`,
                );
            if (versions.length === 0) return;
            const versionIds = versions.map((v) => v.dashboard_version_id);
            const tiles = await trx(DashboardTilesTableName)
                .whereIn('dashboard_version_id', versionIds)
                .select('*');
            const renamed = new Map<string, string>();
            const childTables = [
                DashboardTileChartTableName,
                DashboardTileSqlChartTableName,
                DashboardTileMarkdownsTableName,
                DashboardTileLoomsTableName,
                DashboardTileHeadingsTableName,
                DashboardTileDataAppsTableName,
            ];
            // Child rows reference the tile by (version, uuid) without ON
            // UPDATE, so the tile is re-inserted under the new uuid, the
            // children moved across, and the old row removed last.
            await tiles.reduce(async (previous, tile) => {
                await previous;
                const to = renamed.get(tile.dashboard_tile_uuid) ?? uuidv4();
                renamed.set(tile.dashboard_tile_uuid, to);
                await trx(DashboardTilesTableName).insert({
                    ...tile,
                    dashboard_tile_uuid: to,
                });
                await childTables.reduce(async (prev, table) => {
                    await prev;
                    await trx(table)
                        .where({
                            dashboard_version_id: tile.dashboard_version_id,
                            dashboard_tile_uuid: tile.dashboard_tile_uuid,
                        })
                        .update({ dashboard_tile_uuid: to });
                }, Promise.resolve());
                await trx(DashboardTilesTableName)
                    .where({
                        dashboard_version_id: tile.dashboard_version_id,
                        dashboard_tile_uuid: tile.dashboard_tile_uuid,
                    })
                    .delete();
            }, Promise.resolve());
            // Filters and date zoom target tiles by uuid inside the
            // version's config; rewrite those references in place.
            await versions.reduce(async (previous, version) => {
                await previous;
                if (!version.config) return;
                let text = JSON.stringify(version.config);
                renamed.forEach((to, from) => {
                    text = text.split(from).join(to);
                });
                await trx(DashboardVersionsTableName)
                    .where('dashboard_version_id', version.dashboard_version_id)
                    .update({ config: JSON.parse(text) });
            }, Promise.resolve());
            // The copy's own comments: clones of the seeded ones, attached
            // to the copy's charts so they are removed with the copy.
            const chartOfTile = new Map<string, string>(
                (
                    await trx(DashboardTileChartTableName)
                        .join(
                            SavedChartsTableName,
                            `${SavedChartsTableName}.saved_query_id`,
                            `${DashboardTileChartTableName}.saved_chart_id`,
                        )
                        .whereIn(
                            `${DashboardTileChartTableName}.dashboard_version_id`,
                            versionIds,
                        )
                        .select<
                            { dashboard_tile_uuid: string; uuid: string }[]
                        >(
                            `${DashboardTileChartTableName}.dashboard_tile_uuid`,
                            `${SavedChartsTableName}.saved_query_uuid as uuid`,
                        )
                ).map((row) => [row.dashboard_tile_uuid, row.uuid]),
            );
            // Only the seed's comments (made by whoever enabled Learn) come
            // along; nothing anyone wrote on the shared project afterwards.
            const comments = await trx(DashboardTileCommentsTableName)
                .whereIn('dashboard_tile_uuid', [...renamed.keys()])
                .where('user_uuid', seedUserUuid ?? '')
                .orderBy('created_at', 'asc')
                .select('*');
            const clonedIds = new Map<string, string>();
            await comments.reduce(async (previous, comment) => {
                await previous;
                const to = renamed.get(comment.dashboard_tile_uuid);
                if (!to) return;
                const [clone] = await trx(DashboardTileCommentsTableName)
                    .insert({
                        text: comment.text,
                        text_html: comment.text_html,
                        dashboard_tile_uuid: to,
                        reply_to: comment.reply_to
                            ? (clonedIds.get(comment.reply_to) ?? null)
                            : null,
                        user_uuid: comment.user_uuid,
                        saved_chart_uuid: chartOfTile.get(to) ?? null,
                        mentions: comment.mentions,
                        resolved: comment.resolved,
                        created_at: comment.created_at,
                    })
                    .returning('comment_id');
                clonedIds.set(comment.comment_id, clone.comment_id);
            }, Promise.resolve());
        });
    }

    async delete(
        projectUuid: string,
        transaction?: Transaction,
    ): Promise<void> {
        // Invalidate warehouse credentials cache
        deleteWarehouseCredentialsCacheForProject(projectUuid);

        const deleteInTransaction = async (trx: Transaction): Promise<void> => {
            const [project] = await trx('projects')
                .select('project_id')
                .where('project_uuid', projectUuid);

            if (!project) {
                throw new NotFoundError('Project not found');
            }
            const projectId = project.project_id;
            // First we delete some of the content from the project
            // to avoid getting deadlock issues
            await trx('catalog_search')
                .where('project_uuid', projectUuid)
                .delete();

            await trx('cached_explores')
                .where('project_uuid', projectUuid)
                .delete();

            await trx('cached_explore')
                .where('project_uuid', projectUuid)
                .delete();

            // Deleting spaces will also delete dashboards and charts in cascade,
            // At the same time, charts and dashboards will delete analytic_views, schedulers, pinned content, and more.
            await trx(SpaceTableName).where('project_id', projectId).delete();

            await trx('jobs').where('project_uuid', projectUuid).delete();

            // Finally, delete the project and everything else in cascade
            await trx('projects').where('project_uuid', projectUuid).delete();
        };

        if (transaction) {
            await deleteInTransaction(transaction);
        } else {
            await this.database.transaction(deleteInTransaction);
        }
    }

    async getCompileProject(
        projectUuid: string,
    ): Promise<
        Pick<
            Project,
            | 'name'
            | 'dbtConnection'
            | 'dbtVersion'
            | 'organizationUuid'
            | 'upstreamProjectUuid'
            | 'projectDefaults'
        >
    > {
        const project = await this.database(ProjectTableName)
            .innerJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            )
            .select<
                {
                    name: string;
                    dbt_connection: Buffer | null;
                    dbt_version: SupportedDbtVersions;
                    organization_uuid: string;
                    copied_from_project_uuid: string | null;
                    project_defaults: ProjectDefaults | null;
                }[]
            >([
                `${ProjectTableName}.name`,
                `${ProjectTableName}.dbt_connection`,
                `${ProjectTableName}.dbt_version`,
                `${OrganizationTableName}.organization_uuid`,
                `${ProjectTableName}.copied_from_project_uuid`,
                `${ProjectTableName}.project_defaults`,
            ])
            .where(`${ProjectTableName}.project_uuid`, projectUuid)
            .first();
        if (!project) {
            throw new NotFoundError(
                `Cannot find project with id: ${projectUuid}`,
            );
        }
        if (!project.dbt_connection) {
            throw new NotFoundError('Project has no valid dbt credentials');
        }
        try {
            return {
                name: project.name,
                dbtConnection: JSON.parse(
                    this.encryptionUtil.decrypt(project.dbt_connection),
                ) as DbtProjectConfig,
                dbtVersion: project.dbt_version,
                organizationUuid: project.organization_uuid,
                upstreamProjectUuid:
                    project.copied_from_project_uuid ?? undefined,
                projectDefaults: project.project_defaults ?? undefined,
            };
        } catch {
            throw new UnexpectedServerError('Failed to load dbt credentials');
        }
    }

    async getCompileConnections(projectUuid: string): Promise<Connection[]> {
        return this.connectionModel.listByProject(projectUuid);
    }

    async getWithSensitiveFields(
        projectUuid: string,
        connectionUuid?: string,
    ): Promise<Project & { warehouseConnection?: CreateWarehouseCredentials }> {
        type QueryResult = {
            name: string;
            slug: string;
            project_type: ProjectType;
            dbt_connection: Buffer | null;
            organization_uuid: string;
            pinned_list_uuid?: string;
            dbt_version: SupportedDbtVersions;
            copied_from_project_uuid?: string;
            scheduler_timezone: string;
            query_timezone: string | null;
            use_project_timezone_in_filters: boolean;
            scheduler_failure_notify_recipients: boolean;
            scheduler_failure_include_contact: boolean;
            scheduler_failure_contact_override: string | null;
            created_by_user_uuid: string | null;
            organization_warehouse_credentials_uuid: string | null;
            has_default_user_spaces: boolean;
            project_defaults: ProjectDefaults | null;
            color_palette_uuid: string | null;
            expires_at: Date | null;
            provisioning_source: string | null;
            agent_sql_scope: AgentSqlScope | null;
            require_user_credentials: boolean | null;
        }[];
        return wrapSentryTransaction(
            'ProjectModel.getWithSensitiveFields',
            {},
            async () => {
                const projects = await this.database('projects')
                    .leftJoin(
                        OrganizationTableName,
                        'organizations.organization_id',
                        'projects.organization_id',
                    )
                    .leftJoin(
                        PinnedListTableName,
                        'pinned_list.project_uuid',
                        'projects.project_uuid',
                    )
                    .column([
                        this.database.ref('name').withSchema(ProjectTableName),
                        this.database.ref('slug').withSchema(ProjectTableName),
                        this.database
                            .ref('project_type')
                            .withSchema(ProjectTableName),
                        this.database
                            .ref('dbt_connection')
                            .withSchema(ProjectTableName),
                        this.database
                            .ref('organization_uuid')
                            .withSchema(OrganizationTableName),
                        this.database
                            .ref('pinned_list_uuid')
                            .withSchema(PinnedListTableName),
                        this.database
                            .ref('dbt_version')
                            .withSchema(ProjectTableName),
                        this.database
                            .ref('copied_from_project_uuid')
                            .withSchema(ProjectTableName),
                        this.database
                            .ref('scheduler_timezone')
                            .withSchema(ProjectTableName),
                        this.database
                            .ref('query_timezone')
                            .withSchema(ProjectTableName),
                        this.database
                            .ref('use_project_timezone_in_filters')
                            .withSchema(ProjectTableName),
                        this.database
                            .ref('scheduler_failure_notify_recipients')
                            .withSchema(ProjectTableName),
                        this.database
                            .ref('scheduler_failure_include_contact')
                            .withSchema(ProjectTableName),
                        this.database
                            .ref('scheduler_failure_contact_override')
                            .withSchema(ProjectTableName),
                        this.database
                            .ref('created_by_user_uuid')
                            .withSchema(ProjectTableName),
                        this.database
                            .ref('organization_warehouse_credentials_uuid')
                            .withSchema(ProjectTableName),
                        this.database
                            .ref('has_default_user_spaces')
                            .withSchema(ProjectTableName),
                        this.database
                            .ref('project_defaults')
                            .withSchema(ProjectTableName),
                        this.database
                            .ref('color_palette_uuid')
                            .withSchema(ProjectTableName),
                        this.database
                            .ref('expires_at')
                            .withSchema(ProjectTableName),
                        this.database
                            .ref('provisioning_source')
                            .withSchema(ProjectTableName),
                        this.database
                            .ref('agent_sql_scope')
                            .withSchema(ProjectTableName),
                        this.database
                            .ref('require_user_credentials')
                            .withSchema(ProjectTableName),
                    ])
                    .select<QueryResult>()
                    .where('projects.project_uuid', projectUuid);
                if (projects.length === 0) {
                    throw new NotFoundError(
                        `Cannot find project with id: ${projectUuid}`,
                    );
                }
                const [project] = projects;
                if (!project.dbt_connection) {
                    throw new NotFoundError(
                        'Project has no valid dbt credentials',
                    );
                }
                let dbtSensitiveCredentials: DbtProjectConfig;
                try {
                    dbtSensitiveCredentials = JSON.parse(
                        this.encryptionUtil.decrypt(project.dbt_connection),
                    ) as DbtProjectConfig;
                } catch (e) {
                    throw new UnexpectedServerError(
                        'Failed to load dbt credentials',
                    );
                }

                const connections =
                    await this.connectionModel.listByProject(projectUuid);
                let selectedConnection: Connection | undefined;
                if (connectionUuid) {
                    selectedConnection = connections.find(
                        (connection) =>
                            connection.connectionUuid === connectionUuid,
                    );
                } else if (connections.length === 1) {
                    [selectedConnection] = connections;
                }
                if (connectionUuid && !selectedConnection) {
                    throw new NotFoundError('Connection not found');
                }
                const warehouseConnection = selectedConnection
                    ? await this.connectionModel.getCredentials(
                          projectUuid,
                          selectedConnection.connectionUuid,
                      )
                    : undefined;
                const connectionCredentials = await Promise.all(
                    connections
                        .filter(
                            (connection) =>
                                project.require_user_credentials === null ||
                                connection.organizationWarehouseCredentialsUuid !==
                                    null,
                        )
                        .map(async (connection) => ({
                            credentials:
                                warehouseConnection &&
                                connection.connectionUuid ===
                                    selectedConnection?.connectionUuid
                                    ? warehouseConnection
                                    : await this.connectionModel.getCredentials(
                                          projectUuid,
                                          connection.connectionUuid,
                                      ),
                            usesOrganizationCredentials:
                                connection.organizationWarehouseCredentialsUuid !==
                                null,
                        })),
                );

                const result: Omit<Project, 'warehouseConnection'> = {
                    organizationUuid: project.organization_uuid,
                    projectUuid,
                    slug: project.slug,
                    name: project.name,
                    type: project.project_type,
                    dbtConnection: dbtSensitiveCredentials,
                    connections,
                    pinnedListUuid: project.pinned_list_uuid,
                    dbtVersion: project.dbt_version,
                    upstreamProjectUuid: project.copied_from_project_uuid,
                    schedulerTimezone: project.scheduler_timezone,
                    queryTimezone: project.query_timezone,
                    useProjectTimezoneInFilters:
                        project.use_project_timezone_in_filters,
                    schedulerFailureNotifyRecipients:
                        project.scheduler_failure_notify_recipients,
                    schedulerFailureIncludeContact:
                        project.scheduler_failure_include_contact,
                    schedulerFailureContactOverride:
                        project.scheduler_failure_contact_override,
                    createdByUserUuid: project.created_by_user_uuid,
                    organizationWarehouseCredentialsUuid:
                        project.organization_warehouse_credentials_uuid ??
                        undefined,
                    hasDefaultUserSpaces: project.has_default_user_spaces,
                    projectDefaults: project.project_defaults ?? undefined,
                    colorPaletteUuid: project.color_palette_uuid ?? null,
                    expiresAt: project.expires_at ?? null,
                    provisioningSource: project.provisioning_source ?? null,
                    agentSqlScope: project.agent_sql_scope ?? null,
                    requireUserCredentials:
                        ProjectModel.resolveRequireUserCredentials(
                            project.require_user_credentials,
                            connectionCredentials,
                        ),
                };

                if (!warehouseConnection) {
                    return result;
                }
                return {
                    ...result,
                    warehouseConnection,
                };
            },
        );
    }

    async getSummary(projectUuid: string): Promise<ProjectSummary> {
        const project = await this.database(ProjectTableName)
            .leftJoin(
                OrganizationTableName,
                'projects.organization_id',
                'organizations.organization_id',
            )
            .select<
                Pick<
                    DbProject,
                    | 'name'
                    | 'project_uuid'
                    | 'slug'
                    | 'project_type'
                    | 'copied_from_project_uuid'
                    | 'created_by_user_uuid'
                    | 'provisioning_source'
                > &
                    Pick<DbOrganization, 'organization_uuid'>
            >([
                `${ProjectTableName}.name`,
                `${ProjectTableName}.project_uuid`,
                `${ProjectTableName}.slug`,
                `${OrganizationTableName}.organization_uuid`,
                `${ProjectTableName}.copied_from_project_uuid`,
                `${ProjectTableName}.project_type`,
                `${ProjectTableName}.created_by_user_uuid`,
                `${ProjectTableName}.provisioning_source`,
            ])
            .where('projects.project_uuid', projectUuid)
            .first();
        if (!project) {
            throw new NotFoundError(
                `Cannot find project with id: ${projectUuid}`,
            );
        }
        return {
            organizationUuid: project.organization_uuid,
            projectUuid: project.project_uuid,
            slug: project.slug,
            name: project.name,
            type: project.project_type,
            upstreamProjectUuid: project.copied_from_project_uuid || undefined,
            createdByUserUuid: project.created_by_user_uuid,
            provisioningSource: project.provisioning_source,
        };
    }

    async getUuidBySlug(
        organizationUuid: string,
        projectSlug: string,
    ): Promise<string> {
        const project = await this.database(ProjectTableName)
            .innerJoin(
                OrganizationTableName,
                `${ProjectTableName}.organization_id`,
                `${OrganizationTableName}.organization_id`,
            )
            .select(`${ProjectTableName}.project_uuid`)
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .where(`${ProjectTableName}.slug`, projectSlug)
            .first();

        if (!project) {
            throw new NotFoundError(
                `Cannot find project with slug: ${projectSlug}`,
            );
        }

        return project.project_uuid;
    }

    /*
    This method will load default values for backwards compatibility
    For example, when we introduce a new authentication type, we need to set the default value for the existing projects
    */
    static resolveRequireUserCredentials(
        projectSetting: boolean | null,
        connectionCredentials: {
            credentials: CreateWarehouseCredentials;
            usesOrganizationCredentials: boolean;
        }[],
    ): boolean {
        const organizationCredentialsRequire = connectionCredentials.some(
            ({ credentials, usesOrganizationCredentials }) =>
                usesOrganizationCredentials &&
                credentials.requireUserCredentials === true,
        );
        const anyConnectionRequires = connectionCredentials.some(
            ({ credentials }) => credentials.requireUserCredentials === true,
        );
        return (
            organizationCredentialsRequire ||
            (projectSetting ?? anyConnectionRequires)
        );
    }

    static getConnectionWithDefaults(
        sensitiveCredentials?: CreateWarehouseCredentials,
        nonSensitiveCredentials?: WarehouseCredentials,
    ): WarehouseCredentials | undefined {
        if (!sensitiveCredentials || !nonSensitiveCredentials) {
            return nonSensitiveCredentials;
        }

        switch (nonSensitiveCredentials.type) {
            case WarehouseTypes.BIGQUERY:
                return {
                    ...nonSensitiveCredentials,
                    authenticationType:
                        nonSensitiveCredentials.authenticationType ??
                        BigqueryAuthenticationType.PRIVATE_KEY,
                };
            case WarehouseTypes.SNOWFLAKE: {
                const rawCredentials =
                    sensitiveCredentials as CreateSnowflakeCredentials;

                if (nonSensitiveCredentials.authenticationType !== undefined) {
                    return nonSensitiveCredentials;
                }

                if (rawCredentials.privateKey === undefined) {
                    return {
                        ...nonSensitiveCredentials,
                        authenticationType:
                            SnowflakeAuthenticationType.PASSWORD,
                    };
                }

                return {
                    ...nonSensitiveCredentials,
                    authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY,
                };
            }
            default:
                return nonSensitiveCredentials;
        }
    }

    static getNonSensitiveWarehouseCredentials(
        sensitiveCredentials: CreateWarehouseCredentials,
    ): WarehouseCredentials {
        const nonSensitiveCredentials = Object.fromEntries(
            Object.entries(sensitiveCredentials).filter(
                ([key]) =>
                    !sensitiveCredentialsFieldNames.includes(key as AnyType),
            ),
        ) as WarehouseCredentials;
        const scrubbedCredentials =
            sensitiveCredentials.type === WarehouseTypes.DUCKDB &&
            sensitiveCredentials.connectionType ===
                DuckdbConnectionType.DUCKLAKE
                ? (stripDucklakeNestedSensitive(
                      sensitiveCredentials,
                  ) as WarehouseCredentials)
                : nonSensitiveCredentials;
        return ProjectModel.getConnectionWithDefaults(
            sensitiveCredentials,
            scrubbedCredentials,
        ) as WarehouseCredentials;
    }

    async get(projectUuid: string): Promise<Project> {
        const project = await this.getWithSensitiveFields(projectUuid);
        const sensitiveCredentials =
            project.connections.length === 1
                ? project.warehouseConnection
                : undefined;

        const nonSensitiveDbtCredentials = Object.fromEntries(
            Object.entries(project.dbtConnection).filter(
                ([key]) =>
                    !sensitiveDbtCredentialsFieldNames.includes(key as AnyType),
            ),
        ) as DbtProjectConfig;

        const nonSensitiveCredentials = sensitiveCredentials
            ? (Object.fromEntries(
                  Object.entries(sensitiveCredentials).filter(
                      ([key]) =>
                          !sensitiveCredentialsFieldNames.includes(
                              key as AnyType,
                          ),
                  ),
              ) as WarehouseCredentials)
            : undefined;

        const scrubbedCredentials =
            nonSensitiveCredentials &&
            sensitiveCredentials &&
            sensitiveCredentials.type === WarehouseTypes.DUCKDB &&
            sensitiveCredentials.connectionType ===
                DuckdbConnectionType.DUCKLAKE
                ? (stripDucklakeNestedSensitive(
                      sensitiveCredentials,
                  ) as WarehouseCredentials)
                : nonSensitiveCredentials;

        const nonSensitiveCredentialsWithDefaults =
            ProjectModel.getConnectionWithDefaults(
                sensitiveCredentials,
                scrubbedCredentials,
            );

        return {
            organizationUuid: project.organizationUuid,
            projectUuid,
            slug: project.slug,
            name: project.name,
            type: project.type,
            dbtConnection: nonSensitiveDbtCredentials,
            warehouseConnection: nonSensitiveCredentialsWithDefaults,
            connections: project.connections,
            pinnedListUuid: project.pinnedListUuid,
            dbtVersion: project.dbtVersion,
            upstreamProjectUuid: project.upstreamProjectUuid || undefined,
            schedulerTimezone: project.schedulerTimezone,
            queryTimezone: project.queryTimezone,
            useProjectTimezoneInFilters: project.useProjectTimezoneInFilters,
            schedulerFailureNotifyRecipients:
                project.schedulerFailureNotifyRecipients,
            schedulerFailureIncludeContact:
                project.schedulerFailureIncludeContact,
            schedulerFailureContactOverride:
                project.schedulerFailureContactOverride,
            createdByUserUuid: project.createdByUserUuid ?? null,
            organizationWarehouseCredentialsUuid:
                project.organizationWarehouseCredentialsUuid,
            hasDefaultUserSpaces: project.hasDefaultUserSpaces,
            projectDefaults: project.projectDefaults,
            colorPaletteUuid: project.colorPaletteUuid ?? null,
            expiresAt: project.expiresAt,
            provisioningSource: project.provisioningSource ?? null,
            agentSqlScope: project.agentSqlScope ?? null,
            requireUserCredentials: project.requireUserCredentials,
        };
    }

    async getTablesConfiguration(
        projectUuid: string,
    ): Promise<TablesConfiguration> {
        const projects = await this.database(ProjectTableName)
            .select(['table_selection_type', 'table_selection_value'])
            .where('project_uuid', projectUuid);
        if (projects.length === 0) {
            throw new NotFoundError(
                `Cannot find project with id: ${projectUuid}`,
            );
        }
        return {
            tableSelection: {
                type: projects[0].table_selection_type,
                value: projects[0].table_selection_value,
            },
        };
    }

    async updateTablesConfiguration(
        projectUuid: string,
        data: TablesConfiguration,
    ): Promise<void> {
        await this.database(ProjectTableName)
            .update({
                table_selection_type: data.tableSelection.type,
                table_selection_value: data.tableSelection.value,
            })
            .where('project_uuid', projectUuid);
    }

    static convertMetricFiltersFieldIdsToFieldRef = (
        explore: Explore | ExploreError,
    ) => {
        if (isExploreError(explore)) return explore;
        const convertedExplore = { ...explore };
        if (convertedExplore.tables) {
            Object.values(convertedExplore.tables).forEach((table) => {
                if (!isJsonObject(table)) {
                    return;
                }
                if (table.metrics) {
                    Object.values(table.metrics).forEach((metric) => {
                        if (metric.filters) {
                            metric.filters.forEach((filter) => {
                                // @ts-expect-error cached explore types might not be up to date
                                const { fieldId, fieldRef, ...rest } =
                                    filter.target;
                                // eslint-disable-next-line no-param-reassign
                                filter.target = {
                                    ...rest,
                                    fieldRef: fieldRef ?? fieldId,
                                };
                            });
                        }
                    });
                }
            });
        }

        return convertedExplore;
    };

    /**
     * Find explores from cache (cached_explore) from a project.
     * @param projectUuid - The project uuid.
     * @param key - The key to represent the Explore dictionary key.
     * @param exploreNamesWithDuplicates - The explore names with duplicates.
     * @returns A dictionary of explores with the key being the name or uuid.
     */
    async findExploresFromCache(
        projectUuid: string,
        key: 'name' | 'uuid',
        exploreNamesWithDuplicates?: string[],
    ): Promise<{ [exploreNameOrUuid: string]: Explore | ExploreError }> {
        // dedupe values
        const exploreNames = exploreNamesWithDuplicates
            ? [...new Set(exploreNamesWithDuplicates)]
            : undefined;
        return wrapSentryTransaction(
            'ProjectModel.findExploresFromCache',
            {
                projectUuid,
                exploreNames,
            },
            async (span) => {
                const query = this.database(CachedExploreTableName)
                    .select('explore', 'cached_explore_uuid')
                    .where('project_uuid', projectUuid);
                if (exploreNames) {
                    void query.whereIn('name', exploreNames);
                }
                const explores = await query;
                span.setAttribute('foundExplores', !!explores.length);

                const finalExplores = wrapSentryTransactionSync(
                    'ProjectModel.findExploresFromCache.convertExplores',
                    { exploresCount: explores.length },
                    () =>
                        explores.reduce<Record<string, Explore | ExploreError>>(
                            (acc, { explore, cached_explore_uuid }) => {
                                if (
                                    !isJsonObject(explore) ||
                                    typeof explore.name !== 'string'
                                ) {
                                    return acc;
                                }
                                const exploreKey =
                                    key === 'name'
                                        ? explore.name
                                        : cached_explore_uuid;
                                acc[exploreKey] =
                                    ProjectModel.convertMetricFiltersFieldIdsToFieldRef(
                                        explore as Explore | ExploreError,
                                    );
                                return acc;
                            },
                            Object.create(null) as Record<
                                string,
                                Explore | ExploreError
                            >,
                        ),
                );

                return finalExplores;
            },
        );
    }

    /**
     * Sums the on-disk (TOAST) byte size of the `explore` column for the
     * matched rows via `pg_column_size`, which reads the stored/compressed
     * size from the TOAST pointer rather than detoasting the full JSONB
     * value. Used for cache-read telemetry and to select the explore-summary
     * read strategy.
     */
    async getCachedExploreStorageBytes(
        projectUuid: string,
        exploreNamesWithDuplicates?: string[],
    ): Promise<number> {
        const { totalBytes } = await this.getCachedExploreStorageStats(
            projectUuid,
            exploreNamesWithDuplicates,
        );
        return totalBytes;
    }

    async getCachedExploreStorageStats(
        projectUuid: string,
        exploreNamesWithDuplicates?: string[],
    ): Promise<CachedExploreStorageStats> {
        const exploreNames = exploreNamesWithDuplicates
            ? [...new Set(exploreNamesWithDuplicates)]
            : undefined;
        const query = this.database(CachedExploreTableName)
            .select<{ exploreCount: string; totalBytes: string }[]>(
                this.database.raw(
                    'COUNT(*)::bigint as "exploreCount", COALESCE(SUM(pg_column_size("explore")), 0)::bigint as "totalBytes"',
                ),
            )
            .where('project_uuid', projectUuid);
        if (exploreNames) {
            void query.whereIn('name', exploreNames);
        }
        const [row] = await query;
        return {
            exploreCount: Number(row?.exploreCount ?? 0),
            totalBytes: Number(row?.totalBytes ?? 0),
        };
    }

    async findExploreTableSummariesFromCache(
        projectUuid: string,
        exploreNamesWithDuplicates?: string[],
        readContext?: ExploreCacheReadContext,
    ): Promise<Record<string, ExploreTableSummaryRecord>> {
        const exploreNames = exploreNamesWithDuplicates
            ? [...new Set(exploreNamesWithDuplicates)]
            : undefined;

        return wrapSentryTransaction(
            'ProjectModel.findExploreTableSummariesFromCache',
            { projectUuid, exploreNames },
            async (span) => {
                const { exploreCount, totalBytes } =
                    await this.getCachedExploreStorageStats(
                        projectUuid,
                        exploreNames,
                    );
                const storedBytesPerExplore =
                    exploreCount === 0 ? undefined : totalBytes / exploreCount;
                const projectionThresholdBytesPerExplore =
                    this.lightdashConfig.query
                        .exploreSummaryProjectionMinStoredBytesPerExplore;
                const shouldReadFullExplores =
                    exploreCount > 0 &&
                    projectionThresholdBytesPerExplore > 0 &&
                    storedBytesPerExplore !== undefined &&
                    storedBytesPerExplore < projectionThresholdBytesPerExplore;

                if (readContext) {
                    Object.assign(readContext, {
                        readStrategy: shouldReadFullExplores
                            ? ('full-explore-read' as const)
                            : ('table-summary-projection' as const),
                        storedExploreBytes: totalBytes,
                        storedBytesPerExplore,
                        projectionThresholdBytesPerExplore,
                    });
                }

                if (exploreCount === 0) {
                    span.setAttribute('foundExplores', false);
                    return Object.create(null) as Record<
                        string,
                        ExploreTableSummaryRecord
                    >;
                }

                if (shouldReadFullExplores) {
                    const fullExplores = await this.findExploresFromCache(
                        projectUuid,
                        'name',
                        exploreNames,
                    );
                    const summaries = Object.values(fullExplores).reduce<
                        Record<string, ExploreTableSummaryRecord>
                    >((acc, explore) => {
                        const summary = toExploreTableSummaryRecord(explore);
                        if (summary) {
                            acc[summary.name] = summary;
                        }
                        return acc;
                    }, Object.create(null));
                    span.setAttribute(
                        'foundExplores',
                        !!Object.keys(summaries).length,
                    );
                    return summaries;
                }

                const query = this.database(CachedExploreTableName)
                    .select<RawExploreTableSummaryRow[]>(
                        this.database.raw(`
                            explore_summary.name as "exploreName",
                            explore_summary.type as "exploreType",
                            explore_summary."baseTable" as "baseTable",
                            explore_summary."hasErrors" as "hasErrors",
                            table_entry.key as "tableKey",
                            table_entry.value->'name' as "tableName",
                            table_entry.value->'originalName' as "originalName",
                            table_entry.value->'database' as "database",
                            table_entry.value->'schema' as "schema",
                            table_entry.value->'description' as "description",
                            jsonb_exists(table_entry.value, 'description') as "hasDescription",
                            table_entry.value->'sqlTable' as "sqlTable",
                            table_entry.value->'ymlPath' as "ymlPath",
                            table_entry.value->'dbtSourceUuid' as "dbtSourceUuid"
                        `),
                    )
                    .joinRaw(
                        `LEFT JOIN LATERAL (
                            SELECT
                                explore_fields.name,
                                explore_fields.type,
                                explore_fields."baseTable",
                                explore_fields.tables,
                                jsonb_exists(${CachedExploreTableName}.explore, 'errors') as "hasErrors"
                            FROM jsonb_to_record(
                                CASE
                                    WHEN jsonb_typeof(${CachedExploreTableName}.explore) = 'object'
                                        THEN ${CachedExploreTableName}.explore
                                    ELSE '{}'::jsonb
                                END
                            ) AS explore_fields(
                                name text,
                                type text,
                                "baseTable" text,
                                tables jsonb
                            )
                            OFFSET 0
                        ) AS explore_summary ON TRUE
                        LEFT JOIN LATERAL jsonb_each(
                            CASE
                                WHEN jsonb_typeof(explore_summary.tables) = 'object' THEN explore_summary.tables
                                ELSE '{}'::jsonb
                            END
                        ) AS table_entry(key, value)
                            ON jsonb_typeof(table_entry.value) = 'object'`,
                    )
                    .where(
                        `${CachedExploreTableName}.project_uuid`,
                        projectUuid,
                    )
                    .whereRaw(
                        `jsonb_typeof(${CachedExploreTableName}.explore->'name') = 'string'`,
                    )
                    .whereNotNull('explore_summary.name');

                if (exploreNames) {
                    void query.whereIn(
                        `${CachedExploreTableName}.name`,
                        exploreNames,
                    );
                }

                const rows = await query;
                const explores = reduceExploreTableSummaryRows(rows);

                span.setAttribute(
                    'foundExplores',
                    !!Object.keys(explores).length,
                );
                return explores;
            },
        );
    }

    async getCachedExploreNames(projectUuid: string): Promise<string[]> {
        const rows = await this.database(CachedExploreTableName)
            .select<{ name: string }[]>('name')
            .where('project_uuid', projectUuid);
        return rows.map((row) => row.name);
    }

    async getExploreConnectionUuid(
        projectUuid: string,
        exploreName: string,
    ): Promise<string | null> {
        const row = await this.database(CachedExploreTableName)
            .select<{ connection_uuid: string | null }>('connection_uuid')
            .where('project_uuid', projectUuid)
            .where('name', exploreName)
            .first();
        if (!row) {
            throw new NotFoundError(`Explore "${exploreName}" not found`);
        }
        return row.connection_uuid ?? null;
    }

    async getExploreConnectionUuids(
        projectUuid: string,
        exploreNames: string[],
    ): Promise<Map<string, string | null>> {
        if (exploreNames.length === 0) return new Map();
        const rows = await this.database(CachedExploreTableName)
            .select<{ name: string; connection_uuid: string | null }[]>([
                'name',
                'connection_uuid',
            ])
            .where('project_uuid', projectUuid)
            .whereIn('name', exploreNames);
        return new Map(
            rows.map(({ name, connection_uuid: connectionUuid }) => [
                name,
                connectionUuid ?? null,
            ]),
        );
    }

    async findVirtualViewsFromCache(
        projectUuid: string,
    ): Promise<Record<string, Explore | ExploreError>> {
        const virtualViews = await this.database(CachedExploreTableName)
            .select('explore')
            .where('project_uuid', projectUuid)
            .whereRaw("explore->>'type' = ?", [ExploreType.VIRTUAL]);

        return virtualViews.reduce<Record<string, Explore | ExploreError>>(
            (acc, { explore }) => {
                acc[explore.name] = explore;
                return acc;
            },
            {},
        );
    }

    async getAllExploresFromCache(
        projectUuid: string,
    ): Promise<{ [exploreUuid: string]: Explore | ExploreError }> {
        const cachedExplores = await this.database(CachedExploreTableName)
            .select<
                {
                    cached_explore_uuid: string;
                    explore: Explore | ExploreError;
                }[]
            >(['explore', 'cached_explore_uuid'])
            .where('project_uuid', projectUuid);

        return cachedExplores.reduce<Record<string, Explore | ExploreError>>(
            (acc, { cached_explore_uuid, explore }) => {
                acc[cached_explore_uuid] = explore;
                return acc;
            },
            {},
        );
    }

    /**
     * Get all explore summaries with only the fields needed for the summary view.
     * This is optimized to avoid detoasting the full explore JSON per projected field by
     * extracting every field once per row with a single lateral jsonb_to_record.
     * @param projectUuid - The project uuid.
     * @returns An array of lightweight explore summary objects.
     */
    async getAllExploreSummaries(projectUuid: string): Promise<
        Array<
            SummaryExplore & {
                baseTableRequiredAttributes: Explore['tables'][string]['requiredAttributes'];
                baseTableAnyAttributes: Explore['tables'][string]['anyAttributes'];
            }
        >
    > {
        const summaries = await this.database(CachedExploreTableName)
            .select<RawSummaryRow[]>(
                this.database.raw(`
                    explore_summary."name" as "name",
                    explore_summary."label" as "label",
                    explore_summary."tags" as "tags",
                    explore_summary."groupLabel" as "groupLabel",
                    explore_summary."groups" as "groups",
                    explore_summary."type" as "type",
                    explore_summary."preAggregateSource" as "preAggregateSource",
                    explore_summary."externalSource" as "externalSource",
                    explore_summary."errors" as "errors",
                    explore_summary."warnings" as "warnings",
                    explore_summary."baseTable" as "baseTable",
                    base_table.value->>'database' as "baseTableDatabase",
                    base_table.value->>'schema' as "baseTableSchema",
                    base_table.value->>'description' as "baseTableDescription",
                    base_table.value->>'connectionUuid' as "connectionUuid",
                    base_table.value->'requiredAttributes' as "baseTableRequiredAttributes",
                    base_table.value->'anyAttributes' as "baseTableAnyAttributes",
                    explore_summary."aiHint" as "aiHint",
                    explore_summary."customMeta" as "customMeta"
                `),
            )
            .joinRaw(
                `LEFT JOIN LATERAL jsonb_to_record(
                    CASE
                        WHEN jsonb_typeof(${CachedExploreTableName}.explore) = 'object'
                            THEN ${CachedExploreTableName}.explore
                        ELSE '{}'::jsonb
                    END
                ) AS explore_summary(
                    "name" jsonb,
                    "label" jsonb,
                    "tags" jsonb,
                    "groupLabel" jsonb,
                    "groups" jsonb,
                    "type" jsonb,
                    "preAggregateSource" jsonb,
                    "externalSource" jsonb,
                    "errors" jsonb,
                    "warnings" jsonb,
                    "baseTable" text,
                    "tables" jsonb,
                    "aiHint" jsonb,
                    "customMeta" jsonb
                ) ON TRUE
                LEFT JOIN LATERAL (
                    SELECT explore_summary."tables" -> explore_summary."baseTable" AS value
                ) AS base_table ON TRUE`,
            )
            .where('project_uuid', projectUuid);

        return summaries.map((row) => ({
            name: row.name,
            label: row.label,
            tags: row.tags,
            groupLabel: row.groupLabel ?? undefined,
            groups: row.groups ?? undefined,
            databaseName: row.baseTableDatabase,
            schemaName: row.baseTableSchema,
            description: row.baseTableDescription ?? undefined,
            connectionUuid: row.connectionUuid,
            aiHint: row.aiHint ?? undefined,
            customMeta: row.customMeta ?? undefined,
            type: row.type ?? undefined,
            preAggregateSource: row.preAggregateSource ?? undefined,
            externalSource: row.externalSource ?? undefined,
            baseTableRequiredAttributes:
                row.baseTableRequiredAttributes ?? undefined,
            baseTableAnyAttributes: row.baseTableAnyAttributes ?? undefined,
            ...(row.errors ? { errors: row.errors } : {}), // Fatal errors from ExploreError
            ...(row.warnings ? { warnings: row.warnings } : {}), // Non-fatal warnings from partial compilation
        }));
    }

    async getExploreFromCache(
        projectUuid: string,
        exploreName: string,
    ): Promise<Explore | ExploreError> {
        const cachedExplores = await this.findExploresFromCache(
            projectUuid,
            'name',
            [exploreName],
        );
        const cachedExplore = cachedExplores[exploreName];
        if (cachedExplore === undefined) {
            const candidateExploreNames = await this.findExploreSplitCandidates(
                projectUuid,
                exploreName,
            );
            if (candidateExploreNames.length >= 2) {
                throw new ExploreSplitError(exploreName, candidateExploreNames);
            }
            throw new NotFoundError(`Explore "${exploreName}" does not exist.`);
        }
        return cachedExplore;
    }

    async findExploreSplitCandidates(
        projectUuid: string,
        exploreName: string,
    ): Promise<string[]> {
        const splitLookupReadContext = newExploreCacheReadContext(
            'split-lookup',
            undefined,
        );
        const { result: allCachedExplores } = await measureTime(
            async () => {
                const explores = await this.findExploreTableSummariesFromCache(
                    projectUuid,
                    undefined,
                    splitLookupReadContext,
                );
                Object.assign(splitLookupReadContext, {
                    ...summarizeExploreCacheRead(explores),
                });
                return explores;
            },
            'ProjectModel.findExploreSplitCandidates.cachedExploreRead',
            Logger,
            splitLookupReadContext,
        );
        return getExploreSplitCandidates(
            exploreName,
            Object.values(allCachedExplores),
        );
    }

    async findExploreByTableName(
        projectUuid: string,
        tableName: string,
    ): Promise<Explore | ExploreError | undefined> {
        const cachedExplores = await this.findExploresFromCache(
            projectUuid,
            'name',
            [tableName],
        );
        return cachedExplores[tableName];
    }

    async findExploreNamesContainingTables(
        projectUuid: string,
        tableNames: string[],
    ): Promise<string[]> {
        if (tableNames.length === 0) return [];
        const query = this.database(CachedExploreTableName)
            .select<{ name: string }[]>('name')
            .where('project_uuid', projectUuid);
        for (const tableName of new Set(tableNames)) {
            query.andWhereRaw('? = ANY(table_names)', [tableName]);
        }
        return (await query).map(({ name }) => name);
    }

    private async findExploreCacheContainingTable(
        projectUuid: string,
        tableName: string,
    ): Promise<
        | {
              explore: Explore | ExploreError;
              baseMatch: boolean;
          }
        | undefined
    > {
        return this.database(CachedExploreTableName)
            .columns({
                explore: 'explore',
                baseMatch: this.database.raw("? = explore->>'baseTable'", [
                    tableName,
                ]),
            })
            .select<{
                explore: Explore | ExploreError;
                baseMatch: boolean;
            }>()
            .whereRaw('? = ANY(table_names)', tableName)
            .andWhere('project_uuid', projectUuid)
            .orderBy('baseMatch', 'desc')
            .first();
    }

    async findExploreContainingTable(
        projectUuid: string,
        tableName: string,
    ): Promise<Explore | ExploreError | undefined> {
        return wrapSentryTransaction(
            'ProjectModel.findExploreContainingTable',
            {},
            async (span) => {
                const exploreCache = await this.findExploreCacheContainingTable(
                    projectUuid,
                    tableName,
                );
                span.setAttribute(
                    'foundExploreContainingTable',
                    !!exploreCache,
                );
                return exploreCache
                    ? ProjectModel.convertMetricFiltersFieldIdsToFieldRef(
                          exploreCache.explore,
                      )
                    : undefined;
            },
        );
    }

    // Returns explore based on the join original name rather than the explore with the join.
    async findJoinAliasExplore(
        projectUuid: string,
        joinAliasName: string,
    ): Promise<Explore | ExploreError | undefined> {
        return wrapSentryTransaction(
            'ProjectModel.findExploreFromJoinAlias',
            {},
            async (span) => {
                const exploreWithJoinAlias =
                    await this.findExploreCacheContainingTable(
                        projectUuid,
                        joinAliasName,
                    );
                if (exploreWithJoinAlias) {
                    const originalTableName =
                        exploreWithJoinAlias.explore.tables?.[joinAliasName]
                            .originalName;
                    if (originalTableName) {
                        const exploreCache = await this.database(
                            CachedExploreTableName,
                        )
                            .select('explore')
                            .where('name', originalTableName)
                            .andWhere('project_uuid', projectUuid)
                            .first();
                        span.setAttribute(
                            'foundExploreCacheViaJoinAlias',
                            !!exploreCache,
                        );
                        return exploreCache
                            ? ProjectModel.convertMetricFiltersFieldIdsToFieldRef(
                                  exploreCache.explore,
                              )
                            : undefined;
                    }
                }

                return undefined;
            },
        );
    }

    async saveExploresToCache(
        projectUuid: string,
        explores: (Explore | ExploreError)[],
        complete = false,
        dbtModelNames?: string[],
        _sourceUuid?: string,
    ) {
        return wrapSentryTransaction(
            'ProjectModel.saveExploresToCache',
            {},
            async () =>
                this.database.transaction(async (trx) => {
                    await ProjectModel.lockAndEnsureCachedExplores(
                        trx,
                        projectUuid,
                    );
                    const cachedExploresQuery = trx(CachedExploreTableName)
                        .select<
                            {
                                explore: Explore | ExploreError;
                                connection_uuid: string | null;
                            }[]
                        >('explore', 'connection_uuid')
                        .where('project_uuid', projectUuid);
                    if (complete) {
                        cachedExploresQuery.whereRaw(
                            "explore->>'type' = ANY(?)",
                            [[...USER_MANAGED_EXPLORE_TYPES]],
                        );
                    }
                    const cachedExplores = await cachedExploresQuery;
                    cachedExplores.forEach(({ explore, connection_uuid }) =>
                        stampExploreConnectionUuid(explore, connection_uuid),
                    );
                    const retainedNames = new Set([
                        ...(dbtModelNames ?? []),
                        ...explores.map((explore) => explore.name),
                    ]);
                    const hasCombinedSources = cachedExplores.some(
                        ({ explore }) =>
                            Object.values(explore.tables ?? {}).some(
                                (table) => table.dbtSourceUuid !== undefined,
                            ),
                    );
                    const deletedNames =
                        !complete &&
                        dbtModelNames !== undefined &&
                        !hasCombinedSources
                            ? cachedExplores
                                  .filter(({ explore }) => {
                                      const sourceName =
                                          explore.preAggregateSource
                                              ?.sourceExploreName ??
                                          explore.tables?.[
                                              explore.baseTable ?? explore.name
                                          ]?.nestedFrom?.parentTable ??
                                          explore.name;
                                      return (
                                          !isUserManagedExplore(explore) &&
                                          !retainedNames.has(sourceName)
                                      );
                                  })
                                  .map(({ explore }) => explore.name)
                            : [];
                    if (deletedNames.length > 0) {
                        await trx(CachedExploreTableName)
                            .where('project_uuid', projectUuid)
                            .whereIn('name', deletedNames)
                            .delete();
                    }
                    const deletedNamesSet = new Set(deletedNames);
                    const userManagedExplores = cachedExplores.filter(
                        ({ explore }) => isUserManagedExplore(explore),
                    );
                    const userManagedExploresByName = new Map(
                        userManagedExplores.map(({ explore }) => [
                            explore.name,
                            explore,
                        ]),
                    );

                    // NOTE: user-managed explores (virtual views, external source tables)
                    // with the same name as explores will override the explore.
                    // This isn't new behavior, but it's still a bit of a bug. However, it's
                    // not clear what a better approach would be at the moment.
                    const exploresMap = new Map(
                        complete
                            ? []
                            : cachedExplores
                                  .filter(
                                      ({ explore }) =>
                                          !deletedNamesSet.has(explore.name),
                                  )
                                  .map(({ explore }) => [
                                      explore.name,
                                      explore,
                                  ]),
                    );
                    explores.forEach((explore) =>
                        exploresMap.set(explore.name, explore),
                    );
                    userManagedExplores.forEach((e) =>
                        exploresMap.set(e.explore.name, e.explore),
                    );
                    const uniqueExplores = Array.from(exploresMap.values());

                    if (
                        uniqueExplores.length <= 0 &&
                        (complete || dbtModelNames === undefined)
                    ) {
                        throw new ParameterError('No explores to save');
                    }

                    const exploresToSave = complete
                        ? uniqueExplores
                        : Array.from(
                              new Map(
                                  explores.map((explore) => [
                                      explore.name,
                                      explore,
                                  ]),
                              ).values(),
                          ).map(
                              (explore) =>
                                  userManagedExploresByName.get(explore.name) ??
                                  explore,
                          );

                    if (complete) {
                        await trx(CachedExploreTableName)
                            .where('project_uuid', projectUuid)
                            .delete();
                    }

                    // Serialise one explore at a time so a chunk can be built, inserted and
                    // released. Building every row up front held the whole set as strings.
                    let savedBytes = 0;
                    function* sizedRows() {
                        // eslint-disable-next-line no-restricted-syntax
                        for (const explore of exploresToSave) {
                            const serialised = JSON.stringify(explore);
                            savedBytes += Buffer.byteLength(serialised);
                            yield {
                                row: {
                                    project_uuid: projectUuid,
                                    connection_uuid:
                                        getExploreStoredConnectionUuid(explore),
                                    name: explore.name,
                                    table_names: Object.keys(
                                        explore.tables || {},
                                    ),
                                    explore: serialised,
                                },
                                bytes: Buffer.byteLength(serialised),
                            };
                        }
                    }

                    const individualCachedExplores: {
                        cached_explore_uuid: string;
                    }[] = [];
                    let chunkCount = 0;
                    let largestChunkBytes = 0;
                    // Sequential, not Promise.all: every chunk statement was alive at once.
                    // eslint-disable-next-line no-restricted-syntax
                    for (const { rows, bytes } of chunkRowsByBytes(
                        sizedRows(),
                    )) {
                        chunkCount += 1;
                        largestChunkBytes = Math.max(largestChunkBytes, bytes);
                        const insertQuery = trx<DbCachedExplore>(
                            CachedExploreTableName,
                        ).insert(rows);
                        // eslint-disable-next-line no-await-in-loop
                        const saved = await (complete
                            ? insertQuery.returning('cached_explore_uuid')
                            : insertQuery
                                  .onConflict(['name', 'project_uuid'])
                                  .merge([
                                      'connection_uuid',
                                      'table_names',
                                      'explore',
                                  ])
                                  .returning('cached_explore_uuid'));
                        individualCachedExplores.push(...saved);
                    }

                    Logger.info(
                        `dbt.compile.saveExplores projectUuid=${projectUuid} explores=${uniqueExplores.length} chunks=${chunkCount} largestChunkBytes=${largestChunkBytes}`,
                        {
                            event: 'dbt.compile.saveExplores',
                            projectUuid,
                            explores: uniqueExplores.length,
                            chunks: chunkCount,
                            largestChunkBytes,
                            savedBytes,
                        },
                    );

                    return {
                        cachedExploreUuids: individualCachedExplores.map(
                            (explore) => explore.cached_explore_uuid,
                        ),
                    };
                }),
        );
    }

    async saveExploreStreamToCache(
        projectUuid: string,
        explores: AsyncIterable<Explore | ExploreError>,
    ): Promise<{ cachedExploreUuids: string[] }> {
        return wrapSentryTransaction(
            'ProjectModel.saveExploresToCache',
            {},
            async () => {
                const saveUuid = uuidv4();
                try {
                    const stageStartedAt = performance.now();
                    let savedBytes = 0;
                    const stagedNames = new Set<string>();
                    const stagedNameOrder: string[] = [];
                    const sizedRows = async function* sizedRowsGenerator() {
                        for await (const explore of explores) {
                            if (!stagedNames.has(explore.name)) {
                                stagedNames.add(explore.name);
                                stagedNameOrder.push(explore.name);
                            }
                            const serialised = JSON.stringify(explore);
                            const bytes = Buffer.byteLength(serialised);
                            savedBytes += bytes;
                            yield {
                                row: {
                                    save_uuid: saveUuid,
                                    project_uuid: projectUuid,
                                    connection_uuid:
                                        getExploreStoredConnectionUuid(explore),
                                    name: explore.name,
                                    table_names: Object.keys(
                                        explore.tables || {},
                                    ),
                                    explore: serialised,
                                },
                                bytes,
                            };
                        }
                    };

                    let chunkCount = 0;
                    let largestChunkBytes = 0;
                    for await (const { rows, bytes } of chunkAsyncRowsByBytes(
                        sizedRows(),
                    )) {
                        const uniqueRows = Array.from(
                            new Map(
                                rows.map((row) => [row.name, row]),
                            ).values(),
                        );
                        await this.database<DbCachedExploreStaging>(
                            CachedExploreStagingTableName,
                        )
                            .insert(uniqueRows)
                            .onConflict(['save_uuid', 'name', 'project_uuid'])
                            .merge([
                                'connection_uuid',
                                'table_names',
                                'explore',
                            ]);
                        chunkCount += 1;
                        largestChunkBytes = Math.max(largestChunkBytes, bytes);
                    }
                    const stageDurationMs = Math.round(
                        performance.now() - stageStartedAt,
                    );

                    const swapStartedAt = performance.now();
                    const { promotedRows, managedNames } =
                        await this.database.transaction(async (trx) => {
                            await ProjectModel.lockAndEnsureCachedExplores(
                                trx,
                                projectUuid,
                            );
                            const managedResult = await trx.raw<{
                                rows: {
                                    name: string;
                                    cached_explore_uuid: string;
                                }[];
                            }>(
                                `INSERT INTO ?? (save_uuid, project_uuid, connection_uuid, name, table_names, explore)
                                 SELECT ?, project_uuid, connection_uuid, name, table_names, explore
                                 FROM ??
                                 WHERE project_uuid = ?
                                   AND explore->>'type' = ANY(?)
                                 ON CONFLICT (save_uuid, name, project_uuid) DO UPDATE
                                 SET connection_uuid = EXCLUDED.connection_uuid,
                                     table_names = EXCLUDED.table_names,
                                     explore = EXCLUDED.explore
                                 RETURNING name, cached_explore_uuid`,
                                [
                                    CachedExploreStagingTableName,
                                    saveUuid,
                                    CachedExploreTableName,
                                    projectUuid,
                                    [...USER_MANAGED_EXPLORE_TYPES],
                                ],
                            );
                            const expectedNames = new Set(stagedNames);
                            managedResult.rows.forEach(({ name }) =>
                                expectedNames.add(name),
                            );
                            if (expectedNames.size === 0) {
                                throw new ParameterError('No explores to save');
                            }
                            const lockedStagedRows = await trx(
                                CachedExploreStagingTableName,
                            )
                                .select<{ name: string }[]>('name')
                                .where({
                                    save_uuid: saveUuid,
                                    project_uuid: projectUuid,
                                })
                                .forUpdate();
                            if (
                                lockedStagedRows.length !==
                                    expectedNames.size ||
                                lockedStagedRows.some(
                                    ({ name }) => !expectedNames.has(name),
                                )
                            ) {
                                throw new UnexpectedServerError(
                                    'Cached explore staging name set mismatch',
                                );
                            }
                            await trx(CachedExploreTableName)
                                .where('project_uuid', projectUuid)
                                .delete();
                            const promotedResult = await trx.raw<{
                                rows: {
                                    name: string;
                                    cached_explore_uuid: string;
                                }[];
                            }>(
                                `INSERT INTO ?? (cached_explore_uuid, project_uuid, connection_uuid, name, table_names, explore)
                                 SELECT cached_explore_uuid,
                                        project_uuid,
                                        connection_uuid,
                                        name,
                                        table_names,
                                        explore
                                 FROM ??
                                 WHERE save_uuid = ? AND project_uuid = ?
                                 RETURNING name, cached_explore_uuid`,
                                [
                                    CachedExploreTableName,
                                    CachedExploreStagingTableName,
                                    saveUuid,
                                    projectUuid,
                                ],
                            );
                            return {
                                promotedRows: promotedResult.rows,
                                managedNames: managedResult.rows.map(
                                    ({ name }) => name,
                                ),
                            };
                        });
                    const swapDurationMs = Math.round(
                        performance.now() - swapStartedAt,
                    );
                    const cachedExploreUuidsByName = new Map(
                        promotedRows.map(
                            ({
                                name,
                                cached_explore_uuid: cachedExploreUuid,
                            }) => [name, cachedExploreUuid],
                        ),
                    );
                    const resultNames = [...stagedNameOrder];
                    for (const name of managedNames) {
                        if (!stagedNames.has(name)) resultNames.push(name);
                    }
                    Logger.info(
                        `dbt.compile.saveExplores projectUuid=${projectUuid} explores=${cachedExploreUuidsByName.size} chunks=${chunkCount} largestChunkBytes=${largestChunkBytes} stageDurationMs=${stageDurationMs} swapDurationMs=${swapDurationMs}`,
                        {
                            event: 'dbt.compile.saveExplores',
                            projectUuid,
                            explores: cachedExploreUuidsByName.size,
                            chunks: chunkCount,
                            largestChunkBytes,
                            savedBytes,
                            stageDurationMs,
                            swapDurationMs,
                        },
                    );
                    return {
                        cachedExploreUuids: resultNames.map((name) => {
                            const cachedExploreUuid =
                                cachedExploreUuidsByName.get(name);
                            if (cachedExploreUuid === undefined) {
                                throw new UnexpectedServerError(
                                    `Missing cached explore UUID for ${name}`,
                                );
                            }
                            return cachedExploreUuid;
                        }),
                    };
                } finally {
                    const cleanupErrors: Error[] = [];
                    try {
                        await this.database(CachedExploreStagingTableName)
                            .where('save_uuid', saveUuid)
                            .delete();
                    } catch (error) {
                        cleanupErrors.push(
                            error instanceof Error
                                ? error
                                : new Error(String(error)),
                        );
                    }
                    try {
                        await this.database(CachedExploreStagingTableName)
                            .whereIn(
                                'save_uuid',
                                this.database(CachedExploreStagingTableName)
                                    .select('save_uuid')
                                    .groupBy('save_uuid')
                                    .havingRaw(
                                        "max(created_at) < now() - interval '24 hours'",
                                    )
                                    .limit(100),
                            )
                            .delete();
                    } catch (error) {
                        cleanupErrors.push(
                            error instanceof Error
                                ? error
                                : new Error(String(error)),
                        );
                    }
                    if (cleanupErrors.length > 0) {
                        Logger.error(
                            `dbt.compile.saveExplores.cleanupFailed projectUuid=${projectUuid} saveUuid=${saveUuid} errors=${cleanupErrors.length}`,
                            {
                                event: 'dbt.compile.saveExplores.cleanupFailed',
                                projectUuid,
                                saveUuid,
                                errors: cleanupErrors.map(
                                    (error) => error.message,
                                ),
                            },
                        );
                    }
                }
            },
        );
    }

    async stampProjectContent(
        projectUuid: string,
        connectionUuid: string,
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            await trx(CachedExploreTableName)
                .where({ project_uuid: projectUuid })
                .whereNull('connection_uuid')
                .update({ connection_uuid: connectionUuid });
            await trx(SavedSqlVersionsTableName)
                .whereNull('connection_uuid')
                .whereIn(
                    'saved_sql_uuid',
                    trx(SavedSqlTableName)
                        .select('saved_sql_uuid')
                        .where({ project_uuid: projectUuid }),
                )
                .update({ connection_uuid: connectionUuid });
        });
    }

    async tryAcquireProjectLock(
        projectUuid: string,
        onLockAcquired: () => Promise<void>,
        onLockFailed?: () => Promise<void>,
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            // pg_advisory_xact_lock takes a 64bit integer as key
            // we can't use project_uuid (uuidv4) as key, not even a hash,
            // so we will be using autoinc project_id from DB.
            const projectLock = await trx.raw(`
                SELECT pg_try_advisory_xact_lock(${CACHED_EXPLORES_PG_LOCK_NAMESPACE}, project_id)
                FROM projects
                WHERE project_uuid = '${projectUuid}' LIMIT 1  `);

            if (projectLock.rows.length === 0) return; // No project with uuid in DB
            const acquiresLock = projectLock.rows[0].pg_try_advisory_xact_lock;
            if (acquiresLock) {
                await onLockAcquired();
            } else if (onLockFailed) {
                await onLockFailed();
            }
        });
    }

    /**
     * Who holds the compile lock for a project, and for how long.
     *
     * A retry blocked by a zombie compile otherwise reads "Compilation is already in progress"
     * about a job the server has already declared failed, with nothing to identify the holder.
     */
    async getProjectLockHolder(projectUuid: string): Promise<{
        heldForSeconds: number;
        backendPid: number;
        applicationName: string | null;
    } | null> {
        const result = await this.database.raw(
            `
            SELECT a.pid,
                   a.application_name,
                   EXTRACT(EPOCH FROM (now() - a.xact_start)) AS held_for_seconds
            FROM pg_locks l
            JOIN pg_stat_activity a ON a.pid = l.pid
            JOIN projects p ON p.project_uuid = ?
            WHERE l.locktype = 'advisory'
              AND l.classid = ?
              AND l.objid = p.project_id
              AND l.granted
            ORDER BY a.xact_start ASC
            LIMIT 1`,
            [projectUuid, CACHED_EXPLORES_PG_LOCK_NAMESPACE],
        );
        const row = result.rows[0];
        if (!row) return null;
        return {
            heldForSeconds: Math.round(Number(row.held_for_seconds ?? 0)),
            backendPid: Number(row.pid),
            applicationName: row.application_name ?? null,
        };
    }

    async getWarehouseFromCache(
        projectUuid: string,
        connectionUuid?: string,
    ): Promise<WarehouseCatalog | undefined> {
        const { connection, isSole } = await this.resolveConnectionScope(
            projectUuid,
            connectionUuid,
        );
        const cachedWarehouse = await this.database(
            ProjectConnectionCatalogCacheTableName,
        )
            .select('warehouse')
            .where('project_uuid', projectUuid)
            .where('connection_uuid', connection.connectionUuid)
            .first();
        if (cachedWarehouse) return cachedWarehouse.warehouse;

        if (isSole) {
            const legacyWarehouse = await this.database(
                CachedWarehouseTableName,
            )
                .select('warehouse')
                .where('project_uuid', projectUuid)
                .first();
            if (legacyWarehouse) return legacyWarehouse.warehouse;
        }
        return undefined;
    }

    async saveWarehouseToCache(
        projectUuid: string,
        warehouse: WarehouseCatalog,
        connectionUuid?: string,
    ): Promise<DbCachedWarehouse> {
        const { connection, isSole } = await this.resolveConnectionScope(
            projectUuid,
            connectionUuid,
        );
        return this.database.transaction(async (trx) => {
            const [cachedWarehouse] = await trx(
                ProjectConnectionCatalogCacheTableName,
            )
                .insert({
                    project_uuid: projectUuid,
                    connection_uuid: connection.connectionUuid,
                    warehouse: JSON.stringify(warehouse),
                })
                .onConflict(['project_uuid', 'connection_uuid'])
                .merge({ warehouse: JSON.stringify(warehouse) })
                .returning('*');
            if (isSole) {
                await trx(CachedWarehouseTableName)
                    .insert({
                        project_uuid: projectUuid,
                        warehouse: JSON.stringify(warehouse),
                    })
                    .onConflict('project_uuid')
                    .merge()
                    .returning('*');
            }
            return cachedWarehouse;
        });
    }

    async getProjectMemberAccess(
        projectUuid: string,
        userUuid: string,
    ): Promise<ProjectMemberProfile | undefined> {
        type QueryResult = {
            user_uuid: string;
            email: string;
            role: ProjectMemberRole;
            first_name: string;
            last_name: string;
            role_uuid: string | null;
        };
        const [projectMemberProfile] = await this.database(
            'project_memberships',
        )
            .leftJoin('users', 'project_memberships.user_id', 'users.user_id')
            .leftJoin('emails', 'emails.user_id', 'users.user_id')
            .leftJoin(
                'projects',
                'project_memberships.project_id',
                'projects.project_id',
            )
            .select<QueryResult[]>()
            .where('project_uuid', projectUuid)
            .where('users.user_uuid', userUuid)
            .andWhere('is_primary', true);

        if (projectMemberProfile === undefined) {
            return undefined;
        }
        return {
            userUuid: projectMemberProfile.user_uuid,
            projectUuid,
            role: projectMemberProfile.role,
            email: projectMemberProfile.email,
            firstName: projectMemberProfile.first_name,
            lastName: projectMemberProfile.last_name,
            roleUuid: projectMemberProfile.role_uuid || undefined,
        };
    }

    async hasProjectMembership(
        projectUuid: string,
        userUuid: string,
        { trx = this.database }: { trx?: Knex } = {},
    ): Promise<boolean> {
        const membership = await trx(ProjectMembershipsTableName)
            .innerJoin(
                ProjectTableName,
                `${ProjectMembershipsTableName}.project_id`,
                `${ProjectTableName}.project_id`,
            )
            .innerJoin(
                UserTableName,
                `${ProjectMembershipsTableName}.user_id`,
                `${UserTableName}.user_id`,
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid)
            .where(`${UserTableName}.user_uuid`, userUuid)
            .first(`${ProjectMembershipsTableName}.user_id`)
            .forShare();

        return membership !== undefined;
    }

    async getProjectAccess(
        projectUuid: string,
    ): Promise<ProjectMemberProfile[]> {
        type QueryResult = {
            user_uuid: string;
            email: string;
            role: ProjectMemberRole;
            first_name: string;
            last_name: string;
            role_uuid: string | null;
        };
        const projectMemberships = await this.database('project_memberships')
            .leftJoin('users', 'project_memberships.user_id', 'users.user_id')
            .leftJoin('emails', 'emails.user_id', 'users.user_id')
            .leftJoin(
                'projects',
                'project_memberships.project_id',
                'projects.project_id',
            )
            .select<(QueryResult & { has_extra_roles: boolean })[]>(
                'project_memberships.*',
                'users.*',
                'emails.*',
                'projects.*',
                this.database.raw(
                    `EXISTS (SELECT 1 FROM ?? AS x WHERE x.project_id = project_memberships.project_id AND x.user_id = project_memberships.user_id) AS has_extra_roles`,
                    [ProjectMembershipCustomRolesTableName],
                ),
            )
            .where('project_uuid', projectUuid)
            .andWhere('is_primary', true);

        return projectMemberships.map((membership) => ({
            userUuid: membership.user_uuid,
            email: membership.email,
            role: membership.role,
            firstName: membership.first_name,
            projectUuid,
            lastName: membership.last_name,
            roleUuid: membership.role_uuid || undefined,
            hasMultipleRoles: membership.has_extra_roles,
        }));
    }

    async copyConnectionsForPreview(
        sourceProjectUuid: string,
        targetProjectUuid: string,
        override?: {
            connectionUuid: string;
            warehouseConnection: CreateWarehouseCredentials;
            organizationWarehouseCredentialsUuid?: string;
        },
    ): Promise<Map<string, string>> {
        const sourceConnections =
            await this.connectionModel.listByProject(sourceProjectUuid);
        const connections = await Promise.all(
            sourceConnections.map(async (sourceConnection) => {
                const connection = await this.connectionModel.create(
                    targetProjectUuid,
                    sourceConnection.connectionUuid === override?.connectionUuid
                        ? {
                              warehouseConnection: override.warehouseConnection,
                              organizationWarehouseCredentialsUuid:
                                  override.organizationWarehouseCredentialsUuid,
                              name: sourceConnection.name,
                          }
                        : {
                              warehouseConnection:
                                  await this.connectionModel.getCredentials(
                                      sourceProjectUuid,
                                      sourceConnection.connectionUuid,
                                  ),
                              organizationWarehouseCredentialsUuid:
                                  sourceConnection.organizationWarehouseCredentialsUuid ??
                                  undefined,
                              name: sourceConnection.name,
                          },
                );
                return [
                    sourceConnection.connectionUuid,
                    connection.connectionUuid,
                ] as const;
            }),
        );
        return new Map(connections);
    }

    async copyProjectAccess(
        upstreamProjectUuid: string,
        previewProjectUuid: string,
    ): Promise<{
        userAccessCount: number;
        skippedUserAccessCount: number;
        groupAccessCount: number;
    }> {
        return this.database.transaction(async (trx) => {
            const projects = await trx(ProjectTableName)
                .select<
                    Pick<
                        DbProject,
                        'project_id' | 'project_uuid' | 'organization_id'
                    >[]
                >('project_id', 'project_uuid', 'organization_id')
                .whereIn('project_uuid', [
                    upstreamProjectUuid,
                    previewProjectUuid,
                ]);
            const upstreamProject = projects.find(
                ({ project_uuid }) => project_uuid === upstreamProjectUuid,
            );
            const previewProject = projects.find(
                ({ project_uuid }) => project_uuid === previewProjectUuid,
            );

            if (!upstreamProject || !previewProject) {
                throw new NotFoundError(
                    'Upstream or preview project not found',
                );
            }
            if (
                upstreamProject.organization_id !==
                previewProject.organization_id
            ) {
                throw new ParameterError(
                    'Upstream and preview projects must be in the same organization',
                );
            }

            type ProjectAccessRow = Pick<
                DbProjectMembership,
                'user_id' | 'role' | 'role_uuid'
            > & {
                is_internal: boolean;
                organization_id: number | null;
            };
            const projectAccesses = await trx(ProjectMembershipsTableName)
                .innerJoin(
                    UserTableName,
                    `${ProjectMembershipsTableName}.user_id`,
                    `${UserTableName}.user_id`,
                )
                .leftJoin(
                    OrganizationMembershipsTableName,
                    function joinPreviewOrganizationMembership() {
                        this.on(
                            `${OrganizationMembershipsTableName}.user_id`,
                            '=',
                            `${ProjectMembershipsTableName}.user_id`,
                        ).andOnVal(
                            `${OrganizationMembershipsTableName}.organization_id`,
                            previewProject.organization_id,
                        );
                    },
                )
                .select<ProjectAccessRow[]>({
                    user_id: `${ProjectMembershipsTableName}.user_id`,
                    role: `${ProjectMembershipsTableName}.role`,
                    role_uuid: `${ProjectMembershipsTableName}.role_uuid`,
                    is_internal: `${UserTableName}.is_internal`,
                    organization_id: `${OrganizationMembershipsTableName}.organization_id`,
                })
                .where(
                    `${ProjectMembershipsTableName}.project_id`,
                    upstreamProject.project_id,
                );
            const eligibleProjectAccesses = projectAccesses.filter(
                ({ is_internal, organization_id }) =>
                    !is_internal &&
                    organization_id === previewProject.organization_id,
            );
            const groupAccesses = await trx(ProjectGroupAccessTableName)
                .innerJoin(
                    GroupTableName,
                    `${ProjectGroupAccessTableName}.group_uuid`,
                    `${GroupTableName}.group_uuid`,
                )
                .select<
                    {
                        group_uuid: string;
                        role: ProjectMemberRole;
                        role_uuid: string | null;
                    }[]
                >(
                    `${ProjectGroupAccessTableName}.group_uuid`,
                    `${ProjectGroupAccessTableName}.role`,
                    `${ProjectGroupAccessTableName}.role_uuid`,
                )
                .where(
                    `${ProjectGroupAccessTableName}.project_uuid`,
                    upstreamProjectUuid,
                )
                .andWhere(
                    `${GroupTableName}.organization_id`,
                    previewProject.organization_id,
                );

            if (eligibleProjectAccesses.length > 0) {
                await trx(ProjectMembershipsTableName)
                    .insert(
                        eligibleProjectAccesses.map(
                            ({ user_id, role, role_uuid }) => ({
                                user_id,
                                project_id: previewProject.project_id,
                                role,
                                role_uuid,
                            }),
                        ),
                    )
                    .onConflict(['user_id', 'project_id'])
                    .merge(['role', 'role_uuid']);
                // Extra custom roles follow their membership into the preview.
                const eligibleUserIds = eligibleProjectAccesses.map(
                    ({ user_id }) => user_id,
                );
                await trx(ProjectMembershipCustomRolesTableName)
                    .where('project_id', previewProject.project_id)
                    .whereIn('user_id', eligibleUserIds)
                    .delete();
                await trx.raw(
                    `INSERT INTO ?? (project_id, user_id, role_uuid)
                     SELECT ?, user_id, role_uuid FROM ??
                     WHERE project_id = ? AND user_id = ANY(?)
                     ON CONFLICT DO NOTHING`,
                    [
                        ProjectMembershipCustomRolesTableName,
                        previewProject.project_id,
                        ProjectMembershipCustomRolesTableName,
                        upstreamProject.project_id,
                        eligibleUserIds,
                    ],
                );
            }
            if (groupAccesses.length > 0) {
                await trx(ProjectGroupAccessTableName)
                    .insert(
                        groupAccesses.map(
                            ({ group_uuid, role, role_uuid }) => ({
                                group_uuid,
                                project_uuid: previewProjectUuid,
                                role,
                                role_uuid,
                            }),
                        ),
                    )
                    .onConflict(['project_uuid', 'group_uuid'])
                    .merge(['role', 'role_uuid']);
                const groupUuids = groupAccesses.map(
                    ({ group_uuid }) => group_uuid,
                );
                await trx(ProjectGroupAccessCustomRolesTableName)
                    .where('project_uuid', previewProjectUuid)
                    .whereIn('group_uuid', groupUuids)
                    .delete();
                await trx.raw(
                    `INSERT INTO ?? (project_uuid, group_uuid, role_uuid)
                     SELECT ?, group_uuid, role_uuid FROM ??
                     WHERE project_uuid = ? AND group_uuid = ANY(?)
                     ON CONFLICT DO NOTHING`,
                    [
                        ProjectGroupAccessCustomRolesTableName,
                        previewProjectUuid,
                        ProjectGroupAccessCustomRolesTableName,
                        upstreamProjectUuid,
                        groupUuids,
                    ],
                );
            }

            return {
                userAccessCount: eligibleProjectAccesses.length,
                skippedUserAccessCount:
                    projectAccesses.length - eligibleProjectAccesses.length,
                groupAccessCount: groupAccesses.length,
            };
        });
    }

    async createProjectAccess(
        projectUuid: string,
        email: string,
        role: ProjectMemberRole,
        roleUuid?: string,
    ): Promise<void> {
        try {
            const [project] = await this.database('projects')
                .select('project_id', 'organization_id')
                .where('project_uuid', projectUuid);

            const [user] = await this.database('users')
                .leftJoin('emails', 'emails.user_id', 'users.user_id')
                .leftJoin(
                    OrganizationMembershipsTableName,
                    `${OrganizationMembershipsTableName}.user_id`,
                    'users.user_id',
                )
                .select('users.user_id')
                .where('email', email)
                // Defence: SAs have no email row so this is empty for them,
                // but the explicit guard documents intent.
                .andWhere('users.is_internal', false)
                .andWhere(
                    `${OrganizationMembershipsTableName}.organization_id`,
                    project.organization_id,
                );
            if (user === undefined) {
                throw new NotFoundError(
                    `Can't find user with email ${email} in the organization`,
                );
            }
            await this.database('project_memberships').insert({
                project_id: project.project_id,
                role,
                role_uuid: roleUuid || null,
                user_id: user.user_id,
            });
        } catch (error: AnyType) {
            if (
                error instanceof DatabaseError &&
                error.constraint === 'project_memberships_pkey'
            ) {
                throw new AlreadyExistsError(
                    `This user email ${email} already has access to this project`,
                );
            }
            throw error;
        }
    }

    async updateProjectAccess(
        projectUuid: string,
        userUuid: string,
        role: ProjectMemberRole,
    ): Promise<void> {
        // Clear role_uuid when switching to a system role so that stale FK
        // references don't prevent custom role deletion later (see #20690).
        // A singular write replaces the whole role set, so extras go too.
        await this.database.transaction(async (trx) => {
            const { rows } = await trx.raw<{
                rows: Pick<DbProjectMembership, 'project_id' | 'user_id'>[];
            }>(
                `
                UPDATE project_memberships AS m
                SET role = :role, role_uuid = NULL FROM projects AS p, users AS u
                WHERE p.project_id = m.project_id
                  AND u.user_id = m.user_id
                  AND user_uuid = :userUuid
                  AND p.project_uuid = :projectUuid
                    RETURNING m.project_id, m.user_id
            `,
                { projectUuid, userUuid, role },
            );
            await Promise.all(
                rows.map((row) =>
                    clearProjectExtraRoles(trx, row.project_id, row.user_id),
                ),
            );
        });
    }

    async updateMetadata(
        projectUuid: string,
        data: UpdateMetadata,
    ): Promise<void> {
        await this.database('projects')
            .update({
                copied_from_project_uuid: data.upstreamProjectUuid, // if upstreamProjectUuid is undefined, it will do nothing, if it is null, it will be unset
            })
            .where('project_uuid', projectUuid);
    }

    async updateDefaultUserSpaces(
        projectUuid: string,
        hasDefaultUserSpaces: boolean,
    ): Promise<void> {
        if (!hasDefaultUserSpaces) {
            await this.database(ProjectTableName)
                .update({ has_default_user_spaces: false })
                .where('project_uuid', projectUuid);
            return;
        }

        await this.database.transaction(async (trx) => {
            // 1. Set has_default_user_spaces = true and get project details
            const [project] = await trx(ProjectTableName)
                .update({ has_default_user_spaces: true })
                .where('project_uuid', projectUuid)
                .returning(['project_id', 'organization_id']);

            if (!project) {
                throw new NotFoundError(
                    `Project with uuid ${projectUuid} not found`,
                );
            }

            // 2. Find or create the "Default User Spaces" parent folder
            let parentSpace = await trx(SpaceTableName)
                .select('space_uuid', 'path')
                .where('project_id', project.project_id)
                .where('name', DEFAULT_USER_SPACES_PARENT_NAME)
                .whereNull('parent_space_uuid')
                .whereNull('deleted_at')
                .first();

            if (!parentSpace) {
                const parentSlug = await generateUniqueSlugScopedToProject(
                    trx,
                    project.project_id,
                    SpaceTableName,
                    DEFAULT_USER_SPACES_PARENT_NAME,
                );
                const parentPath = getLtreePathFromSlug(parentSlug);

                [parentSpace] = await trx(SpaceTableName)
                    .insert({
                        project_id: project.project_id,
                        name: DEFAULT_USER_SPACES_PARENT_NAME,
                        inherit_parent_permissions: true,
                        slug: parentSlug,
                        parent_space_uuid: null,
                        path: parentPath,
                        is_default_user_space: false,
                    })
                    .returning(['space_uuid', 'path']);
            }

            if (!parentSpace) {
                throw new UnexpectedServerError(
                    'Failed to find or create Default User Spaces folder',
                );
            }
        });
    }

    async getProjectsWithDefaultUserSpaces(organizationUuid: string): Promise<
        {
            projectId: number;
            projectUuid: string;
            parentSpaceUuid: string;
            parentPath: string;
        }[]
    > {
        const rows = await this.database(ProjectTableName)
            .innerJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            )
            .innerJoin(
                SpaceTableName,
                `${SpaceTableName}.project_id`,
                `${ProjectTableName}.project_id`,
            )
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .where(`${ProjectTableName}.has_default_user_spaces`, true)
            .where(`${SpaceTableName}.name`, DEFAULT_USER_SPACES_PARENT_NAME)
            .whereNull(`${SpaceTableName}.parent_space_uuid`)
            .whereNull(`${SpaceTableName}.deleted_at`)
            .select(
                `${ProjectTableName}.project_id as project_id`,
                `${ProjectTableName}.project_uuid as project_uuid`,
                `${SpaceTableName}.space_uuid as parent_space_uuid`,
                `${SpaceTableName}.path as parent_path`,
            );

        return rows.map((row) => ({
            projectId: row.project_id,
            projectUuid: row.project_uuid,
            parentSpaceUuid: row.parent_space_uuid,
            parentPath: row.parent_path,
        }));
    }

    async ensureDefaultUserSpace(
        projectId: number,
        parentSpaceUuid: string,
        parentPath: string,
        user: {
            userId: number;
            userUuid: string;
            firstName: string;
            lastName: string;
        },
    ): Promise<void> {
        const existing = await this.database(SpaceTableName)
            .where('is_default_user_space', true)
            .where('created_by_user_id', user.userId)
            .where('project_id', projectId)
            .whereNull('deleted_at')
            .first('space_uuid');

        if (existing) return;

        const spaceName =
            user.firstName || user.lastName
                ? `${user.firstName} ${user.lastName}`.trim()
                : `User ${user.userUuid.slice(0, 8)}`;

        await this.database.transaction(async (trx) => {
            const baseSlug = generateSlug(spaceName);
            await acquireProjectSlugLock(
                trx,
                String(projectId),
                `space:${baseSlug}`,
            );
            const slug = await generateUniqueSlugScopedToProject(
                trx,
                projectId,
                SpaceTableName,
                baseSlug,
            );
            const path = `${parentPath}.${getLtreePathFromSlug(slug)}`;

            const insertedSpaces = await trx(SpaceTableName)
                .insert({
                    project_id: projectId,
                    name: spaceName,
                    inherit_parent_permissions: false,
                    slug,
                    parent_space_uuid: parentSpaceUuid,
                    path,
                    is_default_user_space: true,
                    created_by_user_id: user.userId,
                })
                .onConflict(
                    trx.raw(
                        '(project_id, created_by_user_id) WHERE is_default_user_space = true AND deleted_at IS NULL',
                    ),
                )
                .ignore()
                .returning('space_uuid');

            if (insertedSpaces.length === 0) return;

            await trx(SpaceUserAccessTableName)
                .insert({
                    space_uuid: insertedSpaces[0].space_uuid,
                    user_uuid: user.userUuid,
                    space_role: SpaceMemberRole.ADMIN,
                })
                .onConflict(['user_uuid', 'space_uuid'])
                .merge();
        });
    }

    async deleteProjectAccess(
        projectUuid: string,
        userUuid: string,
    ): Promise<void> {
        await this.database.raw<(DbProjectMembership & DbProject & DbUser)[]>(
            `
                DELETE
                FROM project_memberships AS m USING projects AS p, users AS u
                WHERE p.project_id = m.project_id
                  AND u.user_id = m.user_id
                  AND user_uuid = :userUuid
                  AND p.project_uuid = :projectUuid
            `,
            { projectUuid, userUuid },
        );
    }

    /**
     * Insert a (service account, project) grant.
     *
     * Accepts either a system role (`role`) or a custom role (`roleUuid`) —
     * exactly one. The discriminated union is enforced by the caller
     * (`ServiceAccountService.create` validates role-uuid ownership in bulk
     * before reaching the DB), so this layer only enforces the structural
     * invariants that are cheap to check here:
     *  - cross-org grants are rejected (returns ParameterError, surfaces as 400)
     *  - duplicate grants raise AlreadyExistsError (409 at the API)
     */
    async createServiceAccountProjectAccess(
        projectUuid: string,
        serviceAccountUuid: string,
        grant: { role?: ProjectMemberRole; roleUuid?: string },
    ): Promise<void> {
        // Structural XOR check. Callers must pass exactly one of role /
        // roleUuid — service layer already enforces this for API requests,
        // but a programming-bug call into the model should fail fast.
        const hasRole = grant.role !== undefined;
        const hasRoleUuid = grant.roleUuid !== undefined;
        if (hasRole === hasRoleUuid) {
            throw new ParameterError(
                'Grant must specify exactly one of role or roleUuid',
            );
        }
        // `projects.organization_id` is the int link; `service_accounts`
        // uses `organization_uuid`. Resolve both to a uuid via a join through
        // `organizations` so the cross-org comparison is uuid-vs-uuid.
        const [project] = await this.database(ProjectTableName)
            .leftJoin(
                OrganizationTableName,
                `${ProjectTableName}.organization_id`,
                `${OrganizationTableName}.organization_id`,
            )
            .select<
                {
                    project_id: number;
                    organization_uuid: string;
                }[]
            >(
                `${ProjectTableName}.project_id`,
                `${OrganizationTableName}.organization_uuid`,
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid);
        if (!project) {
            throw new NotFoundError(
                `Project with uuid ${projectUuid} not found`,
            );
        }

        const [sa] = await this.database(ServiceAccountsTableName)
            .leftJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${ServiceAccountsTableName}.service_account_user_uuid`,
            )
            .select<
                Array<{
                    user_id: number;
                    organization_uuid: string;
                }>
            >(
                `${UserTableName}.user_id`,
                `${ServiceAccountsTableName}.organization_uuid`,
            )
            .where(
                `${ServiceAccountsTableName}.service_account_uuid`,
                serviceAccountUuid,
            );
        if (!sa) {
            throw new NotFoundError(
                `Service account with uuid ${serviceAccountUuid} not found`,
            );
        }
        if (sa.organization_uuid !== project.organization_uuid) {
            throw new ParameterError(
                'Service account and project must be in the same organization',
            );
        }

        try {
            // The legacy `role` column is NOT NULL. When `role_uuid` is set,
            // CASL resolution at request time prefers the custom role, so
            // the `role` value is a structural placeholder only. Matches the
            // convention used by `project_group_access` for custom roles
            // (Viewer as the safe-by-default fallback).
            await this.database(ProjectMembershipsTableName).insert({
                project_id: project.project_id,
                user_id: sa.user_id,
                role: hasRoleUuid
                    ? ProjectMemberRole.VIEWER
                    : (grant.role as ProjectMemberRole),
                role_uuid: grant.roleUuid ?? null,
            });
        } catch (error: AnyType) {
            if (
                error instanceof DatabaseError &&
                error.constraint === 'project_memberships_pkey'
            ) {
                throw new AlreadyExistsError(
                    `Service account ${serviceAccountUuid} already has access to project ${projectUuid}`,
                );
            }
            throw error;
        }
    }

    /**
     * Replace a service account's entire set of project grants in one
     * transaction. Used by the in-place SA edit path: delete every existing
     * `project_memberships` row for the SA's dedicated user, then insert the
     * new set. Wholesale replace (rather than a diff) keeps add / remove /
     * role-change a single atomic operation.
     *
     * Each grant must carry exactly one of `role` (system) or `roleUuid`
     * (custom); the service layer validates this and that custom roles belong
     * to the org before calling. Projects are re-validated here to be in the
     * SA's organization.
     */
    async setServiceAccountProjectAccess(
        serviceAccountUuid: string,
        grants: ServiceAccountProjectAccessInput[],
        options: { makeProjectScoped?: boolean } = {},
    ): Promise<void> {
        const [sa] = await this.database(ServiceAccountsTableName)
            .leftJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${ServiceAccountsTableName}.service_account_user_uuid`,
            )
            .select<Array<{ user_id: number; organization_uuid: string }>>(
                `${UserTableName}.user_id`,
                `${ServiceAccountsTableName}.organization_uuid`,
            )
            .where(
                `${ServiceAccountsTableName}.service_account_uuid`,
                serviceAccountUuid,
            );
        if (!sa) {
            throw new NotFoundError(
                `Service account with uuid ${serviceAccountUuid} not found`,
            );
        }

        // Resolve every project to its int id, validating same-org membership
        // up front so the replace can't partially apply a cross-org grant.
        const projectUuids = grants.map((g) => g.projectUuid);
        if (new Set(projectUuids).size !== projectUuids.length) {
            throw new ParameterError(
                'A service account can have at most one grant per project',
            );
        }
        const projects = await this.database(ProjectTableName)
            .leftJoin(
                OrganizationTableName,
                `${ProjectTableName}.organization_id`,
                `${OrganizationTableName}.organization_id`,
            )
            .select<
                { project_uuid: string; project_id: number; org_uuid: string }[]
            >(
                `${ProjectTableName}.project_uuid`,
                `${ProjectTableName}.project_id`,
                `${OrganizationTableName}.organization_uuid as org_uuid`,
            )
            .whereIn(`${ProjectTableName}.project_uuid`, projectUuids);
        const projectByUuid = new Map(projects.map((p) => [p.project_uuid, p]));
        for (const projectUuid of projectUuids) {
            const project = projectByUuid.get(projectUuid);
            if (!project) {
                throw new NotFoundError(
                    `Project with uuid ${projectUuid} not found`,
                );
            }
            if (project.org_uuid !== sa.organization_uuid) {
                throw new ParameterError(
                    'Service account and project must be in the same organization',
                );
            }
        }

        await this.database.transaction(async (trx) => {
            await trx(ProjectMembershipsTableName)
                .where('user_id', sa.user_id)
                .delete();
            if (grants.length > 0) {
                await trx(ProjectMembershipsTableName).insert(
                    grants.map((grant) => {
                        // Legacy `role` column is NOT NULL; when `role_uuid` is
                        // set, runtime CASL prefers the custom role and `role`
                        // is a Viewer placeholder (matches create's convention).
                        const project = projectByUuid.get(grant.projectUuid)!;
                        return {
                            project_id: project.project_id,
                            user_id: sa.user_id,
                            role: grant.roleUuid
                                ? ProjectMemberRole.VIEWER
                                : (grant.role as ProjectMemberRole),
                            role_uuid: grant.roleUuid ?? null,
                        };
                    }),
                );
            }
            if (options.makeProjectScoped) {
                await trx(ServiceAccountsTableName)
                    .where('service_account_uuid', serviceAccountUuid)
                    .update({
                        scopes: [ServiceAccountScope.SYSTEM_MEMBER],
                    });
                await trx(OrganizationMembershipsTableName)
                    .where('user_id', sa.user_id)
                    .update({
                        role: OrganizationMemberRole.MEMBER,
                        role_uuid: null,
                    });
                // A singular write replaces the whole role set, so extras go too.
                await trx(OrganizationMembershipCustomRolesTableName)
                    .where('user_id', sa.user_id)
                    .delete();
            }
        });
    }

    /**
     * Validate that every `roleUuid` in the input exists and belongs to the
     * given organization. Returns the set of `roleUuid`s in the input that
     * are missing or owned by a different org — callers should reject if
     * the returned set is non-empty.
     *
     * Used during service-account create to bulk-validate
     * `projectAccess[*].roleUuid` before opening a write transaction. One
     * query for the whole batch avoids per-grant N+1s and a partial-success
     * window.
     */
    async findInvalidCustomRoleUuids(
        roleUuids: string[],
        organizationUuid: string,
    ): Promise<string[]> {
        if (roleUuids.length === 0) return [];
        const rows = await this.database(RolesTableName)
            .select<{ role_uuid: string }[]>('role_uuid')
            .whereIn('role_uuid', roleUuids)
            .andWhere('organization_uuid', organizationUuid);
        const valid = new Set(rows.map((r) => r.role_uuid));
        return roleUuids.filter((u) => !valid.has(u));
    }

    /**
     * Per-service-account list of project grants.
     *
     * Used by the org SA list's hover preview: one query returns every
     * `(project, role)` the SA can use. Powers the inline role-edit and
     * revoke actions in the UI without any client-side fan-out.
     */
    async getServiceAccountProjectGrants(
        serviceAccountUuid: string,
    ): Promise<ServiceAccountProjectGrant[]> {
        type Row = {
            project_uuid: string;
            project_name: string;
            role: ProjectMemberRole;
            role_uuid: string | null;
            role_name: string | null;
        };
        const rows = await this.database(ProjectMembershipsTableName)
            .innerJoin(
                UserTableName,
                `${ProjectMembershipsTableName}.user_id`,
                `${UserTableName}.user_id`,
            )
            .innerJoin(
                ServiceAccountsTableName,
                `${ServiceAccountsTableName}.service_account_user_uuid`,
                `${UserTableName}.user_uuid`,
            )
            .innerJoin(
                ProjectTableName,
                `${ProjectMembershipsTableName}.project_id`,
                `${ProjectTableName}.project_id`,
            )
            // LEFT join: most grants are system roles (no row in `roles`).
            // Custom-role grants have role_uuid set and we project the
            // role's display name so the UI doesn't need a follow-up lookup.
            .leftJoin(
                RolesTableName,
                `${ProjectMembershipsTableName}.role_uuid`,
                `${RolesTableName}.role_uuid`,
            )
            .select<Row[]>(
                `${ProjectTableName}.project_uuid`,
                `${ProjectTableName}.name as project_name`,
                `${ProjectMembershipsTableName}.role`,
                `${ProjectMembershipsTableName}.role_uuid`,
                `${RolesTableName}.name as role_name`,
            )
            .where(
                `${ServiceAccountsTableName}.service_account_uuid`,
                serviceAccountUuid,
            );

        return rows.map((r) => {
            if (r.role_uuid && r.role_name) {
                return {
                    projectUuid: r.project_uuid,
                    projectName: r.project_name,
                    roleUuid: r.role_uuid,
                    roleName: r.role_name,
                };
            }
            return {
                projectUuid: r.project_uuid,
                projectName: r.project_name,
                role: r.role,
            };
        });
    }

    /**
     * Counts of `project_memberships` rows per SA, batched for the org SA
     * list. Returns a map keyed by `users.user_uuid` (the SA's dedicated
     * user row) so the caller can zip counts into the SA list response
     * without an N+1 fan-out. SAs with zero grants are absent from the
     * map; callers default missing keys to 0.
     */
    async getProjectAccessCountsByServiceAccountUserUuids(
        userUuids: string[],
    ): Promise<Map<string, number>> {
        if (userUuids.length === 0) return new Map();
        const rows = await this.database(ProjectMembershipsTableName)
            .innerJoin(
                UserTableName,
                `${ProjectMembershipsTableName}.user_id`,
                `${UserTableName}.user_id`,
            )
            .select<{ user_uuid: string; count: string }[]>(
                `${UserTableName}.user_uuid`,
                this.database.raw('count(*) as count'),
            )
            .whereIn(`${UserTableName}.user_uuid`, userUuids)
            .groupBy(`${UserTableName}.user_uuid`);
        return new Map(rows.map((r) => [r.user_uuid, Number(r.count)]));
    }

    async getProjectGroupAccesses(projectUuid: string) {
        const projectGroupAccesses = await this.database(
            ProjectGroupAccessTableName,
        )
            .select<(ProjectGroupAccess & { role_uuid: string | null })[]>({
                projectUuid: 'project_uuid',
                groupUuid: 'group_uuid',
                role: 'role',
                role_uuid: 'role_uuid',
            })
            .where('project_uuid', projectUuid);

        return projectGroupAccesses.map(({ role_uuid, ...access }) => ({
            ...access,
            role: role_uuid ?? access.role,
        }));
    }

    async getWarehouseCredentialsForProject(
        projectUuid: string,
        connectionUuid?: string | null,
    ): Promise<CreateWarehouseCredentials> {
        const connection = await this.resolveConnection(
            projectUuid,
            connectionUuid,
        );
        const cacheKey = getWarehouseCredentialsCacheKey(
            projectUuid,
            connection.connectionUuid,
        );
        const revision = await this.connectionModel.getCredentialsRevision(
            projectUuid,
            connection.connectionUuid,
        );
        const cachedCredentials =
            warehouseCredentialsCache?.get<WarehouseCredentialsCacheEntry>(
                cacheKey,
            );
        if (cachedCredentials && cachedCredentials.revision === revision) {
            return cachedCredentials.credentials;
        }
        const credentials = await this.connectionModel.getCredentials(
            projectUuid,
            connection.connectionUuid,
        );
        warehouseCredentialsCache?.set(cacheKey, { revision, credentials });
        return credentials;
    }

    /** Compare-and-swap on the credential's stored refreshToken. Invalidates the warehouse credentials cache on swap. */
    async rotateRefreshToken(
        projectUuid: string,
        expectedOldRefreshToken: string,
        newRefreshToken: string,
        connectionUuid?: string | null,
    ): Promise<boolean> {
        const connection = await this.resolveConnection(
            projectUuid,
            connectionUuid,
        );
        const swapped = await this.database.transaction(async (trx) => {
            const row = await trx('warehouse_credentials')
                .innerJoin(
                    'projects',
                    'warehouse_credentials.project_id',
                    'projects.project_id',
                )
                .where('projects.project_uuid', projectUuid)
                .where(
                    'warehouse_credentials.warehouse_credentials_uuid',
                    connection.connectionUuid,
                )
                .whereNull('warehouse_credentials.superseded_at')
                .select<
                    {
                        warehouse_credentials_id: number;
                        encrypted_credentials: Buffer | null;
                    }[]
                >([
                    'warehouse_credentials.warehouse_credentials_id',
                    'warehouse_credentials.encrypted_credentials',
                ])
                .forUpdate()
                .first();
            if (!row?.encrypted_credentials) {
                return false;
            }

            let credentials: CreateWarehouseCredentials;
            try {
                credentials = normalizeWarehouseCredentials(
                    JSON.parse(
                        this.encryptionUtil.decrypt(row.encrypted_credentials),
                    ) as CreateWarehouseCredentials,
                );
            } catch {
                return false;
            }

            const stored = (credentials as Partial<{ refreshToken: string }>)
                .refreshToken;
            if (stored !== expectedOldRefreshToken) {
                return false;
            }

            (credentials as { refreshToken: string }).refreshToken =
                newRefreshToken;
            const encryptedCredentials = this.encryptionUtil.encrypt(
                JSON.stringify(credentials),
            );
            await trx('warehouse_credentials')
                .update({ encrypted_credentials: encryptedCredentials })
                .where(
                    'warehouse_credentials_id',
                    row.warehouse_credentials_id,
                );
            return true;
        });

        if (swapped) {
            warehouseCredentialsCache?.del(
                getWarehouseCredentialsCacheKey(
                    projectUuid,
                    connection.connectionUuid,
                ),
            );
        }

        return swapped;
    }

    async copyChartSlugMappingsToPreview(
        trx: Knex,
        sourceProjectUuid: string,
        previewProjectUuid: string,
        chartUuidMapping: PreviewChartUuidMapping[],
    ): Promise<void> {
        if (chartUuidMapping.length === 0) return;

        const aliases = await trx(SavedChartSlugMappingsTableName)
            .where('project_uuid', sourceProjectUuid)
            .whereRaw('?? = ANY(?::uuid[])', [
                'saved_query_uuid',
                chartUuidMapping.map(({ sourceChartUuid }) => sourceChartUuid),
            ])
            .select('saved_query_uuid', 'slug');
        if (aliases.length === 0) return;

        const previewChartUuidBySource = new Map(
            chartUuidMapping.map(({ sourceChartUuid, previewChartUuid }) => [
                sourceChartUuid,
                previewChartUuid,
            ]),
        );
        const previewAliases = aliases.map((alias) => {
            const previewChartUuid = previewChartUuidBySource.get(
                alias.saved_query_uuid,
            );
            if (!previewChartUuid) {
                throw new UnexpectedServerError(
                    `Missing preview chart mapping for ${alias.saved_query_uuid}`,
                );
            }
            return {
                project_uuid: previewProjectUuid,
                saved_query_uuid: previewChartUuid,
                slug: alias.slug,
            };
        });

        await trx.batchInsert(
            SavedChartSlugMappingsTableName,
            previewAliases,
            INSERT_BATCH_SIZE,
        );
    }

    async copyDashboardSlugMappingsToPreview(
        trx: Knex,
        sourceProjectUuid: string,
        previewProjectUuid: string,
        dashboardUuidMapping: Array<{
            sourceDashboardUuid: string;
            previewDashboardUuid: string;
        }>,
    ): Promise<void> {
        if (dashboardUuidMapping.length === 0) return;

        const aliases = await trx(DashboardSlugMappingsTableName)
            .where('project_uuid', sourceProjectUuid)
            .whereRaw('?? = ANY(?::uuid[])', [
                'dashboard_uuid',
                dashboardUuidMapping.map(
                    ({ sourceDashboardUuid }) => sourceDashboardUuid,
                ),
            ])
            .select('dashboard_uuid', 'slug');
        if (aliases.length === 0) return;

        const previewDashboardUuidBySource = new Map(
            dashboardUuidMapping.map(
                ({ sourceDashboardUuid, previewDashboardUuid }) => [
                    sourceDashboardUuid,
                    previewDashboardUuid,
                ],
            ),
        );
        const previewAliases = aliases.map((alias) => {
            const previewDashboardUuid = previewDashboardUuidBySource.get(
                alias.dashboard_uuid,
            );
            if (!previewDashboardUuid) {
                throw new UnexpectedServerError(
                    `Missing preview dashboard mapping for ${alias.dashboard_uuid}`,
                );
            }
            return {
                project_uuid: previewProjectUuid,
                dashboard_uuid: previewDashboardUuid,
                slug: alias.slug,
            };
        });

        await trx.batchInsert(
            DashboardSlugMappingsTableName,
            previewAliases,
            INSERT_BATCH_SIZE,
        );
    }

    async copyMetricsTreesForTrainingCopy(
        sourceProjectUuid: string,
        targetProjectUuid: string,
        userUuid: string,
    ): Promise<void> {
        if (sourceProjectUuid === targetProjectUuid) {
            throw new ParameterError(
                'A training copy must be a different project',
            );
        }
        await this.database.transaction(async (trx) => {
            const trees = await trx(MetricsTreesTableName).where(
                'project_uuid',
                sourceProjectUuid,
            );
            if (trees.length === 0) return;
            const sourceMetrics = await trx(CatalogTableName).where({
                project_uuid: sourceProjectUuid,
                field_type: 'metric',
            });
            const targetMetrics = await trx(CatalogTableName).where({
                project_uuid: targetProjectUuid,
                field_type: 'metric',
            });
            const metricMapping = new Map(
                sourceMetrics.map((source) => [
                    source.catalog_search_uuid,
                    targetMetrics.find(
                        (target) =>
                            target.table_name === source.table_name &&
                            target.name === source.name &&
                            target.type === source.type,
                    )?.catalog_search_uuid,
                ]),
            );
            const remap = (sourceUuid: string): string => {
                const targetUuid = metricMapping.get(sourceUuid);
                if (!targetUuid)
                    throw new ParameterError(
                        `Training copy is missing a tree metric: ${sourceUuid}`,
                    );
                return targetUuid;
            };
            const copiedMetricUuids = new Set<string>();
            await trees.reduce<Promise<void>>(async (previous, tree) => {
                await previous;
                const nodes = await trx(MetricsTreeNodesTableName).where(
                    'metrics_tree_uuid',
                    tree.metrics_tree_uuid,
                );
                const mappedNodes = nodes.map((node) => ({
                    catalog_search_uuid: remap(node.catalog_search_uuid),
                    x_position: node.x_position,
                    y_position: node.y_position,
                    source: node.source,
                }));
                const [created] = await trx(MetricsTreesTableName)
                    .insert({
                        project_uuid: targetProjectUuid,
                        name: tree.name,
                        slug: tree.slug,
                        description: tree.description,
                        source: tree.source,
                        created_by_user_uuid: userUuid,
                    })
                    .returning('*');
                if (mappedNodes.length > 0) {
                    await trx(MetricsTreeNodesTableName).insert(
                        mappedNodes.map((node) => ({
                            ...node,
                            metrics_tree_uuid: created.metrics_tree_uuid,
                        })),
                    );
                }
                nodes.forEach((node) =>
                    copiedMetricUuids.add(node.catalog_search_uuid),
                );
            }, Promise.resolve());
            // YAML edges already belong to the new catalog; copy published UI edges only.
            const edges = await trx(MetricsTreeEdgesTableName)
                .where({
                    project_uuid: sourceProjectUuid,
                    source: 'ui',
                })
                .whereIn('source_metric_catalog_search_uuid', [
                    ...copiedMetricUuids,
                ])
                .whereIn('target_metric_catalog_search_uuid', [
                    ...copiedMetricUuids,
                ]);
            if (edges.length > 0) {
                await trx(MetricsTreeEdgesTableName)
                    .insert(
                        edges.map((edge) => ({
                            source_metric_catalog_search_uuid: remap(
                                edge.source_metric_catalog_search_uuid,
                            ),
                            target_metric_catalog_search_uuid: remap(
                                edge.target_metric_catalog_search_uuid,
                            ),
                            project_uuid: targetProjectUuid,
                            created_by_user_uuid: userUuid,
                            source: edge.source,
                        })),
                    )
                    .onConflict([
                        'source_metric_catalog_search_uuid',
                        'target_metric_catalog_search_uuid',
                    ])
                    .ignore();
            }
        });
    }

    async duplicateContent(
        projectUuid: string,
        previewProjectUuid: string,
        spaces: Pick<SpaceSummary, 'uuid'>[],
        connectionUuidMap: Map<string, string>,
    ): Promise<{
        spaceMapping: { sourceSpaceUuid: string; previewSpaceUuid: string }[];
    }> {
        Logger.info(
            `Copying content from ${projectUuid} to ${previewProjectUuid}`,
        );

        return this.database.transaction(async (trx) => {
            const [previewProject] = await trx('projects').where(
                'project_uuid',
                previewProjectUuid,
            );

            const [project] = await trx('projects')
                .where('project_uuid', projectUuid)
                .select('project_id');
            const projectId = project.project_id;

            // Bind ID lists as arrays so large copies stay below Postgres's parameter limit.
            const dbSpaces = await trx(SpaceTableName).whereRaw(
                '?? = ANY(?::uuid[])',
                ['space_uuid', spaces.map((s) => s.uuid)],
            );

            Logger.info(
                `Copying ${spaces.length} spaces on ${previewProjectUuid}`,
            );
            const spaceIds = dbSpaces.map((s) => s.space_id);
            const spaceUuids = dbSpaces.map((s) => s.space_uuid);

            const newSpaces =
                spaces.length > 0
                    ? await chunkedInsertReturning<DbSpace>(
                          trx,
                          SpaceTableName,
                          dbSpaces.map((d) => {
                              type CloneSpace = Omit<
                                  DbSpace,
                                  'space_id' | 'space_uuid' | 'search_vector'
                              > & {
                                  search_vector?: undefined;
                                  space_id?: number;
                                  space_uuid?: string;
                              };
                              const createSpace: CloneSpace = {
                                  ...d,
                                  search_vector: undefined,
                                  space_id: undefined,
                                  space_uuid: undefined,
                                  project_id: previewProject.project_id,
                                  parent_space_uuid: null,
                              };
                              // Remove the keys for the autogenerated fields
                              // Some databases do not support undefined values
                              delete createSpace.search_vector;
                              delete createSpace.space_id;
                              delete createSpace.space_uuid;
                              return createSpace;
                          }),
                      )
                    : [];

            // fix parent_space_uuid based on path for the spaces
            await trx.raw(
                `
                UPDATE ${SpaceTableName} AS child
                SET parent_space_uuid = parent.space_uuid
                FROM ${SpaceTableName} AS parent
                WHERE
                    child.project_id = ?
                    AND parent.project_id = ?
                    AND subpath(child.path, 0, nlevel(child.path) - 1) = parent.path
                    AND nlevel(child.path) > 1;`,
                [previewProject.project_id, previewProject.project_id],
            );

            const spaceMapping = dbSpaces.map((s, i) => ({
                id: s.space_id,
                uuid: s.space_uuid,
                newId: newSpaces[i].space_id,
                newUuid: newSpaces[i].space_uuid,
            }));
            const previewSpaceIdBySource = new Map(
                spaceMapping.map((m) => [m.id, m.newId]),
            );
            const previewSpaceUuidBySource = new Map(
                spaceMapping.map((m) => [m.uuid, m.newUuid]),
            );

            const getNewSpaceId = (oldSpaceId: number): number =>
                previewSpaceIdBySource.get(oldSpaceId)!;

            const getNewSpaceUuid = (oldSpaceUuid: string): string =>
                previewSpaceUuidBySource.get(oldSpaceUuid)!;

            const spaceUserAccesses = await trx('space_user_access').whereRaw(
                '?? = ANY(?::uuid[])',
                ['space_uuid', spaceUuids],
            );

            const newSpaceUserAccess =
                spaceUserAccesses.length > 0
                    ? await chunkedInsertReturning<
                          (typeof spaceUserAccesses)[number]
                      >(
                          trx,
                          'space_user_access',
                          spaceUserAccesses.map((d) => ({
                              ...d,
                              space_uuid: getNewSpaceUuid(d.space_uuid),
                          })),
                      )
                    : [];

            const spaceGroupAccesses = await trx('space_group_access').whereRaw(
                '?? = ANY(?::uuid[])',
                ['space_uuid', spaceUuids],
            );

            Logger.info(
                `Copying ${spaceGroupAccesses.length} space group accesses on ${previewProjectUuid}`,
            );

            const newSpaceGroupAccesses =
                spaceGroupAccesses.length > 0
                    ? await chunkedInsertReturning<
                          (typeof spaceGroupAccesses)[number]
                      >(
                          trx,
                          'space_group_access',
                          spaceGroupAccesses.map((d) => ({
                              ...d,
                              space_uuid: getNewSpaceUuid(d.space_uuid),
                          })),
                      )
                    : [];

            const virtualViews = await trx(CachedExploreTableName)
                .where('project_uuid', projectUuid)
                .andWhereJsonPath(
                    'explore',
                    '$.type',
                    '=',
                    ExploreType.VIRTUAL,
                );

            if (virtualViews.length > 0) {
                Logger.info(
                    `Copying ${virtualViews.length} virtual views into ${previewProjectUuid}`,
                );

                await chunkedInsertReturning<(typeof virtualViews)[number]>(
                    trx,
                    CachedExploreTableName,
                    virtualViews.map((v) => ({
                        ...v,
                        project_uuid: previewProjectUuid,
                        cached_explore_uuid: undefined,
                    })),
                );
            }

            const externalSourceExplores = await trx(CachedExploreTableName)
                .where('project_uuid', projectUuid)
                .andWhereJsonPath(
                    'explore',
                    '$.type',
                    '=',
                    ExploreType.EXTERNAL_SOURCE,
                );

            if (externalSourceExplores.length > 0) {
                Logger.info(
                    `Copying ${externalSourceExplores.length} external source tables into ${previewProjectUuid}`,
                );

                // Copy the source rows with fresh uuids so locator resolution
                // works inside the preview. Ingested files are shared by URI,
                // not duplicated.
                const sources = await trx(ExternalSourcesTableName)
                    .where('project_uuid', projectUuid)
                    .andWhere('scope', ExternalSourceScope.CATALOG);
                const sourceTables = await trx(
                    ExternalSourceTablesTableName,
                ).whereRaw('?? = ANY(?::uuid[])', [
                    'external_source_uuid',
                    sources.map((source) => source.external_source_uuid),
                ]);
                const sourceUuidMap = new Map(
                    sources.map((s) => [s.external_source_uuid, uuidv4()]),
                );
                const tableUuidMap = new Map(
                    sourceTables.map((t) => [
                        t.external_source_table_uuid,
                        uuidv4(),
                    ]),
                );
                if (sources.length > 0) {
                    await chunkedInsertReturning<(typeof sources)[number]>(
                        trx,
                        ExternalSourcesTableName,
                        sources.map(
                            ({ created_at, updated_at, ...source }) => ({
                                ...source,
                                external_source_uuid: sourceUuidMap.get(
                                    source.external_source_uuid,
                                )!,
                                project_uuid: previewProjectUuid,
                            }),
                        ),
                    );
                }
                if (sourceTables.length > 0) {
                    await chunkedInsertReturning<(typeof sourceTables)[number]>(
                        trx,
                        ExternalSourceTablesTableName,
                        sourceTables.map(
                            ({ created_at, updated_at, ...table }) => ({
                                ...table,
                                external_source_table_uuid: tableUuidMap.get(
                                    table.external_source_table_uuid,
                                )!,
                                external_source_uuid: sourceUuidMap.get(
                                    table.external_source_uuid,
                                )!,
                                project_uuid: previewProjectUuid,
                            }),
                        ),
                    );
                }

                await chunkedInsertReturning<
                    (typeof externalSourceExplores)[number]
                >(
                    trx,
                    CachedExploreTableName,
                    externalSourceExplores.map((v) => ({
                        ...v,
                        project_uuid: previewProjectUuid,
                        cached_explore_uuid: undefined,
                        explore: {
                            ...v.explore,
                            externalSource: v.explore.externalSource
                                ? {
                                      ...v.explore.externalSource,
                                      sourceUuid:
                                          sourceUuidMap.get(
                                              v.explore.externalSource
                                                  .sourceUuid,
                                          ) ??
                                          v.explore.externalSource.sourceUuid,
                                      tableUuid:
                                          tableUuidMap.get(
                                              v.explore.externalSource
                                                  .tableUuid,
                                          ) ??
                                          v.explore.externalSource.tableUuid,
                                  }
                                : undefined,
                        },
                    })),
                );
            }

            // Dashboards
            const dashboards = await trx(DashboardsTableName)
                .leftJoin(
                    SpaceTableName,
                    `${DashboardsTableName}.space_id`,
                    `${SpaceTableName}.space_id`,
                )
                .whereRaw('?? = ANY(?::int[])', [
                    `${DashboardsTableName}.space_id`,
                    spaceIds,
                ])
                .andWhere(`${SpaceTableName}.project_id`, projectId)
                .whereNull(`${DashboardsTableName}.deleted_at`)
                .whereNull(`${SpaceTableName}.deleted_at`)
                .select<DbDashboard[]>(`${DashboardsTableName}.*`);

            const dashboardIds = dashboards.map((d) => d.dashboard_id);

            Logger.info(
                `Copying ${dashboards.length} dashboards on ${previewProjectUuid}`,
            );

            const newDashboards =
                dashboards.length > 0
                    ? await chunkedInsertReturning<DbDashboard>(
                          trx,
                          DashboardsTableName,
                          dashboards.map((d) => {
                              type CloneDashboard = Omit<
                                  DbDashboard,
                                  | 'dashboard_id'
                                  | 'dashboard_uuid'
                                  | 'search_vector'
                              > & {
                                  search_vector?: string;
                                  dashboard_id?: number;
                                  dashboard_uuid?: string;
                              };
                              const createDashboard: CloneDashboard = {
                                  ...replaceProjectUuid(d, previewProjectUuid),
                                  search_vector: undefined,
                                  dashboard_id: undefined,
                                  dashboard_uuid: undefined,
                                  space_id: getNewSpaceId(d.space_id),
                              };
                              delete createDashboard.search_vector;
                              delete createDashboard.dashboard_id;
                              delete createDashboard.dashboard_uuid;
                              return createDashboard;
                          }),
                      )
                    : [];

            const dashboardMapping = dashboards.map((c, i) => ({
                id: c.dashboard_id,
                newId: newDashboards[i].dashboard_id,
                uuid: c.dashboard_uuid,
                newUuid: newDashboards[i].dashboard_uuid,
            }));
            const previewDashboardIdBySource = new Map(
                dashboardMapping.map((m) => [m.id, m.newId]),
            );
            const previewDashboardUuidBySource = new Map(
                dashboardMapping.map((m) => [m.uuid, m.newUuid]),
            );
            await this.copyDashboardSlugMappingsToPreview(
                trx,
                projectUuid,
                previewProjectUuid,
                dashboardMapping.map((mapping) => ({
                    sourceDashboardUuid: mapping.uuid,
                    previewDashboardUuid: mapping.newUuid,
                })),
            );
            // Dashboard content is only copied when its dashboard was
            const hasCopiedDashboard = <
                T extends { dashboard_uuid: string | null },
            >(
                row: T,
            ): row is T & { dashboard_uuid: string } =>
                row.dashboard_uuid !== null &&
                previewDashboardUuidBySource.has(row.dashboard_uuid);
            const getPreviewDashboardUuid = (sourceDashboardUuid: string) => {
                const previewDashboardUuid =
                    previewDashboardUuidBySource.get(sourceDashboardUuid);
                if (!previewDashboardUuid) {
                    throw new UnexpectedServerError(
                        `Missing preview dashboard mapping for ${sourceDashboardUuid}`,
                    );
                }
                return previewDashboardUuid;
            };

            // Saved SQL

            // Get all the saved SQLs
            const savedSQLs = await trx(SavedSqlTableName)
                .leftJoin(
                    SpaceTableName,
                    `${SavedSqlTableName}.space_uuid`,
                    `${SpaceTableName}.space_uuid`,
                )
                .whereRaw('?? = ANY(?::uuid[])', [
                    `${SavedSqlTableName}.space_uuid`,
                    spaceUuids,
                ])
                .andWhere(`${SpaceTableName}.project_id`, projectId)
                .whereNull(`${SavedSqlTableName}.deleted_at`)
                .select<DbSavedSql[]>(`${SavedSqlTableName}.*`);

            Logger.info(
                `Copying ${savedSQLs.length} SQL queries on ${previewProjectUuid}`,
            );

            // Define the type for the new saved SQLs
            type CloneSavedSQL = InsertSql & {
                saved_sql_uuid?: string;
                search_vector?: string;
            };

            // Create a function to create the saved SQLs
            const createSavedSQLs = async (savedSQLList: DbSavedSql[]) => {
                if (savedSQLList.length === 0) {
                    return [];
                }
                // Create an array of promises for generating slugs and mapping saved SQLs
                const mappedSavedSQLsPromises = savedSQLList.map(async (d) => {
                    if (!d.space_uuid) {
                        throw new Error(
                            `Chart ${d.saved_sql_uuid} has no space_uuid`,
                        );
                    }
                    const createSavedSQL: CloneSavedSQL = {
                        ...d,
                        project_uuid: previewProjectUuid,
                        space_uuid: getNewSpaceUuid(d.space_uuid),
                        search_vector: undefined,
                        saved_sql_uuid: undefined,
                        dashboard_uuid: null,
                    };
                    delete createSavedSQL.search_vector;
                    delete createSavedSQL.saved_sql_uuid;
                    return createSavedSQL;
                });
                // Resolve all promises
                const mappedSavedSQLs = await Promise.all(
                    mappedSavedSQLsPromises,
                );
                // Insert all the saved SQLs after they have been mapped and return the result
                return chunkedInsertReturning<DbSavedSql>(
                    trx,
                    SavedSqlTableName,
                    mappedSavedSQLs,
                );
            };

            // Create the saved SQLs
            const newSavedSQLs = await createSavedSQLs(savedSQLs);

            const sourceSavedSQLInDashboards = await trx(SavedSqlTableName)
                .leftJoin(
                    DashboardsTableName,
                    function nonDeletedDashboardJoin() {
                        this.on(
                            `${SavedSqlTableName}.dashboard_uuid`,
                            '=',
                            `${DashboardsTableName}.dashboard_uuid`,
                        ).andOnNull(`${DashboardsTableName}.deleted_at`);
                    },
                )
                .leftJoin(
                    SpaceTableName,
                    `${DashboardsTableName}.space_id`,
                    `${SpaceTableName}.space_id`,
                )
                .where(`${SpaceTableName}.project_id`, projectId)
                .whereNull(`${SpaceTableName}.deleted_at`)
                .andWhere(`${SavedSqlTableName}.space_uuid`, null)
                .whereNull(`${SavedSqlTableName}.deleted_at`)
                .select<DbSavedSql[]>(`${SavedSqlTableName}.*`);

            const savedSQLInDashboards =
                sourceSavedSQLInDashboards.filter(hasCopiedDashboard);

            Logger.info(
                `Copying ${savedSQLInDashboards.length} SQL charts in dashboards on ${previewProjectUuid}, skipping ${
                    sourceSavedSQLInDashboards.length -
                    savedSQLInDashboards.length
                } whose dashboard was not copied`,
            );

            const newSavedSQLInDashboards =
                savedSQLInDashboards.length > 0
                    ? await chunkedInsertReturning<DbSavedSql>(
                          trx,
                          SavedSqlTableName,
                          savedSQLInDashboards.map((d) => {
                              const createSavedSQL: CloneSavedSQL = {
                                  ...replaceProjectUuid(d, previewProjectUuid),
                                  dashboard_uuid: getPreviewDashboardUuid(
                                      d.dashboard_uuid,
                                  ),
                                  search_vector: undefined,
                                  saved_sql_uuid: undefined,
                                  space_uuid: null,
                              };
                              delete createSavedSQL.search_vector;
                              delete createSavedSQL.saved_sql_uuid;
                              return createSavedSQL;
                          }),
                      )
                    : [];

            // Create a mapping of the old saved SQLs to the new saved SQLs
            const savedSQLInSpacesMapping = savedSQLs.map((c, i) => ({
                id: c.saved_sql_uuid,
                newId: newSavedSQLs[i].saved_sql_uuid,
            }));
            const savedSQLInDashboardsMapping = savedSQLInDashboards.map(
                (c, i) => ({
                    id: c.saved_sql_uuid,
                    newId: newSavedSQLInDashboards[i].saved_sql_uuid,
                }),
            );
            const savedSQLMapping = [
                ...savedSQLInSpacesMapping,
                ...savedSQLInDashboardsMapping,
            ];
            const previewSavedSqlUuidBySource = new Map(
                savedSQLMapping.map((m) => [m.id, m.newId]),
            );

            const savedSQLUuids = savedSQLMapping.map((c) => c.id);

            // Get the last saved SQL version by uuid and created_at
            const lastSavedSQLVersionEntries = await trx('saved_sql_versions')
                .whereRaw('?? = ANY(?::uuid[])', [
                    'saved_sql_uuid',
                    savedSQLUuids,
                ])
                .select('saved_sql_uuid')
                .max('created_at as latest_created_at')
                .groupBy('saved_sql_uuid');

            // Now query the full records for each saved_sql_uuid where created_at is the latest
            const savedSQLVersions = await trx('saved_sql_versions')
                .whereRaw('?? = ANY(?::uuid[])', [
                    'saved_sql_uuid',
                    lastSavedSQLVersionEntries.map((d) => d.saved_sql_uuid),
                ])
                .select('*');

            const newSavedSQLVersions =
                savedSQLVersions.length > 0
                    ? await chunkedInsertReturning<
                          (typeof savedSQLVersions)[number]
                      >(
                          trx,
                          'saved_sql_versions',
                          savedSQLVersions.map((d) => {
                              const newSavedSQLUuid =
                                  previewSavedSqlUuidBySource.get(
                                      d.saved_sql_uuid,
                                  );
                              if (!newSavedSQLUuid) {
                                  throw new Error(
                                      `Cannot find new saved SQL uuid for ${d.saved_sql_uuid}`,
                                  );
                              }
                              const createSavedSQLVersion = {
                                  ...d,
                                  saved_sql_version_uuid: undefined,
                                  saved_sql_uuid: newSavedSQLUuid,
                                  connection_uuid: toPreviewConnectionUuid(
                                      d.connection_uuid,
                                      connectionUuidMap,
                                  ),
                              };
                              delete createSavedSQLVersion.saved_sql_version_uuid;
                              return createSavedSQLVersion;
                          }),
                      )
                    : [];

            const savedSQLVersionMapping = savedSQLVersions.map((c, i) => ({
                id: c.saved_sql_version_uuid,
                newId: newSavedSQLVersions[i].saved_sql_version_uuid,
            }));

            // Charts
            const charts = await trx(SavedChartsTableName)
                .leftJoin(
                    SpaceTableName,
                    `${SavedChartsTableName}.space_id`,
                    `${SpaceTableName}.space_id`,
                )
                .whereRaw('?? = ANY(?::int[])', [
                    `${SpaceTableName}.space_id`,
                    spaceIds,
                ])
                .andWhere(`${SpaceTableName}.project_id`, projectId)
                .whereNull(`${SpaceTableName}.deleted_at`)
                .whereNull(`${SavedChartsTableName}.deleted_at`)
                .select<DbSavedChart[]>(`${SavedChartsTableName}.*`);

            Logger.info(
                `Copying ${charts.length} charts on ${previewProjectUuid}`,
            );
            type CloneChart = InsertChart & {
                search_vector?: string;
                saved_query_id?: number;
                saved_query_uuid?: string;
            };

            const newCharts =
                charts.length > 0
                    ? await chunkedInsertReturning<DbSavedChart>(
                          trx,
                          SavedChartsTableName,
                          charts.map((d) => {
                              if (!d.space_id) {
                                  throw new Error(
                                      `Chart ${d.saved_query_id} has no space_id`,
                                  );
                              }
                              const createChart: CloneChart = {
                                  ...replaceProjectUuid(d, previewProjectUuid),
                                  search_vector: undefined,
                                  saved_query_id: undefined,
                                  saved_query_uuid: undefined,
                                  space_id: getNewSpaceId(d.space_id),
                                  dashboard_uuid: null,
                              };
                              delete createChart.search_vector;
                              delete createChart.saved_query_id;
                              delete createChart.saved_query_uuid;
                              return createChart;
                          }),
                      )
                    : [];

            const sourceChartsInDashboards = await trx(SavedChartsTableName)
                .leftJoin(
                    DashboardsTableName,
                    function nonDeletedDashboardJoin() {
                        this.on(
                            `${SavedChartsTableName}.dashboard_uuid`,
                            '=',
                            `${DashboardsTableName}.dashboard_uuid`,
                        ).andOnNull(`${DashboardsTableName}.deleted_at`);
                    },
                )
                .leftJoin(
                    SpaceTableName,
                    `${DashboardsTableName}.space_id`,
                    `${SpaceTableName}.space_id`,
                )
                .where(`${SpaceTableName}.project_id`, projectId)
                .whereNull(`${SpaceTableName}.deleted_at`)
                .whereNull(`${SavedChartsTableName}.deleted_at`)
                .andWhere(`${SavedChartsTableName}.space_id`, null)
                .whereNull(`${SavedChartsTableName}.deleted_at`)
                .select<DbSavedChart[]>(`${SavedChartsTableName}.*`);

            const chartsInDashboards =
                sourceChartsInDashboards.filter(hasCopiedDashboard);

            Logger.info(
                `Copying ${chartsInDashboards.length} charts in dashboards on ${previewProjectUuid}, skipping ${
                    sourceChartsInDashboards.length - chartsInDashboards.length
                } whose dashboard was not copied`,
            );

            const newChartsInDashboards =
                chartsInDashboards.length > 0
                    ? await chunkedInsertReturning<DbSavedChart>(
                          trx,
                          SavedChartsTableName,
                          chartsInDashboards.map((d) => {
                              const createChart: CloneChart = {
                                  ...replaceProjectUuid(d, previewProjectUuid),
                                  search_vector: undefined,
                                  space_id: null,
                                  dashboard_uuid: getPreviewDashboardUuid(
                                      d.dashboard_uuid,
                                  ),
                              };
                              delete createChart.search_vector;
                              delete createChart.saved_query_id;
                              delete createChart.saved_query_uuid;

                              return createChart;
                          }),
                      )
                    : [];
            const chartInSpacesMapping = charts.map((c, i) => ({
                id: c.saved_query_id,
                newId: newCharts[i].saved_query_id,
            }));
            const chartInDashboardsMapping = chartsInDashboards.map((c, i) => ({
                id: c.saved_query_id,
                newId: newChartsInDashboards[i].saved_query_id,
            }));

            const chartUuidMapping = [
                ...charts.map((chart, index) => ({
                    sourceChartUuid: chart.saved_query_uuid,
                    previewChartUuid: newCharts[index].saved_query_uuid,
                })),
                ...chartsInDashboards.map((chart, index) => ({
                    sourceChartUuid: chart.saved_query_uuid,
                    previewChartUuid:
                        newChartsInDashboards[index].saved_query_uuid,
                })),
            ];
            const previewChartUuidBySource = new Map(
                chartUuidMapping.map((m) => [
                    m.sourceChartUuid,
                    m.previewChartUuid,
                ]),
            );

            await this.copyChartSlugMappingsToPreview(
                trx,
                projectUuid,
                previewProjectUuid,
                chartUuidMapping,
            );

            const chartMapping = [
                ...chartInSpacesMapping,
                ...chartInDashboardsMapping,
            ];
            const previewChartIdBySource = new Map(
                chartMapping.map((m) => [m.id, m.newId]),
            );

            const chartIds = chartMapping.map((c) => c.id);

            // only get last chart version
            const lastVersionIds = await trx('saved_queries_versions')
                .whereRaw('?? = ANY(?::int[])', ['saved_query_id', chartIds])
                .groupBy('saved_query_id')
                .max('saved_queries_version_id');

            const chartVersions = await trx('saved_queries_versions')
                .whereRaw('?? = ANY(?::int[])', [
                    'saved_queries_version_id',
                    lastVersionIds.map((d) => d.max),
                ])
                .select('*');

            const chartVersionIds = chartVersions.map(
                (d) => d.saved_queries_version_id,
            );

            const newChartVersions =
                chartVersions.length > 0
                    ? await chunkedInsertReturning<
                          (typeof chartVersions)[number]
                      >(
                          trx,
                          'saved_queries_versions',
                          chartVersions.map((d) => {
                              const newSavedQueryId =
                                  previewChartIdBySource.get(d.saved_query_id);
                              if (!newSavedQueryId) {
                                  throw new Error(
                                      `Cannot find new chart id for ${d.saved_query_id}`,
                                  );
                              }
                              const createChartVersion = {
                                  ...d,
                                  saved_queries_version_id: undefined,
                                  saved_queries_version_uuid: undefined,
                                  saved_query_id: newSavedQueryId,
                              };
                              delete createChartVersion.saved_queries_version_id;
                              delete createChartVersion.saved_queries_version_uuid;

                              return createChartVersion;
                          }),
                      )
                    : [];

            const chartVersionMapping = chartVersions.map((c, i) => ({
                id: c.saved_queries_version_id,
                newId: newChartVersions[i].saved_queries_version_id,
            }));
            const previewChartVersionIdBySource = new Map(
                chartVersionMapping.map((m) => [m.id, m.newId]),
            );

            const copyChartVersionContent = async (
                table: string,
                excludedFields: string[],
                fieldPreprocess: {
                    [field: string]: (value: AnyType) => AnyType;
                } = {},
            ) => {
                const content = await trx(table)
                    .whereRaw('?? = ANY(?::int[])', [
                        'saved_queries_version_id',
                        chartVersionIds,
                    ])
                    .select(`*`);

                if (content.length === 0) return undefined;

                Logger.debug(
                    `Copying ${content.length} chart content on ${table} table`,
                );
                const batchSize = 1000;
                const newContent = await trx
                    .batchInsert(
                        table,
                        content.map((d) => {
                            const createContent = {
                                ...d,
                                saved_queries_version_id:
                                    previewChartVersionIdBySource.get(
                                        d.saved_queries_version_id,
                                    ),
                            };
                            excludedFields.forEach((fieldId) => {
                                delete createContent[fieldId];
                            });
                            Object.keys(fieldPreprocess).forEach((fieldId) => {
                                createContent[fieldId] = fieldPreprocess[
                                    fieldId
                                ](createContent[fieldId]);
                            });
                            return createContent;
                        }),
                        batchSize,
                    )
                    .returning('*');

                return newContent;
            };

            await copyChartVersionContent(
                'saved_queries_version_table_calculations',
                ['saved_queries_version_table_calculation_id'],
            );
            await copyChartVersionContent(
                'saved_queries_version_custom_dimensions',
                ['saved_queries_version_custom_dimension_id'],
                {
                    custom_range: (value: AnyType) => JSON.stringify(value),
                    custom_groups: (value: AnyType) => JSON.stringify(value),
                },
            );
            await copyChartVersionContent(
                SavedChartCustomSqlDimensionsTableName,
                [],
            );
            await copyChartVersionContent(
                'saved_queries_version_sorts',
                ['saved_queries_version_sort_id'],
                { pivot_values: (value: AnyType) => JSON.stringify(value) },
            );
            await copyChartVersionContent('saved_queries_version_fields', [
                'saved_queries_version_field_id',
            ]);
            await copyChartVersionContent(
                'saved_queries_version_additional_metrics',
                ['saved_queries_version_additional_metric_id', 'uuid'],
                {
                    filters: (value: AnyType) => JSON.stringify(value),
                    // jsonb array — without stringify pg serializes it as a
                    // postgres array literal, which is invalid json
                    distinct_keys: (value: AnyType) =>
                        value == null ? null : JSON.stringify(value),
                },
            );

            // Get last version of a dashboard
            const lastDashboardVersionsIds = await trx('dashboard_versions')
                .whereRaw('?? = ANY(?::int[])', ['dashboard_id', dashboardIds])
                .groupBy('dashboard_id')
                .max('dashboard_version_id');

            const dashboardVersionIds = lastDashboardVersionsIds.map(
                (d) => d.max,
            );

            const dashboardVersions = await trx('dashboard_versions')
                .whereRaw('?? = ANY(?::int[])', [
                    'dashboard_version_id',
                    dashboardVersionIds,
                ])
                .select('*');

            const newDashboardVersions =
                dashboardVersions.length > 0
                    ? await chunkedInsertReturning<
                          (typeof dashboardVersions)[number]
                      >(
                          trx,
                          'dashboard_versions',
                          dashboardVersions.map((d) => {
                              const createDashboardVersion = {
                                  ...d,
                                  dashboard_version_id: undefined,
                                  dashboard_version_uuid: undefined,
                                  dashboard_id: previewDashboardIdBySource.get(
                                      d.dashboard_id,
                                  )!,
                              };
                              delete createDashboardVersion.dashboard_version_id;
                              delete createDashboardVersion.dashboard_version_uuid;
                              return createDashboardVersion;
                          }),
                      )
                    : [];

            const dashboardVersionsMapping = dashboardVersions.map((c, i) => ({
                id: c.dashboard_version_id,
                newId: newDashboardVersions[i].dashboard_version_id,
            }));
            const previewDashboardVersionIdBySource = new Map(
                dashboardVersionsMapping.map((m) => [m.id, m.newId]),
            );

            const dashboardTabs = await trx(DashboardTabsTableName).whereRaw(
                '?? = ANY(?::int[])',
                ['dashboard_version_id', dashboardVersionIds],
            );

            Logger.info(
                `Copying ${dashboardTabs.length} dashboard tabs on ${previewProjectUuid}`,
            );
            let newDashboardTabs: DbDashboardTabs[] = [];
            if (dashboardTabs.length > 0) {
                newDashboardTabs =
                    await chunkedInsertReturning<DbDashboardTabs>(
                        trx,
                        DashboardTabsTableName,
                        dashboardTabs.map((d) => ({
                            ...d,
                            uuid: uuidv4(), // we need to generate the uuid here: https://github.com/lightdash/lightdash/issues/10408
                            dashboard_id: previewDashboardIdBySource.get(
                                d.dashboard_id,
                            )!,
                            dashboard_version_id:
                                previewDashboardVersionIdBySource.get(
                                    d.dashboard_version_id,
                                )!,
                        })),
                    );
            }
            const dashboardTabsMapping = newDashboardTabs.map((c, i) => ({
                uuid: dashboardTabs[i].uuid,
                newUuid: c.uuid,
                dashboardVersionId: dashboardTabs[i].dashboard_version_id,
            }));
            const previewTabUuidBySource = new Map(
                dashboardTabsMapping.map((m) => [
                    `${m.dashboardVersionId}:${m.uuid}`,
                    m.newUuid,
                ]),
            );

            const dashboardViews = await trx(DashboardViewsTableName).whereRaw(
                '?? = ANY(?::int[])',
                ['dashboard_version_id', dashboardVersionIds],
            );

            Logger.info(
                `Copying ${dashboardViews.length} dashboard views on ${previewProjectUuid}`,
            );

            if (dashboardViews.length > 0) {
                await chunkedInsertReturning<(typeof dashboardViews)[number]>(
                    trx,
                    DashboardViewsTableName,
                    dashboardViews.map((d) => ({
                        ...d,
                        dashboard_view_uuid: undefined,
                        dashboard_version_id:
                            previewDashboardVersionIdBySource.get(
                                d.dashboard_version_id,
                            )!,
                    })),
                );
            }

            const dashboardTiles = await trx('dashboard_tiles').whereRaw(
                '?? = ANY(?::int[])',
                ['dashboard_version_id', dashboardVersionIds],
            );

            Logger.info(
                `Copying ${dashboardTiles.length} dashboard tiles on ${previewProjectUuid}`,
            );

            const dashboardTileUuids = dashboardTiles.map(
                (dv) => dv.dashboard_tile_uuid,
            );

            const newDashboardTiles =
                dashboardTiles.length > 0
                    ? await chunkedInsertReturning<
                          (typeof dashboardTiles)[number]
                      >(
                          trx,
                          'dashboard_tiles',
                          dashboardTiles.map((d) => ({
                              ...d,
                              // we keep the same dashboard_tile_uuid
                              dashboard_version_id:
                                  previewDashboardVersionIdBySource.get(
                                      d.dashboard_version_id,
                                  )!,
                              tab_uuid: previewTabUuidBySource.get(
                                  `${d.dashboard_version_id}:${d.tab_uuid}`,
                              ),
                          })),
                      )
                    : [];

            const dashboardTilesMapping = dashboardTiles.map((c, i) => ({
                id: c.dashboard_tile_uuid,
                newId: newDashboardTiles[i].dashboard_tile_uuid,
            }));
            const previewDashboardTileUuidBySource = new Map(
                dashboardTilesMapping.map((m) => [m.id, m.newId]),
            );

            const copyDashboardTileContent = async (table: string) => {
                const content = await trx(table)
                    .whereRaw('?? = ANY(?::uuid[])', [
                        'dashboard_tile_uuid',
                        dashboardTileUuids,
                    ])
                    .and.whereRaw('?? = ANY(?::int[])', [
                        'dashboard_version_id',
                        dashboardVersionIds,
                    ]);

                if (content.length === 0) return undefined;

                const newContent = await chunkedInsertReturning<
                    (typeof content)[number]
                >(
                    trx,
                    table,
                    content.map((d) => ({
                        ...d,

                        // only applied to tile charts
                        ...(d.saved_chart_id && {
                            saved_chart_id: previewChartIdBySource.get(
                                d.saved_chart_id,
                            ),
                        }),

                        // only applied to saved sql tiles
                        ...(d.saved_sql_uuid && {
                            saved_sql_uuid: previewSavedSqlUuidBySource.get(
                                d.saved_sql_uuid,
                            ),
                        }),

                        dashboard_version_id:
                            previewDashboardVersionIdBySource.get(
                                d.dashboard_version_id,
                            )!,
                        dashboard_tile_uuid:
                            previewDashboardTileUuidBySource.get(
                                d.dashboard_tile_uuid,
                            )!,
                    })),
                );
                return newContent;
            };

            await copyDashboardTileContent('dashboard_tile_charts');
            await copyDashboardTileContent('dashboard_tile_looms');
            await copyDashboardTileContent('dashboard_tile_markdowns');
            await copyDashboardTileContent('dashboard_tile_sql_charts');
            await copyDashboardTileContent('dashboard_tile_headings');
            // Data app tiles are copied with `app_uuid` left pointing at the
            // source project's app — the preview project gets no `apps` row of
            // its own. See `docs/data-apps.md` Limitations.
            await copyDashboardTileContent('dashboard_tile_data_apps');

            // Get AI Agents from the source project
            // Note: AI agents are an Enterprise Edition feature. The table may not exist
            // on self-hosted instances without an EE license.
            let aiAgents: DbAiAgent[] = [];
            let aiAgentMapping: IdContentMapping[] = [];

            const hasAiAgentTable = await trx.schema.hasTable(AiAgentTableName);

            if (hasAiAgentTable) {
                aiAgents = await trx(AiAgentTableName)
                    .where('project_uuid', projectUuid)
                    .select<DbAiAgent[]>('*');

                Logger.info(
                    `Copying ${aiAgents.length} AI agents on ${previewProjectUuid}`,
                );

                type CloneAiAgent = Omit<
                    DbAiAgent,
                    'ai_agent_uuid' | 'created_at' | 'updated_at'
                > & {
                    ai_agent_uuid?: string;
                    created_at?: Date;
                    updated_at?: Date;
                };

                const newAiAgents =
                    aiAgents.length > 0
                        ? await chunkedInsertReturning<DbAiAgent>(
                              trx,
                              AiAgentTableName,
                              aiAgents.map((agent) => {
                                  const createAgent: CloneAiAgent = {
                                      ...agent,
                                      ai_agent_uuid: undefined,
                                      project_uuid: previewProjectUuid,
                                      created_at: undefined,
                                      updated_at: undefined,
                                  };
                                  delete createAgent.ai_agent_uuid;
                                  delete createAgent.created_at;
                                  delete createAgent.updated_at;
                                  return createAgent;
                              }),
                          )
                        : [];

                aiAgentMapping = aiAgents
                    .map((agent, i) => ({
                        id: agent.ai_agent_uuid,
                        newId: newAiAgents[i]?.ai_agent_uuid,
                    }))
                    .filter((mapping) => !!mapping.newId);
                const previewAiAgentUuidBySource = new Map(
                    aiAgentMapping.map((m) => [m.id, m.newId]),
                );

                const aiAgentUuids = aiAgents.map(
                    (agent) => agent.ai_agent_uuid,
                );

                // Copy AI Agent instruction versions
                if (aiAgentUuids.length > 0) {
                    const aiAgentInstructionVersions = await trx(
                        AiAgentInstructionVersionsTableName,
                    )
                        .whereRaw('?? = ANY(?::uuid[])', [
                            'ai_agent_uuid',
                            aiAgentUuids,
                        ])
                        .select('*');

                    Logger.debug(
                        `Copying ${aiAgentInstructionVersions.length} AI agent instruction versions`,
                    );

                    if (aiAgentInstructionVersions.length > 0) {
                        await chunkedInsertReturning<
                            (typeof aiAgentInstructionVersions)[number]
                        >(
                            trx,
                            AiAgentInstructionVersionsTableName,
                            aiAgentInstructionVersions.map((version) => {
                                const newAiAgentUuid =
                                    previewAiAgentUuidBySource.get(
                                        version.ai_agent_uuid,
                                    );
                                if (!newAiAgentUuid) {
                                    throw new Error(
                                        `Cannot find new AI agent UUID for ${version.ai_agent_uuid}`,
                                    );
                                }
                                const createVersion = {
                                    ...version,
                                    ai_agent_instruction_version_uuid:
                                        undefined,
                                    ai_agent_uuid: newAiAgentUuid.toString(),
                                    created_at: undefined,
                                };
                                delete createVersion.ai_agent_instruction_version_uuid;
                                delete createVersion.created_at;
                                return createVersion;
                            }),
                        );
                    }

                    // Skip copying AI Agent integrations (including Slack) for preview projects
                    // due to organization-wide constraints (e.g., one agent per Slack channel)
                    Logger.debug(
                        `Skipping AI agent integrations for preview project ${previewProjectUuid}`,
                    );

                    // Copy AI Agent group access
                    const aiAgentGroupAccesses = await trx(
                        AiAgentGroupAccessTableName,
                    )
                        .whereRaw('?? = ANY(?::uuid[])', [
                            'ai_agent_uuid',
                            aiAgentUuids,
                        ])
                        .select('*');

                    Logger.debug(
                        `Copying ${aiAgentGroupAccesses.length} AI agent group accesses`,
                    );

                    if (aiAgentGroupAccesses.length > 0) {
                        await chunkedInsertReturning<
                            (typeof aiAgentGroupAccesses)[number]
                        >(
                            trx,
                            AiAgentGroupAccessTableName,
                            aiAgentGroupAccesses.map((groupAccess) => {
                                const newAiAgentUuid =
                                    previewAiAgentUuidBySource.get(
                                        groupAccess.ai_agent_uuid,
                                    );
                                if (!newAiAgentUuid) {
                                    throw new Error(
                                        `Cannot find new AI agent UUID for ${groupAccess.ai_agent_uuid}`,
                                    );
                                }
                                const createGroupAccess = {
                                    ...groupAccess,
                                    ai_agent_uuid: newAiAgentUuid.toString(),
                                    created_at: undefined,
                                };
                                delete createGroupAccess.created_at;
                                return createGroupAccess;
                            }),
                        );
                    }

                    // Copy AI Agent user access
                    const aiAgentUserAccesses = await trx(
                        AiAgentUserAccessTableName,
                    )
                        .whereRaw('?? = ANY(?::uuid[])', [
                            'ai_agent_uuid',
                            aiAgentUuids,
                        ])
                        .select('*');

                    Logger.debug(
                        `Copying ${aiAgentUserAccesses.length} AI agent user accesses`,
                    );

                    if (aiAgentUserAccesses.length > 0) {
                        await chunkedInsertReturning<
                            (typeof aiAgentUserAccesses)[number]
                        >(
                            trx,
                            AiAgentUserAccessTableName,
                            aiAgentUserAccesses.map((userAccess) => {
                                const newAiAgentUuid =
                                    previewAiAgentUuidBySource.get(
                                        userAccess.ai_agent_uuid,
                                    );
                                if (!newAiAgentUuid) {
                                    throw new Error(
                                        `Cannot find new AI agent UUID for ${userAccess.ai_agent_uuid}`,
                                    );
                                }
                                const createUserAccess = {
                                    ...userAccess,
                                    ai_agent_uuid: newAiAgentUuid,
                                    created_at: undefined,
                                };
                                delete createUserAccess.created_at;
                                return createUserAccess;
                            }),
                        );
                    }
                }
            } else {
                Logger.debug(
                    `Skipping AI agent content copy: AI agent tables do not exist (likely non-EE instance)`,
                );
            }

            // Categories (tags) belong to the project, not to content; copy
            // them so the preview's catalog carries the same ones once it
            // is indexed. Assignments are rebuilt by that index.
            const tags = await trx(TagsTableName).where(
                'project_uuid',
                projectUuid,
            );
            Logger.info(`Copying ${tags.length} tags on ${previewProjectUuid}`);
            if (tags.length > 0) {
                await chunkedInsertReturning<(typeof tags)[number]>(
                    trx,
                    TagsTableName,
                    tags.map(({ tag_uuid, created_at, ...tag }) => ({
                        ...tag,
                        project_uuid: previewProjectUuid,
                    })),
                );
            }

            // Pinned items: the preview's homepage shows what the project
            // pins, mapped onto the copied dashboards, charts and spaces.
            const [pinnedList] = await trx(PinnedListTableName).where(
                'project_uuid',
                projectUuid,
            );
            if (pinnedList) {
                const [existingPreviewList] = await trx(
                    PinnedListTableName,
                ).where('project_uuid', previewProjectUuid);
                const previewList =
                    existingPreviewList ??
                    (
                        await trx(PinnedListTableName)
                            .insert({ project_uuid: previewProjectUuid })
                            .returning('*')
                    )[0];
                const pinnedDashboards = await trx(
                    PinnedDashboardTableName,
                ).where('pinned_list_uuid', pinnedList.pinned_list_uuid);
                const pinnedCharts = await trx(PinnedChartTableName).where(
                    'pinned_list_uuid',
                    pinnedList.pinned_list_uuid,
                );
                const pinnedSpaces = await trx(PinnedSpaceTableName).where(
                    'pinned_list_uuid',
                    pinnedList.pinned_list_uuid,
                );
                Logger.info(
                    `Copying ${
                        pinnedDashboards.length +
                        pinnedCharts.length +
                        pinnedSpaces.length
                    } pinned items on ${previewProjectUuid}`,
                );
                const dashboardInserts = pinnedDashboards.flatMap((pin) => {
                    const mapped = previewDashboardUuidBySource.get(
                        pin.dashboard_uuid,
                    );
                    return mapped
                        ? [
                              {
                                  pinned_list_uuid:
                                      previewList.pinned_list_uuid,
                                  dashboard_uuid: mapped,
                                  order: pin.order,
                              },
                          ]
                        : [];
                });
                if (dashboardInserts.length > 0) {
                    await chunkedInsertReturning(
                        trx,
                        PinnedDashboardTableName,
                        dashboardInserts,
                    );
                }
                const chartInserts = pinnedCharts.flatMap((pin) => {
                    const mapped = previewChartUuidBySource.get(
                        pin.saved_chart_uuid,
                    );
                    return mapped
                        ? [
                              {
                                  pinned_list_uuid:
                                      previewList.pinned_list_uuid,
                                  saved_chart_uuid: mapped,
                                  order: pin.order,
                              },
                          ]
                        : [];
                });
                if (chartInserts.length > 0) {
                    await chunkedInsertReturning(
                        trx,
                        PinnedChartTableName,
                        chartInserts,
                    );
                }
                const spaceInserts = pinnedSpaces.flatMap((pin) => {
                    const mapped = previewSpaceUuidBySource.get(pin.space_uuid);
                    return mapped
                        ? [
                              {
                                  pinned_list_uuid:
                                      previewList.pinned_list_uuid,
                                  space_uuid: mapped,
                                  order: pin.order,
                              },
                          ]
                        : [];
                });
                if (spaceInserts.length > 0) {
                    await chunkedInsertReturning(
                        trx,
                        PinnedSpaceTableName,
                        spaceInserts,
                    );
                }
            }

            const contentMapping: PreviewContentMapping = {
                charts: chartMapping,
                chartVersions: chartVersionMapping,
                spaces: spaceMapping,
                dashboards: dashboardMapping,
                dashboardVersions: dashboardVersionsMapping,
                savedSql: savedSQLMapping,
                savedSqlVersions: savedSQLVersionMapping,
                aiAgents: aiAgentMapping,
            };
            // Insert mapping on database
            await trx('preview_content').insert({
                project_uuid: projectUuid,
                preview_project_uuid: previewProjectUuid,
                content_mapping: contentMapping,
            });

            // Return the source→preview space mapping so callers (preview data
            // app duplication) can place copied entities into the mirrored
            // preview spaces.
            return {
                spaceMapping: spaceMapping.map((s) => ({
                    sourceSpaceUuid: s.uuid,
                    previewSpaceUuid: s.newUuid,
                })),
            };
        });
    }

    async getPreviewAiAgentUuid({
        projectUuid,
        previewProjectUuid,
        aiAgentUuid,
    }: {
        projectUuid: string;
        previewProjectUuid: string;
        aiAgentUuid: string;
    }): Promise<string | null> {
        const row = await this.database('preview_content')
            .select<{ content_mapping: PreviewContentMapping }[]>(
                'content_mapping',
            )
            .where('project_uuid', projectUuid)
            .where('preview_project_uuid', previewProjectUuid)
            .orderBy('created_at', 'desc')
            .first();

        const match = row?.content_mapping.aiAgents.find(
            (mapping) => String(mapping.id) === aiAgentUuid,
        );
        return typeof match?.newId === 'string' ? match.newId : null;
    }

    async getUpstreamChartUuidFromPreview(
        previewProjectUuid: string,
        previewChartUuid: string,
    ): Promise<string | null> {
        const previewChart = await this.database(SavedChartsTableName)
            .select('saved_query_id')
            .where('project_uuid', previewProjectUuid)
            .where('saved_query_uuid', previewChartUuid)
            .whereNull('deleted_at')
            .first();
        if (!previewChart) return null;

        const previewContent = await this.database('preview_content')
            .select<
                {
                    project_uuid: string;
                    content_mapping: PreviewContentMapping;
                }[]
            >('project_uuid', 'content_mapping')
            .where('preview_project_uuid', previewProjectUuid)
            .orderBy('created_at', 'desc')
            .first();
        const sourceMapping = previewContent?.content_mapping.charts.find(
            ({ newId }) => Number(newId) === previewChart.saved_query_id,
        );
        if (!previewContent || !sourceMapping) return null;

        const upstreamChart = await this.database(SavedChartsTableName)
            .select('saved_query_uuid')
            .where('project_uuid', previewContent.project_uuid)
            .where('saved_query_id', sourceMapping.id)
            .whereNull('deleted_at')
            .first();

        return upstreamChart?.saved_query_uuid ?? null;
    }

    async getUpstreamDashboardUuidFromPreview(
        previewProjectUuid: string,
        previewDashboardUuid: string,
    ): Promise<string | null> {
        const previewDashboard = await this.database(DashboardsTableName)
            .select('dashboard_id')
            .where('project_uuid', previewProjectUuid)
            .where('dashboard_uuid', previewDashboardUuid)
            .whereNull('deleted_at')
            .first();
        if (!previewDashboard) return null;

        const previewContent = await this.database('preview_content')
            .select<
                {
                    project_uuid: string;
                    content_mapping: PreviewContentMapping;
                }[]
            >('project_uuid', 'content_mapping')
            .where('preview_project_uuid', previewProjectUuid)
            .orderBy('created_at', 'desc')
            .first();
        const sourceMapping = previewContent?.content_mapping.dashboards.find(
            ({ newId }) => Number(newId) === previewDashboard.dashboard_id,
        );
        if (!previewContent || !sourceMapping) return null;

        const upstreamDashboard = await this.database(DashboardsTableName)
            .select('dashboard_uuid')
            .where('project_uuid', previewContent.project_uuid)
            .where('dashboard_id', sourceMapping.id)
            .whereNull('deleted_at')
            .first();

        return upstreamDashboard?.dashboard_uuid ?? null;
    }

    // Easier to mock in ProjectService
    getWarehouseClientFromCredentials(
        credentials: CreateWarehouseCredentials,
        options?: Parameters<typeof warehouseClientFromCredentials>[1],
    ) {
        return warehouseClientFromCredentials(credentials, {
            // The client is shared by all concurrent async query jobs
            maxOpenConnections:
                this.lightdashConfig.natsWorker.workerConcurrency,
            ...options,
        });
    }

    async createVirtualView(
        projectUuid: string,
        {
            name,
            label,
            sql,
            columns,
            parameterValues,
        }: CreateVirtualViewPayload,
        warehouseClient: WarehouseClient,
        connectionUuid?: string | null,
    ): Promise<Explore> {
        const virtualView = createVirtualView(
            name,
            sql,
            columns,
            warehouseClient,
            label,
            parameterValues,
        );
        stampExploreConnectionUuid(virtualView, connectionUuid);

        await this.database.transaction(async (trx) => {
            await ProjectModel.lockAndEnsureCachedExplores(trx, projectUuid);
            const existing = await trx(CachedExploreTableName)
                .select('name')
                .where('project_uuid', projectUuid)
                .andWhere('name', virtualView.name)
                .first();
            if (existing) {
                throw new AlreadyExistsError(
                    `Explore "${virtualView.name}" already exists`,
                );
            }
            await trx(CachedExploreTableName).insert({
                project_uuid: projectUuid,
                connection_uuid: getExploreStoredConnectionUuid(virtualView),
                name: virtualView.name,
                table_names: Object.keys(virtualView.tables || {}),
                explore: virtualView,
            });
        });

        return virtualView;
    }

    async updateVirtualView(
        projectUuid: string,
        exploreName: string,
        payload: UpdateVirtualViewPayload,
        warehouseClient: WarehouseClient,
        expectedExplore?: Explore,
        connectionUuid?: string | null,
    ) {
        const translatedToExplore = createVirtualView(
            exploreName,
            payload.sql,
            payload.columns,
            warehouseClient,
            payload.name, // label
            payload.parameterValues,
        );

        await this.database.transaction(async (trx) => {
            await ProjectModel.lockAndEnsureCachedExplores(trx, projectUuid);
            const existing = await trx(CachedExploreTableName)
                .select<
                    {
                        explore: Explore | ExploreError;
                        connection_uuid: string | null;
                    }[]
                >('explore', 'connection_uuid')
                .where('project_uuid', projectUuid)
                .andWhere('name', exploreName)
                .first();
            if (!existing || existing.explore.type !== ExploreType.VIRTUAL) {
                throw new NotFoundError(
                    `Virtual view "${exploreName}" does not exist`,
                );
            }
            if (
                expectedExplore &&
                !isEqual(existing.explore, expectedExplore)
            ) {
                throw new ParameterError(
                    'Virtual view changed concurrently; download and retry',
                );
            }
            const resolvedConnectionUuid =
                connectionUuid === undefined
                    ? existing.connection_uuid
                    : connectionUuid;
            stampExploreConnectionUuid(
                translatedToExplore,
                resolvedConnectionUuid,
            );
            await trx(CachedExploreTableName)
                .update({
                    connection_uuid:
                        getExploreStoredConnectionUuid(translatedToExplore),
                    table_names: Object.keys(translatedToExplore.tables || {}),
                    explore: translatedToExplore,
                })
                .where('project_uuid', projectUuid)
                .andWhere('name', exploreName);
        });

        return translatedToExplore;
    }

    async deleteVirtualView(projectUuid: string, name: string) {
        await this.database.transaction(async (trx) => {
            await ProjectModel.lockAndEnsureCachedExplores(trx, projectUuid);
            await trx(CachedExploreTableName)
                .where('project_uuid', projectUuid)
                .whereRaw("explore->>'type' = ?", [ExploreType.VIRTUAL])
                .andWhere('name', name)
                .delete();
        });
    }

    async saveExternalSourceExplore(
        projectUuid: string,
        explore: Explore,
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            await ProjectModel.lockAndEnsureCachedExplores(trx, projectUuid);
            const existing = await trx(CachedExploreTableName)
                .select<{ explore: Explore | ExploreError }[]>('explore')
                .where('project_uuid', projectUuid)
                .andWhere('name', explore.name)
                .first();
            if (
                existing &&
                existing.explore.type !== ExploreType.EXTERNAL_SOURCE
            ) {
                throw new AlreadyExistsError(
                    `Explore "${explore.name}" already exists`,
                );
            }

            const row = {
                project_uuid: projectUuid,
                connection_uuid: getExploreStoredConnectionUuid(explore),
                name: explore.name,
                table_names: Object.keys(explore.tables || {}),
                explore,
            };
            if (existing) {
                await trx(CachedExploreTableName)
                    .where('project_uuid', projectUuid)
                    .andWhere('name', explore.name)
                    .update({
                        connection_uuid: row.connection_uuid,
                        table_names: row.table_names,
                        explore: row.explore,
                    });
            } else {
                await trx(CachedExploreTableName).insert({
                    project_uuid: row.project_uuid,
                    connection_uuid: row.connection_uuid,
                    name: row.name,
                    table_names: Object.keys(explore.tables || {}),
                    explore,
                });
            }
        });
    }

    async deleteExternalSourceExplores(
        projectUuid: string,
        names: string[],
    ): Promise<void> {
        if (names.length === 0) return;
        await this.database.transaction(async (trx) => {
            await ProjectModel.lockAndEnsureCachedExplores(trx, projectUuid);
            await trx(CachedExploreTableName)
                .where('project_uuid', projectUuid)
                .whereRaw("explore->>'type' = ?", [ExploreType.EXTERNAL_SOURCE])
                .whereIn('name', names)
                .delete();
        });
    }

    private static async lockAndEnsureCachedExplores(
        trx: Transaction,
        projectUuid: string,
    ): Promise<void> {
        await trx(CachedExploresTableName)
            .insert({ project_uuid: projectUuid, explores: [] })
            .onConflict('project_uuid')
            .ignore();
        await trx(CachedExploresTableName)
            .where('project_uuid', projectUuid)
            .forUpdate()
            .first();
    }

    async updateSchedulerSettings(
        projectUuid: string,
        settings: UpdateSchedulerSettings,
    ) {
        const update: Partial<
            Pick<
                DbProject,
                | 'scheduler_timezone'
                | 'scheduler_failure_notify_recipients'
                | 'scheduler_failure_include_contact'
                | 'scheduler_failure_contact_override'
            >
        > = {};
        if (settings.schedulerTimezone !== undefined) {
            update.scheduler_timezone = settings.schedulerTimezone;
        }
        if (settings.schedulerFailureNotifyRecipients !== undefined) {
            update.scheduler_failure_notify_recipients =
                settings.schedulerFailureNotifyRecipients;
        }
        if (settings.schedulerFailureIncludeContact !== undefined) {
            update.scheduler_failure_include_contact =
                settings.schedulerFailureIncludeContact;
        }
        if (settings.schedulerFailureContactOverride !== undefined) {
            update.scheduler_failure_contact_override =
                settings.schedulerFailureContactOverride;
        }

        if (Object.keys(update).length === 0) {
            return undefined;
        }

        const [updatedProject] = await this.database(ProjectTableName)
            .update(update)
            .where('project_uuid', projectUuid)
            .returning('*');

        return updatedProject;
    }

    async getProjectWarehouseConfig(
        projectUuid: string,
        connectionUuid?: string | null,
    ): Promise<{
        organizationWarehouseCredentialsUuid: string | null;
        queryTimezone: string | null;
        requireUserCredentials: boolean | null;
    }> {
        const connection = await this.resolveConnection(
            projectUuid,
            connectionUuid,
        );
        const [project] = await this.database(ProjectTableName)
            .select('query_timezone', 'require_user_credentials')
            .where('project_uuid', projectUuid);

        if (!project) {
            throw new NotFoundError(
                `Cannot find project with id: ${projectUuid}`,
            );
        }

        return {
            organizationWarehouseCredentialsUuid:
                connection.organizationWarehouseCredentialsUuid,
            queryTimezone: project.query_timezone,
            requireUserCredentials: project.require_user_credentials,
        };
    }

    async getAgentSqlScope(projectUuid: string): Promise<AgentSqlScope | null> {
        const [project] = await this.database(ProjectTableName)
            .select('agent_sql_scope')
            .where('project_uuid', projectUuid);

        if (!project) {
            throw new NotFoundError(
                `Cannot find project with id: ${projectUuid}`,
            );
        }

        return project.agent_sql_scope ?? null;
    }

    async updateAgentSqlScope(
        projectUuid: string,
        agentSqlScope: AgentSqlScope | null,
    ): Promise<void> {
        // Empty everywhere means "unrestricted", stored as NULL so there is
        // exactly one representation of the default. An allow list is not
        // required: a scope may consist only of exclusions.
        const isEmpty =
            !agentSqlScope ||
            (agentSqlScope.schemas.length === 0 &&
                !agentSqlScope.catalogs?.length &&
                !agentSqlScope.deniedSchemas?.length &&
                !agentSqlScope.deniedCatalogs?.length);
        const normalised = isEmpty
            ? null
            : {
                  schemas: agentSqlScope!.schemas,
                  ...(agentSqlScope!.catalogs?.length
                      ? { catalogs: agentSqlScope!.catalogs }
                      : {}),
                  ...(agentSqlScope!.deniedSchemas?.length
                      ? { deniedSchemas: agentSqlScope!.deniedSchemas }
                      : {}),
                  ...(agentSqlScope!.deniedCatalogs?.length
                      ? { deniedCatalogs: agentSqlScope!.deniedCatalogs }
                      : {}),
              };

        const updated = await this.database(ProjectTableName)
            .update({ agent_sql_scope: normalised })
            .where('project_uuid', projectUuid);

        if (updated === 0) {
            throw new NotFoundError(
                `Cannot find project with id: ${projectUuid}`,
            );
        }
    }

    async getQueryTimezone(projectUuid: string): Promise<string | null> {
        const [project] = await this.database(ProjectTableName)
            .select('query_timezone')
            .where('project_uuid', projectUuid);

        if (!project) {
            throw new NotFoundError(
                `Cannot find project with id: ${projectUuid}`,
            );
        }

        return project.query_timezone;
    }

    async updateQueryTimezone(
        projectUuid: string,
        settings: UpdateQueryTimezoneSettings,
    ): Promise<DbProject> {
        const { queryTimezone, useProjectTimezoneInFilters } = settings;

        return this.database.transaction(async (trx) => {
            const [current] = await trx(ProjectTableName)
                .select('query_timezone', 'use_project_timezone_in_filters')
                .where('project_uuid', projectUuid)
                .forUpdate();

            if (!current) {
                throw new NotFoundError(
                    `Cannot find project with id: ${projectUuid}`,
                );
            }

            const resultingTimezone =
                queryTimezone !== undefined
                    ? queryTimezone
                    : current.query_timezone;
            const resultingUseProjectTimezoneInFilters =
                useProjectTimezoneInFilters !== undefined
                    ? useProjectTimezoneInFilters
                    : current.use_project_timezone_in_filters;

            if (
                resultingUseProjectTimezoneInFilters &&
                resultingTimezone === null
            ) {
                throw new ParameterError(
                    'Cannot enable useProjectTimezoneInFilters without a project query timezone',
                );
            }

            const [updatedProject] = await trx(ProjectTableName)
                .update({
                    ...(queryTimezone !== undefined && {
                        query_timezone: queryTimezone,
                    }),
                    ...(useProjectTimezoneInFilters !== undefined && {
                        use_project_timezone_in_filters:
                            useProjectTimezoneInFilters,
                    }),
                })
                .where('project_uuid', projectUuid)
                .returning('*');

            return updatedProject;
        });
    }
}
