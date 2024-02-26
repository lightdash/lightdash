import {
    DashboardSearchResult,
    Explore,
    ExploreError,
    FieldSearchResult,
    hasIntersection,
    isDimension,
    isExploreError,
    NotExistsError,
    SavedChartSearchResult,
    SearchFilters,
    SearchItemType,
    SearchResults,
    SpaceSearchResult,
    TableErrorSearchResult,
    TableSearchResult,
    TableSelectionType,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    DashboardsTableName,
    DashboardVersionsTableName,
} from '../../database/entities/dashboards';
import {
    CachedExploresTableName,
    ProjectTableName,
} from '../../database/entities/projects';
import { SavedChartsTableName } from '../../database/entities/savedCharts';
import { SpaceTableName } from '../../database/entities/spaces';
import { UserTableName } from '../../database/entities/users';
import {
    filterByCreatedAt,
    filterByCreatedByUuid,
    shouldSearchForType,
} from './utils/filters';
import { getFullTextSearchRankCalcSql } from './utils/fullTextSearch';

type ModelDependencies = {
    database: Knex;
};

export class SearchModel {
    private database: Knex;

    constructor(deps: ModelDependencies) {
        this.database = deps.database;
    }

    private async searchSpaces(
        projectUuid: string,
        query: string,
        filters?: SearchFilters,
    ): Promise<SpaceSearchResult[]> {
        if (!shouldSearchForType(SearchItemType.SPACE, filters?.type)) {
            return [];
        }

        const { searchRankRawSql, searchRankColumnName } =
            getFullTextSearchRankCalcSql(
                this.database,
                SpaceTableName,
                'search_vector',
                query,
            );

        const subquery = this.database(SpaceTableName)
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .column({ uuid: 'space_uuid' }, 'spaces.name', searchRankRawSql)
            .where('projects.project_uuid', projectUuid)
            .orderBy(searchRankColumnName, 'desc');

        filterByCreatedAt(SpaceTableName, subquery, filters);
        filterByCreatedByUuid(
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
            .where(searchRankColumnName, '>', 0)
            .limit(10);
    }

    private async searchDashboards(
        projectUuid: string,
        query: string,
        filters?: SearchFilters,
    ): Promise<DashboardSearchResult[]> {
        if (!shouldSearchForType(SearchItemType.DASHBOARD, filters?.type)) {
            return [];
        }

        const { searchRankRawSql, searchRankColumnName } =
            getFullTextSearchRankCalcSql(
                this.database,
                DashboardsTableName,
                'search_vector',
                query,
            );

        const subquery = this.database(DashboardsTableName)
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
            .column(
                { uuid: 'dashboard_uuid' },
                `${DashboardsTableName}.name`,
                `${DashboardsTableName}.description`,
                { spaceUuid: 'space_uuid' },
                searchRankRawSql,
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid)
            .orderBy(searchRankColumnName, 'desc');

        filterByCreatedAt(DashboardsTableName, subquery, filters);
        filterByCreatedByUuid(
            subquery,
            {
                join: {
                    isVersioned: true,
                    joinTableName: DashboardVersionsTableName,
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
            .where(searchRankColumnName, '>', 0)
            .limit(10);

        const dashboardUuids = dashboards.map((dashboard) => dashboard.uuid);

        const validationErrors = await this.database('validations')
            .where('project_uuid', projectUuid)
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

        return dashboards.map((dashboard) => ({
            ...dashboard,
            validationErrors: validationErrors[dashboard.uuid] || [],
        }));
    }

    private async searchSavedCharts(
        projectUuid: string,
        query: string,
        filters?: SearchFilters,
    ): Promise<SavedChartSearchResult[]> {
        if (!shouldSearchForType(SearchItemType.CHART, filters?.type)) {
            return [];
        }

        const { searchRankRawSql, searchRankColumnName } =
            getFullTextSearchRankCalcSql(
                this.database,
                SavedChartsTableName,
                'search_vector',
                query,
            );

        // Needs to be a subquery to be able to use the search rank column to filter out 0 rank results
        const subquery = this.database(SavedChartsTableName)
            .leftJoin(
                SpaceTableName,
                `${SavedChartsTableName}.space_id`,
                `${SpaceTableName}.space_id`,
            )

            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .column(
                { uuid: 'saved_query_uuid' },
                `${SavedChartsTableName}.name`,
                `${SavedChartsTableName}.description`,
                {
                    chartType: `${SavedChartsTableName}.last_version_chart_kind`,
                },
                { spaceUuid: 'space_uuid' },
                searchRankRawSql,
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid)
            .orderBy(searchRankColumnName, 'desc');

        filterByCreatedAt(SavedChartsTableName, subquery, filters);
        filterByCreatedByUuid(
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
            .where(searchRankColumnName, '>', 0)
            .limit(10);

        const chartUuids = savedCharts.map((chart) => chart.uuid);

        const validationErrors = await this.database('validations')
            .where('project_uuid', projectUuid)
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
                        return hasIntersection(
                            explore.tags || [],
                            tableSelection.value || [],
                        );
                    }
                    if (tableSelection.type === TableSelectionType.WITH_NAMES) {
                        return (tableSelection.value || []).includes(
                            explore.name,
                        );
                    }
                    return true;
                },
            );
        }
        return [];
    }

    private static searchTablesAndFields(
        query: string,
        explores: Explore[],
        filters?: SearchFilters,
    ) {
        const shouldSearchForTables = shouldSearchForType(
            SearchItemType.TABLE,
            filters?.type,
        );

        const shouldSearchForFields = shouldSearchForType(
            SearchItemType.FIELD,
            filters?.type,
        );

        const lowerCaseQuery = query.toLowerCase();
        return explores
            .filter((explore) => !isExploreError(explore))
            .reduce<[TableSearchResult[], FieldSearchResult[]]>(
                (acc, explore) =>
                    Object.values(explore.tables).reduce<
                        [TableSearchResult[], FieldSearchResult[]]
                    >(([tables, fields], table) => {
                        if (
                            shouldSearchForTables &&
                            (table.label
                                .toLowerCase()
                                .includes(lowerCaseQuery) ||
                                table.description
                                    ?.toLowerCase()
                                    .includes(lowerCaseQuery))
                        ) {
                            tables.push({
                                name: table.name,
                                label: table.label,
                                description: table.description,
                                explore: explore.name,
                                exploreLabel: explore.label,
                                requiredAttributes: table.requiredAttributes,
                            });
                        }

                        if (shouldSearchForFields) {
                            [
                                ...Object.values(table.dimensions),
                                ...Object.values(table.metrics),
                            ].forEach((field) => {
                                if (
                                    !field.hidden &&
                                    (field.label
                                        .toLowerCase()
                                        .includes(lowerCaseQuery) ||
                                        field.description
                                            ?.toLowerCase()
                                            .includes(lowerCaseQuery))
                                ) {
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
                                    });
                                }
                            });
                        }

                        return [tables, fields];
                    }, acc),
                [[], []],
            );
    }

    private async searchTableErrors(
        projectUuid: string,
        query: string,
        explores: Explore[],
    ): Promise<TableErrorSearchResult[]> {
        const lowerCaseQuery = query.toLowerCase();

        const validationErrors = await this.database('validations')
            .where('project_uuid', projectUuid)
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
            tables: tablesAndErrors,
            fields,
            pages,
        };
    }
}
