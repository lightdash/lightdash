import {
    ChartKind,
    ChartSourceType,
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
import { SavedSemanticViewerChartsTableName } from '../database/entities/savedSemanticViewerCharts';
import { SavedSqlTableName } from '../database/entities/savedSql';
import {
    DbSpace,
    SpaceGroupAccessTableName,
    SpaceTableName,
    SpaceUserAccessTableName,
} from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';
import { DbValidationTable } from '../database/entities/validation';
import { wrapSentryTransaction } from '../utils';
import { generateUniqueSlug } from '../utils/SlugUtils';
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

    /**
     * Nested spaces MVP - get is_private from root space
     * Returns a raw SQL expression to determine if a space is private.
     * For nested spaces, it checks the root space's privacy setting.
     * @returns SQL string for determining privacy setting
     */
    static getRootSpaceIsPrivateQuery(): string {
        return `
            CASE
                WHEN ${SpaceTableName}.parent_space_uuid IS NOT NULL THEN
                    (SELECT ps.is_private 
                     FROM spaces ps 
                     WHERE ps.path @> ${SpaceTableName}.path 
                     AND nlevel(ps.path) = 1
                     LIMIT 1)
                ELSE
                    ${SpaceTableName}.is_private
            END
        `;
    }

    /**
     * Nested spaces MVP - get access list from root space
     * Returns a raw SQL expression to get user access for a space.
     * For nested spaces, it retrieves access from the root space.
     * @returns SQL string for retrieving access information
     */
    static getRootSpaceAccessQuery(sharedWithTableName: string): string {
        return `
            CASE
                WHEN ${SpaceTableName}.parent_space_uuid IS NOT NULL THEN
                    (SELECT COALESCE(json_agg(sua.user_uuid) FILTER (WHERE sua.user_uuid IS NOT NULL), '[]')
                     FROM space_user_access sua
                     JOIN spaces root_space ON sua.space_uuid = root_space.space_uuid
                     WHERE root_space.path @> ${SpaceTableName}.path
                     AND nlevel(root_space.path) = 1
                     LIMIT 1)
                ELSE
                    COALESCE(json_agg(${sharedWithTableName}.user_uuid) FILTER (WHERE ${sharedWithTableName}.user_uuid IS NOT NULL), '[]')
            END
        `;
    }

    static async getSpaceIdAndName(db: Knex, spaceUuid: string | undefined) {
        if (spaceUuid === undefined) return undefined;

        const [space] = await db(SpaceTableName)
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
        const space = await db(SpaceTableName)
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .innerJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
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
                UserTableName,
                `${SpaceUserAccessTableName}.user_uuid`,
                `${UserTableName}.user_uuid`,
            )
            .where((q) => {
                void q
                    .where(`${UserTableName}.user_uuid`, userUuid)
                    .orWhere(`${SpaceTableName}.is_private`, false);
            })
            .where(`${ProjectTableName}.project_uuid`, projectUuid)
            // Nested spaces MVP - only consider root spaces
            .whereNull(`${SpaceTableName}.parent_space_uuid`)
            .select<
                (DbSpace &
                    Pick<DbPinnedList, 'pinned_list_uuid'> &
                    Pick<DBPinnedSpace, 'order'>)[]
            >([
                `${SpaceTableName}.space_id`,
                `${SpaceTableName}.space_uuid`,
                `${SpaceTableName}.name`,
                `${SpaceTableName}.created_at`,
                `${SpaceTableName}.project_id`,
                `${OrganizationTableName}.organization_uuid`,
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
                `${SavedChartsTableName}.space_id`,
                `${SpaceTableName}.space_id`,
            )
            .leftJoin(
                UserTableName,
                `${SavedChartsTableName}.last_version_updated_by_user_uuid`,
                `${UserTableName}.user_uuid`,
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
                    slug: string;
                    is_private: boolean;
                }[]
            >([
                `${SavedChartsTableName}.saved_query_uuid`,
                `${SavedChartsTableName}.name`,
                `${SavedChartsTableName}.description`,
                `${SavedChartsTableName}.last_version_updated_at as created_at`,
                `${UserTableName}.user_uuid`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                `${PinnedListTableName}.pinned_list_uuid`,
                `${PinnedChartTableName}.order`,
                `${SavedChartsTableName}.last_version_chart_kind as chart_kind`,
                this.database.raw(
                    `(SELECT ${SavedChartVersionsTableName}.chart_type FROM ${SavedChartVersionsTableName} WHERE ${SavedChartVersionsTableName}.saved_query_id = ${SavedChartsTableName}.saved_query_id ORDER BY ${SavedChartVersionsTableName}.created_at DESC LIMIT 1) as chart_type`,
                ),
                `${SavedChartsTableName}.views_count`,
                `${SavedChartsTableName}.first_viewed_at`,
                `${ProjectTableName}.project_uuid`,
                `${OrganizationTableName}.organization_uuid`,
                `${DashboardsTableName}.dashboard_uuid`,
                `${DashboardsTableName}.name as dashboard_name`,
                `${SavedChartsTableName}.slug`,
                this.database.raw(
                    `${SpaceModel.getRootSpaceIsPrivateQuery()} AS is_private`,
                ),
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
                slug: savedQuery.slug,
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
        projectUuids?: string[];
        spaceUuid?: string;
        spaceUuids?: string[];
        slug?: string;
    }): Promise<Omit<SpaceSummary, 'userAccess'>[]> {
        return Sentry.startSpan(
            {
                op: 'SpaceModel.find',
                name: 'SpaceModel.find',
            },
            async () => {
                const query = this.database(SpaceTableName)
                    .innerJoin(
                        ProjectTableName,
                        `${ProjectTableName}.project_id`,
                        `${SpaceTableName}.project_id`,
                    )
                    .innerJoin(
                        OrganizationTableName,
                        `${OrganizationTableName}.organization_id`,
                        `${ProjectTableName}.organization_id`,
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
                        `${SpaceTableName}.space_uuid`,
                    )
                    .leftJoin(
                        `${UserTableName} as shared_with`,
                        `${SpaceUserAccessTableName}.user_uuid`,
                        'shared_with.user_uuid',
                    )
                    .groupBy(
                        `${PinnedListTableName}.pinned_list_uuid`,
                        `${PinnedSpaceTableName}.order`,
                        `${OrganizationTableName}.organization_uuid`,
                        `${ProjectTableName}.project_uuid`,
                        `${SpaceTableName}.space_uuid`,
                        `${SpaceTableName}.space_id`,
                    )
                    .select({
                        organizationUuid: `${OrganizationTableName}.organization_uuid`,
                        projectUuid: `${ProjectTableName}.project_uuid`,
                        uuid: `${SpaceTableName}.space_uuid`,
                        name: this.database.raw('max(spaces.name)'),
                        isPrivate: this.database.raw(
                            SpaceModel.getRootSpaceIsPrivateQuery(),
                        ),
                        access: this.database.raw(
                            SpaceModel.getRootSpaceAccessQuery('shared_with'),
                        ),
                        pinnedListUuid: `${PinnedListTableName}.pinned_list_uuid`,
                        pinnedListOrder: `${PinnedSpaceTableName}.order`,
                        chartCount: this.database
                            .countDistinct(
                                `${SavedChartsTableName}.saved_query_id`,
                            )
                            .from(SavedChartsTableName)
                            .whereRaw(
                                `${SavedChartsTableName}.space_id = ${SpaceTableName}.space_id`,
                            ),
                        dashboardCount: this.database
                            .countDistinct(
                                `${DashboardsTableName}.dashboard_id`,
                            )
                            .from(DashboardsTableName)
                            .whereRaw(
                                `${DashboardsTableName}.space_id = ${SpaceTableName}.space_id`,
                            ),
                        slug: `${SpaceTableName}.slug`,
                    });
                if (filters.projectUuid) {
                    void query.where(
                        `${ProjectTableName}.project_uuid`,
                        filters.projectUuid,
                    );
                }
                if (filters.projectUuids) {
                    void query.whereIn(
                        `${ProjectTableName}.project_uuid`,
                        filters.projectUuids,
                    );
                }
                if (filters.spaceUuid) {
                    void query.where(
                        `${SpaceTableName}.space_uuid`,
                        filters.spaceUuid,
                    );
                }
                if (filters.spaceUuids) {
                    void query.whereIn(
                        `${SpaceTableName}.space_uuid`,
                        filters.spaceUuids,
                    );
                }
                if (filters.slug) {
                    void query.where(`${SpaceTableName}.slug`, filters.slug);
                }
                return query;
            },
        );
    }

    async get(
        spaceUuid: string,
    ): Promise<
        Omit<Space, 'queries' | 'dashboards' | 'access' | 'groupsAccess'>
    > {
        const [row] = await this.database(SpaceTableName)
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
                `${SpaceTableName}.*`,
                this.database.raw(
                    `${SpaceModel.getRootSpaceIsPrivateQuery()} AS is_private`,
                ),
                `${ProjectTableName}.project_uuid`,
                `${OrganizationTableName}.organization_uuid`,

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
            hasParent: row.parent_space_uuid !== null,
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
                            AND validations.job_id IS NULL
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
                `${SpaceTableName}.space_uuid`,
                `${UserTableName}.user_uuid`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                `${EmailTableName}.email`,
                `${SpaceTableName}.is_private`,
                `${SpaceUserAccessTableName}.space_role`,
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

                    const highestProjectRole = getHighestProjectRole([
                        inheritedOrgRole,
                        inheritedProjectRole,
                    ]);

                    // exclude users with no space role
                    if (!highestRole) {
                        return acc2;
                    }

                    let spaceRole;

                    if (highestRole.role === ProjectMemberRole.ADMIN) {
                        spaceRole = SpaceMemberRole.ADMIN;
                    } else if (user_with_direct_access) {
                        // if user has explicit user role in space use that, otherwise try find the highest group role
                        spaceRole =
                            space_role ??
                            getHighestSpaceRole(
                                space_group_roles.map(
                                    (role) => role ?? undefined,
                                ),
                            );
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
                            projectRole: highestProjectRole?.role,
                        },
                    ];
                },
                [],
            );
            return acc;
        }, {});
    }

    private async _getGroupAccess(spaceUuid: string): Promise<SpaceGroup[]> {
        // Get the root space UUID
        const rootSpaceUuid = await this.getSpaceRoot(spaceUuid);
        const spaceUuidToUse = rootSpaceUuid ?? spaceUuid;

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
            .where('space_uuid', spaceUuidToUse);
        return access;
    }

    async getUserSpaceAccess(
        userUuid: string,
        spaceUuid: string,
    ): Promise<SpaceShare[]> {
        // Get the root space UUID if the space is nested
        const rootSpaceUuid = await this.getSpaceRoot(spaceUuid);
        const spaceUuidToUse = rootSpaceUuid ?? spaceUuid;
        return (
            (
                await this._getSpaceAccess([spaceUuidToUse], {
                    userUuid,
                })
            )[spaceUuidToUse] ?? []
        );
    }

    async getUserSpacesAccess(
        userUuid: string,
        spaceUuids: string[],
    ): Promise<Record<string, SpaceShare[]>> {
        // Get a normalized list of root space UUIDs if the spaces are nested
        const spacesWithRootSpaceUuid = await Promise.all(
            spaceUuids.map(async (spaceUuid) => {
                const root = await this.getSpaceRoot(spaceUuid);

                return { rootSpaceUuid: root, spaceUuid };
            }),
        );

        const rootSpaceUuids = spacesWithRootSpaceUuid
            .map(({ rootSpaceUuid }) => rootSpaceUuid)
            .filter((rootSpaceUuid) => rootSpaceUuid !== undefined);

        // Fetch access for all root spaces - we can get the access for all descendants from this
        const rootSpacesAccess = await this._getSpaceAccess(rootSpaceUuids, {
            userUuid,
        });

        return Object.entries(rootSpacesAccess).reduce<
            Record<string, SpaceShare[]>
        >((acc, [spaceUuid, spaceAccess]) => {
            // Get descendants of a current space and return the access of the root space for all descendants
            const descendants = spacesWithRootSpaceUuid.filter(
                ({ rootSpaceUuid }) => rootSpaceUuid === spaceUuid,
            );
            // Add the access of the root space for all descendants
            descendants.forEach(({ spaceUuid: s }) => {
                acc[s] = spaceAccess;
            });

            // Otherwise, return the access of the root space
            acc[spaceUuid] = spaceAccess;

            return acc;
        }, {});
    }

    private async getSpaceCharts(
        chartsTable: {
            name: string;
            uuidColumnName: string;
            chartSourceType: ChartSourceType;
        },
        spaceUuids: string[],
        filters?: {
            recentlyUpdated?: boolean;
            mostPopular?: boolean;
        },
    ) {
        const {
            name: chartTable,
            uuidColumnName,
            chartSourceType,
        } = chartsTable;

        let spaceChartsQuery = this.database(chartTable)
            .whereIn(`${SpaceTableName}.space_uuid`, spaceUuids)
            .leftJoin(
                SpaceTableName,
                `${chartTable}.space_uuid`,
                `${SpaceTableName}.space_uuid`,
            )
            .leftJoin(
                UserTableName,
                `${chartTable}.last_version_updated_by_user_uuid`,
                `${UserTableName}.user_uuid`,
            )
            /* .leftJoin(
            PinnedChartTableName,
            `${PinnedChartTableName}.saved_chart_uuid`,
            `${chartTable}.saved_sql_uuid`,
            )
            .leftJoin(
                PinnedListTableName,
                `${PinnedListTableName}.pinned_list_uuid`,
                `${PinnedChartTableName}.pinned_list_uuid`,
            ) */
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
                `${chartTable}.dashboard_uuid`,
            )
            .select<
                {
                    uuid: string;
                    name: string;
                    description?: string;
                    created_at: Date;
                    user_uuid: string;
                    first_name: string;
                    last_name: string;
                    views_count: number;
                    first_viewed_at: Date | null;
                    chart_kind: ChartKind;
                    // pinned_list_uuid: string;
                    // order: number;
                    space_uuid: string;
                    space_name: string;
                    project_uuid: string;
                    organization_uuid: string;
                    dashboard_uuid: string | null;
                    dashboard_name: string | null;
                    slug: string;
                }[]
            >([
                `${chartTable}.${uuidColumnName} as uuid`,
                `${chartTable}.name`,
                `${chartTable}.description`,
                `${chartTable}.last_version_updated_at as created_at`,
                `${UserTableName}.user_uuid`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                `${chartTable}.views_count`,
                `${chartTable}.first_viewed_at`,
                `${chartTable}.last_version_chart_kind as chart_kind`,

                // `${PinnedListTableName}.pinned_list_uuid`,
                // `${PinnedChartTableName}.order`,
                `${SpaceTableName}.space_uuid`,
                `${SpaceTableName}.name as space_name`,
                `${ProjectTableName}.project_uuid`,
                `${OrganizationTableName}.organization_uuid`,
                `${DashboardsTableName}.dashboard_uuid`,
                `${DashboardsTableName}.name as dashboard_name`,
                `${chartTable}.slug`,
            ]);

        if (filters?.recentlyUpdated || filters?.mostPopular) {
            spaceChartsQuery = spaceChartsQuery
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
                                  column: `${chartTable}.last_version_updated_at`,
                                  order: 'desc',
                              },
                          ],
                )
                .limit(this.MOST_POPULAR_OR_RECENTLY_UPDATED_LIMIT);
        } else {
            spaceChartsQuery = spaceChartsQuery.orderBy([
                {
                    column: `${chartTable}.last_version_updated_at`,
                    order: 'desc',
                },
            ]);
        }

        return (await spaceChartsQuery).map((savedChart) => ({
            uuid: savedChart.uuid,
            name: savedChart.name,
            spaceName: savedChart.space_name,
            dashboardName: savedChart.dashboard_name,
            organizationUuid: savedChart.organization_uuid,
            projectUuid: savedChart.project_uuid,
            dashboardUuid: savedChart.dashboard_uuid,
            description: savedChart.description,
            updatedAt: savedChart.created_at,
            updatedByUser: {
                userUuid: savedChart.user_uuid,
                firstName: savedChart.first_name,
                lastName: savedChart.last_name,
            },
            spaceUuid: savedChart.space_uuid,
            views: savedChart.views_count,
            firstViewedAt: savedChart.first_viewed_at,
            chartType: ChartType.CARTESIAN,
            chartKind: savedChart.chart_kind,
            pinnedListUuid: '', // savedQuery.pinned_list_uuid,
            pinnedListOrder: 0, // savedQuery.order,
            validationErrors: [],
            slug: savedChart.slug,
            source: chartSourceType,
        }));
    }

    async getSpaceSqlCharts(
        spaceUuids: string[],
        filters?: {
            recentlyUpdated?: boolean;
            mostPopular?: boolean;
        },
    ): Promise<SpaceQuery[]> {
        return this.getSpaceCharts(
            {
                name: SavedSqlTableName,
                uuidColumnName: 'saved_sql_uuid',
                chartSourceType: ChartSourceType.SQL,
            },
            spaceUuids,
            filters,
        );
    }

    async getSpaceSemanticViewerCharts(
        spaceUuids: string[],
        filters?: {
            recentlyUpdated?: boolean;
            mostPopular?: boolean;
        },
    ): Promise<SpaceQuery[]> {
        return this.getSpaceCharts(
            {
                name: SavedSemanticViewerChartsTableName,
                uuidColumnName: 'saved_semantic_viewer_chart_uuid',
                chartSourceType: ChartSourceType.SEMANTIC_LAYER,
            },
            spaceUuids,
            filters,
        );
    }

    async getSpaceQueries(
        spaceUuids: string[],
        filters?: {
            recentlyUpdated?: boolean;
            mostPopular?: boolean;
        },
    ): Promise<SpaceQuery[]> {
        let spaceQueriesQuery = this.database(SavedChartsTableName)
            .whereIn(`${SpaceTableName}.space_uuid`, spaceUuids)
            .leftJoin(
                SpaceTableName,
                `${SavedChartsTableName}.space_id`,
                `${SpaceTableName}.space_id`,
            )
            .leftJoin(
                UserTableName,
                `${SavedChartsTableName}.last_version_updated_by_user_uuid`,
                `${UserTableName}.user_uuid`,
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
                    slug: string;
                }[]
            >([
                `${SavedChartsTableName}.saved_query_uuid`,
                `${SavedChartsTableName}.name`,
                `${SavedChartsTableName}.description`,
                `${SavedChartsTableName}.last_version_updated_at as created_at`,
                `${UserTableName}.user_uuid`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                `${SavedChartsTableName}.views_count`,
                `${SavedChartsTableName}.first_viewed_at`,
                `${SavedChartsTableName}.last_version_chart_kind as chart_kind`,
                this.database.raw(
                    `(SELECT ${SavedChartVersionsTableName}.chart_type FROM ${SavedChartVersionsTableName} WHERE ${SavedChartVersionsTableName}.saved_query_id = ${SavedChartsTableName}.saved_query_id ORDER BY ${SavedChartVersionsTableName}.created_at DESC LIMIT 1) as chart_type`,
                ),
                `${PinnedListTableName}.pinned_list_uuid`,
                `${PinnedChartTableName}.order`,
                this.database.raw(`
                    COALESCE(
                        (
                            SELECT json_agg(validations.*)
                            FROM validations
                            WHERE validations.saved_chart_uuid = saved_queries.saved_query_uuid
                            AND validations.job_id IS NULL
                        ), '[]'
                    ) as validation_errors
                `),
                `${SpaceTableName}.space_uuid`,
                `${SpaceTableName}.name as space_name`,
                `${ProjectTableName}.project_uuid`,
                `${OrganizationTableName}.organization_uuid`,
                `${DashboardsTableName}.dashboard_uuid`,
                `${DashboardsTableName}.name as dashboard_name`,
                `${SavedChartsTableName}.slug`,
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
                    column: `${SavedChartsTableName}.last_version_updated_at`,
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
            slug: savedQuery.slug,
            source: ChartSourceType.DBT_EXPLORE,
        }));
    }

    async getSpaceSummary(
        spaceUuid: string,
    ): Promise<Omit<SpaceSummary, 'userAccess'>> {
        return wrapSentryTransaction(
            'SpaceModel.getSpaceSummary',
            {},
            async () => {
                const [space] = await this.find({ spaceUuid });
                if (space === undefined)
                    throw new NotFoundError(
                        `Space with spaceUuid ${spaceUuid} does not exist`,
                    );
                return space;
            },
        );
    }

    async getSpacesForAccessCheck(
        spaceUuids: string[],
    ): Promise<
        Map<
            string,
            Pick<SpaceSummary, 'isPrivate' | 'organizationUuid' | 'projectUuid'>
        >
    > {
        const spaces = await this.database(SpaceTableName)
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .innerJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            )
            .leftJoin(
                SpaceUserAccessTableName,
                `${SpaceUserAccessTableName}.space_uuid`,
                `${SpaceTableName}.space_uuid`,
            )
            .leftJoin(
                `${UserTableName} as shared_with`,
                `${SpaceUserAccessTableName}.user_uuid`,
                `shared_with.user_uuid`,
            )
            .whereIn(`${SpaceTableName}.space_uuid`, spaceUuids)
            .select({
                spaceUuid: `${SpaceTableName}.space_uuid`,
                organizationUuid: `${OrganizationTableName}.organization_uuid`,
                projectUuid: `${ProjectTableName}.project_uuid`,
                isPrivate: this.database.raw(
                    SpaceModel.getRootSpaceIsPrivateQuery(),
                ),
                access: this.database.raw(
                    SpaceModel.getRootSpaceAccessQuery('shared_with'),
                ),
            })
            .groupBy(
                `${SpaceTableName}.space_uuid`,
                `${OrganizationTableName}.organization_uuid`,
                `${ProjectTableName}.project_uuid`,
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
        const rootSpaceUuid = await this.getSpaceRoot(spaceUuid);
        const spaceUuidToQueryForAccess = rootSpaceUuid ?? spaceUuid;
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
                (await this._getSpaceAccess([spaceUuidToQueryForAccess]))[
                    spaceUuidToQueryForAccess
                ] ?? [],
            groupsAccess: await this._getGroupAccess(spaceUuidToQueryForAccess),
            slug: space.slug,
            hasParent: space.hasParent,
        };
    }

    /**
     * Generates a slug for a space.
     * @param slug - The slug to generate.
     * @param forceSameSlug - Whether to force the slug to be the same as the input slug.
     * @param trx - The transaction to use.
     * @param parentSpaceUuid - The uuid of the parent space.
     * @returns The slug.
     */
    static async getSpaceSlug({
        slug,
        forceSameSlug,
        trx,
        parentSpaceUuid,
    }: {
        slug: string;
        forceSameSlug: boolean;
        trx: Knex;
        parentSpaceUuid: string | null;
    }) {
        if (parentSpaceUuid) {
            const [parentSpace] = await trx(SpaceTableName)
                .select('slug')
                .where('space_uuid', parentSpaceUuid);
            if (!parentSpace) {
                throw new NotFoundError(
                    `Parent space with uuid ${parentSpaceUuid} does not exist`,
                );
            }
            return `${parentSpace.slug}/${slug}`;
        }
        if (forceSameSlug) {
            return slug;
        }
        return generateUniqueSlug(trx, SpaceTableName, slug);
    }

    /**
     * Converts a slug to a path of type ltree.
     * @param slug - The slug to convert. eg. "my-space/my-sub-space"
     * @returns The path. eg. "my-space.my-sub-space"
     */
    static async getSpacePath({ slug }: { slug: string }) {
        return slug.replace(/\//g, '.');
    }

    async createSpace(
        projectUuid: string,
        name: string,
        userId: number,
        isPrivate: boolean,
        slug: string,
        forceSameSlug: boolean = false,
        parentSpaceUuid: string | null = null,
    ): Promise<Space> {
        return this.database.transaction(async (trx) => {
            const [project] = await trx(ProjectTableName)
                .select('project_id')
                .where('project_uuid', projectUuid);

            const spaceSlug = await SpaceModel.getSpaceSlug({
                slug,
                forceSameSlug,
                parentSpaceUuid,
                trx,
            });

            const spacePath = await SpaceModel.getSpacePath({
                slug: spaceSlug,
            });

            const [space] = await trx(SpaceTableName)
                .insert({
                    project_id: project.project_id,
                    is_private: isPrivate,
                    name,
                    created_by_user_id: userId,
                    slug: spaceSlug,
                    parent_space_uuid: parentSpaceUuid,
                    path: spacePath,
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
        });
    }

    async deleteSpace(spaceUuid: string): Promise<void> {
        await this.database(SpaceTableName)
            .where('space_uuid', spaceUuid)
            .delete();
    }

    async update(
        spaceUuid: string,
        space: Partial<UpdateSpace>,
    ): Promise<Space> {
        await this.database(SpaceTableName)
            .update({
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

    /**
     * Gets the root space UUID for a given space UUID
     *
     * This method uses PostgreSQL's ltree extension to find the root space of a hierarchy.
     * The spaces are stored in a tree structure where:
     * - Root spaces have a path with a single level (e.g., "my-space")
     * - Child spaces have paths that include their parent hierarchy (e.g., "my-space.my-child-space")
     * @param spaceUuid Space UUID to get the root for
     * @returns Root space UUID (or the same UUID if it's already a root or has no hierarchy)
     */
    async getSpaceRoot(spaceUuid: string): Promise<string | undefined> {
        const result = await this.database(SpaceTableName)
            .select<{ root_space_uuid: string; is_self_root: boolean }>(
                this.database.raw(`
                CASE 
                    WHEN path IS NOT NULL THEN 
                        (SELECT root_space.space_uuid 
                        FROM spaces root_space 
                        -- Using subpath(path, 0, 1) to extract the first element of the path
                        -- This gets just the root part of the path
                        WHERE subpath(root_space.path, 0, 1) = subpath(${SpaceTableName}.path, 0, 1)
                        -- nlevel(path) = 1 finds only root nodes (first level in hierarchy)
                        AND nlevel(root_space.path) = 1)
                    ELSE space_uuid 
                END as root_space_uuid,
                -- Check if this space is its own root (either it's a root space or has no hierarchy)
                CASE 
                    WHEN path IS NOT NULL THEN 
                        (nlevel(path) = 1 OR space_uuid = (
                            SELECT root_space.space_uuid 
                            FROM spaces root_space 
                            WHERE subpath(root_space.path, 0, 1) = subpath(${SpaceTableName}.path, 0, 1)
                            AND nlevel(root_space.path) = 1
                        ))
                    ELSE true
                END as is_self_root
            `),
            )
            .where('space_uuid', spaceUuid)
            .first();

        // Return undefined if the space is its own root
        return result?.is_self_root ? undefined : result?.root_space_uuid;
    }
}
