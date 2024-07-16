import { SummaryContent } from '@lightdash/common';
import { Knex } from 'knex';
import Logger from '../../logging/logger';
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
    ): Promise<SummaryContent[]> {
        const matchingConfigurations = this.contentConfigurations.filter(
            (config) => config.shouldQueryBeIncluded(filters),
        );
        console.log(
            'matchingConfigurations',
            matchingConfigurations.length,
            filters,
        );
        if (matchingConfigurations.length === 0) {
            return [];
        }

        const query = this.database.select<SummaryContentRow[]>('*');

        matchingConfigurations.forEach((config) => {
            void query.unionAll(config.getSummaryQuery(this.database, filters));
        });

        console.log('query', query.toSQL());
        const results = await query;

        return results.reduce<SummaryContent[]>((acc, result) => {
            const matchingConfig = matchingConfigurations.find((config) =>
                config.shouldRowBeConverted(result),
            );

            if (!matchingConfig) {
                Logger.warn(
                    `No matching configuration found to convert content row with uuid ${result.uuid}`,
                );
            } else {
                acc.push(matchingConfig.convertSummaryRow(result));
            }

            return acc;
        }, []);
    }
}
