import {
    ChartKind,
    NotFoundError,
    OrganizationMemberRole,
    ProjectMemberRole,
    Space,
    SpaceDashboard,
    SpaceQuery,
    SpaceShare,
    SpaceSummary,
    UpdateSpace,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
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
    DBPinnedSpace,
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
import { DbValidationTable } from '../database/entities/validation';
import { wrapOtelSpan } from '../utils';
import { GetDashboardDetailsQuery } from './DashboardModel/DashboardModel';

type Dependencies = {
    database: Knex;
};

export class SpaceModel {
    private database: Knex;

    public MOST_POPULAR_OR_RECENTLY_UPDATED_LIMIT: number;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
        this.MOST_POPULAR_OR_RECENTLY_UPDATED_LIMIT = 10;
    }

    async find(filters: {
        projectUuid?: string;
        spaceUuid?: string;
    }): Promise<SpaceSummary[]> {
        const transaction = Sentry.getCurrentHub()
            ?.getScope()
            ?.getTransaction();
        const span = transaction?.startChild({
            op: 'SpaceModel.find',
            description: 'Find spaces',
        });
        try {
            const query = this.database('spaces')
                .innerJoin(
                    'projects',
                    'projects.project_id',
                    'spaces.project_id',
                )
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
                .leftJoin(
                    'space_share',
                    'space_share.space_id',
                    'spaces.space_id',
                )
                .leftJoin(
                    'users as shared_with',
                    'space_share.user_id',
                    'shared_with.user_id',
                )
                .groupBy(
                    `${PinnedListTableName}.pinned_list_uuid`,
                    `${PinnedSpaceTableName}.order`,
                    'organizations.organization_uuid',
                    'projects.project_uuid',
                    'spaces.space_uuid',
                    'spaces.space_id',
                )
                .select({
                    organizationUuid: 'organizations.organization_uuid',
                    projectUuid: 'projects.project_uuid',
                    uuid: 'spaces.space_uuid',
                    name: this.database.raw('max(spaces.name)'),
                    isPrivate: this.database.raw('bool_or(spaces.is_private)'),
                    access: this.database.raw(
                        "COALESCE(json_agg(shared_with.user_uuid) FILTER (WHERE shared_with.user_uuid IS NOT NULL), '[]')",
                    ),
                    pinnedListUuid: `${PinnedListTableName}.pinned_list_uuid`,
                    pinnedListOrder: `${PinnedSpaceTableName}.order`,
                    chartCount: this.database
                        .countDistinct(`${SavedChartsTableName}.saved_query_id`)
                        .from(SavedChartsTableName)
                        .whereRaw(
                            `${SavedChartsTableName}.space_id = ${SpaceTableName}.space_id`,
                        ),
                    dashboardCount: this.database
                        .countDistinct(`${DashboardsTableName}.dashboard_id`)
                        .from(DashboardsTableName)
                        .whereRaw(
                            `${DashboardsTableName}.space_id = ${SpaceTableName}.space_id`,
                        ),
                });
            if (filters.projectUuid) {
                query.where('projects.project_uuid', filters.projectUuid);
            }
            if (filters.spaceUuid) {
                query.where('spaces.space_uuid', filters.spaceUuid);
            }
            return await query;
        } finally {
            span?.finish();
        }
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
                    Pick<DbPinnedList, 'pinned_list_uuid'> &
                    Pick<DBPinnedSpace, 'order'>)[]
            >([
                'spaces.*',

                'projects.project_uuid',
                'organizations.organization_uuid',

                `${PinnedListTableName}.pinned_list_uuid`,
                `${PinnedSpaceTableName}.order`,
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
            pinnedListOrder: row.order,
        };
    }

    async getSpaceDashboards(
        spaceUuids: string[],
        filters?: {
            recentlyUpdated?: boolean;
            mostPopular?: boolean;
        },
    ): Promise<SpaceDashboard[]> {
        const subQuery = this.database
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
                    validation_errors: DbValidationTable[];
                    space_uuid: string;
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
                `${PinnedDashboardTableName}.order`,
                this.database.raw(`
                    COALESCE(
                        (
                            SELECT json_agg(validations.*) 
                            FROM validations 
                            WHERE validations.dashboard_uuid = ${DashboardsTableName}.dashboard_uuid
                        ), '[]'
                    ) as validation_errors
                `),
                `${DashboardVersionsTableName}.created_at as dashboard_version_created_at`,
                `${DashboardVersionsTableName}.dashboard_id as dashboard_id`,
            ])
            .distinctOn(`${DashboardVersionsTableName}.dashboard_id`)
            .whereIn(`${SpaceTableName}.space_uuid`, spaceUuids)
            .orderBy([
                {
                    column: `dashboard_id`,
                },
                {
                    column: `dashboard_version_created_at`,
                    order: 'desc',
                },
            ])
            .as('subQuery');

        let dashboardsQuery = this.database.select('*').from(subQuery);

        if (filters?.recentlyUpdated || filters?.mostPopular) {
            const sortByColumn = filters.mostPopular
                ? 'views'
                : 'dashboard_version_created_at';

            dashboardsQuery = dashboardsQuery
                .orderBy(sortByColumn, 'desc')
                .limit(this.MOST_POPULAR_OR_RECENTLY_UPDATED_LIMIT);
        }

        const dashboards = await dashboardsQuery;

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
                order,
                validation_errors,
                space_uuid,
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
                spaceUuid: space_uuid,
                views: parseInt(views, 10),
                firstViewedAt: first_viewed_at,
                pinnedListUuid: pinned_list_uuid,
                pinnedListOrder: order,
                validationErrors: validation_errors?.map(
                    (error: DbValidationTable) => ({
                        validationId: error.validation_id,
                        error: error.error,
                        createdAt: error.created_at,
                    }),
                ),
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
                function joinProjectMembershipTable() {
                    this.on(
                        `${UserTableName}.user_id`,
                        '=',
                        `${ProjectMembershipsTableName}.user_id`,
                    ).andOn(
                        `${SpaceTableName}.project_id`,
                        '=',
                        `${ProjectMembershipsTableName}.project_id`,
                    );
                },
            )
            .select<
                {
                    user_uuid: string;
                    first_name: string;
                    last_name: string;
                    project_role: ProjectMemberRole | null;
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

        return access.reduce<SpaceShare[]>(
            (
                acc,
                {
                    user_uuid,
                    first_name,
                    last_name,
                    project_role,
                    organization_role,
                },
            ) => {
                const role = getProjectRoleOrInheritedFromOrganization(
                    project_role,
                    organization_role,
                );
                // exclude all users that were converted to organization members and have no space access
                if (!role) {
                    this.removeSpaceAccess(spaceUuid, user_uuid);
                    return acc;
                }
                return [
                    ...acc,
                    {
                        userUuid: user_uuid,
                        firstName: first_name,
                        lastName: last_name,
                        role,
                    },
                ];
            },
            [],
        );
    }

    async getSpaceQueries(
        spaceUuids: string[],
        filters?: {
            recentlyUpdated?: boolean;
            mostPopular?: boolean;
        },
    ): Promise<SpaceQuery[]> {
        let spaceQueriesQuery = this.database('saved_queries')
            .whereIn(`${SpaceTableName}.space_uuid`, spaceUuids)
            .leftJoin(
                SpaceTableName,
                `saved_queries.space_id`,
                `${SpaceTableName}.space_id`,
            )
            .leftJoin(
                'users',
                'saved_queries.last_version_updated_by_user_uuid',
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
                    chart_kind: ChartKind;
                    pinned_list_uuid: string;
                    order: number;
                    validation_errors: DbValidationTable[];
                    space_uuid: string;
                }[]
            >([
                `saved_queries.saved_query_uuid`,
                `saved_queries.name`,
                `saved_queries.description`,
                `saved_queries.last_version_updated_at as created_at`,
                `users.user_uuid`,
                `users.first_name`,
                `users.last_name`,
                this.database.raw(
                    `(SELECT COUNT('${AnalyticsChartViewsTableName}.chart_uuid') FROM ${AnalyticsChartViewsTableName} WHERE ${AnalyticsChartViewsTableName}.chart_uuid = saved_queries.saved_query_uuid) as views`,
                ),
                this.database.raw(
                    `(SELECT ${AnalyticsChartViewsTableName}.timestamp FROM ${AnalyticsChartViewsTableName} WHERE ${AnalyticsChartViewsTableName}.chart_uuid = saved_queries.saved_query_uuid ORDER BY ${AnalyticsChartViewsTableName}.timestamp ASC LIMIT 1) as first_viewed_at`,
                ),
                `saved_queries.last_version_chart_kind as chart_kind`,
                `${PinnedListTableName}.pinned_list_uuid`,
                `${PinnedChartTableName}.order`,
                this.database.raw(`
                    COALESCE(
                        (
                            SELECT json_agg(validations.*) 
                            FROM validations 
                            WHERE validations.saved_chart_uuid = saved_queries.saved_query_uuid
                        ), '[]'
                    ) as validation_errors
                `),
                `${SpaceTableName}.space_uuid`,
            ]);

        if (filters?.recentlyUpdated || filters?.mostPopular) {
            spaceQueriesQuery = spaceQueriesQuery
                .orderBy(
                    filters.mostPopular
                        ? [
                              {
                                  column: 'views',
                                  order: 'desc',
                              },
                          ]
                        : [
                              {
                                  column: `saved_queries.last_version_updated_at`,
                                  order: 'desc',
                              },
                          ],
                )
                .limit(this.MOST_POPULAR_OR_RECENTLY_UPDATED_LIMIT);
        } else {
            spaceQueriesQuery = spaceQueriesQuery.orderBy([
                {
                    column: `saved_queries.last_version_updated_at`,
                    order: 'desc',
                },
            ]);
        }

        const savedQueries = await spaceQueriesQuery;

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
            spaceUuid: savedQuery.space_uuid,
            views: parseInt(savedQuery.views, 10),
            firstViewedAt: savedQuery.first_viewed_at,
            chartType: savedQuery.chart_kind,
            pinnedListUuid: savedQuery.pinned_list_uuid,
            pinnedListOrder: savedQuery.order,
            validationErrors: savedQuery.validation_errors.map(
                ({ error, created_at, validation_id }) => ({
                    error,
                    createdAt: created_at,
                    validationId: validation_id,
                }),
            ),
        }));
    }

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
                    Pick<DbPinnedList, 'pinned_list_uuid'> &
                    Pick<DBPinnedSpace, 'order'>)[]
            >([
                'spaces.*',
                'projects.project_uuid',
                'organizations.organization_uuid',
                `${PinnedListTableName}.pinned_list_uuid`,
                `${PinnedSpaceTableName}.order`,
            ]);
        return Promise.all(
            results.map(async (row) => ({
                organizationUuid: row.organization_uuid,
                name: row.name,
                isPrivate: row.is_private,
                uuid: row.space_uuid,
                projectUuid: row.project_uuid,
                pinnedListUuid: row.pinned_list_uuid,
                pinnedListOrder: row.order,
                queries: await this.getSpaceQueries([row.space_uuid]),
                dashboards: await this.getSpaceDashboards([row.space_uuid]),
                access: await this.getSpaceAccess(row.space_uuid),
            })),
        );
    }

    async getSpaceSummary(spaceUuid: string): Promise<SpaceSummary> {
        return wrapOtelSpan('SpaceModel.getSpaceSummary', {}, async () => {
            const [space] = await this.find({ spaceUuid });
            if (space === undefined)
                throw new NotFoundError(
                    `Space with spaceUuid ${spaceUuid} does not exist`,
                );
            return space;
        });
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
            pinnedListOrder: space.pinnedListOrder,
            queries: await this.getSpaceQueries([space.uuid]),
            dashboards: await this.getSpaceDashboards([space.uuid]),
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
            pinnedListOrder: null,
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
