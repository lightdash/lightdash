import {
    CatalogField,
    CatalogTable,
    CatalogType,
    Explore,
    getBasicType,
    NotFoundError,
    UnexpectedServerError,
} from '@lightdash/common';
import { Knex } from 'knex';
import { CatalogTableName, DbCatalog } from '../../database/entities/catalog';
import { CachedExploreTableName } from '../../database/entities/projects';
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
        limit = 50,
        excludeUnmatched = true,
        searchRankFunction = getFullTextSearchRankCalcSql,
    }: {
        searchQuery: string;
        projectUuid: string;
        exploreName?: string;
        type?: CatalogType;
        limit?: number;
        excludeUnmatched?: boolean;
        searchRankFunction?: (args: {
            database: Knex;
            variables: Record<string, string>;
        }) => Knex.Raw<any>;
    }): Promise<(CatalogTable | CatalogField)[]> {
        const searchRankRawSql = searchRankFunction({
            database: this.database,
            variables: {
                searchVectorColumn: `${CatalogTableName}.search_vector`,
                searchQuery,
            },
        });

        let catalogItemsQuery = this.database(CatalogTableName)
            .column(
                `${CatalogTableName}.name`,
                'description',
                'type',
                {
                    search_rank: searchRankRawSql,
                },
                `${CachedExploreTableName}.explore`,
            )
            .leftJoin(
                CachedExploreTableName,
                `${CatalogTableName}.cached_explore_uuid`,
                `${CachedExploreTableName}.cached_explore_uuid`,
            )
            .where(`${CatalogTableName}.project_uuid`, projectUuid);

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

        if (excludeUnmatched) {
            catalogItemsQuery = catalogItemsQuery.andWhereRaw(
                `"${CatalogTableName}".search_vector @@ to_tsquery('lightdash_english_config', ?)`,
                getFullTextSearchQuery(searchQuery),
            );
        }

        catalogItemsQuery = catalogItemsQuery
            .orderBy('search_rank', 'desc')
            .limit(limit ?? 50);

        console.log('catalogItemsQuery', catalogItemsQuery.toString());

        const catalogItems = await catalogItemsQuery;
        const catalog = await wrapSentryTransaction(
            'CatalogModel.search.parse',
            {
                catalogSize: catalogItems.length,
            },
            async () => catalogItems.map(parseCatalog),
        );
        return catalog;
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
