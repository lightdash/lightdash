import {
    CatalogField,
    CatalogFilter,
    CatalogTable,
    CatalogType,
    Explore,
    FieldType,
    NotFoundError,
    TableSelectionType,
    UnexpectedServerError,
    type ApiSort,
    type CatalogItem,
    type ChartUsageUpdate,
    type KnexPaginateArgs,
    type KnexPaginatedData,
    type TablesConfiguration,
    type UserAttributeValueMap,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    CatalogTableName,
    getDbCatalogColumnFromCatalogProperty,
    type DbCatalog,
} from '../../database/entities/catalog';
import { CachedExploreTableName } from '../../database/entities/projects';
import KnexPaginate from '../../database/pagination';
import { wrapSentryTransaction } from '../../utils';
import {
    getFullTextSearchQuery,
    getFullTextSearchRankCalcSql,
} from '../SearchModel/utils/search';
import { parseCatalog } from './utils/parser';

type SearchModelArguments = {
    database: Knex;
};

export class CatalogModel {
    protected database: Knex;

    constructor(args: SearchModelArguments) {
        this.database = args.database;
    }

    // Index catalog happens inside projectModel, inside `saveExploresToCache`
    async search({
        searchQuery,
        projectUuid,
        exploreName,
        type,
        filter,
        limit = 50,
        excludeUnmatched = true,
        searchRankFunction = getFullTextSearchRankCalcSql,
        tablesConfiguration,
        userAttributes,
        paginateArgs,
        sortArgs,
    }: {
        searchQuery?: string;
        projectUuid: string;
        exploreName?: string;
        filter?: CatalogFilter;
        type?: CatalogType;
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
    }): Promise<KnexPaginatedData<(CatalogTable | CatalogField)[]>> {
        const searchRankRawSql = searchQuery
            ? searchRankFunction({
                  database: this.database,
                  variables: {
                      searchVectorColumn: `${CatalogTableName}.search_vector`,
                      searchQuery,
                  },
              })
            : undefined;

        let catalogItemsQuery = this.database(CatalogTableName)
            .column(
                `${CatalogTableName}.name`,
                'description',
                'type',
                {
                    search_rank: searchRankRawSql ?? 0,
                },
                `${CachedExploreTableName}.explore`,
                `required_attributes`,
                `chart_usage`,
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
            catalogItemsQuery.select<(DbCatalog & { explore: Explore })[]>(),
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

    async updateChartUsages(
        projectUuid: string,
        chartUsageUpdates: ChartUsageUpdate[],
    ) {
        await this.database.transaction(async (trx) => {
            const updatePromises = chartUsageUpdates.map(
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
}
