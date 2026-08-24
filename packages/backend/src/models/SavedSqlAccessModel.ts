import { type Knex } from 'knex';
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { OrganizationTableName } from '../database/entities/organizations';
import { ProjectTableName } from '../database/entities/projects';
import { SavedSqlTableName } from '../database/entities/savedSql';
import {
    SavedSqlGroupAccessTableName,
    SavedSqlUserAccessTableName,
} from '../database/entities/savedSqlAccess';
import { UserTableName } from '../database/entities/users';
import {
    getActiveGrantedGroupPredicate,
    getActiveProjectMemberPredicate,
    groupDirectAccessRows,
    type DirectAccess,
    type DirectAccessRow,
} from './directAccessModelUtils';

export type SavedSqlDirectAccess = DirectAccess;

export class SavedSqlAccessModel {
    constructor(private readonly database: Knex) {}

    async getUserAccess(
        savedSqlUuids: string[],
        userUuid: string,
        { trx = this.database }: { trx?: Knex } = {},
    ): Promise<Record<string, SavedSqlDirectAccess>> {
        const uniqueSavedSqlUuids = [...new Set(savedSqlUuids)];
        if (uniqueSavedSqlUuids.length === 0) {
            return {};
        }

        const rows: DirectAccessRow[] = await trx(SavedSqlUserAccessTableName)
            .select({
                resourceUuid: `${SavedSqlUserAccessTableName}.saved_sql_uuid`,
                organizationUuid: `${OrganizationTableName}.organization_uuid`,
                projectUuid: `${ProjectTableName}.project_uuid`,
                role: `${SavedSqlUserAccessTableName}.space_role`,
                groupUuid: trx.raw('NULL'),
            })
            .innerJoin(
                SavedSqlTableName,
                `${SavedSqlTableName}.saved_sql_uuid`,
                `${SavedSqlUserAccessTableName}.saved_sql_uuid`,
            )
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_uuid`,
                `${SavedSqlTableName}.project_uuid`,
            )
            .innerJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${SavedSqlUserAccessTableName}.user_uuid`,
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
                `${SavedSqlUserAccessTableName}.saved_sql_uuid`,
                uniqueSavedSqlUuids,
            )
            .where(`${SavedSqlUserAccessTableName}.user_uuid`, userUuid)
            .where(getActiveProjectMemberPredicate(trx))
            .whereNull(`${SavedSqlTableName}.dashboard_uuid`)
            .whereNull(`${SavedSqlTableName}.deleted_at`)
            .unionAll(
                trx(SavedSqlGroupAccessTableName)
                    .select({
                        resourceUuid: `${SavedSqlGroupAccessTableName}.saved_sql_uuid`,
                        organizationUuid: `${OrganizationTableName}.organization_uuid`,
                        projectUuid: `${ProjectTableName}.project_uuid`,
                        role: `${SavedSqlGroupAccessTableName}.space_role`,
                        groupUuid: `${SavedSqlGroupAccessTableName}.group_uuid`,
                    })
                    .innerJoin(
                        SavedSqlTableName,
                        `${SavedSqlTableName}.saved_sql_uuid`,
                        `${SavedSqlGroupAccessTableName}.saved_sql_uuid`,
                    )
                    .innerJoin(
                        ProjectTableName,
                        `${ProjectTableName}.project_uuid`,
                        `${SavedSqlTableName}.project_uuid`,
                    )
                    .innerJoin(
                        OrganizationTableName,
                        `${OrganizationTableName}.organization_id`,
                        `${ProjectTableName}.organization_id`,
                    )
                    .innerJoin(
                        GroupMembershipTableName,
                        `${GroupMembershipTableName}.group_uuid`,
                        `${SavedSqlGroupAccessTableName}.group_uuid`,
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
                        `${SavedSqlGroupAccessTableName}.saved_sql_uuid`,
                        uniqueSavedSqlUuids,
                    )
                    .where(`${UserTableName}.user_uuid`, userUuid)
                    .where(getActiveProjectMemberPredicate(trx))
                    .where(
                        `${GroupMembershipTableName}.organization_id`,
                        trx.ref(`${ProjectTableName}.organization_id`),
                    )
                    .where(
                        getActiveGrantedGroupPredicate(
                            trx,
                            SavedSqlGroupAccessTableName,
                        ),
                    )
                    .whereNull(`${SavedSqlTableName}.dashboard_uuid`)
                    .whereNull(`${SavedSqlTableName}.deleted_at`),
            );

        return groupDirectAccessRows(rows);
    }
}
