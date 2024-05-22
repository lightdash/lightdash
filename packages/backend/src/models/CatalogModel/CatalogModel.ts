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
    private database: Knex;

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
    async search(
        projectUuid: string,
        query: string,
        limit: number = 50,
    ): Promise<(CatalogTable | CatalogField)[]> {
        const searchRankRawSql = getFullTextSearchRankCalcSql(
            this.database,
            CatalogTableName,
            'search_vector',
            query,
        );
        const catalogItemsQuery = this.database(CatalogTableName)
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
            .where(`${CatalogTableName}.project_uuid`, projectUuid)
            .andWhere(
                `${CatalogTableName}.search_vector`,
                '@@',
                this.database.raw(
                    `to_tsquery('lightdash_english_config', ?)`,
                    query,
                ),
            )
            .orderBy('search_rank', 'desc')
            .limit(limit);

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
