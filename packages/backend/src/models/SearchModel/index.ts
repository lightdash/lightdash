import {
    AllChartsSearchResult,
    ChartKind,
    DashboardSearchResult,
    DashboardTabResult,
    Explore,
    ExploreError,
    ExploreType,
    FieldSearchResult,
    NotExistsError,
    SavedChartSearchResult,
    SearchFilters,
    SearchItemType,
    SearchResults,
    SpaceSearchResult,
    SqlChartSearchResult,
    TableErrorSearchResult,
    TableSearchResult,
    TableSelectionType,
    hasIntersection,
    isDimension,
    isExploreError,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    DashboardTabsTableName,
    DashboardVersionsTableName,
    DashboardsTableName,
} from '../../database/entities/dashboards';
import {
    CachedExploresTableName,
    ProjectTableName,
} from '../../database/entities/projects';
import { SavedChartsTableName } from '../../database/entities/savedCharts';
import { SavedSqlTableName } from '../../database/entities/savedSql';
import { SpaceTableName } from '../../database/entities/spaces';
import { UserTableName } from '../../database/entities/users';
import {
    filterByCreatedAt,
    filterByCreatedByUuid,
    shouldSearchForType,
} from './utils/filters';
import {
    getFullTextSearchRankCalcSql,
    getRegexFromUserQuery,
    getTableOrFieldMatchCount,
} from './utils/search';

type SearchModelArguments = {
    database: Knex;
};

const SEARCH_LIMIT_PER_ITEM_TYPE = 10;

export class SearchModel {
    private database: Knex;

    constructor(args: SearchModelArguments) {
        this.database = args.database;
    }

    private async searchSpaces(
        projectUuid: string,
        query: string,
        filters?: SearchFilters,
    ): Promise<SpaceSearchResult[]> {
        if (!shouldSearchForType(SearchItemType.SPACE, filters?.type)) {
            return [];
        }

        const searchRankRawSql = getFullTextSearchRankCalcSql({
            database: this.database,
            variables: {
                searchVectorColumn: `${SpaceTableName}.search_vector`,
                searchQuery: query,
            },
        });

        let subquery = this.database(SpaceTableName)
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .column({ uuid: 'space_uuid' }, 'spaces.name', {
                search_rank: searchRankRawSql,
            })
            .where('projects.project_uuid', projectUuid)
            .orderBy('search_rank', 'desc');

        subquery = filterByCreatedAt(SpaceTableName, subquery, filters);
        subquery = filterByCreatedByUuid(
            subquery,
            {
                join: {
                    joinTableName: UserTableName,
                    joinTableIdColumnName: 'user_id',
                    joinTableUserUuidColumnName: 'user_uuid',
                    tableIdColumnName: 'created_by_user_id',
                },
                tableName: SpaceTableName,
            },
            filters,
        );

        return this.database(SpaceTableName)
            .select()
            .from(subquery.as('spaces_with_rank'))
            .where('search_rank', '>', 0)
            .limit(10);
    }

    async searchDashboards(
        projectUuid: string,
        query: string,
        filters?: SearchFilters,
        fullTextSearchOperator: 'OR' | 'AND' = 'AND',
    ): Promise<DashboardSearchResult[]> {
        if (!shouldSearchForType(SearchItemType.DASHBOARD, filters?.type)) {
            return [];
        }

        const dashboardSearchRankRawSql = getFullTextSearchRankCalcSql({
            database: this.database,
            variables: {
                searchVectorColumn: `${DashboardsTableName}.search_vector`,
                searchQuery: query,
            },
            fullTextSearchOperator,
        });

        const directChartSearchRankRawSql = getFullTextSearchRankCalcSql({
            database: this.database,
            variables: {
                searchVectorColumn: 'direct_charts.search_vector',
                searchQuery: query,
            },
            fullTextSearchOperator,
        });

        const tileChartSearchRankRawSql = getFullTextSearchRankCalcSql({
            database: this.database,
            variables: {
                searchVectorColumn: 'tile_charts.search_vector',
                searchQuery: query,
            },
            fullTextSearchOperator,
        });

        let subquery = this.database(DashboardsTableName)
            .leftJoin(
                SpaceTableName,
                `${DashboardsTableName}.space_id`,
                `${SpaceTableName}.space_id`,
            )
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .leftJoin(
                this.database.raw(
                    `${DashboardVersionsTableName} as first_version`,
                ),
                this.database.raw(
                    `first_version.dashboard_id = ${DashboardsTableName}.dashboard_id AND first_version.dashboard_version_id = (SELECT MIN(dashboard_version_id) FROM ${DashboardVersionsTableName} WHERE dashboard_id = ${DashboardsTableName}.dashboard_id)`,
                ),
            )
            .leftJoin(
                this.database.raw(
                    `${DashboardVersionsTableName} as last_version`,
                ),
                this.database.raw(
                    `last_version.dashboard_id = ${DashboardsTableName}.dashboard_id AND last_version.dashboard_version_id = (SELECT MAX(dashboard_version_id) FROM ${DashboardVersionsTableName} WHERE dashboard_id = ${DashboardsTableName}.dashboard_id)`,
                ),
            )
            .leftJoin(
                `${UserTableName} as created_by_user`,
                `created_by_user.user_uuid`,
                `first_version.updated_by_user_uuid`,
            )
            .leftJoin(
                `${UserTableName} as updated_by_user`,
                `updated_by_user.user_uuid`,
                `last_version.updated_by_user_uuid`,
            )
            // Join with charts that belong directly to dashboard
            .leftJoin(
                `${SavedChartsTableName} as direct_charts`,
                `${DashboardsTableName}.dashboard_uuid`,
                'direct_charts.dashboard_uuid',
            )
            // Join with charts that are in dashboard through tiles
            .leftJoin('dashboard_tiles', function () {
                this.on(
                    'dashboard_tiles.dashboard_version_id',
                    '=',
                    `last_version.dashboard_version_id`,
                );
            })
            .leftJoin('dashboard_tile_charts', function () {
                this.on(
                    'dashboard_tile_charts.dashboard_version_id',
                    '=',
                    'dashboard_tiles.dashboard_version_id',
                ).andOn(
                    'dashboard_tile_charts.dashboard_tile_uuid',
                    '=',
                    'dashboard_tiles.dashboard_tile_uuid',
                );
            })
            .leftJoin(
                `${SavedChartsTableName} as tile_charts`,
                'tile_charts.saved_query_id',
                'dashboard_tile_charts.saved_chart_id',
            )
            .column(
                { uuid: `${DashboardsTableName}.dashboard_uuid` },
                `${DashboardsTableName}.name`,
                `${DashboardsTableName}.description`,
                { projectUuid: `${ProjectTableName}.project_uuid` },
                { spaceUuid: `${SpaceTableName}.space_uuid` },
                this.database.raw(
                    `GREATEST(
                        ${dashboardSearchRankRawSql}, 
                        COALESCE(MAX(${directChartSearchRankRawSql}), 0),
                        COALESCE(MAX(${tileChartSearchRankRawSql}), 0)
                    ) as search_rank`,
                ),
                { viewsCount: `${DashboardsTableName}.views_count` },
                { firstViewedAt: `${DashboardsTableName}.first_viewed_at` },
                { lastModified: `last_version.created_at` },
                { createdByFirstName: 'created_by_user.first_name' },
                { createdByLastName: 'created_by_user.last_name' },
                { createdByUserUuid: 'created_by_user.user_uuid' },
                { lastUpdatedByFirstName: 'updated_by_user.first_name' },
                { lastUpdatedByLastName: 'updated_by_user.last_name' },
                { lastUpdatedByUserUuid: 'updated_by_user.user_uuid' },
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid)
            .whereRaw(
                `(${dashboardSearchRankRawSql} > 0 OR ${directChartSearchRankRawSql} > 0 OR ${tileChartSearchRankRawSql} > 0)`,
            )
            .groupBy(
                `${DashboardsTableName}.dashboard_id`,
                `${DashboardsTableName}.dashboard_uuid`,
                `${DashboardsTableName}.name`,
                `${DashboardsTableName}.description`,
                `${ProjectTableName}.project_uuid`,
                `${SpaceTableName}.space_uuid`,
                `${DashboardsTableName}.views_count`,
                `${DashboardsTableName}.first_viewed_at`,
                `last_version.created_at`,
                'created_by_user.first_name',
                'created_by_user.last_name',
                'created_by_user.user_uuid',
                'updated_by_user.first_name',
                'updated_by_user.last_name',
                'updated_by_user.user_uuid',
            )
            .orderBy('search_rank', 'desc');

        subquery = filterByCreatedAt(DashboardsTableName, subquery, filters);
        subquery = filterByCreatedByUuid(
            subquery,
            {
                join: {
                    isVersioned: true,
                    joinTableName: 'first_version',
                    joinTableIdColumnName: 'dashboard_id',
                    joinTableUserUuidColumnName: 'updated_by_user_uuid',
                    tableIdColumnName: 'dashboard_id',
                },
                tableName: DashboardsTableName,
            },
            filters,
        );

        const dashboards = await this.database(DashboardsTableName)
            .select()
            .from(subquery.as('dashboards_with_rank'))
            .where('search_rank', '>', 0)
            .limit(10);

        const dashboardUuids = dashboards.map((dashboard) => dashboard.uuid);

        const validationErrors = await this.database('validations')
            .where('project_uuid', projectUuid)
            .whereNull('job_id')
            .whereIn('dashboard_uuid', dashboardUuids)
            .andWhereNot('dashboard_uuid', null)
            .select('validation_id', 'dashboard_uuid')
            .then((rows) =>
                rows.reduce<Record<string, Array<{ validationId: number }>>>(
                    (acc, row) => {
                        if (row.dashboard_uuid) {
                            acc[row.dashboard_uuid] = [
                                ...(acc[row.dashboard_uuid] ?? []),
                                { validationId: row.validation_id },
                            ];
                        }
                        return acc;
                    },
                    {},
                ),
            );

        const directChartsQuery = this.database(SavedChartsTableName)
            .select(
                'dashboard_uuid',
                { uuid: 'saved_query_uuid' },
                'name',
                'description',
                { chartType: 'last_version_chart_kind' },
                'views_count',
            )
            .whereIn('dashboard_uuid', dashboardUuids);

        const tileChartsQuery = this.database('dashboards')
            .join(
                'dashboard_versions',
                'dashboards.dashboard_id',
                'dashboard_versions.dashboard_id',
            )
            .join(
                'dashboard_tiles',
                'dashboard_versions.dashboard_version_id',
                'dashboard_tiles.dashboard_version_id',
            )
            .join('dashboard_tile_charts', function () {
                this.on(
                    'dashboard_tile_charts.dashboard_version_id',
                    '=',
                    'dashboard_tiles.dashboard_version_id',
                ).andOn(
                    'dashboard_tile_charts.dashboard_tile_uuid',
                    '=',
                    'dashboard_tiles.dashboard_tile_uuid',
                );
            })
            .join(
                SavedChartsTableName,
                `${SavedChartsTableName}.saved_query_id`,
                'dashboard_tile_charts.saved_chart_id',
            )
            .select(
                'dashboards.dashboard_uuid',
                { uuid: `${SavedChartsTableName}.saved_query_uuid` },
                `${SavedChartsTableName}.name`,
                `${SavedChartsTableName}.description`,
                {
                    chartType: `${SavedChartsTableName}.last_version_chart_kind`,
                },
                `${SavedChartsTableName}.views_count`,
            )
            .whereIn('dashboards.dashboard_uuid', dashboardUuids)
            .whereRaw(
                `dashboard_versions.dashboard_version_id = (
                        SELECT MAX(dashboard_version_id) 
                        FROM dashboard_versions dv2 
                        WHERE dv2.dashboard_id = dashboards.dashboard_id
                    )`,
            );

        const [directCharts, tileCharts] =
            dashboardUuids.length > 0
                ? await Promise.all([directChartsQuery, tileChartsQuery])
                : [];

        const dashboardCharts = [
            ...(directCharts ?? []),
            ...(tileCharts ?? []),
        ];

        const chartsByDashboard = dashboardCharts.reduce<
            Record<
                string,
                Array<{
                    uuid: string;
                    name: string;
                    description: string;
                    chartType: string;
                    viewsCount: number;
                }>
            >
        >((acc, chart) => {
            if (!acc[chart.dashboard_uuid]) {
                acc[chart.dashboard_uuid] = [];
            }
            acc[chart.dashboard_uuid].push({
                uuid: chart.uuid,
                name: chart.name,
                description: chart.description,
                chartType: chart.chartType,
                viewsCount: chart.views_count,
            });
            return acc;
        }, {});

        return dashboards.map((dashboard) => ({
            ...dashboard,
            validationErrors: validationErrors[dashboard.uuid] || [],
            viewsCount: dashboard.viewsCount || 0,
            firstViewedAt: dashboard.firstViewedAt || null,
            lastModified: dashboard.lastModified || null,
            createdBy: dashboard.createdByUserUuid
                ? {
                      firstName: dashboard.createdByFirstName,
                      lastName: dashboard.createdByLastName,
                      userUuid: dashboard.createdByUserUuid,
                  }
                : null,
            lastUpdatedBy: dashboard.lastUpdatedByUserUuid
                ? {
                      firstName: dashboard.lastUpdatedByFirstName,
                      lastName: dashboard.lastUpdatedByLastName,
                      userUuid: dashboard.lastUpdatedByUserUuid,
                  }
                : null,
            charts: chartsByDashboard[dashboard.uuid] || [],
        }));
    }

    private async searchDashboardTabs(
        projectUuid: string,
        query: string,
        filters?: SearchFilters,
    ): Promise<DashboardTabResult[]> {
        if (!shouldSearchForType(SearchItemType.DASHBOARD_TAB, filters?.type)) {
            return [];
        }

        const dashboardTabs = await this.database(DashboardTabsTableName)
            .innerJoin(
                DashboardsTableName,
                `${DashboardsTableName}.dashboard_id`,
                `${DashboardTabsTableName}.dashboard_id`,
            )
            .leftJoin(
                SpaceTableName,
                `${DashboardsTableName}.space_id`,
                `${SpaceTableName}.space_id`,
            )
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .column<DashboardTabResult[]>(
                { uuid: `${DashboardTabsTableName}.uuid` },
                { name: `${DashboardTabsTableName}.name` },
                { dashboardUuid: `${DashboardsTableName}.dashboard_uuid` },
                { dashboardName: `${DashboardsTableName}.name` },
                { spaceUuid: `${SpaceTableName}.space_uuid` },
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid)
            .andWhere(
                `${DashboardTabsTableName}.name`,
                'ilike',
                this.database.raw('?', [`%${query}%`]),
            )
            .distinctOn(`${DashboardTabsTableName}.uuid`);

        return dashboardTabs;
    }

    private async searchCharts(
        searchTable: {
            name: string;
            uuidColumnName: string;
        },
        projectUuid: string,
        query: string,
        filters?: SearchFilters,
        fullTextSearchOperator: 'OR' | 'AND' = 'AND',
    ) {
        const { name: tableName, uuidColumnName } = searchTable;

        const searchRankRawSql = getFullTextSearchRankCalcSql({
            database: this.database,
            variables: {
                searchVectorColumn: `${tableName}.search_vector`,
                searchQuery: query,
            },
            fullTextSearchOperator,
        });

        // Needs to be a subquery to be able to use the search rank column to filter out 0 rank results
        let subquery = this.database(tableName)
            .leftJoin(
                DashboardsTableName,
                `${tableName}.dashboard_uuid`,
                `${DashboardsTableName}.dashboard_uuid`,
            )
            .leftJoin(SpaceTableName, function joinSpaces() {
                this.on(
                    `${tableName}.space_uuid`,
                    '=',
                    `${SpaceTableName}.space_uuid`,
                );
                this.orOn(
                    `${DashboardsTableName}.space_id`,
                    '=',
                    `${SpaceTableName}.space_id`,
                );
            })
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .leftJoin(
                `${UserTableName} as created_by_user`,
                `created_by_user.user_uuid`,
                `${tableName}.created_by_user_uuid`,
            )
            .leftJoin(
                `${UserTableName} as updated_by_user`,
                `updated_by_user.user_uuid`,
                `${tableName}.last_version_updated_by_user_uuid`,
            )
            .column(
                { uuid: uuidColumnName },
                `${tableName}.slug`,
                `${tableName}.name`,
                `${tableName}.description`,
                {
                    chartType: `${tableName}.last_version_chart_kind`,
                },
                { spaceUuid: `${tableName}.space_uuid` },
                { projectUuid: `${ProjectTableName}.project_uuid` },
                { viewsCount: `${tableName}.views_count` },
                { firstViewedAt: `${tableName}.first_viewed_at` },
                { lastModified: `${tableName}.last_version_updated_at` },
                { createdByFirstName: 'created_by_user.first_name' },
                { createdByLastName: 'created_by_user.last_name' },
                { createdByUserUuid: 'created_by_user.user_uuid' },
                { lastUpdatedByFirstName: 'updated_by_user.first_name' },
                { lastUpdatedByLastName: 'updated_by_user.last_name' },
                { lastUpdatedByUserUuid: 'updated_by_user.user_uuid' },
                { search_rank: searchRankRawSql },
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid)
            .orderBy('search_rank', 'desc');

        subquery = filterByCreatedAt(tableName, subquery, filters);
        subquery = filterByCreatedByUuid(
            subquery,
            {
                tableName,
                tableUserUuidColumnName: 'created_by_user_uuid',
            },
            filters,
        );

        const charts = await this.database(tableName)
            .select()
            .from(subquery.as('saved_charts_with_rank'))
            .where('search_rank', '>', 0)
            .limit(10);

        return charts.map((chart) => ({
            ...chart,
            chartSource: 'sql' as const,
            viewsCount: chart.viewsCount || 0,
            firstViewedAt: chart.firstViewedAt || null,
            lastModified: chart.lastModified || null,
            createdBy: chart.createdByUserUuid
                ? {
                      firstName: chart.createdByFirstName,
                      lastName: chart.createdByLastName,
                      userUuid: chart.createdByUserUuid,
                  }
                : null,
            lastUpdatedBy: chart.lastUpdatedByUserUuid
                ? {
                      firstName: chart.lastUpdatedByFirstName,
                      lastName: chart.lastUpdatedByLastName,
                      userUuid: chart.lastUpdatedByUserUuid,
                  }
                : null,
        }));
    }

    private async searchSqlCharts(
        projectUuid: string,
        query: string,
        filters?: SearchFilters,
        fullTextSearchOperator: 'OR' | 'AND' = 'AND',
    ): Promise<SqlChartSearchResult[]> {
        if (!shouldSearchForType(SearchItemType.SQL_CHART, filters?.type)) {
            return [];
        }

        return this.searchCharts(
            {
                name: SavedSqlTableName,
                uuidColumnName: 'saved_sql_uuid',
            },
            projectUuid,
            query,
            filters,
            fullTextSearchOperator,
        );
    }

    private async searchSavedCharts(
        projectUuid: string,
        query: string,
        filters?: SearchFilters,
        fullTextSearchOperator: 'OR' | 'AND' = 'AND',
    ): Promise<SavedChartSearchResult[]> {
        if (!shouldSearchForType(SearchItemType.CHART, filters?.type)) {
            return [];
        }

        const searchRankRawSql = getFullTextSearchRankCalcSql({
            database: this.database,
            variables: {
                searchVectorColumn: `${SavedChartsTableName}.search_vector`,
                searchQuery: query,
            },
            fullTextSearchOperator,
        });

        // Needs to be a subquery to be able to use the search rank column to filter out 0 rank results
        let subquery = this.database(SavedChartsTableName)
            .leftJoin(
                DashboardsTableName,
                `${SavedChartsTableName}.dashboard_uuid`,
                `${DashboardsTableName}.dashboard_uuid`,
            )
            .leftJoin(SpaceTableName, function joinSpaces() {
                this.on(
                    `${SavedChartsTableName}.space_id`,
                    '=',
                    `${SpaceTableName}.space_id`,
                );
                this.orOn(
                    `${DashboardsTableName}.space_id`,
                    '=',
                    `${SpaceTableName}.space_id`,
                );
            })
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .leftJoin(
                this.database.raw(`saved_queries_versions as first_version`),
                this.database.raw(
                    `first_version.saved_query_id = ${SavedChartsTableName}.saved_query_id AND first_version.saved_queries_version_id = (SELECT MIN(saved_queries_version_id) FROM saved_queries_versions WHERE saved_query_id = ${SavedChartsTableName}.saved_query_id)`,
                ),
            )
            .leftJoin(
                `${UserTableName} as created_by_user`,
                `created_by_user.user_uuid`,
                `first_version.updated_by_user_uuid`,
            )
            .leftJoin(
                `${UserTableName} as updated_by_user`,
                `updated_by_user.user_uuid`,
                `${SavedChartsTableName}.last_version_updated_by_user_uuid`,
            )
            .column(
                { uuid: 'saved_query_uuid' },
                `${SavedChartsTableName}.name`,
                `${SavedChartsTableName}.description`,
                {
                    chartType: `${SavedChartsTableName}.last_version_chart_kind`,
                },
                { spaceUuid: 'space_uuid' },
                { projectUuid: `${ProjectTableName}.project_uuid` },
                { search_rank: searchRankRawSql },
                { viewsCount: `${SavedChartsTableName}.views_count` },
                { firstViewedAt: `${SavedChartsTableName}.first_viewed_at` },
                {
                    lastModified: `${SavedChartsTableName}.last_version_updated_at`,
                },
                { createdByFirstName: 'created_by_user.first_name' },
                { createdByLastName: 'created_by_user.last_name' },
                { createdByUserUuid: 'created_by_user.user_uuid' },
                { lastUpdatedByFirstName: 'updated_by_user.first_name' },
                { lastUpdatedByLastName: 'updated_by_user.last_name' },
                { lastUpdatedByUserUuid: 'updated_by_user.user_uuid' },
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid)
            .orderBy('search_rank', 'desc');

        subquery = filterByCreatedAt(SavedChartsTableName, subquery, filters);
        subquery = filterByCreatedByUuid(
            subquery,
            {
                tableName: SavedChartsTableName,
                tableUserUuidColumnName: 'last_version_updated_by_user_uuid',
            },
            filters,
        );

        const savedCharts = await this.database(SavedChartsTableName)
            .select()
            .from(subquery.as('saved_charts_with_rank'))
            .where('search_rank', '>', 0)
            .limit(10);

        const chartUuids = savedCharts.map((chart) => chart.uuid);

        const validationErrors = await this.database('validations')
            .where('project_uuid', projectUuid)
            .whereNull('job_id')
            .whereIn('saved_chart_uuid', chartUuids)
            .andWhereNot('saved_chart_uuid', null)
            .select('validation_id', 'saved_chart_uuid')
            .then((rows) =>
                rows.reduce<Record<string, Array<{ validationId: number }>>>(
                    (acc, row) => {
                        if (row.saved_chart_uuid) {
                            acc[row.saved_chart_uuid] = [
                                ...(acc[row.saved_chart_uuid] ?? []),
                                { validationId: row.validation_id },
                            ];
                        }
                        return acc;
                    },
                    {},
                ),
            );

        return savedCharts.map((chart) => ({
            ...chart,
            validationErrors: validationErrors[chart.uuid] || [],
            viewsCount: chart.viewsCount || 0,
            firstViewedAt: chart.firstViewedAt || null,
            lastModified: chart.lastModified || null,
            createdBy: chart.createdByUserUuid
                ? {
                      firstName: chart.createdByFirstName,
                      lastName: chart.createdByLastName,
                      userUuid: chart.createdByUserUuid,
                  }
                : null,
            lastUpdatedBy: chart.lastUpdatedByUserUuid
                ? {
                      firstName: chart.lastUpdatedByFirstName,
                      lastName: chart.lastUpdatedByLastName,
                      userUuid: chart.lastUpdatedByUserUuid,
                  }
                : null,
        }));
    }

    async searchAllCharts(
        projectUuid: string,
        query: string,
        fullTextSearchOperator: 'OR' | 'AND' = 'AND',
    ): Promise<Array<AllChartsSearchResult>> {
        const savedChartsSearchRankRawSql = getFullTextSearchRankCalcSql({
            database: this.database,
            variables: {
                searchVectorColumn: `${SavedChartsTableName}.search_vector`,
                searchQuery: query,
            },
            fullTextSearchOperator,
        });

        const savedChartsSubquery = this.database(SavedChartsTableName)
            .leftJoin(
                DashboardsTableName,
                `${SavedChartsTableName}.dashboard_uuid`,
                `${DashboardsTableName}.dashboard_uuid`,
            )
            .leftJoin(SpaceTableName, function joinSpaces() {
                this.on(
                    `${SavedChartsTableName}.space_id`,
                    '=',
                    `${SpaceTableName}.space_id`,
                );
                this.orOn(
                    `${DashboardsTableName}.space_id`,
                    '=',
                    `${SpaceTableName}.space_id`,
                );
            })
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .leftJoin(
                this.database.raw(
                    `saved_queries_versions as saved_chart_first_version`,
                ),
                this.database.raw(
                    `saved_chart_first_version.saved_query_id = ${SavedChartsTableName}.saved_query_id AND saved_chart_first_version.saved_queries_version_id = (SELECT MIN(saved_queries_version_id) FROM saved_queries_versions WHERE saved_query_id = ${SavedChartsTableName}.saved_query_id)`,
                ),
            )
            .leftJoin(
                `${UserTableName} as saved_chart_created_by_user`,
                `saved_chart_created_by_user.user_uuid`,
                `saved_chart_first_version.updated_by_user_uuid`,
            )
            .leftJoin(
                `${UserTableName} as saved_chart_updated_by_user`,
                `saved_chart_updated_by_user.user_uuid`,
                `${SavedChartsTableName}.last_version_updated_by_user_uuid`,
            )
            .column(
                { uuid: 'saved_query_uuid' },
                `${SavedChartsTableName}.slug`,
                `${SavedChartsTableName}.name`,
                `${SavedChartsTableName}.description`,
                {
                    chartType: `${SavedChartsTableName}.last_version_chart_kind`,
                },
                { spaceUuid: `${SpaceTableName}.space_uuid` },
                { search_rank: savedChartsSearchRankRawSql },
                { projectUuid: `${ProjectTableName}.project_uuid` },
                { viewsCount: `${SavedChartsTableName}.views_count` },
                { firstViewedAt: `${SavedChartsTableName}.first_viewed_at` },
                {
                    lastModified: `${SavedChartsTableName}.last_version_updated_at`,
                },
                {
                    createdByFirstName:
                        'saved_chart_created_by_user.first_name',
                },
                { createdByLastName: 'saved_chart_created_by_user.last_name' },
                { createdByUserUuid: 'saved_chart_created_by_user.user_uuid' },
                {
                    lastUpdatedByFirstName:
                        'saved_chart_updated_by_user.first_name',
                },
                {
                    lastUpdatedByLastName:
                        'saved_chart_updated_by_user.last_name',
                },
                {
                    lastUpdatedByUserUuid:
                        'saved_chart_updated_by_user.user_uuid',
                },
                this.database.raw('? as chart_source', ['saved']),
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid);

        const savedSqlSearchRankRawSql = getFullTextSearchRankCalcSql({
            database: this.database,
            variables: {
                searchVectorColumn: `${SavedSqlTableName}.search_vector`,
                searchQuery: query,
            },
            fullTextSearchOperator,
        });

        const savedSqlSubquery = this.database(SavedSqlTableName)
            .leftJoin(
                DashboardsTableName,
                `${SavedSqlTableName}.dashboard_uuid`,
                `${DashboardsTableName}.dashboard_uuid`,
            )
            .leftJoin(SpaceTableName, function joinSpaces() {
                this.on(
                    `${SavedSqlTableName}.space_uuid`,
                    '=',
                    `${SpaceTableName}.space_uuid`,
                );
                this.orOn(
                    `${DashboardsTableName}.space_id`,
                    '=',
                    `${SpaceTableName}.space_id`,
                );
            })
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .leftJoin(
                `${UserTableName} as sql_chart_created_by_user`,
                `sql_chart_created_by_user.user_uuid`,
                `${SavedSqlTableName}.created_by_user_uuid`,
            )
            .leftJoin(
                `${UserTableName} as sql_chart_updated_by_user`,
                `sql_chart_updated_by_user.user_uuid`,
                `${SavedSqlTableName}.last_version_updated_by_user_uuid`,
            )
            .column(
                { uuid: 'saved_sql_uuid' },
                `${SavedSqlTableName}.slug`,
                `${SavedSqlTableName}.name`,
                `${SavedSqlTableName}.description`,
                {
                    chartType: `${SavedSqlTableName}.last_version_chart_kind`,
                },
                { spaceUuid: `${SavedSqlTableName}.space_uuid` },
                { search_rank: savedSqlSearchRankRawSql },
                { projectUuid: `${ProjectTableName}.project_uuid` },
                // Need to add null values for saved chart specific fields to match union structure
                // Cast nulls to proper types to avoid UNION type mismatch
                this.database.raw('null::integer as "viewsCount"'),
                this.database.raw('null::timestamp as "firstViewedAt"'),
                this.database.raw('null::timestamp as "lastModified"'),
                this.database.raw(
                    'sql_chart_created_by_user.first_name as "createdByFirstName"',
                ),
                this.database.raw(
                    'sql_chart_created_by_user.last_name as "createdByLastName"',
                ),
                this.database.raw(
                    'sql_chart_created_by_user.user_uuid as "createdByUserUuid"',
                ),
                this.database.raw(
                    'sql_chart_updated_by_user.first_name as "lastUpdatedByFirstName"',
                ),
                this.database.raw(
                    'sql_chart_updated_by_user.last_name as "lastUpdatedByLastName"',
                ),
                this.database.raw(
                    'sql_chart_updated_by_user.user_uuid as "lastUpdatedByUserUuid"',
                ),
                this.database.raw('? as chart_source', ['sql']),
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid);

        // Type-safe union by ensuring both subqueries have identical column structure
        const unionQuery = this.database
            .select<{
                uuid: string;
                slug: string;
                name: string;
                description: string;
                chartType: string;
                spaceUuid: string;
                search_rank: number;
                projectUuid: string;
                viewsCount: number;
                firstViewedAt: string;
                lastModified: string;
                createdByFirstName: string;
                createdByLastName: string;
                createdByUserUuid: string;
                lastUpdatedByFirstName: string;
                lastUpdatedByLastName: string;
                lastUpdatedByUserUuid: string;
                chart_source: 'saved' | 'sql';
            }>()
            .from(savedChartsSubquery.as('saved_charts'))
            .unionAll(
                this.database.select().from(savedSqlSubquery.as('saved_sql')),
            );

        const results = await this.database
            .select<
                Array<{
                    uuid: string;
                    slug: string;
                    name: string;
                    description: string;
                    chartType: string;
                    spaceUuid: string;
                    search_rank: number;
                    projectUuid: string;
                    viewsCount: number;
                    firstViewedAt: string;
                    lastModified: string;
                    createdByFirstName: string;
                    createdByLastName: string;
                    createdByUserUuid: string;
                    lastUpdatedByFirstName: string;
                    lastUpdatedByLastName: string;
                    lastUpdatedByUserUuid: string;
                    chart_source: 'saved' | 'sql';
                }>
            >('*')
            .from(unionQuery.as('all_charts_with_rank'))
            .where('search_rank', '>', 0)
            .orderBy('search_rank', 'desc')
            .limit(20);

        return results.map((result) => ({
            uuid: result.uuid,
            slug: result.slug,
            name: result.name,
            description: result.description,
            chartType: result.chartType as ChartKind, // ChartKind type from database
            spaceUuid: result.spaceUuid,
            search_rank: result.search_rank,
            projectUuid: result.projectUuid,
            viewsCount: result.viewsCount || 0,
            firstViewedAt: result.firstViewedAt || null,
            lastModified: result.lastModified || null,
            chartSource: result.chart_source as 'saved' | 'sql',
            createdBy: result.createdByUserUuid
                ? {
                      firstName: result.createdByFirstName,
                      lastName: result.createdByLastName,
                      userUuid: result.createdByUserUuid,
                  }
                : null,
            lastUpdatedBy: result.lastUpdatedByUserUuid
                ? {
                      firstName: result.lastUpdatedByFirstName,
                      lastName: result.lastUpdatedByLastName,
                      userUuid: result.lastUpdatedByUserUuid,
                  }
                : null,
        }));
    }

    private async getProjectExplores(projectUuid: string): Promise<Explore[]> {
        const projects = await this.database(ProjectTableName)
            .select(['table_selection_type', 'table_selection_value'])
            .where('project_uuid', projectUuid)
            .limit(1);
        if (projects.length === 0) {
            throw new NotExistsError(
                `Cannot find project with id: ${projectUuid}`,
            );
        }
        const tableSelection = {
            type: projects[0].table_selection_type,
            value: projects[0].table_selection_value,
        };

        const explores = await this.database(CachedExploresTableName)
            .select(['explores'])
            .where('project_uuid', projectUuid)
            .limit(1);

        if (explores.length > 0 && explores[0].explores) {
            return explores[0].explores.filter(
                (explore: Explore | ExploreError) => {
                    if (tableSelection.type === TableSelectionType.WITH_TAGS) {
                        return (
                            hasIntersection(
                                explore.tags || [],
                                tableSelection.value || [],
                            ) || explore.type === ExploreType.VIRTUAL
                        );
                    }
                    if (tableSelection.type === TableSelectionType.WITH_NAMES) {
                        return (
                            (tableSelection.value || []).includes(
                                explore.name,
                            ) || explore.type === ExploreType.VIRTUAL
                        );
                    }
                    return true;
                },
            );
        }
        return [];
    }

    static searchTablesAndFields(
        query: string,
        explores: Explore[],
        filters?: SearchFilters,
    ): [TableSearchResult[], FieldSearchResult[]] {
        const shouldSearchForTables = shouldSearchForType(
            SearchItemType.TABLE,
            filters?.type,
        );

        const shouldSearchForFields = shouldSearchForType(
            SearchItemType.FIELD,
            filters?.type,
        );

        // Building regex to match any of the words in the query and then using it to match against the label and description
        // results are sorted by the number of matches - we create a set out of the matches to remove duplicates
        const queryRegex = getRegexFromUserQuery(query);

        const [unsortedTables, unsortedFields] = explores
            .filter((explore) => !isExploreError(explore))
            .reduce<[TableSearchResult[], FieldSearchResult[]]>(
                (acc, explore) =>
                    Object.values(explore.tables).reduce<
                        [TableSearchResult[], FieldSearchResult[]]
                    >(([tables, fields], table) => {
                        const tableRegexMatchCount = getTableOrFieldMatchCount(
                            queryRegex,
                            table,
                        );

                        if (shouldSearchForTables && tableRegexMatchCount > 0) {
                            tables.push({
                                name: table.name,
                                label: table.label,
                                description: table.description,
                                explore: explore.name,
                                exploreLabel: explore.label,
                                requiredAttributes: table.requiredAttributes,
                                regexMatchCount: tableRegexMatchCount,
                            });
                        }

                        if (shouldSearchForFields) {
                            [
                                ...Object.values(table.dimensions),
                                ...Object.values(table.metrics),
                            ].forEach((field) => {
                                const fieldRegexMatchCount =
                                    getTableOrFieldMatchCount(
                                        queryRegex,
                                        field,
                                    );

                                if (!field.hidden && fieldRegexMatchCount > 0) {
                                    fields.push({
                                        name: field.name,
                                        label: field.label,
                                        description: field.description,
                                        type: field.type,
                                        fieldType: field.fieldType,
                                        table: field.table,
                                        tableLabel: field.tableLabel,
                                        explore: explore.name,
                                        exploreLabel: explore.label,
                                        requiredAttributes: isDimension(field)
                                            ? field.requiredAttributes
                                            : undefined,
                                        tablesRequiredAttributes:
                                            field.tablesRequiredAttributes,
                                        regexMatchCount: fieldRegexMatchCount,
                                    });
                                }
                            });
                        }

                        return [tables, fields];
                    }, acc),
                [[], []],
            );

        const sortedTables = unsortedTables
            .sort((a, b) => b.regexMatchCount - a.regexMatchCount)
            .slice(0, SEARCH_LIMIT_PER_ITEM_TYPE);

        const sortedFields = unsortedFields
            .sort((a, b) => b.regexMatchCount - a.regexMatchCount)
            .slice(0, SEARCH_LIMIT_PER_ITEM_TYPE);

        return [sortedTables, sortedFields];
    }

    private async searchTableErrors(
        projectUuid: string,
        query: string,
        explores: Explore[],
    ): Promise<TableErrorSearchResult[]> {
        const lowerCaseQuery = query.toLowerCase();

        const validationErrors = await this.database('validations')
            .where('project_uuid', projectUuid)
            .whereNull('job_id')
            .whereNotNull('model_name')
            .select('validation_id', 'model_name')
            .then((rows) =>
                rows.reduce<Record<string, Array<{ validationId: number }>>>(
                    (acc, row) => {
                        if (row.model_name) {
                            acc[row.model_name] = [
                                ...(acc[row.model_name] ?? []),
                                { validationId: row.validation_id },
                            ];
                        }
                        return acc;
                    },
                    {},
                ),
            );

        return explores.reduce<TableErrorSearchResult[]>((acc, explore) => {
            if (
                isExploreError(explore) &&
                explore.name.toLowerCase().includes(lowerCaseQuery) &&
                explore.name in validationErrors
            ) {
                return [
                    ...acc,
                    {
                        explore: explore.name,
                        exploreLabel: explore.label,
                        validationErrors: validationErrors[explore.name],
                    },
                ];
            }
            return acc;
        }, []);
    }

    private static searchPages(
        projectUuid: string,
        query: string,
        filters?: SearchFilters,
    ) {
        if (!shouldSearchForType(SearchItemType.PAGE, filters?.type)) {
            return [];
        }

        const allPages = [
            {
                uuid: `user-activity`,
                name: 'User activity',
                url: `/projects/${projectUuid}/user-activity`,
            },
        ];

        return allPages.filter((page) =>
            page.name?.toLowerCase().includes(query.toLowerCase()),
        );
    }

    async search(
        projectUuid: string,
        query: string,
        filters?: SearchFilters,
    ): Promise<SearchResults> {
        const spaces = await this.searchSpaces(projectUuid, query, filters);
        const dashboards = await this.searchDashboards(
            projectUuid,
            query,
            filters,
        );
        const savedCharts = await this.searchSavedCharts(
            projectUuid,
            query,
            filters,
        );
        const sqlCharts = await this.searchSqlCharts(
            projectUuid,
            query,
            filters,
        );
        const dashboardTabs = await this.searchDashboardTabs(
            projectUuid,
            query,
            filters,
        );

        const explores = await this.getProjectExplores(projectUuid);
        const tableErrors = await this.searchTableErrors(
            projectUuid,
            query,
            explores,
        );
        const [tables, fields] = SearchModel.searchTablesAndFields(
            query,
            explores,
            filters,
        );

        const tablesAndErrors = [...tables, ...tableErrors];
        const pages = SearchModel.searchPages(projectUuid, query, filters);

        return {
            spaces,
            dashboards,
            savedCharts,
            sqlCharts,
            tables: tablesAndErrors,
            fields,
            pages,
            dashboardTabs,
        };
    }
}
