import {
    DashboardSearchResult,
    Explore,
    ExploreError,
    FieldSearchResult,
    isExploreError,
    SavedChartSearchResult,
    SearchResults,
    SpaceSearchResult,
    TableSearchResult,
} from '@lightdash/common';
import { Knex } from 'knex';
import { DashboardsTableName } from '../../database/entities/dashboards';
import {
    CachedExploresTableName,
    ProjectTableName,
} from '../../database/entities/projects';
import { SavedChartsTableName } from '../../database/entities/savedCharts';
import { SpaceTableName } from '../../database/entities/spaces';

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
    ): Promise<SpaceSearchResult[]> {
        return this.database(SpaceTableName)
            .select()
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .column({ uuid: 'space_uuid' }, 'spaces.name')
            .where('projects.project_uuid', projectUuid)
            .andWhereRaw(`LOWER(${SpaceTableName}.name) like LOWER(?)`, [
                `%${query}%`,
            ]);
    }

    private async searchDashboards(
        projectUuid: string,
        query: string,
    ): Promise<DashboardSearchResult[]> {
        return this.database(DashboardsTableName)
            .select()
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
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid)
            .andWhere((qB) =>
                qB
                    .whereRaw(
                        `LOWER(${DashboardsTableName}.name) like LOWER(?)`,
                        [`%${query}%`],
                    )
                    .orWhereRaw(
                        `LOWER(${DashboardsTableName}.description) like LOWER(?)`,
                        [`%${query}%`],
                    ),
            );
    }

    private async searchSavedCharts(
        projectUuid: string,
        query: string,
    ): Promise<SavedChartSearchResult[]> {
        return this.database(SavedChartsTableName)
            .select()
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
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid)
            .andWhere((qB) =>
                qB
                    .whereRaw(
                        `LOWER(${SavedChartsTableName}.name) like LOWER(?)`,
                        [`%${query}%`],
                    )
                    .orWhereRaw(
                        `LOWER(${SavedChartsTableName}.description) like LOWER(?)`,
                        [`%${query}%`],
                    ),
            );
    }

    private async searchTablesAndFields(
        projectUuid: string,
        query: string,
    ): Promise<[TableSearchResult[], FieldSearchResult[]]> {
        const explores = await this.database(CachedExploresTableName)
            .select(['explores'])
            .where('project_uuid', projectUuid)
            .limit(1);
        if (explores.length > 0 && explores[0].explores) {
            const lowerCaseQuery = query.toLowerCase();
            return (
                explores[0].explores as Array<Explore | ExploreError>
            ).reduce<[TableSearchResult[], FieldSearchResult[]]>(
                (acc, explore) => {
                    if (!isExploreError(explore)) {
                        return Object.values(explore.tables).reduce<
                            [TableSearchResult[], FieldSearchResult[]]
                        >(([tables, fields], table) => {
                            if (
                                table.label
                                    .toLowerCase()
                                    .includes(lowerCaseQuery) ||
                                table.description
                                    ?.toLowerCase()
                                    .includes(lowerCaseQuery)
                            ) {
                                tables.push({
                                    name: table.name,
                                    label: table.label,
                                    description: table.description,
                                    explore: explore.name,
                                    exploreLabel: explore.label,
                                });
                            }
                            [
                                ...Object.values(table.dimensions),
                                ...Object.values(table.metrics),
                            ].forEach((field) => {
                                if (
                                    field.label
                                        .toLowerCase()
                                        .includes(lowerCaseQuery) ||
                                    field.description
                                        ?.toLowerCase()
                                        .includes(lowerCaseQuery)
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
                                    });
                                }
                            });
                            return [tables, fields];
                        }, acc);
                    }
                    return acc;
                },
                [[], []],
            );
        }
        return [[], []];
    }

    async search(projectUuid: string, query: string): Promise<SearchResults> {
        const spaces = await this.searchSpaces(projectUuid, query);
        const dashboards = await this.searchDashboards(projectUuid, query);
        const savedCharts = await this.searchSavedCharts(projectUuid, query);
        const [tables, fields] = await this.searchTablesAndFields(
            projectUuid,
            query,
        );

        return {
            spaces,
            dashboards,
            savedCharts,
            tables,
            fields,
        };
    }
}
