import {
    AnyType,
    CatalogFieldMap,
    CatalogType,
    Explore,
    UnexpectedServerError,
    type TablesConfiguration,
    type UserAttributeValueMap,
} from '@lightdash/common';
import { Knex } from 'knex';
import { CatalogTableName, DbCatalogIn } from '../../database/entities/catalog';
import {
    CatalogModel,
    CatalogModelArguments,
    CatalogSearchContext,
} from '../../models/CatalogModel/CatalogModel';
import OpenAi from '../clients/OpenAi';

type CommercialCatalogModelArguments = CatalogModelArguments & {
    openAi: OpenAi;
};

export class CommercialCatalogModel extends CatalogModel {
    openAi: OpenAi;

    constructor({ openAi, ...args }: CommercialCatalogModelArguments) {
        super(args);
        this.openAi = openAi;
    }

    static getHybridSearchRankCalcSqlFunction(hybridSearchVariables: {
        embedVectorColumn: string;
        embedQueries: string[];
    }) {
        return ({
            database,
            variables,
        }: {
            database: Knex;
            variables: Record<string, string>;
        }) => {
            const scores = hybridSearchVariables.embedQueries
                .map(
                    (_embedQuery, i) =>
                        // calculates the cosine similarity between the embedding vector and the embed query
                        `(1 - (:embedVectorColumn: <=> :embedQueries${i}))`,
                )
                .join(', ');

            // takes the greatest similarity score from all the embed queries
            return database.raw(`GREATEST(${scores})`, {
                ...variables,
                embedVectorColumn: hybridSearchVariables.embedVectorColumn,
                ...Object.fromEntries(
                    hybridSearchVariables.embedQueries.map((embedQuery, i) => [
                        `embedQueries${i}`,
                        embedQuery,
                    ]),
                ),
            });
        };
    }

    async hybridSearch({
        embedQueries,
        ...args
    }: {
        embedQueries: number[][];
        projectUuid: string;
        exploreName?: string;
        type?: CatalogType;
        limit?: number;
        excludeUnmatched?: boolean;
        searchRankFunction?: (args: {
            database: Knex;
            variables: Record<string, string>;
        }) => Knex.Raw<AnyType>;
        tablesConfiguration: TablesConfiguration;
        userAttributes: UserAttributeValueMap;
    }) {
        return super.search({
            ...args,
            context: CatalogSearchContext.CATALOG,
            catalogSearch: {
                searchQuery: '',
            },
            excludeUnmatched: false,
            searchRankFunction:
                CommercialCatalogModel.getHybridSearchRankCalcSqlFunction({
                    embedVectorColumn: `${CatalogTableName}.embedding_vector`,
                    embedQueries: embedQueries.map((embedQuery) =>
                        JSON.stringify(embedQuery),
                    ),
                }),
        });
    }

    private async embedCatalogItem(
        catalogItems: DbCatalogIn[],
    ): Promise<Array<Array<number>>> {
        if (this.openAi.embedder === undefined) {
            throw new UnexpectedServerError(
                'OpenAi embedder is not initialized',
            );
        }

        const results = await this.openAi.embedder.embedDocuments(
            catalogItems.map((catalogItem) =>
                JSON.stringify({
                    name: catalogItem.name,
                    description: catalogItem.description ?? '',
                }),
            ),
        );

        return results;
    }

    async indexCatalog(
        projectUuid: string,
        cachedExplores: (Explore & { cachedExploreUuid: string })[],
    ): Promise<{
        catalogInserts: DbCatalogIn[];
        catalogFieldMap: CatalogFieldMap;
    }> {
        const { catalogInserts, catalogFieldMap } = await super.indexCatalog(
            projectUuid,
            cachedExplores,
        );

        const { enabled: copilotEnabled, embeddingSearchEnabled } =
            this.lightdashConfig.ai.copilot;

        if (!copilotEnabled || !embeddingSearchEnabled) {
            return { catalogInserts, catalogFieldMap };
        }

        const embeddings = await this.embedCatalogItem(catalogInserts);

        const transaction = await this.database.transaction((trx) =>
            Promise.all(
                catalogInserts.map(async (catalogItem, index) => {
                    const [result] = await trx(CatalogTableName)
                        .update({
                            embedding_vector: JSON.stringify(embeddings[index]),
                        })
                        .where(
                            'cached_explore_uuid',
                            catalogItem.cached_explore_uuid,
                        )
                        .andWhere('project_uuid', projectUuid)
                        .andWhere('name', catalogItem.name)
                        .andWhere('type', catalogItem.type)
                        .returning('*');

                    return result;
                }),
            ),
        );

        return { catalogInserts: transaction, catalogFieldMap };
    }
}
