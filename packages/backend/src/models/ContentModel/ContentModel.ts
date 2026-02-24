import {
    assertUnreachable,
    ChartKind,
    ChartSourceType,
    ContentType,
    DeletedContentWithDescendants,
    KnexPaginateArgs,
    KnexPaginatedData,
    SummaryContentBase,
} from '@lightdash/common';
import { Knex } from 'knex';
import KnexPaginate from '../../database/pagination';
import { dashboardContentConfiguration } from './ContentConfigurations/DashboardContentConfiguration';
import { dbtExploreChartContentConfiguration } from './ContentConfigurations/DbtExploreChartContentConfiguration';
import { spaceContentConfiguration } from './ContentConfigurations/SpaceContentConfiguration';
import { sqlChartContentConfiguration } from './ContentConfigurations/SqlChartContentConfiguration';
import {
    ContentArgs,
    ContentFilters,
    SummaryContentRow,
} from './ContentModelTypes';

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
        spaceContentConfiguration,
    ];

    constructor(args: { database: Knex }) {
        this.database = args.database;
    }

    getDatabase() {
        return this.database;
    }

    async findSummaryContents(
        filters: ContentFilters,
        queryArgs: ContentArgs,
        paginateArgs?: KnexPaginateArgs,
    ): Promise<KnexPaginatedData<SummaryContentBase[]>> {
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

        if (queryArgs.sortBy) {
            void query.orderBy([
                {
                    column: 'content_type_rank',
                    order: 'ASC',
                },
                {
                    column: queryArgs.sortBy,
                    order: queryArgs.sortDirection ?? 'DESC',
                },
            ]);
        } else {
            void query.orderBy([
                {
                    column: 'content_type_rank',
                    order: 'ASC',
                },
                {
                    column: 'last_updated_at',
                    order: 'DESC',
                },
            ]);
        }

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

    async findDeletedContents(
        filters: ContentFilters,
        paginateArgs?: KnexPaginateArgs,
    ): Promise<KnexPaginatedData<DeletedContentWithDescendants[]>> {
        const deletedFilters: ContentFilters = {
            ...filters,
            deleted: true,
            includeDescendantCounts: true,
        };
        const matchingConfigurations = this.contentConfigurations.filter(
            (config) => config.shouldQueryBeIncluded(deletedFilters),
        );

        if (matchingConfigurations.length === 0) {
            return { data: [] };
        }

        const query = this.database.select<SummaryContentRow[]>('*');

        matchingConfigurations.forEach((config) => {
            void query.unionAll(
                config.getSummaryQuery(this.database, deletedFilters),
            );
        });

        void query.orderBy('deleted_at', 'desc');

        const { pagination, data } = await KnexPaginate.paginate(
            query,
            paginateArgs,
        );

        return {
            pagination,
            data: data.map((row): DeletedContentWithDescendants => {
                const matchingConfig = matchingConfigurations.find((config) =>
                    config.shouldRowBeConverted(row),
                );
                if (!matchingConfig) {
                    throw new Error(
                        `No matching configuration found for deleted content row with uuid ${row.uuid}`,
                    );
                }
                return ContentModel.convertToDeletedSummary(row);
            }),
        };
    }

    private static convertToDeletedSummary(
        row: SummaryContentRow,
    ): DeletedContentWithDescendants {
        const deletedBy = row.deleted_by_user_uuid
            ? {
                  userUuid: row.deleted_by_user_uuid,
                  firstName: row.deleted_by_user_first_name ?? '',
                  lastName: row.deleted_by_user_last_name ?? '',
              }
            : null;
        const base = {
            uuid: row.uuid,
            name: row.name,
            description: row.description,
            deletedAt: row.deleted_at ?? new Date(),
            deletedBy,
            spaceUuid: row.space_uuid,
            spaceName: row.space_name,
            projectUuid: row.project_uuid,
            organizationUuid: row.organization_uuid,
        };

        switch (row.content_type) {
            case ContentType.CHART: {
                const source = row.metadata.source as ChartSourceType;
                const chartBase = {
                    ...base,
                    contentType: ContentType.CHART as const,
                    chartKind: (row.metadata.chart_kind as ChartKind) ?? null,
                };
                switch (source) {
                    case ChartSourceType.DBT_EXPLORE:
                        return {
                            ...chartBase,
                            source,
                            schedulerCount: Number(
                                row.metadata.schedulerCount ?? 0,
                            ),
                        };
                    case ChartSourceType.SQL:
                        return {
                            ...chartBase,
                            source,
                        };
                    default:
                        return assertUnreachable(
                            source,
                            `Unknown chart source: ${source}`,
                        );
                }
            }
            case ContentType.DASHBOARD:
                return {
                    ...base,
                    contentType: ContentType.DASHBOARD,
                    chartCount: Number(row.metadata.chartCount ?? 0),
                    schedulerCount: Number(row.metadata.schedulerCount ?? 0),
                };
            case ContentType.SPACE:
                return {
                    ...base,
                    contentType: ContentType.SPACE,
                    nestedSpaceCount: Number(
                        row.metadata.nestedSpaceCount ?? 0,
                    ),
                    dashboardCount: Number(row.metadata.dashboardCount ?? 0),
                    chartCount: Number(row.metadata.chartCount ?? 0),
                    schedulerCount: Number(row.metadata.schedulerCount ?? 0),
                };
            default:
                throw new Error(
                    `Unexpected content type in deleted results: ${row.content_type}`,
                );
        }
    }
}
