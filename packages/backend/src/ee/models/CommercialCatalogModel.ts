import {
    AnyType,
    CatalogType,
    Explore,
    type ExploreError,
    type TablesConfiguration,
    type UserAttributeValueMap,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    CatalogTableName,
    type DbCatalog,
} from '../../database/entities/catalog';
import { DbTag } from '../../database/entities/tags';
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

    async indexCatalog(
        projectUuid: string,
        cachedExploreMap: { [exploreUuid: string]: Explore | ExploreError },
        projectYamlTags: DbTag[],
        userUuid: string | undefined,
    ): ReturnType<typeof CatalogModel.prototype.indexCatalog> {
        const result = await super.indexCatalog(
            projectUuid,
            cachedExploreMap,
            projectYamlTags,
            userUuid,
        );

        return result;

        // const { enabled: copilotEnabled, embeddingSearchEnabled } =
        //     this.lightdashConfig.ai.copilot;

        // if (!copilotEnabled || !embeddingSearchEnabled) {
        //   return { catalogInserts, catalogFieldMap };
        // }

        // if (!embedderFn) {
        //     throw new UnexpectedServerError(
        //         'Embedder function is not provided',
        //     );
        // }

        // const embeddings = await embedderFn(
        //     catalogInserts.map((catalogItem) => ({
        //         name: catalogItem.name,
        //         description: catalogItem.description ?? '',
        //     })),
        // );

        // const transaction = await this.database.transaction((trx) =>
        //     Promise.all(
        //         catalogInserts.map(async (catalogItem, index) => {
        //             const [result] = await trx(CatalogTableName)
        //                 .update({
        //                     embedding_vector: JSON.stringify(embeddings[index]),
        //                 })
        //                 .where(
        //                     'cached_explore_uuid',
        //                     catalogItem.cached_explore_uuid,
        //                 )
        //                 .andWhere('project_uuid', projectUuid)
        //                 .andWhere('name', catalogItem.name)
        //                 .andWhere('type', catalogItem.type)
        //                 .returning('*');

        //             return result;
        //         }),
        //     ),
        // );

        // return { catalogInserts: transaction, catalogFieldMap };
    }
}
