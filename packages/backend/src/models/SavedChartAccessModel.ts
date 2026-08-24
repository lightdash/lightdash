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
import { UserTableName } from '../database/entities/users';
import {
    getActiveGrantedGroupPredicate,
    getActiveProjectMemberPredicate,
    groupDirectAccessRows,
    type DirectAccess,
    type DirectAccessRow,
} from './directAccessModelUtils';

export type SavedChartDirectAccess = DirectAccess;

export class SavedChartAccessModel {
    constructor(private readonly database: Knex) {}

    async getUserAccess(
        savedChartUuids: string[],
        userUuid: string,
        { trx = this.database }: { trx?: Knex } = {},
    ): Promise<Record<string, SavedChartDirectAccess>> {
        const uniqueSavedChartUuids = [...new Set(savedChartUuids)];
        if (uniqueSavedChartUuids.length === 0) {
            return {};
        }

        const rows: DirectAccessRow[] = await trx(SavedChartUserAccessTableName)
            .select({
                resourceUuid: `${SavedChartUserAccessTableName}.saved_chart_uuid`,
                organizationUuid: `${OrganizationTableName}.organization_uuid`,
                projectUuid: `${ProjectTableName}.project_uuid`,
                role: `${SavedChartUserAccessTableName}.space_role`,
                groupUuid: trx.raw('NULL'),
            })
            .innerJoin(
                SavedChartsTableName,
                `${SavedChartsTableName}.saved_query_uuid`,
                `${SavedChartUserAccessTableName}.saved_chart_uuid`,
            )
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_uuid`,
                `${SavedChartsTableName}.project_uuid`,
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
                uniqueSavedChartUuids,
            )
            .where(`${SavedChartUserAccessTableName}.user_uuid`, userUuid)
            .where(getActiveProjectMemberPredicate(trx))
            .whereNull(`${SavedChartsTableName}.dashboard_uuid`)
            .whereNull(`${SavedChartsTableName}.deleted_at`)
            .unionAll(
                trx(SavedChartGroupAccessTableName)
                    .select({
                        resourceUuid: `${SavedChartGroupAccessTableName}.saved_chart_uuid`,
                        organizationUuid: `${OrganizationTableName}.organization_uuid`,
                        projectUuid: `${ProjectTableName}.project_uuid`,
                        role: `${SavedChartGroupAccessTableName}.space_role`,
                        groupUuid: `${SavedChartGroupAccessTableName}.group_uuid`,
                    })
                    .innerJoin(
                        SavedChartsTableName,
                        `${SavedChartsTableName}.saved_query_uuid`,
                        `${SavedChartGroupAccessTableName}.saved_chart_uuid`,
                    )
                    .innerJoin(
                        ProjectTableName,
                        `${ProjectTableName}.project_uuid`,
                        `${SavedChartsTableName}.project_uuid`,
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
                        uniqueSavedChartUuids,
                    )
                    .where(`${UserTableName}.user_uuid`, userUuid)
                    .where(getActiveProjectMemberPredicate(trx))
                    .whereRaw('?? = ??', [
                        `${GroupMembershipTableName}.organization_id`,
                        `${ProjectTableName}.organization_id`,
                    ])
                    .where(
                        getActiveGrantedGroupPredicate(
                            trx,
                            SavedChartGroupAccessTableName,
                        ),
                    )
                    .whereNull(`${SavedChartsTableName}.dashboard_uuid`)
                    .whereNull(`${SavedChartsTableName}.deleted_at`),
            );

        return groupDirectAccessRows(rows);
    }
}
