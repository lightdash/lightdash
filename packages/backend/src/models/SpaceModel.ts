import {
    ChartKind,
    ChartSourceType,
    ChartType,
    convertOrganizationRoleToProjectRole,
    convertProjectRoleToSpaceRole,
    convertSpaceRoleToProjectRole,
    getHighestProjectRole,
    getHighestSpaceRole,
    getLtreePathFromSlug,
    GroupRole,
    NotFoundError,
    OrganizationMemberRole,
    OrganizationRole,
    ParameterError,
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
import {
    generateUniqueSlug,
    generateUniqueSpaceSlug,
} from '../utils/SlugUtils';
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
                     FROM ${SpaceTableName} ps
                     WHERE ps.path @> ${SpaceTableName}.path
                     AND nlevel(ps.path) = 1
                     AND ps.project_id = ${SpaceTableName}.project_id
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
                     FROM ${SpaceUserAccessTableName} sua
                     JOIN ${SpaceTableName} root_space ON sua.space_uuid = root_space.space_uuid
                     WHERE root_space.path @> ${SpaceTableName}.path
                     AND nlevel(root_space.path) = 1
                     AND root_space.project_id = ${SpaceTableName}.project_id
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
            parentSpaceUuid: space.parent_space_uuid,
            path: space.path,
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
            childSpaces: [],
            access: [],
            groupsAccess: [],
            slug: space.slug,
        };
    }

    async find(
        filters: {
            projectUuid?: string;
            projectUuids?: string[];
            spaceUuid?: string;
            spaceUuids?: string[];
            slug?: string;
            path?: string;
            parentSpaceUuid?: string;
        },
        { trx = this.database }: { trx?: Knex } = { trx: this.database },
    ): Promise<Omit<SpaceSummary, 'userAccess'>[]> {
        return Sentry.startSpan(
            {
                op: 'SpaceModel.find',
                name: 'SpaceModel.find',
            },
            async () => {
                const query = trx(SpaceTableName)
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
                        name: trx.raw('max(spaces.name)'),
                        isPrivate: trx.raw(
                            SpaceModel.getRootSpaceIsPrivateQuery(),
                        ),
                        access: trx.raw(
                            SpaceModel.getRootSpaceAccessQuery('shared_with'),
                        ),
                        pinnedListUuid: `${PinnedListTableName}.pinned_list_uuid`,
                        pinnedListOrder: `${PinnedSpaceTableName}.order`,
                        chartCount: trx
                            .countDistinct(
                                `${SavedChartsTableName}.saved_query_id`,
                            )
                            .from(SavedChartsTableName)
                            .whereRaw(
                                `${SavedChartsTableName}.space_id = ${SpaceTableName}.space_id`,
                            ),
                        dashboardCount: trx
                            .countDistinct(
                                `${DashboardsTableName}.dashboard_id`,
                            )
                            .from(DashboardsTableName)
                            .whereRaw(
                                `${DashboardsTableName}.space_id = ${SpaceTableName}.space_id`,
                            ),
                        slug: `${SpaceTableName}.slug`,
                        parentSpaceUuid: `${SpaceTableName}.parent_space_uuid`,
                        path: `${SpaceTableName}.path`,
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
                if (filters.parentSpaceUuid) {
                    void query.where(
                        `${SpaceTableName}.parent_space_uuid`,
                        filters.parentSpaceUuid,
                    );
                }
                if (filters.slug) {
                    void query.where(`${SpaceTableName}.slug`, filters.slug);
                }
                if (filters.path) {
                    void query.where(`${SpaceTableName}.path`, filters.path);
                }
                return query;
            },
        );
    }

    async get(
        spaceUuid: string,
    ): Promise<
        Omit<
            Space,
            'queries' | 'dashboards' | 'access' | 'groupsAccess' | 'childSpaces'
        >
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
            parentSpaceUuid: row.parent_space_uuid,
            path: row.path,
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
        const spaceOrRootUuid = await this.getSpaceRoot(spaceUuid);

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
            .where('space_uuid', spaceOrRootUuid);
        return access;
    }

    /**
     * Get the access for a space
     * Nested Spaces MVP - inherit access from root space
     * @param userUuid - The UUID of the user to get access for
     * @param spaceUuid - The UUID of the space to get access for
     * @returns The access for the space
     */
    async getUserSpaceAccess(
        userUuid: string,
        spaceUuid: string,
    ): Promise<SpaceShare[]> {
        const spaceOrRootUuid = await this.getSpaceRoot(spaceUuid);
        return (
            (
                await this._getSpaceAccess([spaceOrRootUuid], {
                    userUuid,
                })
            )[spaceOrRootUuid] ?? []
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

        const rootSpaceUuids = Array.from(
            new Set(
                spacesWithRootSpaceUuid.map(
                    ({ rootSpaceUuid }) => rootSpaceUuid,
                ),
            ),
        );

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
                `${SpaceTableName}.parent_space_uuid`,
                `${SpaceTableName}.path`,
                `${SpaceTableName}.project_id`,
                `${SpaceTableName}.is_private`,
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

    /**
     * Gets the breadcrumbs for a space
     * @param spaceUuid - The UUID of the space to get the breadcrumbs for
     * @param projectUuid - The UUID of the project to get the breadcrumbs for
     * @returns The breadcrumbs for the space in an array like : ['Parent Space', 'Child Space']
     */
    async getSpaceBreadcrumbs(
        spaceUuid: string,
        projectUuid: string,
    ): Promise<
        {
            name: string;
            uuid: string;
        }[]
    > {
        const space = await this.database(SpaceTableName)
            .select('path', 'name', 'space_uuid')
            .where('space_uuid', spaceUuid)
            .first();

        if (!space) {
            throw new NotFoundError(
                `Space with uuid ${spaceUuid} does not exist`,
            );
        }

        const ancestorsNamesOrderByLevel = await this.database(SpaceTableName)
            .leftJoin(
                `${ProjectTableName}`,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid)
            .whereRaw('path @> ?::ltree AND path != ?::ltree', [
                space.path,
                space.path,
            ])
            .select<DbSpace[]>(
                `${SpaceTableName}.name`,
                `${SpaceTableName}.space_uuid`,
                this.database.raw('nlevel(path) as level'),
            )
            .orderBy('level', 'asc');

        const breadcrumbs = ancestorsNamesOrderByLevel
            .map((ancestor) => ({
                name: ancestor.name,
                uuid: ancestor.space_uuid,
            }))
            .concat({
                name: space.name,
                uuid: space.space_uuid,
            });

        return breadcrumbs;
    }

    async getFullSpace(spaceUuid: string): Promise<Space> {
        const space = await this.get(spaceUuid);
        const rootSpaceUuid = await this.getSpaceRoot(spaceUuid);
        const breadcrumbs = await this.getSpaceBreadcrumbs(
            spaceUuid,
            space.projectUuid,
        );
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
            childSpaces: await this.find({
                parentSpaceUuid: spaceUuid,
            }),
            access:
                (await this._getSpaceAccess([rootSpaceUuid]))[rootSpaceUuid] ??
                [],
            groupsAccess: await this._getGroupAccess(rootSpaceUuid),
            slug: space.slug,
            parentSpaceUuid: space.parentSpaceUuid,
            path: space.path,
            breadcrumbs,
        };
    }

    async getSpaceAncestors({
        spaceUuid,
        projectUuid,
    }: {
        spaceUuid: string;
        projectUuid: string;
    }) {
        const space = await this.database(SpaceTableName)
            .select('path')
            .where('space_uuid', spaceUuid)
            .first();

        if (!space) {
            throw new NotFoundError(
                `Space with uuid ${spaceUuid} does not exist`,
            );
        }

        const ancestors = await this.database(SpaceTableName)
            .select('space_uuid')
            .innerJoin(
                `${ProjectTableName}`,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .whereRaw('?::ltree <@ path', [space.path])
            .andWhereNot('space_uuid', spaceUuid)
            .andWhere(`${ProjectTableName}.project_uuid`, projectUuid);

        return ancestors.map((ancestor) => ancestor.space_uuid);
    }

    async findClosestAncestorByPath({
        path,
        projectUuid,
    }: {
        path: string;
        projectUuid: string;
    }) {
        const closestAncestor = await this.database(SpaceTableName)
            .select('space_uuid')
            .innerJoin(
                `${ProjectTableName}`,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .whereRaw('?::ltree <@ path', [path])
            .andWhere(`${ProjectTableName}.project_uuid`, projectUuid)
            .orderByRaw('nlevel(path) DESC')
            .first();

        return closestAncestor ? closestAncestor.space_uuid : null;
    }

    static async getSpaceSlugByUuid({
        trx,
        spaceUuid,
    }: {
        trx: Knex;
        spaceUuid: string;
    }) {
        const [space] = await trx(SpaceTableName)
            .select('slug')
            .where('space_uuid', spaceUuid);

        if (!space) {
            throw new NotFoundError(
                `Space with uuid ${spaceUuid} does not exist`,
            );
        }
        return space.slug;
    }

    /**
     * Generates a slug for a space.
     * @param slug - The slug to generate.
     * @param trx - The transaction to use.
     * @param parentSpaceUuid - The uuid of the parent space.
     * @returns The slug.
     */
    static async getSpaceSlug({
        slug,
        trx,
        parentSpaceUuid,
        forceSameSlug,
    }: {
        slug: string;
        trx: Knex;
        parentSpaceUuid: string | null;
        forceSameSlug: boolean;
    }) {
        if (forceSameSlug && !parentSpaceUuid) {
            return slug;
        }

        if (parentSpaceUuid) {
            const parentSpaceSlug = await this.getSpaceSlugByUuid({
                trx,
                spaceUuid: parentSpaceUuid,
            });
            return `${parentSpaceSlug}/${slug}`;
        }

        return generateUniqueSlug(trx, SpaceTableName, slug);
    }

    async generateSpacePath(
        spaceSlug: string,
        parentSpaceUuid: string | null,
        projectId: number,
        { trx = this.database }: { trx?: Knex } = {},
    ) {
        if (!parentSpaceUuid) {
            return getLtreePathFromSlug(spaceSlug);
        }

        const parentSpace = await trx(SpaceTableName)
            .select('path')
            .where('space_uuid', parentSpaceUuid)
            .where('project_id', projectId)
            .first();

        if (!parentSpace) {
            throw new NotFoundError(
                `Parent space with uuid ${parentSpaceUuid} does not exist`,
            );
        }

        return `${parentSpace.path}.${getLtreePathFromSlug(spaceSlug)}`;
    }

    async createSpace(
        spaceData: {
            name: string;
            isPrivate: boolean;
            parentSpaceUuid: string | null;
        },
        {
            projectUuid,
            userId,
            trx = this.database,
            path,
        }: {
            trx?: Knex;
            userId: number;
            projectUuid: string;
            path?: string;
        },
    ): Promise<Space> {
        const [project] = await trx(ProjectTableName)
            .select('project_id')
            .where('project_uuid', projectUuid);

        const spaceSlug = await generateUniqueSpaceSlug(
            spaceData.name,
            project.project_id,
            {
                trx,
            },
        );

        let spacePath = '';
        if (path) {
            // 1. `path` property is passed to `createSpace` function when Promoting a space or using content as code
            // 2. If `PromoteService` or `CoderService` call `createSpace` that means that given space was not fount in given project so needs to be created – and existance check was done by using path (1)
            // 3. So given all the above, it makes sense to create the new space using the passed path (instead of slug) as that's the field we use for matching
            spacePath = path;
        } else {
            spacePath = await this.generateSpacePath(
                spaceSlug,
                spaceData.parentSpaceUuid,
                project.project_id,
                { trx },
            );
        }

        const [space] = await trx(SpaceTableName)
            .insert({
                project_id: project.project_id,
                is_private: spaceData.isPrivate,
                name: spaceData.name,
                created_by_user_id: userId,
                slug: spaceSlug,
                parent_space_uuid: spaceData.parentSpaceUuid ?? null,
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
            childSpaces: [],
            access: [],
            groupsAccess: [],
            pinnedListUuid: null,
            pinnedListOrder: null,
            slug: space.slug,
            parentSpaceUuid: space.parent_space_uuid,
            path: space.path,
        };
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

    async moveToSpace(
        {
            projectUuid,
            itemUuid: spaceUuid,
            targetSpaceUuid,
        }: {
            projectUuid: string;
            itemUuid: string;
            targetSpaceUuid: string | null;
        },
        { tx = this.database }: { tx?: Knex } = {},
    ): Promise<void> {
        const [project] = await tx(ProjectTableName)
            .select('project_id')
            .where('project_uuid', projectUuid);

        if (!project) {
            throw new NotFoundError(
                `Project with uuid ${projectUuid} does not exist`,
            );
        }

        // check if parent space is not subtree of space
        const isCycle = await tx
            .with('space_to_move', (query) => {
                void query
                    .select('path')
                    .from(SpaceTableName)
                    .where('space_uuid', spaceUuid)
                    .andWhere('project_id', project.project_id); // scope the space being moved to the project
            })
            .with('target_parent', (query) => {
                if (targetSpaceUuid === null) {
                    // If moving to root, there's no parent, so no cycle is possible from here.
                    void query
                        .select(tx.raw('null::ltree as path'))
                        .where(tx.raw('false'));
                } else {
                    void query
                        .select('path')
                        .from(SpaceTableName)
                        .where('space_uuid', targetSpaceUuid)
                        .andWhere('project_id', project.project_id); // scope the target parent space to the project
                }
            })
            .select(tx.raw('1')) // We only care if a row exists
            .from('space_to_move')
            // Check if the target parent's path is a descendant of the space we are moving.
            .joinRaw(
                'JOIN target_parent ON target_parent.path <@ space_to_move.path',
            )
            .first();

        if (isCycle) {
            throw new ParameterError(
                'You cannot move a space into one of its own nested-spaces. Please choose a different location.',
            );
        }

        await tx.raw(
            `
                UPDATE ${SpaceTableName} AS s
                SET
                    -- Recalculate the path by prepending the new parent's path.
                    -- COALESCE handles moving to the root (where p.path is NULL).
                    path = COALESCE(p.path, ''::ltree) || subpath(s.path, nlevel(m.path) - 1),
                    -- Update the foreign key for the specific space being moved.
                    parent_space_uuid = CASE
                        WHEN s.space_uuid = ? THEN ?
                        ELSE s.parent_space_uuid
                    END
                FROM
                    -- 'm' is the space being moved.
                    ${SpaceTableName} AS m
                    -- 'p' is the target parent space. LEFT JOIN handles moving to the root.
                    LEFT JOIN ${SpaceTableName} AS p ON p.space_uuid = ?
                WHERE
                    m.space_uuid = ?
                    -- Scope the space being moved ('m') to the correct project and UUID.
                    AND m.project_id = ?
                    -- Ensure the parent space 'p' also belongs to the same project.
                    AND s.project_id = m.project_id
                    AND s.path <@ m.path
                    AND ((?::uuid) IS NULL OR p.project_id = m.project_id)
            `,
            [
                spaceUuid,
                targetSpaceUuid,
                targetSpaceUuid,
                spaceUuid,
                project.project_id,
                targetSpaceUuid,
            ],
        );
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
     * Checks if a space is a root space
     * @param spaceUuid - The UUID of the space to check
     * @returns True if the space is a root space, false otherwise
     */
    async isRootSpace(spaceUuid: string): Promise<boolean> {
        const rootSpaceUuid = await this.getSpaceRoot(spaceUuid);
        return rootSpaceUuid === spaceUuid;
    }

    /**
     * Gets the root space UUID for a given space UUID
     *
     * This method uses PostgreSQL's ltree extension to find the root space of a hierarchy.
     * The spaces are stored in a tree structure where:
     * - Root spaces have a path with a single level (e.g., "my-space")
     * - Child spaces have paths that include their parent hierarchy (e.g., "my-space.my-child-space")
     * @param spaceUuid Space UUID to get the root for
     * @returns Root space UUID (or itself if it's already a root space)
     */
    async getSpaceRoot(spaceUuid: string): Promise<string> {
        return this.database.transaction(async (trx) => {
            const space = await trx(SpaceTableName)
                .select(['path', 'project_id'])
                .where('space_uuid', spaceUuid)
                .first();

            if (!space || !space.path) {
                throw new NotFoundError(
                    `Space with uuid ${spaceUuid} does not exist`,
                );
            }

            const root = await trx(SpaceTableName)
                .select('space_uuid')
                .whereRaw('nlevel(path) = 1')
                .andWhereRaw('path @> ?', [space.path])
                .andWhere('project_id', space.project_id)
                .first();

            if (!root) {
                throw new NotFoundError(
                    `Root space for space for ${spaceUuid} not found`,
                );
            }

            return root.space_uuid;
        });
    }
}
