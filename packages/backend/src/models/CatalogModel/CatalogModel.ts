import {
    CatalogFilter,
    CatalogItemIcon,
    CatalogItemsWithIcons,
    CatalogType,
    Explore,
    FieldType,
    NotFoundError,
    TableSelectionType,
    UnexpectedServerError,
    type ApiCatalogSearch,
    type ApiSort,
    type CatalogFieldMap,
    type CatalogFieldWhere,
    type CatalogItem,
    type CatalogItemWithTagUuids,
    type ChartUsageIn,
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
    getDbCatalogColumnFromCatalogProperty,
    type DbCatalog,
    type DbCatalogIn,
    type DbCatalogTagsMigrateIn,
} from '../../database/entities/catalog';
import { CachedExploreTableName } from '../../database/entities/projects';
import { TagsTableName } from '../../database/entities/tags';
import KnexPaginate from '../../database/pagination';
import Logger from '../../logging/logger';
import { wrapSentryTransaction } from '../../utils';
import {
    getFullTextSearchQuery,
    getFullTextSearchRankCalcSql,
} from '../SearchModel/utils/search';
import { convertExploresToCatalog } from './utils';
import { parseCatalog } from './utils/parser';

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
        cachedExplores: (Explore & { cachedExploreUuid: string })[],
    ): Promise<{
        catalogInserts: DbCatalogIn[];
        catalogFieldMap: CatalogFieldMap;
    }> {
        if (cachedExplores.length === 0) {
            return {
                catalogInserts: [],
                catalogFieldMap: {},
            };
        }

        try {
            const wrapped = await wrapSentryTransaction(
                'indexCatalog',
                { projectUuid, cachedExploresSize: cachedExplores.length },
                async () => {
                    const { catalogInserts, catalogFieldMap } =
                        await wrapSentryTransaction(
                            'indexCatalog.convertExploresToCatalog',
                            {
                                projectUuid,
                                cachedExploresLength: cachedExplores.length,
                            },
                            async () =>
                                convertExploresToCatalog(
                                    projectUuid,
                                    cachedExplores,
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

                                const inserts = await this.database
                                    .batchInsert(
                                        CatalogTableName,
                                        catalogInserts,
                                    )
                                    .returning('*')
                                    .transacting(trx);

                                return inserts;
                            }),
                    );

                    return {
                        catalogInserts: transactionInserts,
                        catalogFieldMap,
                    };
                },
            );

            return wrapped;
        } catch (e) {
            Logger.error(`Failed to index catalog ${projectUuid}, ${e}`);
            return {
                catalogInserts: [],
                catalogFieldMap: {},
            };
        }
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
    }: {
        projectUuid: string;
        exploreName?: string;
        catalogSearch: ApiCatalogSearch;
        limit?: number;
        excludeUnmatched?: boolean;
        searchRankFunction?: (args: {
            database: Knex;
            variables: Record<string, string>;
        }) => Knex.Raw<any>;
        tablesConfiguration: TablesConfiguration;
        userAttributes: UserAttributeValueMap;
        paginateArgs?: KnexPaginateArgs;
        sortArgs?: ApiSort;
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
                'description',
                'type',
                `${CachedExploreTableName}.explore`,
                `required_attributes`,
                `chart_usage`,
                `icon`,
                // Add tags as an aggregated JSON array
                {
                    search_rank: searchRankRawSql,
                    catalog_tags: this.database.raw(`
                        COALESCE(
                            JSON_AGG(
                                DISTINCT JSONB_BUILD_OBJECT(
                                    'tagUuid', ${TagsTableName}.tag_uuid,
                                    'name', ${TagsTableName}.name,
                                    'color', ${TagsTableName}.color
                                )
                            ) FILTER (WHERE ${TagsTableName}.tag_uuid IS NOT NULL),
                            '[]'
                        )
                    `),
                },
            )
            .leftJoin(
                CachedExploreTableName,
                `${CatalogTableName}.cached_explore_uuid`,
                `${CachedExploreTableName}.cached_explore_uuid`,
            )
            .leftJoin(
                CatalogTagsTableName,
                `${CatalogTableName}.catalog_search_uuid`,
                `${CatalogTagsTableName}.catalog_search_uuid`,
            )
            .leftJoin(
                TagsTableName,
                `${CatalogTagsTableName}.tag_uuid`,
                `${TagsTableName}.tag_uuid`,
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
                    void this.whereRaw(
                        `
                        (explore->>'baseTable')::text = ANY(?)
                    `,
                        [value ?? []],
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
            catalogItemsQuery = catalogItemsQuery.whereExists(
                function getAllCatalogCategoriesThatMatchTags() {
                    void this.select('*')
                        .from(CatalogTagsTableName)
                        .whereRaw(
                            `${CatalogTagsTableName}.catalog_search_uuid = ${CatalogTableName}.catalog_search_uuid`,
                        )
                        .whereIn(
                            `${CatalogTagsTableName}.tag_uuid`,
                            catalogTags,
                        );
                },
            );
        }

        if (excludeUnmatched && searchQuery) {
            catalogItemsQuery = catalogItemsQuery.andWhereRaw(
                `"${CatalogTableName}".search_vector @@ to_tsquery('lightdash_english_config', ?)`,
                getFullTextSearchQuery(searchQuery),
            );
        }

        catalogItemsQuery = catalogItemsQuery.groupBy(
            `${CatalogTableName}.catalog_search_uuid`,
            `${CatalogTableName}.name`,
            `${CatalogTableName}.description`,
            `${CatalogTableName}.type`,
            `${CachedExploreTableName}.explore`,
            `${CatalogTableName}.required_attributes`,
            `${CatalogTableName}.chart_usage`,
            `${CatalogTableName}.search_vector`,
            'search_rank',
        );

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
                    catalog_tags: Pick<Tag, 'tagUuid' | 'name' | 'color'>[];
                })[]
            >(),
            paginateArgs,
        );

        const catalog = await wrapSentryTransaction(
            'CatalogModel.search.parse',
            {
                catalogSize: paginatedCatalogItems.data.length,
            },
            async () => paginatedCatalogItems.data.map(parseCatalog),
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

    async updateChartUsages(
        projectUuid: string,
        {
            fieldsToIncrement,
            fieldsToDecrement,
        }: {
            fieldsToIncrement: CatalogFieldWhere[];
            fieldsToDecrement: CatalogFieldWhere[];
        },
    ) {
        await this.database.transaction(async (trx) => {
            const incrementPromises = fieldsToIncrement.map(
                ({ fieldName, cachedExploreUuid }) =>
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
                        .increment('chart_usage', 1),
            );

            const decrementPromises = fieldsToDecrement.map(
                ({ fieldName, cachedExploreUuid }) =>
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
                        .where('chart_usage', '>', 0) // Ensure we don't decrement below 0
                        .decrement('chart_usage', 1),
            );

            await Promise.all([...incrementPromises, ...decrementPromises]);
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

    async tagCatalogItem(
        user: SessionUser,
        catalogSearchUuid: string,
        tagUuid: string,
    ) {
        await this.database(CatalogTagsTableName).insert({
            catalog_search_uuid: catalogSearchUuid,
            tag_uuid: tagUuid,
            created_by_user_uuid: user.userUuid,
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

    async getCatalogItemsWithTags(
        projectUuid: string,
        opts?: { onlyTagged?: boolean },
    ) {
        const { onlyTagged = false } = opts ?? {};

        let query = this.database(CatalogTableName)
            .column(
                `${CatalogTableName}.catalog_search_uuid`,
                `${CatalogTableName}.cached_explore_uuid`,
                `${CatalogTableName}.project_uuid`,
                `${CatalogTableName}.name`,
                `${CatalogTableName}.type`,
                `${CatalogTableName}.field_type`,
                {
                    explore_base_table: this.database.raw(
                        `${CachedExploreTableName}.explore->>'baseTable'`,
                    ),
                    catalog_tag_uuids: this.database.raw(`
                    COALESCE(
                        JSON_AGG(
                            DISTINCT JSONB_BUILD_OBJECT(
                                'tagUuid', ${CatalogTagsTableName}.tag_uuid,
                                'createdByUserUuid', ${CatalogTagsTableName}.created_by_user_uuid,
                                'createdAt', ${CatalogTagsTableName}.created_at
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

        query = query
            .where(`${CatalogTableName}.project_uuid`, projectUuid)
            .groupBy(
                `${CatalogTableName}.catalog_search_uuid`,
                `${CatalogTableName}.cached_explore_uuid`,
                `${CatalogTableName}.project_uuid`,
                `${CatalogTableName}.name`,
                `${CatalogTableName}.type`,
                `${CatalogTableName}.field_type`,
                `explore_base_table`,
            );

        const itemsWithTags: (DbCatalog & {
            explore_base_table: string;
            catalog_tag_uuids: {
                tagUuid: string;
                createdByUserUuid: string | null;
                createdAt: Date;
            }[];
        })[] = await query;

        return itemsWithTags.map<CatalogItemWithTagUuids>((i) => ({
            catalogSearchUuid: i.catalog_search_uuid,
            cachedExploreUuid: i.cached_explore_uuid,
            projectUuid: i.project_uuid,
            name: i.name,
            type: i.type,
            fieldType: i.field_type,
            exploreBaseTable: i.explore_base_table,
            catalogTags: i.catalog_tag_uuids,
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
                {
                    explore_base_table: this.database.raw(
                        `${CachedExploreTableName}.explore->>'baseTable'`,
                    ),
                },
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
                `explore_base_table`,
            );

        const itemsWithIcons: (DbCatalog & {
            explore_base_table: string;
        })[] = await query;

        return itemsWithIcons.map<CatalogItemsWithIcons>((i) => ({
            catalogSearchUuid: i.catalog_search_uuid,
            cachedExploreUuid: i.cached_explore_uuid,
            projectUuid: i.project_uuid,
            name: i.name,
            type: i.type,
            fieldType: i.field_type,
            exploreBaseTable: i.explore_base_table,
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
}
