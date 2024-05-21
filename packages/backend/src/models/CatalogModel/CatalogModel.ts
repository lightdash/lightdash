import {
    CatalogField,
    CatalogTable,
    CatalogType,
    Explore,
    FieldType,
} from '@lightdash/common';
import { Field } from 'apache-arrow';
import { Knex } from 'knex';
import { CatalogTableName, DbCatalog } from '../../database/entities/catalog';
import { CachedExploreTableName } from '../../database/entities/projects';
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
        if (dbCatalog.type === CatalogType.Table) {
            return {
                name: dbCatalog.name,
                groupLabel: dbCatalog.explore.groupLabel,
                description: dbCatalog.description || undefined,
                type: dbCatalog.type,
            };
        }

        const baseTable = dbCatalog.explore.tables[dbCatalog.explore.baseTable];
        const isDimension = Object.values(baseTable.dimensions).some(
            (d) => d.name === dbCatalog.name,
        );

        // TODO return requiredAttributes and filter permissions on CatalogService
        return {
            name: dbCatalog.name,
            tableLabel: dbCatalog.explore.name,
            description: dbCatalog.description || undefined,
            type: dbCatalog.type,
            fieldType: isDimension ? FieldType.DIMENSION : FieldType.METRIC,
        };
    }

    // Index catalog happens inside projectModel, inside `saveExploresToCache`
    async search(
        projectUuid: string,
        query: string,
        limit: number = 100,
    ): Promise<(CatalogTable | CatalogField)[]> {
        const searchRankRawSql = getFullTextSearchRankCalcSql(
            this.database,
            CatalogTableName,
            'search_vector',
            query,
        );
        const catalogItems = await this.database(CatalogTableName)
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
            // TODO filter search_rank > 0.1
            .orderBy('search_rank', 'desc')
            .limit(limit);

        return catalogItems.map(CatalogModel.parseCatalog);
    }
}
