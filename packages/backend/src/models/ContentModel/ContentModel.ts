import {
    KnexPaginateArgs,
    KnexPaginatedData,
    SummaryContent,
} from '@lightdash/common';
import { Knex } from 'knex';
import KnexPaginate from '../../database/pagination';
import { dashboardContentConfiguration } from './ContentConfigurations/DashboardContentConfiguration';
import { dbtExploreChartContentConfiguration } from './ContentConfigurations/DbtExploreChartContentConfiguration';
import { sqlChartContentConfiguration } from './ContentConfigurations/SqlChartContentConfiguration';
import { ContentFilters, SummaryContentRow } from './ContentModelTypes';

/**
 Content model is responsible for fetching all content types in a single query, leveraging UNION ALL clauses.
 It uses content configurations to determine which queries to run and how to convert the results.
 The queries need to have the exact same columns! Any additional data needs to be inside the metadata jsonb column.

 If you want to add a new content type, you need to create a new content configuration and add it to the contentConfigurations array.
 */
export class ContentModel {
    private database: Knex;

    private contentConfigurations = [
        sqlChartContentConfiguration,
        dbtExploreChartContentConfiguration,
        dashboardContentConfiguration,
    ];

    constructor(args: { database: Knex }) {
        this.database = args.database;
    }

    async findSummaryContents(
        filters: ContentFilters,
        paginateArgs?: KnexPaginateArgs,
    ): Promise<KnexPaginatedData<SummaryContent[]>> {
        const matchingConfigurations = this.contentConfigurations.filter(
            (config) => config.shouldQueryBeIncluded(filters),
        );

        if (matchingConfigurations.length === 0) {
            return {
                data: [],
            };
        }

        const query = this.database.select<SummaryContentRow[]>('*');

        matchingConfigurations.forEach((config) => {
            void query.unionAll(config.getSummaryQuery(this.database, filters));
        });

        const { pagination, data } = await KnexPaginate.paginate(
            query,
            paginateArgs,
        );

        return {
            pagination,
            data: data.map((result) => {
                const matchingConfig = matchingConfigurations.find((config) =>
                    config.shouldRowBeConverted(result),
                );

                if (!matchingConfig) {
                    throw new Error(
                        `No matching configuration found to convert content row with uuid ${result.uuid}`,
                    );
                }

                return matchingConfig.convertSummaryRow(result);
            }),
        };
    }
}
