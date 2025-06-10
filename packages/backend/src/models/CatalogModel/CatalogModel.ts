import {
    CatalogFilter,
    CatalogItemIcon,
    CatalogItemsWithIcons,
    CatalogType,
    Explore,
    FieldType,
    NotFoundError,
    TableSelectionType,
    UNCATEGORIZED_TAG_UUID,
    UnexpectedServerError,
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
    type SessionUser,
    type TablesConfiguration,
    type Tag,
    type UserAttributeValueMap,
} from '@lightdash/common';
import { Knex } from 'knex';
import type { LightdashConfig } from '../../config/parseConfig';
import {
    CatalogTableName,
    CatalogTagsTableName,
    DbCatalogTagIn,
    MetricsTreeEdgesTableName,
    getDbCatalogColumnFromCatalogProperty,
    type DbCatalog,
    type DbCatalogTagsMigrateIn,
    type DbMetricsTreeEdge,
    type DbMetricsTreeEdgeDelete,
    type DbMetricsTreeEdgeIn,
} from '../../database/entities/catalog';
import { CachedExploreTableName } from '../../database/entities/projects';
import { DbTag, TagsTableName } from '../../database/entities/tags';
import KnexPaginate from '../../database/pagination';
import Logger from '../../logging/logger';
import { wrapSentryTransaction } from '../../utils';
import {
    getFullTextSearchQuery,
    getFullTextSearchRankCalcSql,
} from '../SearchModel/utils/search';
import { convertExploresToCatalog } from './utils';
import { parseCatalog } from './utils/parser';

export enum CatalogSearchContext {
    SPOTLIGHT = 'spotlight',
    CATALOG = 'catalog',
    METRICS_EXPLORER = 'metricsExplorer',
}

export type CatalogModelArguments = {
    database: Knex;
    lightdashConfig: LightdashConfig;
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
        embedderFn?: (
            documents: {
                name: string;
                description: string;
            }[],
        ) => Promise<Array<Array<number>>>,
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

                                const BATCH_SIZE = 3000;
                                const results = await trx
                                    .batchInsert<DbCatalog>(
                                        CatalogTableName,
                                        catalogInserts.map(
                                            ({
                                                assigned_yaml_tags,
                                                ...catalogInsert
                                            }) => catalogInsert,
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
        catalogSearch: { catalogTags, filter, searchQuery = '', type },
        limit = 50,
        excludeUnmatched = true,
        searchRankFunction = getFullTextSearchRankCalcSql,
        tablesConfiguration,
        userAttributes,
        paginateArgs,
        sortArgs,
        context,
    }: {
        projectUuid: string;
        exploreName?: string;
        catalogSearch: ApiCatalogSearch;
        limit?: number;
        excludeUnmatched?: boolean;
        searchRankFunction?: (args: {
            database: Knex;
            variables: Record<string, string>;
        }) => Knex.Raw;
        tablesConfiguration: TablesConfiguration;
        userAttributes: UserAttributeValueMap;
        paginateArgs?: KnexPaginateArgs;
        sortArgs?: ApiSort;
        context: CatalogSearchContext;
    }): Promise<KnexPaginatedData<CatalogItem[]>> {
        const searchRankRawSql = searchRankFunction({
            database: this.database,
            variables: {
                searchVectorColumn: `${CatalogTableName}.search_vector`,
                searchQuery,
            },
        });

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
                `icon`,
                // Add tags as an aggregated JSON array
                {
                    search_rank: searchRankRawSql,
                },
            )
            .leftJoin(
                CachedExploreTableName,
                `${CatalogTableName}.cached_explore_uuid`,
                `${CachedExploreTableName}.cached_explore_uuid`,
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
            catalogItemsQuery = catalogItemsQuery.andWhere(
                function getCatalogItemsWithTags() {
                    const regularTags = catalogTags.filter(
                        (tag) => tag !== UNCATEGORIZED_TAG_UUID,
                    );
                    const includeUncategorized = catalogTags.includes(
                        UNCATEGORIZED_TAG_UUID,
                    );

                    if (regularTags.length > 0 && includeUncategorized) {
                        // Show items that either:
                        // 1. Have no tags OR
                        // 2. Have any of the specified tags
                        void this.where(function getUncategorizedItems() {
                            void this.whereNotExists(function noTags() {
                                void this.select('*')
                                    .from(CatalogTagsTableName)
                                    .whereRaw(
                                        `${CatalogTagsTableName}.catalog_search_uuid = ${CatalogTableName}.catalog_search_uuid`,
                                    );
                            }).orWhereExists(function hasSpecificTags() {
                                void this.select('*')
                                    .from(CatalogTagsTableName)
                                    .whereRaw(
                                        `${CatalogTagsTableName}.catalog_search_uuid = ${CatalogTableName}.catalog_search_uuid`,
                                    )
                                    .whereIn(
                                        `${CatalogTagsTableName}.tag_uuid`,
                                        regularTags,
                                    );
                            });
                        });
                    } else if (includeUncategorized) {
                        // Show only items with no tags
                        void this.whereNotExists(function noTags() {
                            void this.select('*')
                                .from(CatalogTagsTableName)
                                .whereRaw(
                                    `${CatalogTagsTableName}.catalog_search_uuid = ${CatalogTableName}.catalog_search_uuid`,
                                );
                        });
                    } else {
                        // Show only items with specified tags
                        void this.whereExists(function hasSpecificTags() {
                            void this.select('*')
                                .from(CatalogTagsTableName)
                                .whereRaw(
                                    `${CatalogTagsTableName}.catalog_search_uuid = ${CatalogTableName}.catalog_search_uuid`,
                                )
                                .whereIn(
                                    `${CatalogTagsTableName}.tag_uuid`,
                                    regularTags,
                                );
                        });
                    }
                },
            );
        }

        if (excludeUnmatched && searchQuery) {
            catalogItemsQuery = catalogItemsQuery.andWhereRaw(
                `"${CatalogTableName}".search_vector @@ to_tsquery('lightdash_english_config', ?)`,
                getFullTextSearchQuery(searchQuery),
            );
        }

        catalogItemsQuery = catalogItemsQuery
            .orderBy('search_rank', 'desc')
            .limit(limit ?? 50);

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
                (DbCatalog & {
                    explore: Explore;
                })[]
            >(),
            paginateArgs,
        );

        const tagsPerItem = await this.getTagsPerItem(
            paginatedCatalogItems.data.map((item) => item.catalog_search_uuid),
        );

        const catalog = await wrapSentryTransaction(
            'CatalogModel.search.parse',
            {
                catalogSize: paginatedCatalogItems.data.length,
            },
            async () =>
                paginatedCatalogItems.data.map((item) =>
                    parseCatalog({
                        ...item,
                        catalog_tags:
                            tagsPerItem[item.catalog_search_uuid] ?? [],
                    }),
                ),
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
                created_at: `${MetricsTreeEdgesTableName}.created_at`,
                created_by_user_uuid: `${MetricsTreeEdgesTableName}.created_by_user_uuid`,
                source_metric_name: `source_metric.name`,
                source_metric_table_name: `source_metric.table_name`,
                target_metric_name: `target_metric.name`,
                target_metric_table_name: `target_metric.table_name`,
            })
            .innerJoin(
                { source_metric: CatalogTableName },
                function joinSource() {
                    void this.on(
                        `${MetricsTreeEdgesTableName}.source_metric_catalog_search_uuid`,
                        '=',
                        `source_metric.catalog_search_uuid`,
                    ).andOnVal('source_metric.project_uuid', '=', projectUuid);
                },
            )
            .innerJoin(
                { target_metric: CatalogTableName },
                function joinTarget() {
                    void this.on(
                        `${MetricsTreeEdgesTableName}.target_metric_catalog_search_uuid`,
                        '=',
                        `target_metric.catalog_search_uuid`,
                    ).andOnVal('target_metric.project_uuid', '=', projectUuid);
                },
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
            projectUuid,
        }));
    }

    async createMetricsTreeEdge(metricsTreeEdge: DbMetricsTreeEdgeIn) {
        return this.database(MetricsTreeEdgesTableName).insert(metricsTreeEdge);
    }

    async deleteMetricsTreeEdge(metricsTreeEdge: DbMetricsTreeEdgeDelete) {
        return this.database(MetricsTreeEdgesTableName)
            .where(metricsTreeEdge)
            .delete();
    }

    async migrateMetricsTreeEdges(
        metricTreeEdgesMigrateIn: DbMetricsTreeEdgeIn[],
    ) {
        return this.database.batchInsert(
            MetricsTreeEdgesTableName,
            metricTreeEdgesMigrateIn,
        );
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
}
