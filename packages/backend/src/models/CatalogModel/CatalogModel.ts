import {
    CatalogField,
    CatalogTable,
    CatalogType,
    Explore,
} from '@lightdash/common';
import { Knex } from 'knex';
import { CatalogTableName, DbCatalog } from '../../database/entities/catalog';
import { CachedExploreTableName } from '../../database/entities/projects';
import { wrapSentryTransaction } from '../../utils';
import { getFullTextSearchRankCalcSql } from '../SearchModel/utils/search';

type SearchModelArguments = {
    database: Knex;
};

export class CatalogModel {
    protected database: Knex;

    constructor(args: SearchModelArguments) {
        this.database = args.database;
    }

    static parseCatalog(
        dbCatalog: DbCatalog & { explore: Explore },
    ): CatalogTable | CatalogField {
        const baseTable = dbCatalog.explore.tables[dbCatalog.explore.baseTable];

        if (dbCatalog.type === CatalogType.Table) {
            return {
                name: dbCatalog.name,
                groupLabel: dbCatalog.explore.groupLabel,
                description: dbCatalog.description || undefined,
                type: dbCatalog.type,
                requiredAttributes: baseTable.requiredAttributes,
            };
        }

        const dimensionsAndMetrics = [
            ...Object.values(baseTable.dimensions),
            ...Object.values(baseTable.metrics),
        ];
        // This is the most computationally expensive part of the code
        // Perhaps we should add metadata (requiredAttributes) to the catalog database
        // or cache this somehow
        const findField = dimensionsAndMetrics.find(
            (d) => d.name === dbCatalog.name,
        );
        if (!findField) {
            throw new Error(
                `Field ${dbCatalog.name} not found in explore ${dbCatalog.explore.name}`,
            );
        }
        return {
            name: dbCatalog.name,
            tableLabel: dbCatalog.explore.name,
            description: dbCatalog.description || undefined,
            type: dbCatalog.type,
            fieldType: findField?.fieldType,
            requiredAttributes:
                findField?.requiredAttributes || baseTable.requiredAttributes,
        };
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
                searchQuery,
            );
        }

        catalogItemsQuery = catalogItemsQuery
            .orderBy('search_rank', 'desc')
            .limit(limit ?? 50);

        const catalogItems = await catalogItemsQuery;
        const catalog = await wrapSentryTransaction(
            'CatalogModel.search.parse',
            {
                catalogSize: catalogItems.length,
            },
            async () => catalogItems.map(CatalogModel.parseCatalog),
        );
        return catalog;
    }
}
