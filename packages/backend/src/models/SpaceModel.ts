import {
    ChartKind,
    ChartType,
    convertOrganizationRoleToProjectRole,
    convertProjectRoleToSpaceRole,
    convertSpaceRoleToProjectRole,
    getHighestProjectRole,
    getHighestSpaceRole,
    GroupRole,
    NotFoundError,
    OrganizationMemberRole,
    OrganizationRole,
    ProjectMemberRole,
    ProjectRole,
    Space,
    SpaceDashboard,
    SpaceGroup,
    SpaceGroupAccessRole,
    SpaceMemberRole,
    SpaceQuery,
    SpaceShare,
    SpaceSummary,
    UpdateSpace,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { Knex } from 'knex';
import { groupBy } from 'lodash';
import {
    DashboardsTableName,
    DashboardVersionsTableName,
} from '../database/entities/dashboards';
import { EmailTableName } from '../database/entities/emails';
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
import { GroupTableName } from '../database/entities/groups';
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
import { ProjectGroupAccessTableName } from '../database/entities/projectGroupAccess';
import { ProjectMembershipsTableName } from '../database/entities/projectMemberships';
import { DbProject, ProjectTableName } from '../database/entities/projects';
import {
    SavedChartsTableName,
    SavedChartVersionsTableName,
} from '../database/entities/savedCharts';
import {
    DbSpace,
    SpaceGroupAccessTableName,
    SpaceTableName,
    SpaceUserAccessTableName,
} from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';
import { DbValidationTable } from '../database/entities/validation';
import { wrapOtelSpan } from '../utils';
import type { GetDashboardDetailsQuery } from './DashboardModel/DashboardModel';

type SpaceModelArguments = {
    database: Knex;
};

export class SpaceModel {
    private database: Knex;

    public MOST_POPULAR_OR_RECENTLY_UPDATED_LIMIT: number;

    constructor(args: SpaceModelArguments) {
        this.database = args.database;
        this.MOST_POPULAR_OR_RECENTLY_UPDATED_LIMIT = 10;
    }

    static async getSpaceIdAndName(db: Knex, spaceUuid: string | undefined) {
        if (spaceUuid === undefined) return undefined;

        const [space] = await db('spaces')
            .select(['space_id', 'name'])
            .where('space_uuid', spaceUuid);
        return { spaceId: space.space_id, name: space.name };
    }

    static async getFirstAccessibleSpace(
        db: Knex,
        projectUuid: string,
        userUuid: string,
    ): Promise<
        DbSpace &
            Pick<DbPinnedList, 'pinned_list_uuid'> &
            Pick<DBPinnedSpace, 'order'>
    > {
        const space = await db('spaces')
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
            .leftJoin(
                SpaceUserAccessTableName,
                `${SpaceUserAccessTableName}.space_uuid`,
                `${SpaceTableName}.space_uuid`,
            )
            .leftJoin(
                'users',
                `${SpaceUserAccessTableName}.user_uuid`,
                `${UserTableName}.user_uuid`,
            )
            .where((q) => {
                void q
                    .where(`${UserTableName}.user_uuid`, userUuid)
                    .orWhere(`${SpaceTableName}.is_private`, false);
            })
            .where(`${ProjectTableName}.project_uuid`, projectUuid)
            .select<
                (DbSpace &
                    Pick<DbPinnedList, 'pinned_list_uuid'> &
                    Pick<DBPinnedSpace, 'order'>)[]
            >([
                'spaces.space_id',
                'spaces.space_uuid',
                'spaces.name',
                'spaces.created_at',
                'spaces.project_id',
                'organizations.organization_uuid',
                `${PinnedListTableName}.pinned_list_uuid`,
                `${PinnedSpaceTableName}.order`,
            ])
            .first();

        if (space === undefined) {
            throw new NotFoundError(
                `No space found for project with id: ${projectUuid}`,
            );
        }

        return space;
    }

    async getFirstAccessibleSpace(projectUuid: string, userUuid: string) {
        return SpaceModel.getFirstAccessibleSpace(
            this.database,
            projectUuid,
            userUuid,
        );
    }

    async getSpaceWithQueries(
        projectUuid: string,
        userUuid: string,
    ): Promise<Space> {
        const space = await this.getFirstAccessibleSpace(projectUuid, userUuid);
        const savedQueries = await this.database('saved_queries')
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
            .leftJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .leftJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            )
            .leftJoin(
                DashboardsTableName,
                `${DashboardsTableName}.dashboard_uuid`,
                `${SavedChartsTableName}.dashboard_uuid`,
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
                    pinned_list_uuid: string | null;
                    order: number | null;
                    chart_kind: ChartKind;
                    chart_type: ChartType;
                    views_count: number;
                    first_viewed_at: Date | null;
                    project_uuid: string;
                    organization_uuid: string;
                    dashboard_uuid: string;
                    dashboard_name: string;
                }[]
            >([
                `saved_queries.saved_query_uuid`,
                `saved_queries.name`,
                `saved_queries.description`,
                `saved_queries.last_version_updated_at as created_at`,
                `users.user_uuid`,
                `users.first_name`,
                `users.last_name`,
                `${PinnedListTableName}.pinned_list_uuid`,
                `${PinnedChartTableName}.order`,
                `saved_queries.last_version_chart_kind as chart_kind`,
                this.database.raw(
                    `(SELECT ${SavedChartVersionsTableName}.chart_type FROM ${SavedChartVersionsTableName} WHERE ${SavedChartVersionsTableName}.saved_query_id = saved_queries.saved_query_id ORDER BY ${SavedChartVersionsTableName}.created_at DESC LIMIT 1) as chart_type`,
                ),
                `saved_queries.views_count`,
                `saved_queries.first_viewed_at`,
                `${ProjectTableName}.project_uuid`,
                `${OrganizationTableName}.organization_uuid`,
                `${DashboardsTableName}.dashboard_uuid`,
                `${DashboardsTableName}.name as dashboard_name`,
            ])
            .orderBy('saved_queries.last_version_updated_at', 'desc')
            .where('saved_queries.space_id', space.space_id);

        return {
            organizationUuid: space.organization_uuid,
            uuid: space.space_uuid,
            name: space.name,
            isPrivate: space.is_private,
            pinnedListUuid: space.pinned_list_uuid,
            pinnedListOrder: space.order,
            queries: savedQueries.map((savedQuery) => ({
                uuid: savedQuery.saved_query_uuid,
                name: savedQuery.name,
                spaceName: space.name,
                projectUuid: savedQuery.project_uuid,
                organizationUuid: savedQuery.organization_uuid,
                dashboardUuid: savedQuery.dashboard_uuid,
                dashboardName: savedQuery.dashboard_name,
                description: savedQuery.description,
                updatedAt: savedQuery.created_at,
                updatedByUser: {
                    userUuid: savedQuery.user_uuid,
                    firstName: savedQuery.first_name,
                    lastName: savedQuery.last_name,
                },
                spaceUuid: space.space_uuid,
                pinnedListUuid: savedQuery.pinned_list_uuid,
                pinnedListOrder: savedQuery.order,
                chartType: savedQuery.chart_type,
                chartKind: savedQuery.chart_kind,
                views: savedQuery.views_count,
                firstViewedAt: savedQuery.first_viewed_at,
            })),
            projectUuid,
            dashboards: [],
            access: [],
            groupsAccess: [],
            slug: space.slug,
        };
    }

    async find(filters: {
        projectUuid?: string;
        spaceUuid?: string;
        slug?: string;
    }): Promise<Omit<SpaceSummary, 'userAccess'>[]> {
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
                    `${SpaceUserAccessTableName}`,
                    `${SpaceUserAccessTableName}.space_uuid`,
                    'spaces.space_uuid',
                )
                .leftJoin(
                    'users as shared_with',
                    `${SpaceUserAccessTableName}.user_uuid`,
                    'shared_with.user_uuid',
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
                    slug: 'spaces.slug',
                });
            if (filters.projectUuid) {
                void query.where('projects.project_uuid', filters.projectUuid);
            }
            if (filters.spaceUuid) {
                void query.where('spaces.space_uuid', filters.spaceUuid);
            }
            if (filters.slug) {
                void query.where('spaces.slug', filters.slug);
            }
            return await query;
        } finally {
            span?.finish();
        }
    }

    async get(
        spaceUuid: string,
    ): Promise<
        Omit<Space, 'queries' | 'dashboards' | 'access' | 'groupsAccess'>
    > {
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
            slug: row.slug,
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
                `${DashboardsTableName}.views_count`,
                `${DashboardsTableName}.first_viewed_at`,
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
                ? 'views_count'
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
                views_count,
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
                views: views_count,
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

    private async _getSpaceAccess(
        spaceUuids: string[],
        filters?: { userUuid?: string },
    ): Promise<Record<string, SpaceShare[]>> {
        const access = await this.database
            .table(SpaceTableName)
            .leftJoin(
                ProjectTableName,
                `${SpaceTableName}.project_id`,
                `${ProjectTableName}.project_id`,
            )
            .leftJoin(
                OrganizationMembershipsTableName,
                `${OrganizationMembershipsTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            )
            .leftJoin(
                UserTableName,
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
                        `${ProjectTableName}.project_id`,
                        '=',
                        `${ProjectMembershipsTableName}.project_id`,
                    );
                },
            )
            .leftJoin(SpaceUserAccessTableName, function joinSpaceShareTable() {
                this.on(
                    `${UserTableName}.user_uuid`,
                    '=',
                    `${SpaceUserAccessTableName}.user_uuid`,
                ).andOn(
                    `${SpaceTableName}.space_uuid`,
                    '=',
                    `${SpaceUserAccessTableName}.space_uuid`,
                );
            })
            .leftJoin(
                GroupMembershipTableName,
                `${OrganizationMembershipsTableName}.user_id`,
                `${GroupMembershipTableName}.user_id`,
            )
            .leftJoin(
                ProjectGroupAccessTableName,
                function joinProjectGroupAccessTable() {
                    this.on(
                        `${GroupMembershipTableName}.group_uuid`,
                        '=',
                        `${ProjectGroupAccessTableName}.group_uuid`,
                    ).andOn(
                        `${ProjectTableName}.project_uuid`,
                        '=',
                        `${ProjectGroupAccessTableName}.project_uuid`,
                    );
                },
            )
            .leftJoin(
                SpaceGroupAccessTableName,
                function joinSpaceGroupAccessTable() {
                    this.on(
                        `${GroupMembershipTableName}.group_uuid`,
                        '=',
                        `${SpaceGroupAccessTableName}.group_uuid`,
                    ).andOn(
                        `${SpaceTableName}.space_uuid`,
                        '=',
                        `${SpaceGroupAccessTableName}.space_uuid`,
                    );
                },
            )
            .innerJoin(
                EmailTableName,
                `${UserTableName}.user_id`,
                `${EmailTableName}.user_id`,
            )
            .where(`${EmailTableName}.is_primary`, true)
            .whereIn(`${SpaceTableName}.space_uuid`, spaceUuids)
            .modify((query) => {
                if (filters?.userUuid) {
                    void query.where(
                        `${UserTableName}.user_uuid`,
                        filters.userUuid,
                    );
                }
            })
            .where((query) => {
                void query
                    .where((query1) => {
                        // if space is private, only return user with direct access or admin role
                        void query1
                            .where(`${SpaceTableName}.is_private`, true)
                            .andWhere((query2) => {
                                void query2
                                    .whereNotNull(
                                        `${SpaceUserAccessTableName}.user_uuid`,
                                    )
                                    .orWhereNotNull(
                                        `${SpaceGroupAccessTableName}.group_uuid`,
                                    )
                                    .orWhere(
                                        `${ProjectMembershipsTableName}.role`,
                                        'admin',
                                    )
                                    .orWhere(
                                        `${OrganizationMembershipsTableName}.role`,
                                        'admin',
                                    )
                                    .orWhere(
                                        `${ProjectGroupAccessTableName}.role`,
                                        'admin',
                                    );
                            });
                    })
                    .orWhere(`${SpaceTableName}.is_private`, false);
            })
            .groupBy(
                `${SpaceTableName}.space_uuid`,
                `${UserTableName}.user_id`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                `${EmailTableName}.email`,
                `${SpaceTableName}.is_private`,
                `${ProjectMembershipsTableName}.role`,
                `${OrganizationMembershipsTableName}.role`,
                `${SpaceUserAccessTableName}.user_uuid`,
                `${SpaceUserAccessTableName}.space_role`,
                `${SpaceGroupAccessTableName}.group_uuid`,
            )
            .select<
                {
                    space_uuid: string;
                    user_uuid: string;
                    first_name: string;
                    last_name: string;
                    email: string;
                    is_private: boolean;
                    space_role: SpaceMemberRole;
                    user_with_direct_access: boolean;
                    project_role: ProjectMemberRole | null;
                    organization_role: OrganizationMemberRole;
                    group_roles: (ProjectMemberRole | null)[];
                    space_group_roles: (SpaceMemberRole | null)[];
                }[]
            >([
                `spaces.space_uuid`,
                `users.user_uuid`,
                `users.first_name`,
                `users.last_name`,
                `emails.email`,
                `spaces.is_private`,
                `space_user_access.space_role`,
                this.database.raw(
                    `CASE WHEN ${SpaceUserAccessTableName}.user_uuid IS NULL AND ( ${SpaceGroupAccessTableName}.group_uuid IS NULL ) THEN false ELSE true end as user_with_direct_access`,
                ),
                `${ProjectMembershipsTableName}.role as project_role`,
                `${OrganizationMembershipsTableName}.role as organization_role`,
                this.database.raw(
                    `array_agg(${ProjectGroupAccessTableName}.role) as group_roles`,
                ),
                this.database.raw(
                    `array_agg(${SpaceGroupAccessTableName}.space_role) as space_group_roles`,
                ),
            ]);

        return Object.entries(groupBy(access, 'space_uuid')).reduce<
            Record<string, SpaceShare[]>
        >((acc, [spaceUuid, spaceAccess]) => {
            acc[spaceUuid] = spaceAccess.reduce<SpaceShare[]>(
                (
                    acc2,
                    {
                        user_uuid,
                        first_name,
                        last_name,
                        email,
                        is_private,
                        space_role,
                        user_with_direct_access,
                        project_role,
                        organization_role,
                        group_roles,
                        space_group_roles,
                    },
                ) => {
                    const inheritedOrgRole: OrganizationRole = {
                        type: 'organization',
                        role: convertOrganizationRoleToProjectRole(
                            organization_role,
                        ),
                    };

                    const inheritedProjectRole: ProjectRole = {
                        type: 'project',
                        role: project_role ?? undefined,
                    };

                    const inheritedGroupRoles: GroupRole[] = group_roles.map(
                        (role) => ({ type: 'group', role: role ?? undefined }),
                    );

                    const spaceGroupAccessRoles: SpaceGroupAccessRole[] =
                        space_group_roles.map((role) => ({
                            type: 'space_group',
                            role: role
                                ? convertSpaceRoleToProjectRole(role)
                                : undefined,
                        }));

                    const highestRole = getHighestProjectRole([
                        inheritedOrgRole,
                        inheritedProjectRole,
                        ...inheritedGroupRoles,
                        ...spaceGroupAccessRoles,
                    ]);

                    // exclude users with no space role
                    if (!highestRole) {
                        return acc2;
                    }

                    let spaceRole;

                    if (highestRole.role === ProjectMemberRole.ADMIN) {
                        spaceRole = SpaceMemberRole.ADMIN;
                    } else if (user_with_direct_access) {
                        spaceRole =
                            getHighestSpaceRole([
                                space_role ?? undefined,
                                ...space_group_roles.map(
                                    (role) => role ?? undefined,
                                ),
                            ]) ?? space_role;
                    } else if (!is_private && !user_with_direct_access) {
                        spaceRole = convertProjectRoleToSpaceRole(
                            highestRole.role,
                        );
                    } else {
                        return acc2;
                    }

                    return [
                        ...acc2,
                        {
                            userUuid: user_uuid,
                            firstName: first_name,
                            lastName: last_name,
                            email,
                            role: spaceRole,
                            hasDirectAccess: !!user_with_direct_access,
                            inheritedRole: highestRole.role,
                            inheritedFrom: highestRole.type,
                        },
                    ];
                },
                [],
            );
            return acc;
        }, {});
    }

    private async _getGroupAccess(spaceUuid: string): Promise<SpaceGroup[]> {
        const access = await this.database
            .table(SpaceGroupAccessTableName)
            .select({
                groupUuid: `${SpaceGroupAccessTableName}.group_uuid`,
                spaceRole: `${SpaceGroupAccessTableName}.space_role`,
                groupName: `${GroupTableName}.name`,
            })
            .leftJoin(
                `${GroupTableName}`,
                `${GroupTableName}.group_uuid`,
                `${SpaceGroupAccessTableName}.group_uuid`,
            )
            .where('space_uuid', spaceUuid);
        return access;
    }

    async getUserSpaceAccess(
        userUuid: string,
        spaceUuid: string,
    ): Promise<SpaceShare[]> {
        return (
            (
                await this._getSpaceAccess([spaceUuid], {
                    userUuid,
                })
            )[spaceUuid] ?? []
        );
    }

    async getUserSpacesAccess(
        userUuid: string,
        spaceUuids: string[],
    ): Promise<Record<string, SpaceShare[]>> {
        return this._getSpaceAccess(spaceUuids, {
            userUuid,
        });
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
            .leftJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .leftJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            )
            .leftJoin(
                DashboardsTableName,
                `${DashboardsTableName}.dashboard_uuid`,
                `${SavedChartsTableName}.dashboard_uuid`,
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
                    views_count: number;
                    first_viewed_at: Date | null;
                    chart_kind: ChartKind;
                    chart_type: ChartType;
                    pinned_list_uuid: string;
                    order: number;
                    validation_errors: DbValidationTable[];
                    space_uuid: string;
                    space_name: string;
                    project_uuid: string;
                    organization_uuid: string;
                    dashboard_uuid: string | null;
                    dashboard_name: string | null;
                }[]
            >([
                `saved_queries.saved_query_uuid`,
                `saved_queries.name`,
                `saved_queries.description`,
                `saved_queries.last_version_updated_at as created_at`,
                `users.user_uuid`,
                `users.first_name`,
                `users.last_name`,
                `saved_queries.views_count`,
                `saved_queries.first_viewed_at`,
                `saved_queries.last_version_chart_kind as chart_kind`,
                this.database.raw(
                    `(SELECT ${SavedChartVersionsTableName}.chart_type FROM ${SavedChartVersionsTableName} WHERE ${SavedChartVersionsTableName}.saved_query_id = saved_queries.saved_query_id ORDER BY ${SavedChartVersionsTableName}.created_at DESC LIMIT 1) as chart_type`,
                ),
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
                `${SpaceTableName}.name as space_name`,
                `${ProjectTableName}.project_uuid`,
                `${OrganizationTableName}.organization_uuid`,
                `${DashboardsTableName}.dashboard_uuid`,
                `${DashboardsTableName}.name as dashboard_name`,
            ]);

        if (filters?.recentlyUpdated || filters?.mostPopular) {
            spaceQueriesQuery = spaceQueriesQuery
                .orderBy(
                    filters.mostPopular
                        ? [
                              {
                                  column: 'views_count',
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
            spaceName: savedQuery.space_name,
            dashboardName: savedQuery.dashboard_name,
            organizationUuid: savedQuery.organization_uuid,
            projectUuid: savedQuery.project_uuid,
            dashboardUuid: savedQuery.dashboard_uuid,
            description: savedQuery.description,
            updatedAt: savedQuery.created_at,
            updatedByUser: {
                userUuid: savedQuery.user_uuid,
                firstName: savedQuery.first_name,
                lastName: savedQuery.last_name,
            },
            spaceUuid: savedQuery.space_uuid,
            views: savedQuery.views_count,
            firstViewedAt: savedQuery.first_viewed_at,
            chartType: savedQuery.chart_type,
            chartKind: savedQuery.chart_kind,
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

    async getSpaceSummary(
        spaceUuid: string,
    ): Promise<Omit<SpaceSummary, 'userAccess'>> {
        return wrapOtelSpan('SpaceModel.getSpaceSummary', {}, async () => {
            const [space] = await this.find({ spaceUuid });
            if (space === undefined)
                throw new NotFoundError(
                    `Space with spaceUuid ${spaceUuid} does not exist`,
                );
            return space;
        });
    }

    async getSpacesForAccessCheck(
        spaceUuids: string[],
    ): Promise<
        Map<
            string,
            Pick<SpaceSummary, 'isPrivate' | 'organizationUuid' | 'projectUuid'>
        >
    > {
        const spaces = await this.database('spaces')
            .innerJoin('projects', 'projects.project_id', 'spaces.project_id')
            .innerJoin(
                'organizations',
                'organizations.organization_id',
                'projects.organization_id',
            )
            .leftJoin(
                'space_user_access',
                'space_user_access.space_uuid',
                'spaces.space_uuid',
            )
            .leftJoin(
                'users as shared_with',
                'space_user_access.user_uuid',
                'shared_with.user_uuid',
            )
            .whereIn('spaces.space_uuid', spaceUuids)
            .select({
                spaceUuid: 'spaces.space_uuid',
                organizationUuid: 'organizations.organization_uuid',
                projectUuid: 'projects.project_uuid',
                isPrivate: this.database.raw('bool_or(spaces.is_private)'),
                access: this.database.raw(
                    "COALESCE(json_agg(shared_with.user_uuid) FILTER (WHERE shared_with.user_uuid IS NOT NULL), '[]')",
                ),
            })
            .groupBy(
                'spaces.space_uuid',
                'organizations.organization_uuid',
                'projects.project_uuid',
            );

        const spaceAccessMap = new Map();
        spaces.forEach((space) => {
            spaceAccessMap.set(space.spaceUuid, {
                organizationUuid: space.organizationUuid,
                projectUuid: space.projectUuid,
                isPrivate: space.isPrivate,
            });
        });

        return spaceAccessMap;
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
            access:
                (await this._getSpaceAccess([space.uuid]))[space.uuid] ?? [],
            groupsAccess: await this._getGroupAccess(space.uuid),
            slug: space.slug,
        };
    }

    async createSpace(
        projectUuid: string,
        name: string,
        userId: number,
        isPrivate: boolean,
        slug: string,
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
                slug,
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
            groupsAccess: [],
            pinnedListUuid: null,
            pinnedListOrder: null,
            slug: space.slug,
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

    async addSpaceAccess(
        spaceUuid: string,
        userUuid: string,
        spaceRole: SpaceMemberRole,
    ): Promise<void> {
        await this.database(SpaceUserAccessTableName)
            .insert({
                space_uuid: spaceUuid,
                user_uuid: userUuid,
                space_role: spaceRole,
            })
            .onConflict(['user_uuid', 'space_uuid'])
            .merge();
    }

    async removeSpaceAccess(
        spaceUuid: string,
        userUuid: string,
    ): Promise<void> {
        await this.database(SpaceUserAccessTableName)
            .where('space_uuid', spaceUuid)
            .andWhere('user_uuid', userUuid)
            .delete();
    }

    async addSpaceGroupAccess(
        spaceUuid: string,
        groupUuid: string,
        spaceRole: SpaceMemberRole,
    ): Promise<void> {
        await this.database(SpaceGroupAccessTableName)
            .insert({
                space_uuid: spaceUuid,
                group_uuid: groupUuid,
                space_role: spaceRole,
            })
            .onConflict(['group_uuid', 'space_uuid'])
            .merge();
    }

    async removeSpaceGroupAccess(
        spaceUuid: string,
        groupUuid: string,
    ): Promise<void> {
        await this.database(SpaceGroupAccessTableName)
            .where('space_uuid', spaceUuid)
            .andWhere('group_uuid', groupUuid)
            .delete();
    }
}
