import {
    AlreadyExistsError,
    CatalogCategoryFilterMode,
    CatalogFilter,
    CatalogItemIcon,
    CatalogItemsWithIcons,
    CatalogType,
    ChangesetUtils,
    ChangesetWithChanges,
    CompiledDimension,
    CompiledMetric,
    CompiledTable,
    Explore,
    FieldType,
    NotFoundError,
    TableSelectionType,
    UNASSIGNED_OWNER,
    UNCATEGORIZED_TAG_UUID,
    UnexpectedServerError,
    assertUnreachable,
    convertToAiHints,
    isExploreError,
    type ApiCatalogSearch,
    type ApiSort,
    type CatalogFieldMap,
    type CatalogItem,
    type CatalogItemSummary,
    type CatalogItemWithTagUuids,
    type CatalogMetricsTreeEdge,
    type ChartFieldUsageChanges,
    type ChartUsageIn,
    type ExploreError,
    type KnexPaginateArgs,
    type KnexPaginatedData,
    type MetricsTree,
    type MetricsTreeLockInfo,
    type MetricsTreeSummary,
    type MetricsTreeWithDetails,
    type PrevMetricsTreeNode,
    type SessionUser,
    type TablesConfiguration,
    type Tag,
    type UserAttributeValueMap,
} from '@lightdash/common';
import { Knex } from 'knex';
import { uniqBy } from 'lodash';
import type { LightdashConfig } from '../../config/parseConfig';
import {
    CatalogTableName,
    CatalogTagsTableName,
    DbCatalogTagIn,
    MetricsTreeEdgesTableName,
    MetricsTreeLocksTableName,
    MetricsTreeNodesTableName,
    MetricsTreesTableName,
    getDbCatalogColumnFromCatalogProperty,
    type DbCatalog,
    type DbCatalogTagsMigrateIn,
    type DbMetricsTree,
    type DbMetricsTreeEdge,
    type DbMetricsTreeEdgeDelete,
    type DbMetricsTreeEdgeIn,
    type DbMetricsTreeIn,
    type DbMetricsTreeNodeIn,
} from '../../database/entities/catalog';
import { EmailTableName } from '../../database/entities/emails';
import { CachedExploreTableName } from '../../database/entities/projects';
import { DbTag, TagsTableName } from '../../database/entities/tags';
import { UserTableName } from '../../database/entities/users';
import KnexPaginate from '../../database/pagination';
import Logger from '../../logging/logger';
import { wrapSentryTransaction } from '../../utils';
import {
    getFullTextSearchQuery,
    getFullTextSearchRankCalcSql,
    getWebSearchRankCalcSql,
} from '../SearchModel/utils/search';
import {
    MetricTreeEdge,
    buildYamlMetricTreeEdges,
    convertExploresToCatalog,
} from './utils';
import { parseCatalog } from './utils/parser';

export enum CatalogSearchContext {
    SPOTLIGHT = 'spotlight',
    CATALOG = 'catalog',
    METRICS_EXPLORER = 'metricsExplorer',
    AI_AGENT = 'aiAgent',
    MCP = 'mcp',
}

export type CatalogModelArguments = {
    database: Knex;
    lightdashConfig: LightdashConfig;
};

type DbMetricsTreeWithLock = DbMetricsTree & {
    lock_user_uuid: string | null;
    lock_user_first_name: string | null;
    lock_user_last_name: string | null;
    lock_acquired_at: Date | null;
};

const parseLockInfo = (
    row: DbMetricsTreeWithLock,
): MetricsTreeLockInfo | null => {
    if (
        row.lock_user_uuid === null ||
        row.lock_user_first_name === null ||
        row.lock_acquired_at === null
    ) {
        return null;
    }

    return {
        lockedByUserUuid: row.lock_user_uuid,
        lockedByUserName:
            `${row.lock_user_first_name} ${row.lock_user_last_name ?? ''}`.trim(),
        acquiredAt: row.lock_acquired_at,
    };
};

export class CatalogModel {
    protected database: Knex;

    protected lightdashConfig: LightdashConfig;

    constructor(args: CatalogModelArguments) {
        this.database = args.database;
        this.lightdashConfig = args.lightdashConfig;
    }

    async indexCatalog(
        projectUuid: string,
        cachedExploreMap: { [exploreUuid: string]: Explore | ExploreError },
        projectYamlTags: DbTag[],
        userUuid: string | undefined,
    ): Promise<{
        catalogInserts: DbCatalog[];
        catalogFieldMap: CatalogFieldMap;
        numberOfCategoriesApplied?: number;
    }> {
        const cachedExplores = Object.entries(cachedExploreMap)
            .filter(
                (entry): entry is [string, Explore] =>
                    !isExploreError(entry[1]),
            )
            .map(([cachedExploreUuid, explore]) => ({
                ...explore,
                cachedExploreUuid,
            }));

        if (cachedExplores.length === 0) {
            return {
                catalogInserts: [],
                catalogFieldMap: {},
                numberOfCategoriesApplied: 0,
            };
        }

        try {
            const wrapped = await wrapSentryTransaction(
                'indexCatalog',
                { projectUuid, cachedExploresSize: cachedExplores.length },
                async () => {
                    const {
                        catalogInserts,
                        catalogFieldMap,
                        numberOfCategoriesApplied,
                        yamlEdges,
                    } = await wrapSentryTransaction(
                        'indexCatalog.convertExploresToCatalog',
                        {
                            projectUuid,
                            cachedExploresLength: cachedExplores.length,
                        },
                        async () =>
                            convertExploresToCatalog(
                                projectUuid,
                                cachedExplores,
                                projectYamlTags,
                            ),
                    );

                    const transactionInserts = await wrapSentryTransaction(
                        'indexCatalog.insert',
                        { projectUuid, catalogSize: catalogInserts.length },
                        () =>
                            this.database.transaction(async (trx) => {
                                await trx(CatalogTableName)
                                    .where('project_uuid', projectUuid)
                                    .delete();

                                // Collect unique owner emails and resolve to user_uuids
                                const ownerEmails = [
                                    ...new Set(
                                        catalogInserts
                                            .map((ci) => ci.ownerEmail)
                                            .filter(
                                                (email): email is string =>
                                                    email !== null,
                                            ),
                                    ),
                                ];

                                const emailToUserUuidMap = new Map<
                                    string,
                                    string
                                >();
                                if (ownerEmails.length > 0) {
                                    const userRows = await trx('emails')
                                        .join(
                                            'users',
                                            'emails.user_id',
                                            'users.user_id',
                                        )
                                        .whereIn('emails.email', ownerEmails)
                                        .select(
                                            'emails.email',
                                            'users.user_uuid',
                                        );

                                    userRows.forEach(
                                        (row: {
                                            email: string;
                                            user_uuid: string;
                                        }) => {
                                            emailToUserUuidMap.set(
                                                row.email.toLowerCase(),
                                                row.user_uuid,
                                            );
                                        },
                                    );
                                }

                                const BATCH_SIZE = 3000;

                                const results = await trx
                                    .batchInsert<DbCatalog>(
                                        CatalogTableName,
                                        catalogInserts.map(
                                            ({
                                                assigned_yaml_tags,
                                                ownerEmail,
                                                ...catalogInsert
                                            }) => ({
                                                ...catalogInsert,
                                                owner_user_uuid: ownerEmail
                                                    ? (emailToUserUuidMap.get(
                                                          ownerEmail.toLowerCase(),
                                                      ) ?? null)
                                                    : null,
                                            }),
                                        ),
                                        BATCH_SIZE,
                                    )
                                    .returning('*');

                                // Create project yaml tag insert objects depending on the ID of the catalog insert
                                const yamlTagInserts: DbCatalogTagIn[] =
                                    results.flatMap((result, index) => {
                                        const yamlTags =
                                            catalogInserts[index]
                                                .assigned_yaml_tags;

                                        if (yamlTags && yamlTags.length > 0) {
                                            return yamlTags.map((tag) => ({
                                                catalog_search_uuid:
                                                    result.catalog_search_uuid,
                                                tag_uuid: tag.tag_uuid,
                                                is_from_yaml: true,
                                                created_by_user_uuid:
                                                    userUuid ?? null,
                                            }));
                                        }
                                        return [];
                                    });

                                if (yamlTagInserts.length > 0) {
                                    await trx(CatalogTagsTableName)
                                        .insert(yamlTagInserts)
                                        .returning('*');
                                }

                                await this.syncYamlMetricTreeEdges({
                                    projectUuid,
                                    userUuid,
                                    catalogRows: results,
                                    yamlEdges,
                                    trx,
                                });

                                return results;
                            }),
                    );

                    return {
                        catalogInserts: transactionInserts,
                        catalogFieldMap,
                        numberOfCategoriesApplied,
                    };
                },
            );

            return wrapped;
        } catch (e) {
            Logger.error(`Failed to index catalog ${projectUuid}, ${e}`);
            return {
                catalogInserts: [],
                catalogFieldMap: {},
                numberOfCategoriesApplied: 0,
            };
        }
    }

    async syncYamlMetricTreeEdges({
        projectUuid,
        userUuid,
        catalogRows,
        yamlEdges,
        trx,
    }: {
        projectUuid: string;
        yamlEdges: MetricTreeEdge[];
        catalogRows: DbCatalog[];
        trx?: Knex;
        userUuid?: string | null;
    }) {
        const db = trx ?? this.database;
        await db(MetricsTreeEdgesTableName)
            .where({ project_uuid: projectUuid, source: 'yaml' })
            .delete();

        const { edges: uniqueEdges, invalidEdges } = buildYamlMetricTreeEdges({
            yamlEdges,
            catalogRows,
            projectUuid,
            userUuid,
        });

        invalidEdges.forEach(({ edge, reason }) => {
            Logger.warn(
                `Invalid YAML metric relationship: ${edge.sourceTableName}.${edge.sourceMetricName} -> ${edge.targetTableName}.${edge.targetMetricName} (reason: ${reason})`,
            );
        });

        if (uniqueEdges.length > 0) {
            // YAML is source of truth so if edge exists from UI, convert it to YAML-managed
            // This way, removing from YAML will delete the edge on next sync
            await db(MetricsTreeEdgesTableName)
                .insert(uniqueEdges)
                .onConflict([
                    'source_metric_catalog_search_uuid',
                    'target_metric_catalog_search_uuid',
                ])
                .merge({ source: 'yaml' });
        }
    }

    async indexCatalogUpdates({
        projectUuid,
        cachedExploreMap,
        changeset,
    }: {
        projectUuid: string;
        cachedExploreMap: { [exploreUuid: string]: Explore | ExploreError };
        changeset: ChangesetWithChanges;
    }): Promise<{
        catalogUpdates: DbCatalog[];
    }> {
        const catalogUpdates = await wrapSentryTransaction(
            'indexCatalog.updateCatalogItems',
            {
                projectUuid,
                changesetLength: changeset?.changes.length,
            },
            () =>
                this.database.transaction(async (trx) => {
                    const catalogUpdatesResult: DbCatalog[] = [];

                    const changesetChangesMap = uniqBy(
                        changeset?.changes,
                        (change) =>
                            `${change.entityTableName}:${change.entityType}:${change.entityName}`,
                    );
                    const updatePromises = changesetChangesMap.map(
                        async (change) => {
                            const cachedExploreTable =
                                cachedExploreMap[change.entityTableName];

                            if (
                                !cachedExploreTable ||
                                !cachedExploreTable.tables
                            ) {
                                return null;
                            }

                            if (change.type === 'create') {
                                const isMetric = change.entityType === 'metric';

                                if (isMetric) {
                                    const metricData = change.payload.value;

                                    const cachedExplore = await trx(
                                        CatalogTableName,
                                    )
                                        .select('cached_explore_uuid')
                                        .where(
                                            'table_name',
                                            change.entityTableName,
                                        )
                                        .where('project_uuid', projectUuid)
                                        .first('cached_explore_uuid');

                                    if (!cachedExplore) {
                                        return null;
                                    }

                                    const [result] = await trx(CatalogTableName)
                                        .insert({
                                            name: metricData.name,
                                            label: metricData.label,
                                            description:
                                                metricData.description ?? null,
                                            cached_explore_uuid:
                                                cachedExplore.cached_explore_uuid,
                                            project_uuid: projectUuid,
                                            type: CatalogType.Field,
                                            field_type: FieldType.METRIC,
                                            required_attributes: {},
                                            any_attributes: {},
                                            yaml_tags: [],
                                            ai_hints: null,
                                            chart_usage: 0,
                                            table_name: change.entityTableName,
                                            spotlight_show: true,
                                            joined_tables: [],
                                            owner_user_uuid: null,
                                        })
                                        .returning('*');

                                    catalogUpdatesResult.push(result);
                                    return result;
                                }
                            }

                            let fieldToUpdate:
                                | CompiledDimension
                                | CompiledMetric
                                | CompiledTable;
                            const isTable = change.entityType === 'table';
                            const table =
                                cachedExploreTable.tables[
                                    change.entityTableName
                                ];
                            if (!table) {
                                return null;
                            }

                            switch (change.entityType) {
                                case 'table': {
                                    fieldToUpdate = table;
                                    break;
                                }
                                case 'dimension': {
                                    fieldToUpdate =
                                        table.dimensions[change.entityName];
                                    break;
                                }
                                case 'metric': {
                                    fieldToUpdate =
                                        table.metrics[change.entityName];
                                    break;
                                }
                                default:
                                    return assertUnreachable(
                                        change.entityType,
                                        `Unknown entity type ${change.entityType}`,
                                    );
                            }

                            const [result] = await trx(CatalogTableName)
                                .where('table_name', change.entityTableName)
                                .andWhere('project_uuid', projectUuid)
                                .andWhere('name', change.entityName)
                                .andWhere(
                                    'type',
                                    isTable
                                        ? CatalogType.Table
                                        : CatalogType.Field,
                                )
                                .update({
                                    label: fieldToUpdate.label ?? null,
                                    description:
                                        fieldToUpdate.description ?? null,
                                    ai_hints:
                                        convertToAiHints(
                                            fieldToUpdate.aiHint,
                                        ) ?? null,
                                })
                                .returning('*');

                            catalogUpdatesResult.push(result);
                            return result;
                        },
                    );

                    await Promise.all(updatePromises);

                    return catalogUpdatesResult;
                }),
        );

        return {
            catalogUpdates,
        };
    }

    async indexCatalogReverts({
        projectUuid,
        revertedChanges,
        originalChangeset,
        originalExplores,
    }: {
        projectUuid: string;
        revertedChanges: ChangesetWithChanges['changes'];
        originalChangeset: ChangesetWithChanges;
        originalExplores: Record<string, Explore | ExploreError>;
    }): Promise<{
        catalogUpdates: DbCatalog[];
    }> {
        return wrapSentryTransaction(
            'indexCatalog.indexCatalogReverts',
            {
                projectUuid,
                revertedChangesCount: revertedChanges.length,
                originalChangesetLength: originalChangeset.changes.length,
            },
            async () => {
                // map of changeUuid -> state BEFORE that change
                const stateMap = new Map<
                    string,
                    Record<string, Explore | ExploreError>
                >();
                let currentState = originalExplores;

                for (const change of originalChangeset.changes) {
                    stateMap.set(change.changeUuid, currentState);

                    currentState = ChangesetUtils.applyChangeset(
                        {
                            ...originalChangeset,
                            changes: [change],
                        },
                        structuredClone(currentState),
                    );
                }

                return this.database.transaction(async (trx) => {
                    const catalogUpdatesResult: DbCatalog[] = [];

                    // un-apply each reverted change in the reverse order, using previous state for values
                    const sortedRevertedChanges = [...revertedChanges].sort(
                        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
                    );

                    for (const revertedChange of sortedRevertedChanges) {
                        const preChangeState = stateMap.get(
                            revertedChange.changeUuid,
                        );

                        if (!preChangeState) {
                            Logger.warn(
                                `Could not find pre-change state for ${revertedChange.changeUuid}`,
                            );
                            // eslint-disable-next-line no-continue
                            continue;
                        }
                        const explore =
                            preChangeState[revertedChange.entityTableName];

                        if (!explore || isExploreError(explore)) {
                            Logger.warn(
                                `Explore ${revertedChange.entityTableName} not found in pre-change state`,
                            );
                            // eslint-disable-next-line no-continue
                            continue;
                        }

                        const table =
                            explore.tables[revertedChange.entityTableName];

                        if (!table) {
                            Logger.warn(
                                `Table ${revertedChange.entityTableName} not found in pre-change state`,
                            );
                            // eslint-disable-next-line no-continue
                            continue;
                        }

                        switch (revertedChange.type) {
                            case 'create': {
                                // eslint-disable-next-line no-await-in-loop
                                await trx(CatalogTableName)
                                    .where(
                                        'table_name',
                                        revertedChange.entityTableName,
                                    )
                                    .andWhere('project_uuid', projectUuid)
                                    .andWhere('name', revertedChange.entityName)
                                    .andWhere('type', CatalogType.Field)
                                    .delete();
                                break;
                            }

                            case 'update': {
                                let fieldToRestore:
                                    | CompiledDimension
                                    | CompiledMetric
                                    | CompiledTable;

                                switch (revertedChange.entityType) {
                                    case 'table':
                                        fieldToRestore = table;
                                        break;
                                    case 'dimension':
                                        fieldToRestore =
                                            table.dimensions[
                                                revertedChange.entityName
                                            ];
                                        break;
                                    case 'metric':
                                        fieldToRestore =
                                            table.metrics[
                                                revertedChange.entityName
                                            ];
                                        break;
                                    default:
                                        return assertUnreachable(
                                            revertedChange.entityType,
                                            `Unknown entity type`,
                                        );
                                }

                                if (!fieldToRestore) {
                                    Logger.warn(
                                        `Field ${revertedChange.entityName} not found in pre-change state`,
                                    );
                                    break;
                                }

                                const isTable =
                                    revertedChange.entityType === 'table';

                                // eslint-disable-next-line no-await-in-loop
                                const [result] = await trx(CatalogTableName)
                                    .where(
                                        'table_name',
                                        revertedChange.entityTableName,
                                    )
                                    .andWhere('project_uuid', projectUuid)
                                    .andWhere('name', revertedChange.entityName)
                                    .andWhere(
                                        'type',
                                        isTable
                                            ? CatalogType.Table
                                            : CatalogType.Field,
                                    )
                                    .update({
                                        label: fieldToRestore.label ?? null,
                                        description:
                                            fieldToRestore.description ?? null,
                                        ai_hints:
                                            convertToAiHints(
                                                fieldToRestore.aiHint,
                                            ) ?? null,
                                    })
                                    .returning('*');

                                if (result) {
                                    catalogUpdatesResult.push(result);
                                }

                                break;
                            }

                            case 'delete': {
                                // TODO: Implement when delete operations are fully supported
                                Logger.warn(
                                    `Delete revert not yet implemented for ${revertedChange.changeUuid}`,
                                );
                                break;
                            }

                            default:
                                assertUnreachable(
                                    revertedChange,
                                    'Invalid change type',
                                );
                        }
                    }

                    return {
                        catalogUpdates: catalogUpdatesResult,
                    };
                });
            },
        );
    }

    private async getTagsPerItem(catalogSearchUuids: string[]) {
        const itemTags = await this.database(CatalogTagsTableName)
            .select()
            .leftJoin(
                TagsTableName,
                `${CatalogTagsTableName}.tag_uuid`,
                `${TagsTableName}.tag_uuid`,
            )
            .whereIn(
                `${CatalogTagsTableName}.catalog_search_uuid`,
                catalogSearchUuids,
            );

        return itemTags.reduce<
            Record<
                string,
                Pick<Tag, 'tagUuid' | 'name' | 'color' | 'yamlReference'>[]
            >
        >((acc, tag) => {
            acc[tag.catalog_search_uuid] = [
                ...(acc[tag.catalog_search_uuid] || []),
                {
                    tagUuid: tag.tag_uuid,
                    name: tag.name,
                    color: tag.color,
                    yamlReference: tag.yaml_reference,
                },
            ];
            return acc;
        }, {});
    }

    async search({
        projectUuid,
        exploreName,
        catalogSearch: {
            catalogTags,
            catalogTagsFilterMode,
            filter,
            searchQuery = '',
            type,
            tables,
            ownerUserUuids,
        },
        excludeUnmatched = true,
        tablesConfiguration,
        userAttributes,
        paginateArgs,
        sortArgs,
        context,
        fullTextSearchOperator = 'AND',
        filteredExplores,
        changeset,
    }: {
        projectUuid: string;
        exploreName?: string;
        catalogSearch: ApiCatalogSearch;
        excludeUnmatched?: boolean;
        tablesConfiguration: TablesConfiguration;
        userAttributes: UserAttributeValueMap;
        paginateArgs?: KnexPaginateArgs;
        sortArgs?: ApiSort;
        context: CatalogSearchContext;
        fullTextSearchOperator?: 'OR' | 'AND';
        filteredExplores?: Explore[];
        changeset?: ChangesetWithChanges;
    }): Promise<KnexPaginatedData<CatalogItem[]>> {
        // Use websearch_to_tsquery for AI Agent queries for better natural language support
        const useWebSearch =
            context === CatalogSearchContext.AI_AGENT ||
            context === CatalogSearchContext.MCP;

        let catalogItemsQuery = this.database(CatalogTableName)
            .column(
                `${CatalogTableName}.catalog_search_uuid`,
                `${CatalogTableName}.name`,
                `${CatalogTableName}.label`,
                'description',
                'type',
                `${CachedExploreTableName}.explore`,
                `required_attributes`,
                `chart_usage`,
                `${CatalogTableName}.joined_tables`,
                `${CatalogTableName}.table_name`,
                `icon`,
                `${CatalogTableName}.owner_user_uuid`,
                `owner_user.first_name as owner_first_name`,
                `owner_user.last_name as owner_last_name`,
                `owner_email.email as owner_email`,
                {
                    search_rank: useWebSearch
                        ? getWebSearchRankCalcSql({
                              database: this.database,
                              variables: {
                                  searchVectorColumn: `${CatalogTableName}.search_vector`,
                                  searchQuery,
                              },
                          })
                        : getFullTextSearchRankCalcSql({
                              database: this.database,
                              variables: {
                                  searchVectorColumn: `${CatalogTableName}.search_vector`,
                                  searchQuery,
                              },
                              fullTextSearchOperator,
                          }),
                },
            )
            .leftJoin(
                CachedExploreTableName,
                `${CatalogTableName}.cached_explore_uuid`,
                `${CachedExploreTableName}.cached_explore_uuid`,
            )
            .leftJoin(
                `${UserTableName} as owner_user`,
                `${CatalogTableName}.owner_user_uuid`,
                'owner_user.user_uuid',
            )
            .leftJoin(
                `${EmailTableName} as owner_email`,
                function ownerEmailJoin() {
                    void this.on(
                        'owner_user.user_id',
                        '=',
                        'owner_email.user_id',
                    ).andOnVal('owner_email.is_primary', '=', true);
                },
            )
            .where(`${CatalogTableName}.project_uuid`, projectUuid)
            // tables configuration filtering
            .andWhere(function tablesConfigurationFiltering() {
                const {
                    tableSelection: { type: tableSelectionType, value },
                } = tablesConfiguration;

                if (tableSelectionType === TableSelectionType.WITH_TAGS) {
                    // For tags, we need to check if ANY of the required tags exist in explore's tags array
                    void this.whereRaw(
                        `
                        EXISTS (
                            SELECT 1
                            FROM jsonb_array_elements_text(?) AS required_tag
                            WHERE required_tag = ANY(
                                SELECT jsonb_array_elements_text(explore->'tags')
                            )
                        )
                    `,
                        [JSON.stringify(value ?? [])],
                    );
                } else if (
                    tableSelectionType === TableSelectionType.WITH_NAMES
                ) {
                    // For table names, we check if the baseTable matches any of the required names
                    void this.whereIn(
                        `${CatalogTableName}.table_name`,
                        value ?? [],
                    );
                }
            })
            // user attributes filtering
            .andWhere(function userAttributesFiltering() {
                void this.whereJsonObject('required_attributes', {}).orWhereRaw(
                    `
                        -- Main check: Ensure there are NO required attributes that fail to match user attributes
                        -- If ANY required attribute is missing/mismatched, the whole check fails
                        NOT EXISTS (
                            -- Iterate through each key-value pair in required_attributes
                            -- Example required_attributes: {"is_admin": "true", "department": ["sales", "marketing"]}
                            SELECT 1
                            FROM jsonb_each(required_attributes) AS ra(key, value)
                            -- For each required attribute, check if it DOESN'T match user attributes
                            -- The outer NOT EXISTS + WHERE NOT means ALL conditions must match
                            WHERE NOT (
                                CASE
                                    -- Case 1: Required attribute is an array (e.g., "department": ["sales", "marketing"])
                                    WHEN jsonb_typeof(value) = 'array' THEN
                                        -- Check if ANY of the required values exist in user's attributes
                                        EXISTS (
                                            -- Get each value from the required array
                                            SELECT 1
                                            FROM jsonb_array_elements_text(value) AS req_value
                                            -- Check if this required value exists in user's attributes array
                                            WHERE req_value = ANY(
                                                SELECT jsonb_array_elements_text(?::jsonb -> key)
                                            )
                                        )

                                    -- Case 2: Required attribute is a single value (e.g., "is_admin": "true")
                                    ELSE
                                        -- Extract the single value and check if it exists in user's attributes array
                                        -- value #>> '{}' converts JSONB value to text
                                        -- Example: "true" = ANY(["true", "false"])
                                        (value #>> '{}') = ANY(
                                            SELECT jsonb_array_elements_text(?::jsonb -> key)
                                        )
                                END
                            )
                        )
                    `,
                    [
                        JSON.stringify(userAttributes),
                        JSON.stringify(userAttributes),
                    ],
                );
            });

        if (context === CatalogSearchContext.SPOTLIGHT) {
            catalogItemsQuery = catalogItemsQuery.where(
                `${CatalogTableName}.spotlight_show`,
                true,
            );
        }

        if (exploreName) {
            catalogItemsQuery = catalogItemsQuery.andWhere(
                `${CachedExploreTableName}.name`,
                exploreName,
            );
        }

        if (type) {
            catalogItemsQuery = catalogItemsQuery.andWhere(
                `${CatalogTableName}.type`,
                type,
            );
        }

        if (filter) {
            if (filter === CatalogFilter.Dimensions) {
                catalogItemsQuery = catalogItemsQuery.andWhere(
                    `${CatalogTableName}.field_type`,
                    FieldType.DIMENSION,
                );
            }
            if (filter === CatalogFilter.Metrics) {
                catalogItemsQuery = catalogItemsQuery.andWhere(
                    `${CatalogTableName}.field_type`,
                    FieldType.METRIC,
                );
            }
        }

        if (catalogTags) {
            const useAndMode =
                catalogTagsFilterMode === CatalogCategoryFilterMode.AND;
            const regularTags = catalogTags.filter(
                (tag) => tag !== UNCATEGORIZED_TAG_UUID,
            );
            const includeUncategorized = catalogTags.includes(
                UNCATEGORIZED_TAG_UUID,
            );

            // Subquery: items with no tags
            const uncategorizedSubquery = this.database(CatalogTagsTableName)
                .select('catalog_search_uuid')
                .whereRaw(
                    `${CatalogTagsTableName}.catalog_search_uuid = ${CatalogTableName}.catalog_search_uuid`,
                );

            // Subquery: items matching regular tags (AND: all tags, OR: any tag)
            const matchingTagsSubquery =
                regularTags.length > 0
                    ? this.database(CatalogTagsTableName)
                          .select('catalog_search_uuid')
                          .whereIn('tag_uuid', regularTags)
                          .whereRaw(
                              `${CatalogTagsTableName}.catalog_search_uuid = ${CatalogTableName}.catalog_search_uuid`,
                          )
                          .groupBy('catalog_search_uuid')
                          .modify((qb) => {
                              if (useAndMode) {
                                  void qb.havingRaw(
                                      'COUNT(DISTINCT tag_uuid) = ?',
                                      [regularTags.length],
                                  );
                              }
                          })
                    : null;

            catalogItemsQuery = catalogItemsQuery.andWhere(
                function catalogItemsQueryFn() {
                    if (regularTags.length > 0 && includeUncategorized) {
                        // Items with no tags OR matching tags
                        void this.whereNotExists(
                            uncategorizedSubquery,
                        ).orWhereExists(matchingTagsSubquery!);
                    } else if (includeUncategorized) {
                        // Only items with no tags
                        void this.whereNotExists(uncategorizedSubquery);
                    } else if (matchingTagsSubquery) {
                        // Only items with matching tags
                        void this.whereExists(matchingTagsSubquery);
                    }
                },
            );
        }

        // Filter by table names
        if (tables && tables.length > 0) {
            catalogItemsQuery = catalogItemsQuery.andWhere(
                `${CatalogTableName}.table_name`,
                'in',
                tables,
            );
        }

        // Filter by owner user uuids
        if (ownerUserUuids && ownerUserUuids.length > 0) {
            const hasUnassigned = ownerUserUuids.includes(UNASSIGNED_OWNER);
            const actualUserUuids = ownerUserUuids.filter(
                (o) => o !== UNASSIGNED_OWNER,
            );

            catalogItemsQuery = catalogItemsQuery.andWhere(
                function ownerFiltering() {
                    if (hasUnassigned && actualUserUuids.length > 0) {
                        // Show unassigned OR specific owners
                        void this.whereNull(
                            `${CatalogTableName}.owner_user_uuid`,
                        ).orWhereIn(
                            `${CatalogTableName}.owner_user_uuid`,
                            actualUserUuids,
                        );
                    } else if (hasUnassigned) {
                        // Only unassigned
                        void this.whereNull(
                            `${CatalogTableName}.owner_user_uuid`,
                        );
                    } else {
                        // Only specific owners
                        void this.whereIn(
                            `${CatalogTableName}.owner_user_uuid`,
                            actualUserUuids,
                        );
                    }
                },
            );
        }

        // Filter by filteredExplores (AI agent explore tag filtering)
        if (filteredExplores) {
            if (type === CatalogType.Table) {
                // Filter tables by allowed explore names
                const allowedExploreNames = filteredExplores.map((e) => e.name);
                if (allowedExploreNames.length > 0) {
                    catalogItemsQuery = catalogItemsQuery.andWhere(
                        function allowedExploreNamesFiltering() {
                            void this.whereIn(
                                `${CatalogTableName}.name`,
                                allowedExploreNames,
                            );
                        },
                    );
                } else {
                    // No explores allowed, return no results
                    catalogItemsQuery = catalogItemsQuery.andWhereRaw('false');
                }
            } else if (type === CatalogType.Field) {
                // Filter fields by allowed (tableName, fieldName) tuples from ALL tables in filtered explores
                // This includes fields from joined tables, which may be indexed under different cached_explore_uuids
                const allowedFields = await wrapSentryTransaction(
                    'CatalogModel.search.allowedFields',
                    {
                        filteredExplores: filteredExplores.map(
                            (explore) => explore.name,
                        ),
                    },
                    async () =>
                        filteredExplores.flatMap((explore) =>
                            Object.entries(explore.tables).flatMap(
                                ([tableName, table]) => {
                                    const dims = Object.keys(table.dimensions);
                                    const mets = Object.keys(table.metrics);

                                    return [
                                        ...dims.map(
                                            (dimName): [string, string] => [
                                                tableName,
                                                dimName,
                                            ],
                                        ),
                                        ...mets.map(
                                            (metricName): [string, string] => [
                                                tableName,
                                                metricName,
                                            ],
                                        ),
                                    ];
                                },
                            ),
                        ),
                );

                catalogItemsQuery = catalogItemsQuery.andWhere(
                    function allowedFieldsFiltering() {
                        if (allowedFields.length > 0) {
                            // Use unnest with two arrays to avoid creating thousands of bind parameters
                            // This is much more efficient than VALUES (?, ?), (?, ?), ...
                            const tableNames = allowedFields.map(([t]) => t);
                            const fieldNames = allowedFields.map(([, n]) => n);

                            void this.whereRaw(
                                `(${CatalogTableName}.table_name, ${CatalogTableName}.name) IN (
                                    SELECT * FROM unnest(?::text[], ?::text[]) AS t(table_name, field_name)
                                )`,
                                [tableNames, fieldNames],
                            );
                        } else {
                            // No fields allowed, return no results
                            void this.whereRaw('false');
                        }
                    },
                );
            }
        }

        if (excludeUnmatched && searchQuery) {
            if (useWebSearch) {
                const webSearchQuery = searchQuery
                    .split(' ')
                    .filter((word) => word.trim())
                    .join(' OR ');
                catalogItemsQuery = catalogItemsQuery.andWhereRaw(
                    `"${CatalogTableName}".search_vector @@ websearch_to_tsquery('lightdash_english_config', ?)`,
                    webSearchQuery,
                );
            } else {
                const formattedQuery = getFullTextSearchQuery(
                    searchQuery,
                    fullTextSearchOperator,
                );
                catalogItemsQuery = catalogItemsQuery.andWhereRaw(
                    `"${CatalogTableName}".search_vector @@ to_tsquery('lightdash_english_config', ?)`,
                    formattedQuery,
                );
            }
        }

        catalogItemsQuery = catalogItemsQuery.orderBy('search_rank', 'desc');

        if (sortArgs) {
            const { sort, order } = sortArgs;
            catalogItemsQuery = catalogItemsQuery.orderBy(
                getDbCatalogColumnFromCatalogProperty(
                    sort as keyof CatalogItem, // Can be cast here since we have an exhaustive switch/case in getDbCatalogColumnFromCatalogProperty
                ),
                order,
            );
        }

        const paginatedCatalogItems = await KnexPaginate.paginate(
            catalogItemsQuery.select<
                (DbCatalog & { explore: Explore; search_rank: number })[]
            >(),
            {
                page: paginateArgs?.page ?? 1,
                pageSize: paginateArgs?.pageSize ?? 50,
            },
        );

        const tagsPerItem = await this.getTagsPerItem(
            paginatedCatalogItems.data.map((item) => item.catalog_search_uuid),
        );

        // When using filteredExplores, we need to match each catalog item to the correct explore.
        // We key by explore name (not table name) because the same table can appear in multiple
        // explores as a joined table with different fields exposed.
        const exploreByName: Map<string, Explore> | undefined = filteredExplores
            ? new Map(
                  filteredExplores.map((explore) => [explore.name, explore]),
              )
            : undefined;

        const catalog = await wrapSentryTransaction(
            'CatalogModel.search.parse',
            {
                catalogSize: paginatedCatalogItems.data.length,
            },
            async () =>
                paginatedCatalogItems.data
                    .map((item) => {
                        // Use the explore from filteredExplores if available, otherwise use from DB.
                        // We match by explore name (from item.explore) since each catalog entry
                        // is indexed under a specific explore via cached_explore_uuid.
                        let explore = exploreByName
                            ? exploreByName.get(item.explore.name)
                            : undefined;

                        if (!explore) {
                            explore = item.explore;
                        }

                        if (!explore) {
                            throw new Error(
                                `Explore not found for field ${item.name} in table ${item.table_name}`,
                            );
                        }

                        if (changeset) {
                            const exploreWithChanges =
                                ChangesetUtils.applyChangeset(changeset, {
                                    // we need to clone the explore to avoid mutating the original explore object
                                    [explore.name]: structuredClone(explore),
                                })[explore.name] as Explore; // at this point we know the explore is valid
                            explore = exploreWithChanges;
                        }
                        return parseCatalog({
                            ...item,
                            explore,
                            catalog_tags:
                                tagsPerItem[item.catalog_search_uuid] ?? [],
                        });
                    })
                    // Filter out null results from stale catalog entries
                    // (fields/tables that exist in catalog but were removed from the explore)
                    .filter((item): item is CatalogItem => item !== null),
        );

        return {
            pagination: paginatedCatalogItems.pagination,
            data: catalog,
        };
    }

    async getMetadata(projectUuid: string, name: string): Promise<Explore> {
        const explores = await this.database(CachedExploreTableName)
            .andWhere(`project_uuid`, projectUuid)
            .where(`name`, name);

        if (explores.length === 0) {
            throw new NotFoundError(`Explore with name ${name} not found`);
        } else if (explores.length > 1) {
            throw new UnexpectedServerError(
                `Multiple explores with name ${name} found`,
            );
        }

        return explores[0].explore;
    }

    async setChartUsages(projectUuid: string, chartUsages: ChartUsageIn[]) {
        await this.database.transaction(async (trx) => {
            const updatePromises = chartUsages.map(
                ({ fieldName, chartUsage, cachedExploreUuid }) =>
                    trx(CatalogTableName)
                        .where(`${CatalogTableName}.name`, fieldName)
                        .andWhere(
                            `${CatalogTableName}.cached_explore_uuid`,
                            cachedExploreUuid,
                        )
                        .andWhere(
                            `${CatalogTableName}.project_uuid`,
                            projectUuid,
                        )
                        .update({
                            chart_usage: chartUsage,
                        }),
            );

            await Promise.all(updatePromises);
        });
    }

    async updateFieldsChartUsage(
        projectUuid: string,
        { fieldsToIncrement, fieldsToDecrement }: ChartFieldUsageChanges,
    ) {
        return this.database.transaction(async (trx) => {
            const transactions: Knex.QueryBuilder[] = [];

            // Increment
            if (fieldsToIncrement.length > 0) {
                transactions.push(
                    trx(CatalogTableName)
                        .where((builder) => {
                            fieldsToIncrement.forEach(
                                ({
                                    cachedExploreUuid,
                                    fieldName,
                                    fieldType,
                                }) => {
                                    void builder.orWhere((orBuilder) =>
                                        orBuilder
                                            .where(
                                                `${CatalogTableName}.cached_explore_uuid`,
                                                cachedExploreUuid,
                                            )
                                            .andWhere(
                                                `${CatalogTableName}.name`,
                                                fieldName,
                                            )
                                            .andWhere(
                                                `${CatalogTableName}.field_type`,
                                                fieldType,
                                            ),
                                    );
                                },
                            );
                        })
                        .andWhere(
                            `${CatalogTableName}.project_uuid`,
                            projectUuid,
                        )
                        .increment('chart_usage', 1),
                );
            }

            // Decrement
            if (fieldsToDecrement.length > 0) {
                transactions.push(
                    trx(CatalogTableName)
                        .where((builder) => {
                            fieldsToDecrement.forEach(
                                ({
                                    cachedExploreUuid,
                                    fieldName,
                                    fieldType,
                                }) => {
                                    void builder.orWhere((orBuilder) =>
                                        orBuilder
                                            .where(
                                                `${CatalogTableName}.cached_explore_uuid`,
                                                cachedExploreUuid,
                                            )
                                            .andWhere(
                                                `${CatalogTableName}.name`,
                                                fieldName,
                                            )
                                            .andWhere(
                                                `${CatalogTableName}.field_type`,
                                                fieldType,
                                            ),
                                    );
                                },
                            );
                        })
                        .andWhere(
                            `${CatalogTableName}.project_uuid`,
                            projectUuid,
                        )
                        .andWhere('chart_usage', '>', 0) // Ensure we don't decrement below 0
                        .decrement('chart_usage', 1),
                );
            }

            await Promise.all(transactions);
        });
    }

    async findTablesCachedExploreUuid(
        projectUuid: string,
        tableNames: string[],
    ) {
        return this.database.transaction(async (trx) => {
            const tableCachedExploreUuidsByTableName = await trx(
                CatalogTableName,
            )
                .where(`${CatalogTableName}.name`, 'in', tableNames)
                .andWhere(`${CatalogTableName}.type`, CatalogType.Table)
                .andWhere(`${CatalogTableName}.project_uuid`, projectUuid)
                .select('name', 'cached_explore_uuid');

            return tableCachedExploreUuidsByTableName.reduce<
                Record<string, string>
            >(
                (acc, table) => ({
                    ...acc,
                    [table.name]: table.cached_explore_uuid,
                }),
                {},
            );
        });
    }

    async getCatalogItem(catalogSearchUuid: string) {
        return this.database(CatalogTableName)
            .where(`${CatalogTableName}.catalog_search_uuid`, catalogSearchUuid)
            .first();
    }

    async getCatalogItemByName(
        projectUuid: string,
        metricName: string,
        tableName: string,
        type: CatalogType,
    ) {
        return this.database(CatalogTableName)
            .where(`${CatalogTableName}.name`, metricName)
            .andWhere(`${CatalogTableName}.table_name`, tableName)
            .andWhere(`${CatalogTableName}.type`, type)
            .andWhere(`${CatalogTableName}.project_uuid`, projectUuid)
            .first();
    }

    async tagCatalogItem(
        user: SessionUser,
        catalogSearchUuid: string,
        tagUuid: string,
        isFromYaml: boolean,
    ) {
        await this.database(CatalogTagsTableName).insert({
            catalog_search_uuid: catalogSearchUuid,
            tag_uuid: tagUuid,
            created_by_user_uuid: user.userUuid,
            is_from_yaml: isFromYaml,
        });
    }

    async untagCatalogItem(catalogSearchUuid: string, tagUuid: string) {
        await this.database(CatalogTagsTableName)
            .where({
                catalog_search_uuid: catalogSearchUuid,
                tag_uuid: tagUuid,
            })
            .delete();
    }

    async getCatalogItemsSummary(
        projectUuid: string,
    ): Promise<CatalogItemSummary[]> {
        const catalogItems = await this.database(CatalogTableName)
            .where(`${CatalogTableName}.project_uuid`, projectUuid)
            .select('*');

        return catalogItems.map<CatalogItemSummary>((i) => ({
            catalogSearchUuid: i.catalog_search_uuid,
            cachedExploreUuid: i.cached_explore_uuid,
            projectUuid: i.project_uuid,
            name: i.name,
            type: i.type,
            tableName: i.table_name,
            fieldType: i.field_type,
        }));
    }

    async getCatalogItemsWithTags(
        projectUuid: string,
        opts?: {
            onlyTagged?: boolean;
            includeYamlTags?: boolean;
        },
    ) {
        const { onlyTagged = false, includeYamlTags = false } = opts ?? {};

        let query = this.database(CatalogTableName)
            .column(
                `${CatalogTableName}.catalog_search_uuid`,
                `${CatalogTableName}.cached_explore_uuid`,
                `${CatalogTableName}.project_uuid`,
                `${CatalogTableName}.name`,
                `${CatalogTableName}.type`,
                `${CatalogTableName}.field_type`,
                `${CatalogTableName}.table_name`,
                {
                    catalog_tags: this.database.raw(`
                    COALESCE(
                        JSON_AGG(
                            DISTINCT JSONB_BUILD_OBJECT(
                                'tagUuid', ${CatalogTagsTableName}.tag_uuid,
                                'createdByUserUuid', ${CatalogTagsTableName}.created_by_user_uuid,
                                'createdAt', ${CatalogTagsTableName}.created_at,
                                'taggedViaYaml', ${CatalogTagsTableName}.is_from_yaml
                            )
                        ) FILTER (WHERE ${CatalogTagsTableName}.tag_uuid IS NOT NULL),
                        '[]'
                    )
                `),
                },
            )
            .leftJoin(
                CachedExploreTableName,
                `${CatalogTableName}.cached_explore_uuid`,
                `${CachedExploreTableName}.cached_explore_uuid`,
            );

        if (onlyTagged) {
            query = query.innerJoin(
                CatalogTagsTableName,
                `${CatalogTableName}.catalog_search_uuid`,
                `${CatalogTagsTableName}.catalog_search_uuid`,
            );
        } else {
            query = query.leftJoin(
                CatalogTagsTableName,
                `${CatalogTableName}.catalog_search_uuid`,
                `${CatalogTagsTableName}.catalog_search_uuid`,
            );
        }

        if (!includeYamlTags) {
            query = query.where(`${CatalogTagsTableName}.is_from_yaml`, false);
        }

        query = query
            .where(`${CatalogTableName}.project_uuid`, projectUuid)
            .groupBy(
                `${CatalogTableName}.catalog_search_uuid`,
                `${CatalogTableName}.cached_explore_uuid`,
                `${CatalogTableName}.project_uuid`,
                `${CatalogTableName}.name`,
                `${CatalogTableName}.type`,
                `${CatalogTableName}.field_type`,
                `${CatalogTableName}.table_name`,
            );

        const itemsWithTags: (DbCatalog & {
            catalog_tags: {
                tagUuid: string;
                createdByUserUuid: string | null;
                createdAt: Date;
                taggedViaYaml: boolean;
            }[];
        })[] = await query;

        return itemsWithTags.map<CatalogItemWithTagUuids>((i) => ({
            catalogSearchUuid: i.catalog_search_uuid,
            cachedExploreUuid: i.cached_explore_uuid,
            projectUuid: i.project_uuid,
            name: i.name,
            type: i.type,
            fieldType: i.field_type,
            tableName: i.table_name,
            catalogTags: i.catalog_tags,
        }));
    }

    async migrateCatalogItemTags(
        catalogTagsMigrateIn: DbCatalogTagsMigrateIn[],
    ) {
        return this.database.batchInsert(
            CatalogTagsTableName,
            catalogTagsMigrateIn,
        );
    }

    async getCatalogItemsWithIcons(projectUuid: string) {
        let query = this.database(CatalogTableName)
            .column(
                `${CatalogTableName}.catalog_search_uuid`,
                `${CatalogTableName}.cached_explore_uuid`,
                `${CatalogTableName}.project_uuid`,
                `${CatalogTableName}.name`,
                `${CatalogTableName}.type`,
                `${CatalogTableName}.field_type`,
                `${CatalogTableName}.icon`,
                `${CatalogTableName}.table_name`,
            )
            .leftJoin(
                CachedExploreTableName,
                `${CatalogTableName}.cached_explore_uuid`,
                `${CachedExploreTableName}.cached_explore_uuid`,
            );

        query = query
            .where(`${CatalogTableName}.project_uuid`, projectUuid)
            .whereNotNull(`${CatalogTableName}.icon`)
            .groupBy(
                `${CatalogTableName}.catalog_search_uuid`,
                `${CatalogTableName}.cached_explore_uuid`,
                `${CatalogTableName}.project_uuid`,
                `${CatalogTableName}.name`,
                `${CatalogTableName}.type`,
                `${CatalogTableName}.field_type`,
                `${CatalogTableName}.table_name`,
            );

        const itemsWithIcons: DbCatalog[] = await query;

        return itemsWithIcons.map<CatalogItemsWithIcons>((i) => ({
            catalogSearchUuid: i.catalog_search_uuid,
            cachedExploreUuid: i.cached_explore_uuid,
            projectUuid: i.project_uuid,
            name: i.name,
            type: i.type,
            fieldType: i.field_type,
            tableName: i.table_name,
            icon: i.icon,
        }));
    }

    async updateCatalogItemIcon(
        updates: Array<{
            catalogSearchUuid: string;
            icon: CatalogItemIcon | null;
        }>,
    ): Promise<void> {
        if (updates.length === 0) return;

        await this.database.transaction(async (trx) => {
            const updatePromises = updates.map(({ catalogSearchUuid, icon }) =>
                trx(CatalogTableName)
                    .where('catalog_search_uuid', catalogSearchUuid)
                    .update({ icon }),
            );

            await Promise.all(updatePromises);
        });
    }

    async getMetricsTree(
        projectUuid: string,
        metricUuids: string[],
    ): Promise<{ edges: CatalogMetricsTreeEdge[] }> {
        const edges = await this.database(MetricsTreeEdgesTableName)
            .select<
                (DbMetricsTreeEdge & {
                    source_metric_name: string;
                    source_metric_table_name: string;
                    target_metric_name: string;
                    target_metric_table_name: string;
                })[]
            >({
                source_metric_catalog_search_uuid: `${MetricsTreeEdgesTableName}.source_metric_catalog_search_uuid`,
                target_metric_catalog_search_uuid: `${MetricsTreeEdgesTableName}.target_metric_catalog_search_uuid`,
                created_at: `${MetricsTreeEdgesTableName}.created_at`,
                created_by_user_uuid: `${MetricsTreeEdgesTableName}.created_by_user_uuid`,
                source: `${MetricsTreeEdgesTableName}.source`,
                source_metric_name: `source_metric.name`,
                source_metric_table_name: `source_metric.table_name`,
                target_metric_name: `target_metric.name`,
                target_metric_table_name: `target_metric.table_name`,
            })
            .innerJoin(
                { source_metric: CatalogTableName },
                `${MetricsTreeEdgesTableName}.source_metric_catalog_search_uuid`,
                `source_metric.catalog_search_uuid`,
            )
            .innerJoin(
                { target_metric: CatalogTableName },
                `${MetricsTreeEdgesTableName}.target_metric_catalog_search_uuid`,
                `target_metric.catalog_search_uuid`,
            )
            .where(function sourceNodeWhere() {
                void this.whereIn(
                    'source_metric_catalog_search_uuid',
                    metricUuids,
                );
            })
            .andWhere(function targetNodeWhere() {
                void this.whereIn(
                    'target_metric_catalog_search_uuid',
                    metricUuids,
                );
            })
            .andWhere('source_metric.project_uuid', projectUuid)
            .andWhere('target_metric.project_uuid', projectUuid);

        return {
            edges: edges.map((e) => ({
                source: {
                    catalogSearchUuid: e.source_metric_catalog_search_uuid,
                    name: e.source_metric_name,
                    tableName: e.source_metric_table_name,
                },
                target: {
                    catalogSearchUuid: e.target_metric_catalog_search_uuid,
                    name: e.target_metric_name,
                    tableName: e.target_metric_table_name,
                },
                createdAt: e.created_at,
                createdByUserUuid: e.created_by_user_uuid,
                projectUuid,
                createdFrom: e.source,
            })),
        };
    }

    async getAllMetricsTreeEdges(
        projectUuid: string,
    ): Promise<CatalogMetricsTreeEdge[]> {
        const edges = await this.database(MetricsTreeEdgesTableName)
            .select<
                (DbMetricsTreeEdge & {
                    source_metric_name: string;
                    source_metric_table_name: string;
                    target_metric_name: string;
                    target_metric_table_name: string;
                })[]
            >({
                source_metric_catalog_search_uuid: `${MetricsTreeEdgesTableName}.source_metric_catalog_search_uuid`,
                target_metric_catalog_search_uuid: `${MetricsTreeEdgesTableName}.target_metric_catalog_search_uuid`,
                project_uuid: `${MetricsTreeEdgesTableName}.project_uuid`,
                created_at: `${MetricsTreeEdgesTableName}.created_at`,
                created_by_user_uuid: `${MetricsTreeEdgesTableName}.created_by_user_uuid`,
                source: `${MetricsTreeEdgesTableName}.source`,
                source_metric_name: `source_metric.name`,
                source_metric_table_name: `source_metric.table_name`,
                target_metric_name: `target_metric.name`,
                target_metric_table_name: `target_metric.table_name`,
            })
            .where(`${MetricsTreeEdgesTableName}.project_uuid`, projectUuid)
            .innerJoin(
                { source_metric: CatalogTableName },
                `${MetricsTreeEdgesTableName}.source_metric_catalog_search_uuid`,
                `source_metric.catalog_search_uuid`,
            )
            .innerJoin(
                { target_metric: CatalogTableName },
                `${MetricsTreeEdgesTableName}.target_metric_catalog_search_uuid`,
                `target_metric.catalog_search_uuid`,
            );

        return edges.map((e) => ({
            source: {
                catalogSearchUuid: e.source_metric_catalog_search_uuid,
                name: e.source_metric_name,
                tableName: e.source_metric_table_name,
            },
            target: {
                catalogSearchUuid: e.target_metric_catalog_search_uuid,
                name: e.target_metric_name,
                tableName: e.target_metric_table_name,
            },
            createdAt: e.created_at,
            createdByUserUuid: e.created_by_user_uuid,
            projectUuid: e.project_uuid,
            createdFrom: e.source,
        }));
    }

    // Omiting the project_uuid from the input so the model decides whether to include it or not
    async createMetricsTreeEdge(metricsTreeEdge: DbMetricsTreeEdgeIn) {
        return this.database(MetricsTreeEdgesTableName).insert(metricsTreeEdge);
    }

    async deleteMetricsTreeEdge(metricsTreeEdge: DbMetricsTreeEdgeDelete) {
        return this.database(MetricsTreeEdgesTableName)
            .where(metricsTreeEdge)
            .delete();
    }

    // Omiting the project_uuid from the input so the model decides whether to include it or not
    async migrateMetricsTreeEdges(
        metricTreeEdgesMigrateIn: DbMetricsTreeEdgeIn[],
    ): Promise<void> {
        if (metricTreeEdgesMigrateIn.length === 0) {
            return;
        }
        // Use onConflict().ignore() since YAML edges should take precedence
        // If an edge already exists (e.g., from YAML), skip the migrated UI edge
        await this.database(MetricsTreeEdgesTableName)
            .insert(metricTreeEdgesMigrateIn)
            .onConflict([
                'source_metric_catalog_search_uuid',
                'target_metric_catalog_search_uuid',
            ])
            .ignore();
    }

    private getHydratedNodesQuery(
        filter: { projectUuid: string } | { metricsTreeUuid: string },
    ) {
        const query = this.database(MetricsTreeNodesTableName)
            .select<
                {
                    metrics_tree_uuid: string;
                    catalog_search_uuid: string;
                    name: string;
                    table_name: string;
                    x_position: number | null;
                    y_position: number | null;
                    source: 'yaml' | 'ui';
                    created_at: Date;
                }[]
            >({
                metrics_tree_uuid: `${MetricsTreeNodesTableName}.metrics_tree_uuid`,
                catalog_search_uuid: `${MetricsTreeNodesTableName}.catalog_search_uuid`,
                name: `${CatalogTableName}.name`,
                table_name: `${CatalogTableName}.table_name`,
                x_position: `${MetricsTreeNodesTableName}.x_position`,
                y_position: `${MetricsTreeNodesTableName}.y_position`,
                source: `${MetricsTreeNodesTableName}.source`,
                created_at: `${MetricsTreeNodesTableName}.created_at`,
            })
            .innerJoin(
                CatalogTableName,
                `${MetricsTreeNodesTableName}.catalog_search_uuid`,
                `${CatalogTableName}.catalog_search_uuid`,
            );

        if ('projectUuid' in filter) {
            return query
                .innerJoin(
                    MetricsTreesTableName,
                    `${MetricsTreeNodesTableName}.metrics_tree_uuid`,
                    `${MetricsTreesTableName}.metrics_tree_uuid`,
                )
                .where(
                    `${MetricsTreesTableName}.project_uuid`,
                    filter.projectUuid,
                );
        }

        return query.where(
            `${MetricsTreeNodesTableName}.metrics_tree_uuid`,
            filter.metricsTreeUuid,
        );
    }

    async getAllMetricsTreeNodes(
        projectUuid: string,
    ): Promise<PrevMetricsTreeNode[]> {
        const nodes = await this.getHydratedNodesQuery({ projectUuid });

        return nodes.map((n) => ({
            metricsTreeUuid: n.metrics_tree_uuid,
            name: n.name,
            tableName: n.table_name,
            xPosition: n.x_position,
            yPosition: n.y_position,
            source: n.source,
            createdAt: n.created_at,
        }));
    }

    async migrateMetricsTreeNodes(nodesMigrateIn: DbMetricsTreeNodeIn[]) {
        if (nodesMigrateIn.length === 0) {
            return;
        }
        await this.database(MetricsTreeNodesTableName)
            .insert(nodesMigrateIn)
            .onConflict(['metrics_tree_uuid', 'catalog_search_uuid'])
            .ignore();
    }

    async hasMetricsInCatalog(projectUuid: string): Promise<boolean> {
        const result = await this.database(CatalogTableName)
            .where({
                project_uuid: projectUuid,
                type: CatalogType.Field,
                field_type: FieldType.METRIC,
            })
            .first();

        return result !== undefined;
    }

    // --- Saved Metrics Trees ---

    /** Locks with heartbeat older than this are considered expired */
    private static readonly LOCK_EXPIRY_MINUTES = 2;

    private getLockExpiryCondition() {
        return this.database.raw(
            `${MetricsTreeLocksTableName}.last_heartbeat_at > NOW() - INTERVAL '${CatalogModel.LOCK_EXPIRY_MINUTES} minutes'`,
        );
    }

    async getMetricsTrees(
        projectUuid: string,
        paginateArgs?: KnexPaginateArgs,
    ): Promise<KnexPaginatedData<MetricsTreeSummary[]>> {
        const lockExpiryCondition = this.getLockExpiryCondition();

        const query = this.database(MetricsTreesTableName)
            .select(
                `${MetricsTreesTableName}.*`,
                this.database.raw(
                    `COALESCE(COUNT(DISTINCT ${MetricsTreeNodesTableName}.catalog_search_uuid), 0)::int as node_count`,
                ),
                `${MetricsTreeLocksTableName}.locked_by_user_uuid as lock_user_uuid`,
                `lock_users.first_name as lock_user_first_name`,
                `lock_users.last_name as lock_user_last_name`,
                `${MetricsTreeLocksTableName}.acquired_at as lock_acquired_at`,
            )
            .leftJoin(
                MetricsTreeNodesTableName,
                `${MetricsTreesTableName}.metrics_tree_uuid`,
                `${MetricsTreeNodesTableName}.metrics_tree_uuid`,
            )
            .leftJoin(MetricsTreeLocksTableName, function lockJoin() {
                void this.on(
                    `${MetricsTreesTableName}.metrics_tree_uuid`,
                    '=',
                    `${MetricsTreeLocksTableName}.metrics_tree_uuid`,
                ).andOn(lockExpiryCondition);
            })
            .leftJoin(
                `${UserTableName} as lock_users`,
                `${MetricsTreeLocksTableName}.locked_by_user_uuid`,
                `lock_users.user_uuid`,
            )
            .where(`${MetricsTreesTableName}.project_uuid`, projectUuid)
            .groupBy(
                `${MetricsTreesTableName}.metrics_tree_uuid`,
                `${MetricsTreeLocksTableName}.locked_by_user_uuid`,
                `lock_users.first_name`,
                `lock_users.last_name`,
                `${MetricsTreeLocksTableName}.acquired_at`,
                `${MetricsTreeLocksTableName}.last_heartbeat_at`,
            )
            .orderBy(`${MetricsTreesTableName}.updated_at`, 'desc');

        const result = await KnexPaginate.paginate(
            query.select<(DbMetricsTreeWithLock & { node_count: number })[]>(),
            paginateArgs,
        );

        return {
            data: result.data.map((row) => ({
                metricsTreeUuid: row.metrics_tree_uuid,
                projectUuid: row.project_uuid,
                slug: row.slug,
                name: row.name,
                description: row.description,
                source: row.source,
                createdByUserUuid: row.created_by_user_uuid,
                updatedByUserUuid: row.updated_by_user_uuid,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                generation: row.generation,
                nodeCount: row.node_count,
                lock: parseLockInfo(row),
            })),
            pagination: result.pagination,
        };
    }

    async createMetricsTree(
        tree: DbMetricsTreeIn,
        nodes: Array<{
            catalogSearchUuid: string;
            xPosition?: number;
            yPosition?: number;
        }>,
        edges: Array<{
            sourceCatalogSearchUuid: string;
            targetCatalogSearchUuid: string;
        }>,
    ): Promise<MetricsTree> {
        return this.database.transaction(async (trx) => {
            const [created] = await trx(MetricsTreesTableName)
                .insert(tree)
                .returning('*');

            if (nodes.length > 0) {
                const dbNodes: DbMetricsTreeNodeIn[] = nodes.map((node) => ({
                    metrics_tree_uuid: created.metrics_tree_uuid,
                    catalog_search_uuid: node.catalogSearchUuid,
                    x_position: node.xPosition ?? null,
                    y_position: node.yPosition ?? null,
                    source: tree.source,
                }));
                await trx(MetricsTreeNodesTableName).insert(dbNodes);
            }

            if (edges.length > 0) {
                const dbEdges: DbMetricsTreeEdgeIn[] = edges.map((edge) => ({
                    source_metric_catalog_search_uuid:
                        edge.sourceCatalogSearchUuid,
                    target_metric_catalog_search_uuid:
                        edge.targetCatalogSearchUuid,
                    created_by_user_uuid: tree.created_by_user_uuid,
                    project_uuid: tree.project_uuid,
                    source: tree.source,
                }));
                await trx(MetricsTreeEdgesTableName)
                    .insert(dbEdges)
                    .onConflict([
                        'source_metric_catalog_search_uuid',
                        'target_metric_catalog_search_uuid',
                    ])
                    .ignore();
            }

            return {
                metricsTreeUuid: created.metrics_tree_uuid,
                projectUuid: created.project_uuid,
                slug: created.slug,
                name: created.name,
                description: created.description,
                source: created.source,
                createdByUserUuid: created.created_by_user_uuid,
                updatedByUserUuid: created.updated_by_user_uuid,
                createdAt: created.created_at,
                updatedAt: created.updated_at,
                generation: created.generation,
            };
        });
    }

    async getMetricsTreeByUuid(
        projectUuid: string,
        metricsTreeUuid: string,
    ): Promise<MetricsTreeWithDetails> {
        const lockExpiryCondition = this.getLockExpiryCondition();

        const tree = await this.database(MetricsTreesTableName)
            .select<DbMetricsTreeWithLock>(
                `${MetricsTreesTableName}.*`,
                `${MetricsTreeLocksTableName}.locked_by_user_uuid as lock_user_uuid`,
                `lock_users.first_name as lock_user_first_name`,
                `lock_users.last_name as lock_user_last_name`,
                `${MetricsTreeLocksTableName}.acquired_at as lock_acquired_at`,
            )
            .leftJoin(MetricsTreeLocksTableName, function lockJoin() {
                void this.on(
                    `${MetricsTreesTableName}.metrics_tree_uuid`,
                    '=',
                    `${MetricsTreeLocksTableName}.metrics_tree_uuid`,
                ).andOn(lockExpiryCondition);
            })
            .leftJoin(
                `${UserTableName} as lock_users`,
                `${MetricsTreeLocksTableName}.locked_by_user_uuid`,
                `lock_users.user_uuid`,
            )
            .where(
                `${MetricsTreesTableName}.metrics_tree_uuid`,
                metricsTreeUuid,
            )
            .andWhere(`${MetricsTreesTableName}.project_uuid`, projectUuid)
            .first();

        if (!tree) {
            throw new NotFoundError(
                `Metrics tree ${metricsTreeUuid} not found in project ${projectUuid}`,
            );
        }

        // Fetch nodes with hydrated catalog data
        const nodeRows = await this.getHydratedNodesQuery({
            metricsTreeUuid,
        });

        const nodes = nodeRows.map((row) => ({
            catalogSearchUuid: row.catalog_search_uuid,
            xPosition: row.x_position,
            yPosition: row.y_position,
            name: row.name,
            tableName: row.table_name,
            source: row.source,
        }));

        // Fetch edges where both source and target are nodes of this tree
        const nodeUuids = nodes.map((n) => n.catalogSearchUuid);

        const edgeRows =
            nodeUuids.length > 0
                ? await this.database(MetricsTreeEdgesTableName)
                      .where(
                          `${MetricsTreeEdgesTableName}.project_uuid`,
                          projectUuid,
                      )
                      .whereIn(
                          `${MetricsTreeEdgesTableName}.source_metric_catalog_search_uuid`,
                          nodeUuids,
                      )
                      .whereIn(
                          `${MetricsTreeEdgesTableName}.target_metric_catalog_search_uuid`,
                          nodeUuids,
                      )
                : [];

        // Build a lookup for node data
        const nodeMap = new Map(nodes.map((n) => [n.catalogSearchUuid, n]));

        const edges: CatalogMetricsTreeEdge[] = edgeRows
            .map((row) => {
                const sourceNode = nodeMap.get(
                    row.source_metric_catalog_search_uuid,
                );
                const targetNode = nodeMap.get(
                    row.target_metric_catalog_search_uuid,
                );
                if (!sourceNode || !targetNode) return null;

                return {
                    source: {
                        catalogSearchUuid:
                            row.source_metric_catalog_search_uuid,
                        name: sourceNode.name,
                        tableName: sourceNode.tableName,
                    },
                    target: {
                        catalogSearchUuid:
                            row.target_metric_catalog_search_uuid,
                        name: targetNode.name,
                        tableName: targetNode.tableName,
                    },
                    createdAt: row.created_at,
                    createdByUserUuid: row.created_by_user_uuid,
                    projectUuid: row.project_uuid,
                    createdFrom: row.source,
                };
            })
            .filter((e): e is CatalogMetricsTreeEdge => e !== null);

        return {
            metricsTreeUuid: tree.metrics_tree_uuid,
            projectUuid: tree.project_uuid,
            slug: tree.slug,
            name: tree.name,
            description: tree.description,
            source: tree.source,
            createdByUserUuid: tree.created_by_user_uuid,
            createdAt: tree.created_at,
            updatedAt: tree.updated_at,
            updatedByUserUuid: tree.updated_by_user_uuid,
            generation: tree.generation,
            nodes,
            edges,
            lock: parseLockInfo(tree),
        };
    }

    // --- Metrics Tree Locks ---

    async acquireTreeLock(
        metricsTreeUuid: string,
        userUuid: string,
    ): Promise<MetricsTreeLockInfo> {
        // Atomic upsert: insert a new lock, or overwrite if expired/same user.
        // If the lock is held by a different user and not expired, the WHERE
        // on the merge prevents the update and RETURNING yields no rows.
        const lockExpiryThreshold = this.database.raw(
            `NOW() - INTERVAL '${CatalogModel.LOCK_EXPIRY_MINUTES} minutes'`,
        );

        const result = await this.database(MetricsTreeLocksTableName)
            .insert({
                metrics_tree_uuid: metricsTreeUuid,
                locked_by_user_uuid: userUuid,
            })
            .onConflict('metrics_tree_uuid')
            .merge({
                locked_by_user_uuid: userUuid,
                acquired_at: this.database.fn.now() as unknown as Date,
                last_heartbeat_at: this.database.fn.now() as unknown as Date,
            })
            .where(`${MetricsTreeLocksTableName}.locked_by_user_uuid`, userUuid)
            .orWhere(
                `${MetricsTreeLocksTableName}.last_heartbeat_at`,
                '<=',
                lockExpiryThreshold,
            )
            .returning('*');

        if (result.length === 0) {
            throw new AlreadyExistsError(
                'Tree is being edited by another user',
            );
        }

        const lock = result[0];

        const user = await this.database(UserTableName)
            .select('first_name', 'last_name')
            .where('user_uuid', userUuid)
            .first();

        return {
            lockedByUserUuid: lock.locked_by_user_uuid,
            lockedByUserName:
                `${user!.first_name} ${user!.last_name ?? ''}`.trim(),
            acquiredAt: lock.acquired_at,
        };
    }

    async refreshTreeLockHeartbeat(
        metricsTreeUuid: string,
        userUuid: string,
    ): Promise<boolean> {
        const updated = await this.database(MetricsTreeLocksTableName)
            .where({
                metrics_tree_uuid: metricsTreeUuid,
                locked_by_user_uuid: userUuid,
            })
            .update({
                last_heartbeat_at: this.database.fn.now() as unknown as Date,
            });

        return updated > 0;
    }

    async releaseTreeLock(
        metricsTreeUuid: string,
        userUuid: string,
    ): Promise<void> {
        await this.database(MetricsTreeLocksTableName)
            .where({
                metrics_tree_uuid: metricsTreeUuid,
                locked_by_user_uuid: userUuid,
            })
            .delete();
    }

    async getTreeLock(
        metricsTreeUuid: string,
    ): Promise<MetricsTreeLockInfo | null> {
        const lockRow = await this.database(MetricsTreeLocksTableName)
            .select(
                `${MetricsTreeLocksTableName}.*`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
            )
            .join(
                UserTableName,
                `${MetricsTreeLocksTableName}.locked_by_user_uuid`,
                `${UserTableName}.user_uuid`,
            )
            .where(
                `${MetricsTreeLocksTableName}.metrics_tree_uuid`,
                metricsTreeUuid,
            )
            .andWhere(this.getLockExpiryCondition())
            .first();

        if (!lockRow) return null;

        return {
            lockedByUserUuid: lockRow.locked_by_user_uuid,
            lockedByUserName:
                `${lockRow.first_name} ${lockRow.last_name ?? ''}`.trim(),
            acquiredAt: lockRow.acquired_at,
        };
    }

    // --- Update Metrics Tree ---

    async updateMetricsTree(
        projectUuid: string,
        metricsTreeUuid: string,
        userUuid: string,
        update: {
            name?: string;
            description?: string;
        },
        nodes: Array<{
            catalogSearchUuid: string;
            xPosition?: number;
            yPosition?: number;
        }>,
        edges: Array<{
            sourceCatalogSearchUuid: string;
            targetCatalogSearchUuid: string;
        }>,
        expectedGeneration: number,
    ): Promise<MetricsTreeWithDetails> {
        await this.database.transaction(async (trx) => {
            // Update tree metadata
            const updateFields: Record<string, unknown> = {
                updated_at: trx.fn.now(),
                updated_by_user_uuid: userUuid,
                generation: trx.raw('generation + 1'),
            };
            if (update.name !== undefined) {
                updateFields.name = update.name;
            }
            if (update.description !== undefined) {
                updateFields.description = update.description;
            }

            const updated = await trx(MetricsTreesTableName)
                .where({
                    metrics_tree_uuid: metricsTreeUuid,
                    generation: expectedGeneration,
                })
                .update(updateFields);

            if (updated === 0) {
                throw new AlreadyExistsError(
                    'This tree was modified while you were editing. Please refresh and try again.',
                );
            }

            // Replace UI nodes: delete existing UI nodes, re-insert new ones
            await trx(MetricsTreeNodesTableName)
                .where({
                    metrics_tree_uuid: metricsTreeUuid,
                    source: 'ui',
                })
                .delete();

            if (nodes.length > 0) {
                const dbNodes: DbMetricsTreeNodeIn[] = nodes.map((node) => ({
                    metrics_tree_uuid: metricsTreeUuid,
                    catalog_search_uuid: node.catalogSearchUuid,
                    x_position: node.xPosition ?? null,
                    y_position: node.yPosition ?? null,
                    source: 'ui' as const,
                }));
                await trx(MetricsTreeNodesTableName)
                    .insert(dbNodes)
                    .onConflict(['metrics_tree_uuid', 'catalog_search_uuid'])
                    .merge({
                        x_position: trx.raw(
                            'EXCLUDED.x_position',
                        ) as unknown as number,
                        y_position: trx.raw(
                            'EXCLUDED.y_position',
                        ) as unknown as number,
                    });
            }

            // Replace UI edges for this tree's nodes
            // First get all node UUIDs (including YAML nodes that may still exist)
            const allNodeUuids = await trx(MetricsTreeNodesTableName)
                .where({ metrics_tree_uuid: metricsTreeUuid })
                .pluck('catalog_search_uuid');

            // Delete UI edges where both source and target are in this tree
            if (allNodeUuids.length > 0) {
                await trx(MetricsTreeEdgesTableName)
                    .where({ project_uuid: projectUuid, source: 'ui' })
                    .whereIn('source_metric_catalog_search_uuid', allNodeUuids)
                    .whereIn('target_metric_catalog_search_uuid', allNodeUuids)
                    .delete();
            }

            if (edges.length > 0) {
                const dbEdges: DbMetricsTreeEdgeIn[] = edges.map((edge) => ({
                    source_metric_catalog_search_uuid:
                        edge.sourceCatalogSearchUuid,
                    target_metric_catalog_search_uuid:
                        edge.targetCatalogSearchUuid,
                    created_by_user_uuid: userUuid,
                    project_uuid: projectUuid,
                    source: 'ui' as const,
                }));
                await trx(MetricsTreeEdgesTableName)
                    .insert(dbEdges)
                    .onConflict([
                        'source_metric_catalog_search_uuid',
                        'target_metric_catalog_search_uuid',
                    ])
                    .ignore();
            }
        });

        return this.getMetricsTreeByUuid(projectUuid, metricsTreeUuid);
    }

    async getDistinctOwners(projectUuid: string): Promise<
        {
            userUuid: string;
            firstName: string;
            lastName: string;
            email: string;
        }[]
    > {
        const results = await this.database(CatalogTableName)
            .distinct(
                `${UserTableName}.user_uuid`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                `${EmailTableName}.email`,
            )
            .join(
                `${UserTableName} as users`,
                `${CatalogTableName}.owner_user_uuid`,
                `${UserTableName}.user_uuid`,
            )
            .join(`${EmailTableName} as emails`, function emailJoin() {
                void this.on(
                    `${UserTableName}.user_id`,
                    '=',
                    `${EmailTableName}.user_id`,
                ).andOnVal(`${EmailTableName}.is_primary`, '=', true);
            })
            .where({
                project_uuid: projectUuid,
                spotlight_show: true,
                type: CatalogType.Field,
                field_type: FieldType.METRIC,
            })
            .whereNotNull(`${CatalogTableName}.owner_user_uuid`)
            .orderBy('users.first_name');

        return results.map((r) => ({
            userUuid: r.user_uuid,
            firstName: r.first_name,
            lastName: r.last_name,
            email: r.email,
        }));
    }
}
