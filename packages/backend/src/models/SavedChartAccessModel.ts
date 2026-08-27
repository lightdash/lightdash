import { type Knex } from 'knex';
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { OrganizationTableName } from '../database/entities/organizations';
import { ProjectTableName } from '../database/entities/projects';
import {
    SavedChartGroupAccessTableName,
    SavedChartUserAccessTableName,
} from '../database/entities/savedChartAccess';
import { SavedChartsTableName } from '../database/entities/savedCharts';
import { SpaceTableName } from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';
import {
    getActiveGrantedGroupPredicate,
    getActiveProjectMemberPredicate,
    groupDirectAccessRows,
    type DirectAccess,
    type DirectAccessRow,
} from './directAccessModelUtils';

export type SavedChartDirectAccess = DirectAccess;

/**
 * Pure data access for saved (explore) chart direct grants. Mirrors
 * DashboardAccessModel: authorization (CASL, role delegation) is the calling
 * service's responsibility; the model enforces tenant safety only —
 * organization scoping and current-membership checks. Only space-saved charts
 * carry grants; the space join excludes dashboard-owned definitions
 * (`saved_queries.space_id` null).
 */
export class SavedChartAccessModel {
    constructor(private readonly database: Knex) {}

    async getUserAccess(
        savedChartUuids: string[],
        userUuid: string,
        {
            trx = this.database,
            organizationUuid,
        }: {
            trx?: Knex;
            organizationUuid: string;
        },
    ): Promise<Record<string, SavedChartDirectAccess>> {
        const uniqueUuids = [...new Set(savedChartUuids)];
        if (uniqueUuids.length === 0) {
            return {};
        }

        const rows: DirectAccessRow[] = await trx(SavedChartUserAccessTableName)
            .select({
                resourceUuid: `${SavedChartUserAccessTableName}.saved_chart_uuid`,
                organizationUuid: `${OrganizationTableName}.organization_uuid`,
                projectUuid: `${ProjectTableName}.project_uuid`,
                spaceUuid: `${SpaceTableName}.space_uuid`,
                role: `${SavedChartUserAccessTableName}.space_role`,
                groupUuid: trx.raw('NULL'),
            })
            .innerJoin(
                SavedChartsTableName,
                `${SavedChartsTableName}.saved_query_uuid`,
                `${SavedChartUserAccessTableName}.saved_chart_uuid`,
            )
            .innerJoin(
                SpaceTableName,
                `${SpaceTableName}.space_id`,
                `${SavedChartsTableName}.space_id`,
            )
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .innerJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${SavedChartUserAccessTableName}.user_uuid`,
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
                `${SavedChartUserAccessTableName}.saved_chart_uuid`,
                uniqueUuids,
            )
            .where(`${SavedChartUserAccessTableName}.user_uuid`, userUuid)
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .where(getActiveProjectMemberPredicate(trx))
            .whereNull(`${SavedChartsTableName}.deleted_at`)
            .whereNull(`${SpaceTableName}.deleted_at`)
            .unionAll(
                trx(SavedChartGroupAccessTableName)
                    .select({
                        resourceUuid: `${SavedChartGroupAccessTableName}.saved_chart_uuid`,
                        organizationUuid: `${OrganizationTableName}.organization_uuid`,
                        projectUuid: `${ProjectTableName}.project_uuid`,
                        spaceUuid: `${SpaceTableName}.space_uuid`,
                        role: `${SavedChartGroupAccessTableName}.space_role`,
                        groupUuid: `${SavedChartGroupAccessTableName}.group_uuid`,
                    })
                    .innerJoin(
                        SavedChartsTableName,
                        `${SavedChartsTableName}.saved_query_uuid`,
                        `${SavedChartGroupAccessTableName}.saved_chart_uuid`,
                    )
                    .innerJoin(
                        SpaceTableName,
                        `${SpaceTableName}.space_id`,
                        `${SavedChartsTableName}.space_id`,
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
                        `${SavedChartGroupAccessTableName}.group_uuid`,
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
                        `${SavedChartGroupAccessTableName}.saved_chart_uuid`,
                        uniqueUuids,
                    )
                    .where(`${UserTableName}.user_uuid`, userUuid)
                    .where(
                        `${OrganizationTableName}.organization_uuid`,
                        organizationUuid,
                    )
                    .where(getActiveProjectMemberPredicate(trx))
                    .where(
                        `${GroupMembershipTableName}.organization_id`,
                        trx.ref(`${ProjectTableName}.organization_id`),
                    )
                    .where(
                        getActiveGrantedGroupPredicate(
                            trx,
                            SavedChartGroupAccessTableName,
                        ),
                    )
                    .whereNull(`${SavedChartsTableName}.deleted_at`)
                    .whereNull(`${SpaceTableName}.deleted_at`),
            );

        return groupDirectAccessRows(rows);
    }
}
