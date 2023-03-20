import {
    ChartConfig,
    ChartType,
    DashboardBasicDetails,
    getChartType,
    NotFoundError,
    OrganizationMemberRole,
    ProjectMemberRole,
    Space,
    SpaceQuery,
    SpaceShare,
    UpdateSpace,
} from '@lightdash/common';
import { Knex } from 'knex';
import { getProjectRoleOrInheritedFromOrganization } from '../controllers/authenticationRoles';
import {
    AnalyticsChartViewsTableName,
    AnalyticsDashboardViewsTableName,
} from '../database/entities/analytics';
import {
    DashboardsTableName,
    DashboardVersionsTableName,
} from '../database/entities/dashboards';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import {
    DbOrganization,
    OrganizationTableName,
} from '../database/entities/organizations';
import {
    DbPinnedList,
    PinnedChartTableName,
    PinnedDashboardTableName,
    PinnedListTableName,
    PinnedSpaceTableName,
} from '../database/entities/pinnedList';
import { ProjectMembershipsTableName } from '../database/entities/projectMemberships';
import { DbProject, ProjectTableName } from '../database/entities/projects';
import { SavedChartsTableName } from '../database/entities/savedCharts';
import {
    DbSpace,
    SpaceShareTableName,
    SpaceTableName,
} from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';
import { GetDashboardDetailsQuery } from './DashboardModel/DashboardModel';

type Dependencies = {
    database: Knex;
};

export class SpaceModel {
    private database: Knex;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
    }

    async get(
        spaceUuid: string,
    ): Promise<Omit<Space, 'queries' | 'dashboards' | 'access'>> {
        const [row] = await this.database(SpaceTableName)
            .leftJoin('projects', 'projects.project_id', 'spaces.project_id')
            .leftJoin(
                'organizations',
                'organizations.organization_id',
                'projects.organization_id',
            )
            .leftJoin(
                PinnedSpaceTableName,
                `${PinnedSpaceTableName}.space_uuid`,
                `${SpaceTableName}.space_uuid`,
            )
            .leftJoin(
                PinnedListTableName,
                `${PinnedListTableName}.pinned_list_uuid`,
                `${PinnedSpaceTableName}.pinned_list_uuid`,
            )
            .where(`${SpaceTableName}.space_uuid`, spaceUuid)
            .select<
                (DbSpace &
                    DbProject &
                    DbOrganization &
                    Pick<DbPinnedList, 'pinned_list_uuid'>)[]
            >([
                'spaces.*',

                'projects.project_uuid',
                'organizations.organization_uuid',

                `${PinnedListTableName}.pinned_list_uuid`,
            ]);
        if (row === undefined)
            throw new NotFoundError(
                `space with spaceUuid ${spaceUuid} does not exist`,
            );

        return {
            organizationUuid: row.organization_uuid,
            name: row.name,
            isPrivate: row.is_private,
            uuid: row.space_uuid,
            projectUuid: row.project_uuid,
            pinnedListUuid: row.pinned_list_uuid,
        };
    }

    async getSpaceDashboards(
        spaceUuid: string,
    ): Promise<DashboardBasicDetails[]> {
        const dashboards = await this.database
            .table(DashboardsTableName)
            .leftJoin(
                SpaceTableName,
                `${DashboardsTableName}.space_id`,
                `${SpaceTableName}.space_id`,
            )
            .leftJoin(
                DashboardVersionsTableName,
                `${DashboardsTableName}.dashboard_id`,
                `${DashboardVersionsTableName}.dashboard_id`,
            )
            .leftJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${DashboardVersionsTableName}.updated_by_user_uuid`,
            )
            .innerJoin(
                ProjectTableName,
                `${SpaceTableName}.project_id`,
                `${ProjectTableName}.project_id`,
            )
            .innerJoin(
                OrganizationTableName,
                `${ProjectTableName}.organization_id`,
                `${OrganizationTableName}.organization_id`,
            )
            .leftJoin(
                PinnedDashboardTableName,
                `${PinnedDashboardTableName}.dashboard_uuid`,
                `${DashboardsTableName}.dashboard_uuid`,
            )
            .leftJoin(
                PinnedListTableName,
                `${PinnedListTableName}.pinned_list_uuid`,
                `${PinnedDashboardTableName}.pinned_list_uuid`,
            )
            .select<
                (GetDashboardDetailsQuery & {
                    views: string;
                    first_viewed_at: Date | null;
                })[]
            >([
                `${DashboardsTableName}.dashboard_uuid`,
                `${DashboardsTableName}.name`,
                `${DashboardsTableName}.description`,
                `${ProjectTableName}.project_uuid`,
                `${UserTableName}.user_uuid`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                `${DashboardVersionsTableName}.created_at`,
                `${OrganizationTableName}.organization_uuid`,
                `${SpaceTableName}.space_uuid`,
                this.database.raw(
                    `(SELECT COUNT('${AnalyticsDashboardViewsTableName}.dashboard_uuid') FROM ${AnalyticsDashboardViewsTableName} where ${AnalyticsDashboardViewsTableName}.dashboard_uuid = ${DashboardsTableName}.dashboard_uuid) as views`,
                ),
                this.database.raw(
                    `(SELECT ${AnalyticsDashboardViewsTableName}.timestamp FROM ${AnalyticsDashboardViewsTableName} where ${AnalyticsDashboardViewsTableName}.dashboard_uuid = ${DashboardsTableName}.dashboard_uuid ORDER BY ${AnalyticsDashboardViewsTableName}.timestamp ASC LIMIT 1) as first_viewed_at`,
                ),
                `${PinnedListTableName}.pinned_list_uuid`,
            ])
            .orderBy([
                {
                    column: `${DashboardVersionsTableName}.dashboard_id`,
                },
                {
                    column: `${DashboardVersionsTableName}.created_at`,
                    order: 'desc',
                },
            ])
            .distinctOn(`${DashboardVersionsTableName}.dashboard_id`)
            .where(`${SpaceTableName}.space_uuid`, spaceUuid);

        return dashboards.map(
            ({
                name,
                description,
                dashboard_uuid,
                created_at,
                project_uuid,
                user_uuid,
                first_name,
                last_name,
                organization_uuid,
                views,
                first_viewed_at,
                pinned_list_uuid,
            }) => ({
                organizationUuid: organization_uuid,
                name,
                description,
                uuid: dashboard_uuid,
                projectUuid: project_uuid,
                updatedAt: created_at,
                updatedByUser: {
                    userUuid: user_uuid,
                    firstName: first_name,
                    lastName: last_name,
                },
                spaceUuid,
                views: parseInt(views, 10),
                firstViewedAt: first_viewed_at,
                pinnedListUuid: pinned_list_uuid,
            }),
        );
    }

    async getSpaceAccess(spaceUuid: string): Promise<SpaceShare[]> {
        const access = await this.database
            .table(SpaceShareTableName)
            .leftJoin(
                SpaceTableName,
                `${SpaceShareTableName}.space_id`,
                `${SpaceTableName}.space_id`,
            )
            .leftJoin(
                UserTableName,
                `${UserTableName}.user_id`,
                `${SpaceShareTableName}.user_id`,
            )
            .leftJoin(
                ProjectTableName,
                `${SpaceTableName}.project_id`,
                `${ProjectTableName}.project_id`,
            )
            .leftJoin(
                OrganizationMembershipsTableName,
                `${OrganizationMembershipsTableName}.user_id`,
                `${UserTableName}.user_id`,
            )
            .leftJoin(
                ProjectMembershipsTableName,
                `${UserTableName}.user_id`,
                `${ProjectMembershipsTableName}.user_id`,
            )
            .select<
                {
                    user_uuid: string;
                    first_name: string;
                    last_name: string;

                    project_role: ProjectMemberRole;
                    organization_role: OrganizationMemberRole;
                }[]
            >([
                `users.user_uuid`,
                `users.first_name`,
                `users.last_name`,

                `${ProjectMembershipsTableName}.role as project_role`,
                `${OrganizationMembershipsTableName}.role as organization_role`,
            ])
            .distinctOn(`users.user_uuid`)
            .where(`${SpaceTableName}.space_uuid`, spaceUuid);

        return access.map(
            ({
                user_uuid,
                first_name,
                last_name,
                project_role,
                organization_role,
            }) => ({
                userUuid: user_uuid,
                firstName: first_name,
                lastName: last_name,
                role: getProjectRoleOrInheritedFromOrganization(
                    project_role,
                    organization_role,
                ),
            }),
        );
    }

    async getSpaceQueries(spaceUuid: string): Promise<SpaceQuery[]> {
        const savedQueries = await this.database('saved_queries')
            .leftJoin(
                SpaceTableName,
                `saved_queries.space_id`,
                `${SpaceTableName}.space_id`,
            )
            .leftJoin(
                'saved_queries_versions',
                `saved_queries.saved_query_id`,
                `saved_queries_versions.saved_query_id`,
            )
            .leftJoin(
                'users',
                'saved_queries_versions.updated_by_user_uuid',
                'users.user_uuid',
            )
            .leftJoin(
                PinnedChartTableName,
                `${PinnedChartTableName}.saved_chart_uuid`,
                `${SavedChartsTableName}.saved_query_uuid`,
            )
            .leftJoin(
                PinnedListTableName,
                `${PinnedListTableName}.pinned_list_uuid`,
                `${PinnedChartTableName}.pinned_list_uuid`,
            )
            .select<
                {
                    saved_query_uuid: string;
                    name: string;
                    description?: string;
                    created_at: Date;
                    user_uuid: string;
                    first_name: string;
                    last_name: string;
                    views: string;
                    first_viewed_at: Date | null;
                    chart_config: ChartConfig['config'];
                    chart_type: ChartType;
                    pinned_list_uuid: string;
                }[]
            >([
                `saved_queries.saved_query_uuid`,
                `saved_queries.name`,
                `saved_queries.description`,
                `saved_queries_versions.created_at`,
                `users.user_uuid`,
                `users.first_name`,
                `users.last_name`,
                this.database.raw(
                    `(SELECT COUNT('${AnalyticsChartViewsTableName}.chart_uuid') FROM ${AnalyticsChartViewsTableName} WHERE ${AnalyticsChartViewsTableName}.chart_uuid = saved_queries.saved_query_uuid) as views`,
                ),
                this.database.raw(
                    `(SELECT ${AnalyticsChartViewsTableName}.timestamp FROM ${AnalyticsChartViewsTableName} WHERE ${AnalyticsChartViewsTableName}.chart_uuid = saved_queries.saved_query_uuid ORDER BY ${AnalyticsChartViewsTableName}.timestamp ASC LIMIT 1) as first_viewed_at`,
                ),
                `saved_queries_versions.chart_config`,
                `saved_queries_versions.chart_type`,
                `${PinnedListTableName}.pinned_list_uuid`,
            ])
            .orderBy([
                {
                    column: `saved_queries_versions.saved_query_id`,
                },
                {
                    column: `saved_queries_versions.created_at`,
                    order: 'desc',
                },
            ])
            .distinctOn(`saved_queries_versions.saved_query_id`)
            .where(`${SpaceTableName}.space_uuid`, spaceUuid);

        return savedQueries.map((savedQuery) => ({
            uuid: savedQuery.saved_query_uuid,
            name: savedQuery.name,
            description: savedQuery.description,
            updatedAt: savedQuery.created_at,
            updatedByUser: {
                userUuid: savedQuery.user_uuid,
                firstName: savedQuery.first_name,
                lastName: savedQuery.last_name,
            },
            spaceUuid,
            views: parseInt(savedQuery.views, 10),
            firstViewedAt: savedQuery.first_viewed_at,
            chartType: getChartType(
                savedQuery.chart_type,
                savedQuery.chart_config,
            ),
            pinnedListUuid: savedQuery.pinned_list_uuid,
        }));
    }

    // eslint-disable-next-line class-methods-use-this
    async getAllSpaces(projectUuid: string): Promise<Space[]> {
        const results = await this.database(SpaceTableName)
            .innerJoin('projects', 'projects.project_id', 'spaces.project_id')
            .innerJoin(
                'organizations',
                'organizations.organization_id',
                'projects.organization_id',
            )
            .leftJoin(
                PinnedSpaceTableName,
                `${PinnedSpaceTableName}.space_uuid`,
                `${SpaceTableName}.space_uuid`,
            )
            .leftJoin(
                PinnedListTableName,
                `${PinnedListTableName}.pinned_list_uuid`,
                `${PinnedSpaceTableName}.pinned_list_uuid`,
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid)
            .select<
                (DbSpace &
                    DbProject &
                    DbOrganization &
                    Pick<DbPinnedList, 'pinned_list_uuid'>)[]
            >([
                'spaces.*',
                'projects.project_uuid',
                'organizations.organization_uuid',
                `${PinnedListTableName}.pinned_list_uuid`,
            ]);
        return Promise.all(
            results.map(async (row) => ({
                organizationUuid: row.organization_uuid,
                name: row.name,
                isPrivate: row.is_private,
                uuid: row.space_uuid,
                projectUuid: row.project_uuid,
                pinnedListUuid: row.pinned_list_uuid,
                queries: await this.getSpaceQueries(row.space_uuid),
                dashboards: await this.getSpaceDashboards(row.space_uuid),
                access: await this.getSpaceAccess(row.space_uuid),
            })),
        );
    }

    async getFullSpace(spaceUuid: string): Promise<Space> {
        const space = await this.get(spaceUuid);
        return {
            organizationUuid: space.organizationUuid,
            name: space.name,
            uuid: space.uuid,
            isPrivate: space.isPrivate,
            projectUuid: space.projectUuid,
            pinnedListUuid: space.pinnedListUuid,
            queries: await this.getSpaceQueries(space.uuid),
            dashboards: await this.getSpaceDashboards(space.uuid),
            access: await this.getSpaceAccess(space.uuid),
        };
    }

    async createSpace(
        projectUuid: string,
        name: string,
        userId: number,
        isPrivate: boolean,
    ): Promise<Space> {
        const [project] = await this.database('projects')
            .select('project_id')
            .where('project_uuid', projectUuid);

        const [space] = await this.database(SpaceTableName)
            .insert({
                project_id: project.project_id,
                is_private: isPrivate,
                name,
                created_by_user_id: userId,
            })
            .returning('*');

        return {
            organizationUuid: space.organization_uuid,
            name: space.name,
            queries: [],
            isPrivate: space.is_private,
            uuid: space.space_uuid,
            projectUuid,
            dashboards: [],
            access: [],
            pinnedListUuid: null,
        };
    }

    async deleteSpace(spaceUuid: string): Promise<void> {
        await this.database(SpaceTableName)
            .where('space_uuid', spaceUuid)
            .delete();
    }

    async update(spaceUuid: string, space: UpdateSpace): Promise<Space> {
        await this.database(SpaceTableName)
            .update<UpdateSpace>({
                name: space.name,
                is_private: space.isPrivate,
            })
            .where('space_uuid', spaceUuid);
        return this.getFullSpace(spaceUuid);
    }

    async addSpaceAccess(spaceUuid: string, userUuid: string): Promise<void> {
        const [space] = await this.database('spaces')
            .select('space_id')
            .where('space_uuid', spaceUuid);

        const [user] = await this.database('users')
            .select('user_id')
            .where('user_uuid', userUuid);

        await this.database(SpaceShareTableName)
            .insert({
                space_id: space.space_id,
                user_id: user.user_id,
            })
            .onConflict(['user_id', 'space_id'])
            .merge();
    }

    async removeSpaceAccess(
        spaceUuid: string,
        userUuid: string,
    ): Promise<void> {
        const [space] = await this.database('spaces')
            .select('space_id')
            .where('space_uuid', spaceUuid);

        const [user] = await this.database('users')
            .select('user_id')
            .where('user_uuid', userUuid);

        await this.database(SpaceShareTableName)
            .where('space_id', space.space_id)
            .andWhere('user_id', user.user_id)
            .delete();
    }

    async clearSpaceAccess(spaceUuid: string, userUuid: string): Promise<void> {
        const [space] = await this.database('spaces')
            .select('space_id')
            .where('space_uuid', spaceUuid);

        const [user] = await this.database('users')
            .select('user_id')
            .where('user_uuid', userUuid);

        await this.database('space_share')
            .where('space_id', space.space_id)
            .andWhereNot('user_id', user.user_id)
            .delete();
    }
}
