import {
    assertUnreachable,
    DirectAccessPrincipalType,
    DirectAccessResourceType,
    NotFoundError,
    ParameterError,
    type DirectAccessAssignment,
    type DirectAccessPrincipalRef,
    type SpaceMemberRole,
    type UUID,
} from '@lightdash/common';
import { type Knex } from 'knex';
import {
    AppGroupAccessTableName,
    AppUserAccessTableName,
} from '../database/entities/appAccess';
import { AppsTableName } from '../database/entities/apps';
import {
    DashboardGroupAccessTableName,
    DashboardUserAccessTableName,
} from '../database/entities/dashboardAccess';
import { DashboardsTableName } from '../database/entities/dashboards';
import { EmailTableName } from '../database/entities/emails';
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
import { GroupTableName } from '../database/entities/groups';
import { OrganizationTableName } from '../database/entities/organizations';
import { ProjectTableName } from '../database/entities/projects';
import {
    SavedChartGroupAccessTableName,
    SavedChartUserAccessTableName,
} from '../database/entities/savedChartAccess';
import { SavedChartsTableName } from '../database/entities/savedCharts';
import { SavedSqlTableName } from '../database/entities/savedSql';
import {
    SavedSqlGroupAccessTableName,
    SavedSqlUserAccessTableName,
} from '../database/entities/savedSqlAccess';
import { SpaceTableName } from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';
import {
    validateDirectAccessGroup,
    validateDirectAccessUser,
    type DirectAccessMutationContext,
    type DirectAccessMutationResult,
    type DirectAccessResetResult,
} from './directAccessModelUtils';

/**
 * Closed registry entry: the concrete grant tables behind one resource type.
 * Concrete tables keep real foreign keys; nothing here is polymorphic.
 */
type DirectAccessTableConfig = {
    userTable: string;
    groupTable: string;
    resourceColumn: string;
};

const TABLE_CONFIG: Record<DirectAccessResourceType, DirectAccessTableConfig> =
    {
        [DirectAccessResourceType.DASHBOARD]: {
            userTable: DashboardUserAccessTableName,
            groupTable: DashboardGroupAccessTableName,
            resourceColumn: 'dashboard_uuid',
        },
        [DirectAccessResourceType.CHART]: {
            userTable: SavedChartUserAccessTableName,
            groupTable: SavedChartGroupAccessTableName,
            resourceColumn: 'saved_chart_uuid',
        },
        [DirectAccessResourceType.SQL_CHART]: {
            userTable: SavedSqlUserAccessTableName,
            groupTable: SavedSqlGroupAccessTableName,
            resourceColumn: 'saved_sql_uuid',
        },
        [DirectAccessResourceType.APP]: {
            userTable: AppUserAccessTableName,
            groupTable: AppGroupAccessTableName,
            resourceColumn: 'app_uuid',
        },
    };

const DASHBOARD_OWNED_CHART_RESTRICTION =
    'Cannot grant direct access to a dashboard-owned chart; grant access to its dashboard instead';
const DASHBOARD_OWNED_SQL_RESTRICTION =
    'Cannot grant direct access to a dashboard-owned SQL chart; grant access to its dashboard instead';

type DirectAccessMutationTarget = {
    context: DirectAccessMutationContext;
    // null when the resource can receive new grants; otherwise the reason
    // grant creation is rejected. Revoke and reset stay allowed so stale
    // grants can always be cleaned up.
    grantRestriction: string | null;
};

/**
 * Where a granted resource lives. Personal apps have no space; dashboard-owned
 * chart definitions carry their owning dashboard so authorization can route
 * through the dashboard's grants.
 */
export type DirectAccessResourceLocation = {
    organizationUuid: UUID;
    projectUuid: UUID;
    spaceUuid: UUID | null;
    dashboardUuid: UUID | null;
    createdByUserUuid: UUID | null;
};

export type DirectAccessReplaceResult = DirectAccessResetResult & {
    appliedUsers: number;
    appliedGroups: number;
};

type PrincipalWrite = {
    table: string;
    principalColumn: 'user_uuid' | 'group_uuid';
};

const getPrincipalWrite = (
    config: DirectAccessTableConfig,
    principalType: DirectAccessPrincipalType,
): PrincipalWrite => {
    switch (principalType) {
        case DirectAccessPrincipalType.USER:
            return { table: config.userTable, principalColumn: 'user_uuid' };
        case DirectAccessPrincipalType.GROUP:
            return { table: config.groupTable, principalColumn: 'group_uuid' };
        default:
            return assertUnreachable(
                principalType,
                'Unsupported direct access principal type',
            );
    }
};

/**
 * Generic administration store for direct access grants. One tenant-safe
 * implementation of list, upsert, revoke, reset, and transactional policy
 * replacement covers every registered resource type; the per-type knowledge
 * is confined to the table registry and the target locators below.
 *
 * Authorization (CASL, role delegation) is the calling service's
 * responsibility; the model enforces tenant safety only — organization
 * scoping, current-membership checks, and row locking.
 */
export class DirectAccessModel {
    constructor(private readonly database: Knex) {}

    // ------------------------------------------------------------------
    // Target locators. Mutations discover optimistically, then lock parents
    // before children to match FK cascade order, and re-read the resource
    // under lock to reject ownership races (a chart moving between a space
    // and a dashboard mid-grant).
    // ------------------------------------------------------------------

    private static async getDashboardMutationTarget(
        trx: Knex,
        resourceUuid: string,
        expectedOrganizationUuid: string,
    ): Promise<DirectAccessMutationTarget> {
        const context = await trx(DashboardsTableName)
            .innerJoin(
                SpaceTableName,
                `${SpaceTableName}.space_id`,
                `${DashboardsTableName}.space_id`,
            )
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
            .where(`${DashboardsTableName}.dashboard_uuid`, resourceUuid)
            .whereNull(`${DashboardsTableName}.deleted_at`)
            .where(
                `${OrganizationTableName}.organization_uuid`,
                expectedOrganizationUuid,
            )
            .select<DirectAccessMutationContext>({
                organizationId: `${OrganizationTableName}.organization_id`,
                organizationUuid: `${OrganizationTableName}.organization_uuid`,
                projectId: `${ProjectTableName}.project_id`,
                projectUuid: `${ProjectTableName}.project_uuid`,
            })
            .forUpdate(DashboardsTableName)
            .first();

        if (context === undefined) {
            throw new NotFoundError('Direct access target not found');
        }
        return { context, grantRestriction: null };
    }

    private static async lockOwnerChain(
        trx: Knex,
        owner: DirectAccessMutationContext,
        expectedOrganizationUuid: string,
        ownerSpaceId: number,
    ): Promise<DirectAccessMutationContext> {
        const organization = await trx(OrganizationTableName)
            .where('organization_id', owner.organizationId)
            .where('organization_uuid', expectedOrganizationUuid)
            .select<{ organizationId: number; organizationUuid: string }>({
                organizationId: 'organization_id',
                organizationUuid: 'organization_uuid',
            })
            .forNoKeyUpdate(OrganizationTableName)
            .first();
        if (organization === undefined) {
            throw new NotFoundError('Direct access target not found');
        }

        const project = await trx(ProjectTableName)
            .where('project_id', owner.projectId)
            .where('organization_id', organization.organizationId)
            .select<{ projectId: number; projectUuid: string }>({
                projectId: 'project_id',
                projectUuid: 'project_uuid',
            })
            .forNoKeyUpdate(ProjectTableName)
            .first();
        if (project === undefined) {
            throw new NotFoundError('Direct access target not found');
        }

        const space = await trx(SpaceTableName)
            .where('space_id', ownerSpaceId)
            .where('project_id', project.projectId)
            .whereNull('deleted_at')
            .select('space_id')
            .forNoKeyUpdate(SpaceTableName)
            .first();
        if (space === undefined) {
            throw new NotFoundError('Direct access target not found');
        }

        return {
            organizationId: organization.organizationId,
            organizationUuid: organization.organizationUuid,
            projectId: project.projectId,
            projectUuid: project.projectUuid,
        };
    }

    private static async getChartMutationTarget(
        trx: Knex,
        resourceUuid: string,
        expectedOrganizationUuid: string,
    ): Promise<DirectAccessMutationTarget> {
        const candidateChart = await trx(SavedChartsTableName)
            .where(`${SavedChartsTableName}.saved_query_uuid`, resourceUuid)
            .whereNull(`${SavedChartsTableName}.deleted_at`)
            .select<{
                spaceId: number | null;
                dashboardUuid: string | null;
                storedProjectUuid: string;
            }>({
                spaceId: `${SavedChartsTableName}.space_id`,
                dashboardUuid: `${SavedChartsTableName}.dashboard_uuid`,
                storedProjectUuid: `${SavedChartsTableName}.project_uuid`,
            })
            .first();

        if (candidateChart === undefined) {
            throw new NotFoundError('Direct access target not found');
        }

        let ownerSpaceId = candidateChart.spaceId;
        if (ownerSpaceId === null) {
            if (candidateChart.dashboardUuid === null) {
                throw new NotFoundError('Direct access target not found');
            }
            const candidateDashboard = await trx(DashboardsTableName)
                .where('dashboard_uuid', candidateChart.dashboardUuid)
                .whereNull('deleted_at')
                .select<{ spaceId: number }>({ spaceId: 'space_id' })
                .first();
            if (candidateDashboard === undefined) {
                throw new NotFoundError('Direct access target not found');
            }
            ownerSpaceId = candidateDashboard.spaceId;
        }

        const candidateOwner = await trx(SpaceTableName)
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
            .where(`${SpaceTableName}.space_id`, ownerSpaceId)
            .whereNull(`${SpaceTableName}.deleted_at`)
            .where(
                `${OrganizationTableName}.organization_uuid`,
                expectedOrganizationUuid,
            )
            .select<DirectAccessMutationContext>({
                organizationId: `${OrganizationTableName}.organization_id`,
                organizationUuid: `${OrganizationTableName}.organization_uuid`,
                projectId: `${ProjectTableName}.project_id`,
                projectUuid: `${ProjectTableName}.project_uuid`,
            })
            .first();
        if (candidateOwner === undefined) {
            throw new NotFoundError('Direct access target not found');
        }

        const context = await DirectAccessModel.lockOwnerChain(
            trx,
            candidateOwner,
            expectedOrganizationUuid,
            ownerSpaceId,
        );

        if (
            candidateChart.spaceId === null &&
            candidateChart.dashboardUuid !== null
        ) {
            const dashboard = await trx(DashboardsTableName)
                .where('dashboard_uuid', candidateChart.dashboardUuid)
                .where('space_id', ownerSpaceId)
                .where('project_uuid', context.projectUuid)
                .whereNull('deleted_at')
                .select('dashboard_uuid')
                .forNoKeyUpdate(DashboardsTableName)
                .first();
            if (dashboard === undefined) {
                throw new NotFoundError('Direct access target not found');
            }
        }

        const chart = await trx(SavedChartsTableName)
            .where('saved_query_uuid', resourceUuid)
            .whereNull('deleted_at')
            .select<{
                spaceId: number | null;
                dashboardUuid: string | null;
                storedProjectUuid: string;
            }>({
                spaceId: 'space_id',
                dashboardUuid: 'dashboard_uuid',
                storedProjectUuid: 'project_uuid',
            })
            .forUpdate(SavedChartsTableName)
            .first();
        if (
            chart === undefined ||
            chart.spaceId !== candidateChart.spaceId ||
            chart.dashboardUuid !== candidateChart.dashboardUuid ||
            chart.storedProjectUuid !== context.projectUuid
        ) {
            throw new NotFoundError('Direct access target not found');
        }

        return {
            context,
            grantRestriction:
                chart.spaceId !== null && chart.dashboardUuid === null
                    ? null
                    : DASHBOARD_OWNED_CHART_RESTRICTION,
        };
    }

    private static async getSqlChartMutationTarget(
        trx: Knex,
        resourceUuid: string,
        expectedOrganizationUuid: string,
    ): Promise<DirectAccessMutationTarget> {
        const candidateSql = await trx(SavedSqlTableName)
            .where(`${SavedSqlTableName}.saved_sql_uuid`, resourceUuid)
            .whereNull(`${SavedSqlTableName}.deleted_at`)
            .select<{
                spaceUuid: string | null;
                dashboardUuid: string | null;
                storedProjectUuid: string;
            }>({
                spaceUuid: `${SavedSqlTableName}.space_uuid`,
                dashboardUuid: `${SavedSqlTableName}.dashboard_uuid`,
                storedProjectUuid: `${SavedSqlTableName}.project_uuid`,
            })
            .first();

        if (candidateSql === undefined) {
            throw new NotFoundError('Direct access target not found');
        }

        let ownerSpaceQuery = trx(SpaceTableName);
        // Set together with the space-less branch below, so the later re-check
        // of that same branch has a non-null dashboard to lock.
        let ownerDashboardUuid: string | null = null;
        if (candidateSql.spaceUuid !== null) {
            ownerSpaceQuery = ownerSpaceQuery.where(
                `${SpaceTableName}.space_uuid`,
                candidateSql.spaceUuid,
            );
        } else {
            if (candidateSql.dashboardUuid === null) {
                throw new NotFoundError('Direct access target not found');
            }
            ownerDashboardUuid = candidateSql.dashboardUuid;
            const candidateDashboard = await trx(DashboardsTableName)
                .where('dashboard_uuid', ownerDashboardUuid)
                .whereNull('deleted_at')
                .select<{ spaceId: number }>({ spaceId: 'space_id' })
                .first();
            if (candidateDashboard === undefined) {
                throw new NotFoundError('Direct access target not found');
            }
            ownerSpaceQuery = ownerSpaceQuery.where(
                `${SpaceTableName}.space_id`,
                candidateDashboard.spaceId,
            );
        }

        const candidateOwner = await ownerSpaceQuery
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
            .whereNull(`${SpaceTableName}.deleted_at`)
            .where(
                `${OrganizationTableName}.organization_uuid`,
                expectedOrganizationUuid,
            )
            .select<DirectAccessMutationContext & { ownerSpaceId: number }>({
                organizationId: `${OrganizationTableName}.organization_id`,
                organizationUuid: `${OrganizationTableName}.organization_uuid`,
                projectId: `${ProjectTableName}.project_id`,
                projectUuid: `${ProjectTableName}.project_uuid`,
                ownerSpaceId: `${SpaceTableName}.space_id`,
            })
            .first();
        if (candidateOwner === undefined) {
            throw new NotFoundError('Direct access target not found');
        }

        const context = await DirectAccessModel.lockOwnerChain(
            trx,
            candidateOwner,
            expectedOrganizationUuid,
            candidateOwner.ownerSpaceId,
        );

        if (ownerDashboardUuid !== null) {
            const dashboard = await trx(DashboardsTableName)
                .where('dashboard_uuid', ownerDashboardUuid)
                .where('space_id', candidateOwner.ownerSpaceId)
                .where('project_uuid', context.projectUuid)
                .whereNull('deleted_at')
                .select('dashboard_uuid')
                .forNoKeyUpdate(DashboardsTableName)
                .first();
            if (dashboard === undefined) {
                throw new NotFoundError('Direct access target not found');
            }
        }

        const sqlChart = await trx(SavedSqlTableName)
            .where('saved_sql_uuid', resourceUuid)
            .whereNull('deleted_at')
            .select<{
                spaceUuid: string | null;
                dashboardUuid: string | null;
                storedProjectUuid: string;
            }>({
                spaceUuid: 'space_uuid',
                dashboardUuid: 'dashboard_uuid',
                storedProjectUuid: 'project_uuid',
            })
            .forUpdate(SavedSqlTableName)
            .first();
        if (
            sqlChart === undefined ||
            sqlChart.spaceUuid !== candidateSql.spaceUuid ||
            sqlChart.dashboardUuid !== candidateSql.dashboardUuid ||
            sqlChart.storedProjectUuid !== context.projectUuid
        ) {
            throw new NotFoundError('Direct access target not found');
        }

        return {
            context,
            grantRestriction:
                sqlChart.spaceUuid !== null && sqlChart.dashboardUuid === null
                    ? null
                    : DASHBOARD_OWNED_SQL_RESTRICTION,
        };
    }

    private static async getAppMutationTarget(
        trx: Knex,
        resourceUuid: string,
        expectedOrganizationUuid: string,
    ): Promise<DirectAccessMutationTarget> {
        const candidateApp = await trx(AppsTableName)
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_uuid`,
                `${AppsTableName}.project_uuid`,
            )
            .innerJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            )
            .where(`${AppsTableName}.app_id`, resourceUuid)
            .whereNull(`${AppsTableName}.deleted_at`)
            .where(
                `${OrganizationTableName}.organization_uuid`,
                expectedOrganizationUuid,
            )
            .select<DirectAccessMutationContext & { spaceUuid: string | null }>(
                {
                    organizationId: `${OrganizationTableName}.organization_id`,
                    organizationUuid: `${OrganizationTableName}.organization_uuid`,
                    projectId: `${ProjectTableName}.project_id`,
                    projectUuid: `${ProjectTableName}.project_uuid`,
                    spaceUuid: `${AppsTableName}.space_uuid`,
                },
            )
            .first();

        if (candidateApp === undefined) {
            throw new NotFoundError('Direct access target not found');
        }

        const organization = await trx(OrganizationTableName)
            .where('organization_id', candidateApp.organizationId)
            .where('organization_uuid', expectedOrganizationUuid)
            .select('organization_id')
            .forNoKeyUpdate(OrganizationTableName)
            .first();
        if (organization === undefined) {
            throw new NotFoundError('Direct access target not found');
        }

        const project = await trx(ProjectTableName)
            .where('project_id', candidateApp.projectId)
            .where('organization_id', candidateApp.organizationId)
            .select('project_id')
            .forNoKeyUpdate(ProjectTableName)
            .first();
        if (project === undefined) {
            throw new NotFoundError('Direct access target not found');
        }

        if (candidateApp.spaceUuid !== null) {
            const space = await trx(SpaceTableName)
                .where('space_uuid', candidateApp.spaceUuid)
                .where('project_id', candidateApp.projectId)
                .whereNull('deleted_at')
                .select('space_id')
                .forNoKeyUpdate(SpaceTableName)
                .first();
            if (space === undefined) {
                throw new NotFoundError('Direct access target not found');
            }
        }

        const app = await trx(AppsTableName)
            .where('app_id', resourceUuid)
            .whereNull('deleted_at')
            .select<{ spaceUuid: string | null; storedProjectUuid: string }>({
                spaceUuid: 'space_uuid',
                storedProjectUuid: 'project_uuid',
            })
            .forUpdate(AppsTableName)
            .first();
        if (
            app === undefined ||
            app.spaceUuid !== candidateApp.spaceUuid ||
            app.storedProjectUuid !== candidateApp.projectUuid
        ) {
            throw new NotFoundError('Direct access target not found');
        }

        return {
            context: {
                organizationId: candidateApp.organizationId,
                organizationUuid: candidateApp.organizationUuid,
                projectId: candidateApp.projectId,
                projectUuid: candidateApp.projectUuid,
            },
            grantRestriction: null,
        };
    }

    private static async getMutationTarget(
        trx: Knex,
        resourceType: DirectAccessResourceType,
        resourceUuid: string,
        expectedOrganizationUuid: string,
    ): Promise<DirectAccessMutationTarget> {
        switch (resourceType) {
            case DirectAccessResourceType.DASHBOARD:
                return DirectAccessModel.getDashboardMutationTarget(
                    trx,
                    resourceUuid,
                    expectedOrganizationUuid,
                );
            case DirectAccessResourceType.CHART:
                return DirectAccessModel.getChartMutationTarget(
                    trx,
                    resourceUuid,
                    expectedOrganizationUuid,
                );
            case DirectAccessResourceType.SQL_CHART:
                return DirectAccessModel.getSqlChartMutationTarget(
                    trx,
                    resourceUuid,
                    expectedOrganizationUuid,
                );
            case DirectAccessResourceType.APP:
                return DirectAccessModel.getAppMutationTarget(
                    trx,
                    resourceUuid,
                    expectedOrganizationUuid,
                );
            default:
                return assertUnreachable(
                    resourceType,
                    'Unsupported direct access resource type',
                );
        }
    }

    // ------------------------------------------------------------------
    // Read-only resource location, for authorization and listing.
    // ------------------------------------------------------------------

    // Space-saved content uses its own space; dashboard-owned definitions
    // resolve through their live owning dashboard.
    private async resolveOwnerSpaceId(
        spaceId: number | null,
        dashboardUuid: string | null,
    ): Promise<number | undefined> {
        if (spaceId !== null) {
            return spaceId;
        }
        if (dashboardUuid === null) {
            return undefined;
        }
        const dashboard = await this.database(DashboardsTableName)
            .where('dashboard_uuid', dashboardUuid)
            .whereNull('deleted_at')
            .select<{ spaceId: number }>({ spaceId: 'space_id' })
            .first();
        return dashboard?.spaceId;
    }

    private async findOwnerSpaceLocation(
        ownerSpaceId: number,
        expectedOrganizationUuid: string,
    ): Promise<
        | {
              organizationUuid: string;
              projectUuid: string;
              spaceUuid: string;
          }
        | undefined
    > {
        return this.database(SpaceTableName)
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
            .where(`${SpaceTableName}.space_id`, ownerSpaceId)
            .whereNull(`${SpaceTableName}.deleted_at`)
            .where(
                `${OrganizationTableName}.organization_uuid`,
                expectedOrganizationUuid,
            )
            .select<{
                organizationUuid: string;
                projectUuid: string;
                spaceUuid: string;
            }>({
                organizationUuid: `${OrganizationTableName}.organization_uuid`,
                projectUuid: `${ProjectTableName}.project_uuid`,
                spaceUuid: `${SpaceTableName}.space_uuid`,
            })
            .first();
    }

    async findResourceLocation(
        resourceType: DirectAccessResourceType,
        resourceUuid: string,
        expectedOrganizationUuid: string,
    ): Promise<DirectAccessResourceLocation | undefined> {
        switch (resourceType) {
            case DirectAccessResourceType.DASHBOARD: {
                const row = await this.database(DashboardsTableName)
                    .innerJoin(
                        SpaceTableName,
                        `${SpaceTableName}.space_id`,
                        `${DashboardsTableName}.space_id`,
                    )
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
                    .where(
                        `${DashboardsTableName}.dashboard_uuid`,
                        resourceUuid,
                    )
                    .whereNull(`${DashboardsTableName}.deleted_at`)
                    .whereNull(`${SpaceTableName}.deleted_at`)
                    .where(
                        `${OrganizationTableName}.organization_uuid`,
                        expectedOrganizationUuid,
                    )
                    .select<{
                        organizationUuid: string;
                        projectUuid: string;
                        spaceUuid: string;
                    }>({
                        organizationUuid: `${OrganizationTableName}.organization_uuid`,
                        projectUuid: `${ProjectTableName}.project_uuid`,
                        spaceUuid: `${SpaceTableName}.space_uuid`,
                    })
                    .first();
                return row === undefined
                    ? undefined
                    : {
                          ...row,
                          dashboardUuid: null,
                          createdByUserUuid: null,
                      };
            }
            case DirectAccessResourceType.CHART: {
                const chart = await this.database(SavedChartsTableName)
                    .where('saved_query_uuid', resourceUuid)
                    .whereNull('deleted_at')
                    .select<{
                        spaceId: number | null;
                        dashboardUuid: string | null;
                    }>({
                        spaceId: 'space_id',
                        dashboardUuid: 'dashboard_uuid',
                    })
                    .first();
                if (chart === undefined) {
                    return undefined;
                }
                const ownerSpaceId = await this.resolveOwnerSpaceId(
                    chart.spaceId,
                    chart.dashboardUuid,
                );
                if (ownerSpaceId === undefined) {
                    return undefined;
                }
                const owner = await this.findOwnerSpaceLocation(
                    ownerSpaceId,
                    expectedOrganizationUuid,
                );
                return owner === undefined
                    ? undefined
                    : {
                          ...owner,
                          dashboardUuid: chart.dashboardUuid,
                          createdByUserUuid: null,
                      };
            }
            case DirectAccessResourceType.SQL_CHART: {
                const sqlChart = await this.database(SavedSqlTableName)
                    .where('saved_sql_uuid', resourceUuid)
                    .whereNull('deleted_at')
                    .select<{
                        spaceUuid: string | null;
                        dashboardUuid: string | null;
                        projectUuid: string;
                    }>({
                        spaceUuid: 'space_uuid',
                        dashboardUuid: 'dashboard_uuid',
                        projectUuid: 'project_uuid',
                    })
                    .first();
                if (sqlChart === undefined) {
                    return undefined;
                }
                let ownerSpaceId: number | undefined;
                if (sqlChart.spaceUuid !== null) {
                    const space = await this.database(SpaceTableName)
                        .where('space_uuid', sqlChart.spaceUuid)
                        .select<{ spaceId: number }>({ spaceId: 'space_id' })
                        .first();
                    ownerSpaceId = space?.spaceId;
                } else {
                    ownerSpaceId = await this.resolveOwnerSpaceId(
                        null,
                        sqlChart.dashboardUuid,
                    );
                }
                if (ownerSpaceId === undefined) {
                    return undefined;
                }
                const owner = await this.findOwnerSpaceLocation(
                    ownerSpaceId,
                    expectedOrganizationUuid,
                );
                if (
                    owner === undefined ||
                    owner.projectUuid !== sqlChart.projectUuid
                ) {
                    return undefined;
                }
                return {
                    ...owner,
                    dashboardUuid: sqlChart.dashboardUuid,
                    createdByUserUuid: null,
                };
            }
            case DirectAccessResourceType.APP: {
                const row = await this.database(AppsTableName)
                    .innerJoin(
                        ProjectTableName,
                        `${ProjectTableName}.project_uuid`,
                        `${AppsTableName}.project_uuid`,
                    )
                    .innerJoin(
                        OrganizationTableName,
                        `${OrganizationTableName}.organization_id`,
                        `${ProjectTableName}.organization_id`,
                    )
                    .leftJoin(SpaceTableName, function joinAppSpace() {
                        this.on(
                            `${SpaceTableName}.space_uuid`,
                            `${AppsTableName}.space_uuid`,
                        )
                            .andOn(
                                `${SpaceTableName}.project_id`,
                                `${ProjectTableName}.project_id`,
                            )
                            .andOnNull(`${SpaceTableName}.deleted_at`);
                    })
                    .where(`${AppsTableName}.app_id`, resourceUuid)
                    .whereNull(`${AppsTableName}.deleted_at`)
                    .where(
                        `${OrganizationTableName}.organization_uuid`,
                        expectedOrganizationUuid,
                    )
                    // A space-backed app whose space is deleted has no live
                    // location; treat it as not found rather than personal.
                    .where((locationIsActive) => {
                        void locationIsActive
                            .whereNull(`${AppsTableName}.space_uuid`)
                            .orWhereNotNull(`${SpaceTableName}.space_uuid`);
                    })
                    .select<{
                        organizationUuid: string;
                        projectUuid: string;
                        spaceUuid: string | null;
                        createdByUserUuid: string | null;
                    }>({
                        organizationUuid: `${OrganizationTableName}.organization_uuid`,
                        projectUuid: `${ProjectTableName}.project_uuid`,
                        spaceUuid: `${AppsTableName}.space_uuid`,
                        createdByUserUuid: `${AppsTableName}.created_by_user_uuid`,
                    })
                    .first();
                return row === undefined
                    ? undefined
                    : { ...row, dashboardUuid: null };
            }
            default:
                return assertUnreachable(
                    resourceType,
                    'Unsupported direct access resource type',
                );
        }
    }

    /**
     * Uuids of resources of one type that carry a persisted grant for the
     * user or any of their groups. A cheap candidate scan only — callers must
     * validate candidates through the type's read model (`getUserAccess`) so
     * inert grants (lost membership, deleted resources, ineligible ownership)
     * never surface.
     */
    async findCandidateResourceUuidsForUser(
        resourceType: DirectAccessResourceType,
        userUuid: UUID,
    ): Promise<UUID[]> {
        const config = TABLE_CONFIG[resourceType];
        const rows: { resourceUuid: string }[] = await this.database(
            config.userTable,
        )
            .select({
                resourceUuid: `${config.userTable}.${config.resourceColumn}`,
            })
            .where(`${config.userTable}.user_uuid`, userUuid)
            .unionAll(
                this.database(config.groupTable)
                    .select({
                        resourceUuid: `${config.groupTable}.${config.resourceColumn}`,
                    })
                    .innerJoin(
                        GroupMembershipTableName,
                        `${GroupMembershipTableName}.group_uuid`,
                        `${config.groupTable}.group_uuid`,
                    )
                    .innerJoin(
                        UserTableName,
                        `${UserTableName}.user_id`,
                        `${GroupMembershipTableName}.user_id`,
                    )
                    .where(`${UserTableName}.user_uuid`, userUuid),
            );
        return [...new Set(rows.map((row) => row.resourceUuid))];
    }

    // ------------------------------------------------------------------
    // Administration operations.
    // ------------------------------------------------------------------

    /**
     * Persisted assignments for one resource, exactly as stored. Rows whose
     * principal has lost project access remain visible so administrators can
     * see and revoke stale policy; runtime authorization keeps them inert.
     */
    async listAssignments({
        resourceType,
        resourceUuid,
        organizationUuid,
    }: {
        resourceType: DirectAccessResourceType;
        resourceUuid: string;
        organizationUuid: string;
    }): Promise<DirectAccessAssignment[]> {
        const location = await this.findResourceLocation(
            resourceType,
            resourceUuid,
            organizationUuid,
        );
        if (location === undefined) {
            throw new NotFoundError('Direct access target not found');
        }

        const config = TABLE_CONFIG[resourceType];
        const [userRows, groupRows] = await Promise.all([
            this.database(config.userTable)
                .innerJoin(
                    UserTableName,
                    `${UserTableName}.user_uuid`,
                    `${config.userTable}.user_uuid`,
                )
                .leftJoin(EmailTableName, function joinPrimaryEmail() {
                    this.on(
                        `${EmailTableName}.user_id`,
                        `${UserTableName}.user_id`,
                    ).andOnVal(`${EmailTableName}.is_primary`, true);
                })
                .where(
                    `${config.userTable}.${config.resourceColumn}`,
                    resourceUuid,
                )
                .select<
                    {
                        userUuid: string;
                        firstName: string;
                        lastName: string;
                        email: string | null;
                        role: SpaceMemberRole;
                        grantedByUserUuid: string | null;
                        createdAt: Date;
                        updatedAt: Date;
                    }[]
                >({
                    userUuid: `${UserTableName}.user_uuid`,
                    firstName: `${UserTableName}.first_name`,
                    lastName: `${UserTableName}.last_name`,
                    email: `${EmailTableName}.email`,
                    role: `${config.userTable}.space_role`,
                    grantedByUserUuid: `${config.userTable}.granted_by_user_uuid`,
                    createdAt: `${config.userTable}.created_at`,
                    updatedAt: `${config.userTable}.updated_at`,
                })
                .orderBy([
                    { column: `${config.userTable}.created_at`, order: 'asc' },
                    { column: `${UserTableName}.user_uuid`, order: 'asc' },
                ]),
            this.database(config.groupTable)
                .innerJoin(
                    GroupTableName,
                    `${GroupTableName}.group_uuid`,
                    `${config.groupTable}.group_uuid`,
                )
                .where(
                    `${config.groupTable}.${config.resourceColumn}`,
                    resourceUuid,
                )
                .select<
                    {
                        groupUuid: string;
                        name: string;
                        role: SpaceMemberRole;
                        grantedByUserUuid: string | null;
                        createdAt: Date;
                        updatedAt: Date;
                    }[]
                >({
                    groupUuid: `${GroupTableName}.group_uuid`,
                    name: `${GroupTableName}.name`,
                    role: `${config.groupTable}.space_role`,
                    grantedByUserUuid: `${config.groupTable}.granted_by_user_uuid`,
                    createdAt: `${config.groupTable}.created_at`,
                    updatedAt: `${config.groupTable}.updated_at`,
                })
                .orderBy([
                    { column: `${config.groupTable}.created_at`, order: 'asc' },
                    { column: `${GroupTableName}.group_uuid`, order: 'asc' },
                ]),
        ]);

        return [
            ...userRows.map(
                (row): DirectAccessAssignment => ({
                    principal: {
                        type: DirectAccessPrincipalType.USER,
                        userUuid: row.userUuid,
                        firstName: row.firstName,
                        lastName: row.lastName,
                        email: row.email,
                    },
                    role: row.role,
                    grantedByUserUuid: row.grantedByUserUuid,
                    createdAt: row.createdAt,
                    updatedAt: row.updatedAt,
                }),
            ),
            ...groupRows.map(
                (row): DirectAccessAssignment => ({
                    principal: {
                        type: DirectAccessPrincipalType.GROUP,
                        groupUuid: row.groupUuid,
                        name: row.name,
                    },
                    role: row.role,
                    grantedByUserUuid: row.grantedByUserUuid,
                    createdAt: row.createdAt,
                    updatedAt: row.updatedAt,
                }),
            ),
        ];
    }

    private static async validatePrincipal(
        trx: Knex,
        context: DirectAccessMutationContext,
        principal: DirectAccessPrincipalRef,
    ): Promise<void> {
        const valid =
            principal.type === DirectAccessPrincipalType.USER
                ? await validateDirectAccessUser(trx, context, principal.uuid)
                : await validateDirectAccessGroup(trx, context, principal.uuid);
        if (!valid) {
            throw new NotFoundError('Direct access target not found');
        }
    }

    async upsertAccess({
        resourceType,
        resourceUuid,
        principal,
        role,
        organizationUuid,
        grantedByUserUuid,
    }: {
        resourceType: DirectAccessResourceType;
        resourceUuid: string;
        principal: DirectAccessPrincipalRef;
        role: SpaceMemberRole;
        organizationUuid: string;
        grantedByUserUuid: string;
    }): Promise<DirectAccessMutationResult> {
        return this.database.transaction(async (trx) => {
            const { context, grantRestriction } =
                await DirectAccessModel.getMutationTarget(
                    trx,
                    resourceType,
                    resourceUuid,
                    organizationUuid,
                );
            if (grantRestriction !== null) {
                throw new ParameterError(grantRestriction);
            }
            await DirectAccessModel.validatePrincipal(trx, context, principal);

            const config = TABLE_CONFIG[resourceType];
            const { table, principalColumn } = getPrincipalWrite(
                config,
                principal.type,
            );
            const existing = await trx(table)
                .where({
                    [config.resourceColumn]: resourceUuid,
                    [principalColumn]: principal.uuid,
                })
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
            await trx(table)
                .insert({
                    [config.resourceColumn]: resourceUuid,
                    [principalColumn]: principal.uuid,
                    space_role: role,
                    granted_by_user_uuid: grantedByUserUuid,
                })
                .onConflict([config.resourceColumn, principalColumn])
                .merge({
                    space_role: role,
                    granted_by_user_uuid: grantedByUserUuid,
                    updated_at: trx.fn.now(),
                });
            return {
                ...context,
                beforeRole: existing?.space_role ?? null,
                afterRole: role,
            };
        });
    }

    // Revokes are idempotent: revoking a grant that does not exist succeeds
    // as a no-op ({ beforeRole: null, afterRole: null }) so stale grants can
    // be removed after ownership changes. A missing or cross-organization
    // resource still fails with NotFoundError.
    async revokeAccess({
        resourceType,
        resourceUuid,
        principal,
        organizationUuid,
    }: {
        resourceType: DirectAccessResourceType;
        resourceUuid: string;
        principal: DirectAccessPrincipalRef;
        organizationUuid: string;
    }): Promise<DirectAccessMutationResult> {
        return this.database.transaction(async (trx) => {
            const { context } = await DirectAccessModel.getMutationTarget(
                trx,
                resourceType,
                resourceUuid,
                organizationUuid,
            );
            const config = TABLE_CONFIG[resourceType];
            const { table, principalColumn } = getPrincipalWrite(
                config,
                principal.type,
            );
            const filter = {
                [config.resourceColumn]: resourceUuid,
                [principalColumn]: principal.uuid,
            };
            const existing = await trx(table)
                .where(filter)
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
            if (existing === undefined) {
                return { ...context, beforeRole: null, afterRole: null };
            }
            await trx(table).where(filter).delete();
            return {
                ...context,
                beforeRole: existing.space_role,
                afterRole: null,
            };
        });
    }

    async resetAccess({
        resourceType,
        resourceUuid,
        organizationUuid,
    }: {
        resourceType: DirectAccessResourceType;
        resourceUuid: string;
        organizationUuid: string;
    }): Promise<DirectAccessResetResult> {
        return this.database.transaction(async (trx) => {
            const { context } = await DirectAccessModel.getMutationTarget(
                trx,
                resourceType,
                resourceUuid,
                organizationUuid,
            );
            const config = TABLE_CONFIG[resourceType];
            const [revokedUsers, revokedGroups] = await Promise.all([
                trx(config.userTable)
                    .where(config.resourceColumn, resourceUuid)
                    .delete(),
                trx(config.groupTable)
                    .where(config.resourceColumn, resourceUuid)
                    .delete(),
            ]);
            return { ...context, revokedUsers, revokedGroups };
        });
    }

    /**
     * Atomically replaces the resource's whole direct policy. Used by
     * content-as-code import; either every assignment applies or none do.
     */
    async replacePolicy({
        resourceType,
        resourceUuid,
        organizationUuid,
        grantedByUserUuid,
        assignments,
    }: {
        resourceType: DirectAccessResourceType;
        resourceUuid: string;
        organizationUuid: string;
        grantedByUserUuid: string;
        assignments: {
            principal: DirectAccessPrincipalRef;
            role: SpaceMemberRole;
        }[];
    }): Promise<DirectAccessReplaceResult> {
        const seen = new Set<string>();
        for (const { principal } of assignments) {
            const key = `${principal.type}:${principal.uuid}`;
            if (seen.has(key)) {
                throw new ParameterError(
                    'Direct access policy contains duplicate principals',
                );
            }
            seen.add(key);
        }

        return this.database.transaction(async (trx) => {
            const { context, grantRestriction } =
                await DirectAccessModel.getMutationTarget(
                    trx,
                    resourceType,
                    resourceUuid,
                    organizationUuid,
                );
            if (assignments.length > 0 && grantRestriction !== null) {
                throw new ParameterError(grantRestriction);
            }
            for (const { principal } of assignments) {
                // Sequential on purpose: validation shares the transaction.
                // eslint-disable-next-line no-await-in-loop
                await DirectAccessModel.validatePrincipal(
                    trx,
                    context,
                    principal,
                );
            }

            const config = TABLE_CONFIG[resourceType];
            const [revokedUsers, revokedGroups] = await Promise.all([
                trx(config.userTable)
                    .where(config.resourceColumn, resourceUuid)
                    .delete(),
                trx(config.groupTable)
                    .where(config.resourceColumn, resourceUuid)
                    .delete(),
            ]);

            const userAssignments = assignments.filter(
                ({ principal }) =>
                    principal.type === DirectAccessPrincipalType.USER,
            );
            const groupAssignments = assignments.filter(
                ({ principal }) =>
                    principal.type === DirectAccessPrincipalType.GROUP,
            );
            if (userAssignments.length > 0) {
                await trx(config.userTable).insert(
                    userAssignments.map(({ principal, role }) => ({
                        [config.resourceColumn]: resourceUuid,
                        user_uuid: principal.uuid,
                        space_role: role,
                        granted_by_user_uuid: grantedByUserUuid,
                    })),
                );
            }
            if (groupAssignments.length > 0) {
                await trx(config.groupTable).insert(
                    groupAssignments.map(({ principal, role }) => ({
                        [config.resourceColumn]: resourceUuid,
                        group_uuid: principal.uuid,
                        space_role: role,
                        granted_by_user_uuid: grantedByUserUuid,
                    })),
                );
            }

            return {
                ...context,
                revokedUsers,
                revokedGroups,
                appliedUsers: userAssignments.length,
                appliedGroups: groupAssignments.length,
            };
        });
    }
}
