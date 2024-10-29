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
    type KnexPaginateArgs,
    type KnexPaginatedData,
    type TablesConfiguration,
    type UserAttributeValueMap,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    CatalogTableName,
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
                    void this.whereJsonPath(
                        'explore',
                        '$.tags',
                        'IN',
                        tablesConfiguration.tableSelection.value ?? [],
                    );
                } else if (
                    tableSelectionType === TableSelectionType.WITH_NAMES
                ) {
                    void this.whereJsonPath(
                        'explore',
                        '$.baseTable',
                        'IN',
                        tablesConfiguration.tableSelection.value ?? [],
                    );
                }
            })
            .andWhere(function userAttributesFiltering() {
                void this.whereJsonSubsetOf(
                    'required_attributes',
                    userAttributes,
                ).orWhere('required_attributes', null);
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
}
