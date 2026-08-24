import { type Knex } from 'knex';
import {
    DashboardGroupAccessTableName,
    DashboardUserAccessTableName,
} from '../database/entities/dashboardAccess';
import { DashboardsTableName } from '../database/entities/dashboards';
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { OrganizationTableName } from '../database/entities/organizations';
import { ProjectTableName } from '../database/entities/projects';
import { SpaceTableName } from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';
import {
    getActiveProjectMemberPredicate,
    groupDirectAccessRows,
    type DirectAccess,
    type DirectAccessRow,
} from './directAccessModelUtils';

export type DashboardDirectAccess = DirectAccess;

export class DashboardAccessModel {
    constructor(private readonly database: Knex) {}

    async getUserAccess(
        dashboardUuids: string[],
        userUuid: string,
        { trx = this.database }: { trx?: Knex } = {},
    ): Promise<Record<string, DashboardDirectAccess>> {
        const uniqueDashboardUuids = [...new Set(dashboardUuids)];
        if (uniqueDashboardUuids.length === 0) {
            return {};
        }

        const rows: DirectAccessRow[] = await trx(DashboardUserAccessTableName)
            .select({
                resourceUuid: `${DashboardUserAccessTableName}.dashboard_uuid`,
                organizationUuid: `${OrganizationTableName}.organization_uuid`,
                projectUuid: `${ProjectTableName}.project_uuid`,
                role: `${DashboardUserAccessTableName}.space_role`,
                groupUuid: trx.raw('NULL'),
            })
            .innerJoin(
                DashboardsTableName,
                `${DashboardsTableName}.dashboard_uuid`,
                `${DashboardUserAccessTableName}.dashboard_uuid`,
            )
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
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${DashboardUserAccessTableName}.user_uuid`,
            )
            .innerJoin(
                OrganizationMembershipsTableName,
                function joinCurrentOrganizationMembership() {
                    this.on(
                        `${OrganizationMembershipsTableName}.user_id`,
                        `${UserTableName}.user_id`,
                    ).andOn(
                        `${OrganizationMembershipsTableName}.organization_id`,
                        `${ProjectTableName}.organization_id`,
                    );
                },
            )
            .innerJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            )
            .whereIn(
                `${DashboardUserAccessTableName}.dashboard_uuid`,
                uniqueDashboardUuids,
            )
            .where(`${DashboardUserAccessTableName}.user_uuid`, userUuid)
            .where(getActiveProjectMemberPredicate(trx))
            .whereNull(`${DashboardsTableName}.deleted_at`)
            .unionAll(
                trx(DashboardGroupAccessTableName)
                    .select({
                        resourceUuid: `${DashboardGroupAccessTableName}.dashboard_uuid`,
                        organizationUuid: `${OrganizationTableName}.organization_uuid`,
                        projectUuid: `${ProjectTableName}.project_uuid`,
                        role: `${DashboardGroupAccessTableName}.space_role`,
                        groupUuid: `${DashboardGroupAccessTableName}.group_uuid`,
                    })
                    .innerJoin(
                        DashboardsTableName,
                        `${DashboardsTableName}.dashboard_uuid`,
                        `${DashboardGroupAccessTableName}.dashboard_uuid`,
                    )
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
                    .innerJoin(
                        GroupMembershipTableName,
                        `${GroupMembershipTableName}.group_uuid`,
                        `${DashboardGroupAccessTableName}.group_uuid`,
                    )
                    .innerJoin(
                        UserTableName,
                        `${UserTableName}.user_id`,
                        `${GroupMembershipTableName}.user_id`,
                    )
                    .innerJoin(
                        OrganizationMembershipsTableName,
                        function joinCurrentOrganizationMembership() {
                            this.on(
                                `${OrganizationMembershipsTableName}.user_id`,
                                `${UserTableName}.user_id`,
                            ).andOn(
                                `${OrganizationMembershipsTableName}.organization_id`,
                                `${ProjectTableName}.organization_id`,
                            );
                        },
                    )
                    .whereIn(
                        `${DashboardGroupAccessTableName}.dashboard_uuid`,
                        uniqueDashboardUuids,
                    )
                    .where(`${UserTableName}.user_uuid`, userUuid)
                    .where(getActiveProjectMemberPredicate(trx))
                    .whereRaw('?? = ??', [
                        `${GroupMembershipTableName}.organization_id`,
                        `${ProjectTableName}.organization_id`,
                    ])
                    .whereNull(`${DashboardsTableName}.deleted_at`),
            );

        return groupDirectAccessRows(rows);
    }
}
