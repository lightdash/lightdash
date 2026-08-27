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
import { SpaceTableName } from '../database/entities/spaces';
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
        {
            trx = this.database,
            organizationUuid,
        }: {
            trx?: Knex;
            organizationUuid: string;
        },
    ): Promise<Record<string, SavedSqlDirectAccess>> {
        const uniqueUuids = [...new Set(savedSqlUuids)];
        if (uniqueUuids.length === 0) {
            return {};
        }

        const rows: DirectAccessRow[] = await trx(SavedSqlUserAccessTableName)
            .select({
                resourceUuid: `${SavedSqlUserAccessTableName}.saved_sql_uuid`,
                organizationUuid: `${OrganizationTableName}.organization_uuid`,
                projectUuid: `${ProjectTableName}.project_uuid`,
                spaceUuid: `${SpaceTableName}.space_uuid`,
                role: `${SavedSqlUserAccessTableName}.space_role`,
                groupUuid: trx.raw('NULL'),
            })
            .innerJoin(
                SavedSqlTableName,
                `${SavedSqlTableName}.saved_sql_uuid`,
                `${SavedSqlUserAccessTableName}.saved_sql_uuid`,
            )
            .innerJoin(
                SpaceTableName,
                `${SpaceTableName}.space_uuid`,
                `${SavedSqlTableName}.space_uuid`,
            )
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
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
                uniqueUuids,
            )
            .where(`${SavedSqlUserAccessTableName}.user_uuid`, userUuid)
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .where(getActiveProjectMemberPredicate(trx))
            .where(
                `${SavedSqlTableName}.project_uuid`,
                trx.ref(`${ProjectTableName}.project_uuid`),
            )
            .whereNull(`${SavedSqlTableName}.dashboard_uuid`)
            .whereNull(`${SavedSqlTableName}.deleted_at`)
            .whereNull(`${SpaceTableName}.deleted_at`)
            .unionAll(
                trx(SavedSqlGroupAccessTableName)
                    .select({
                        resourceUuid: `${SavedSqlGroupAccessTableName}.saved_sql_uuid`,
                        organizationUuid: `${OrganizationTableName}.organization_uuid`,
                        projectUuid: `${ProjectTableName}.project_uuid`,
                        spaceUuid: `${SpaceTableName}.space_uuid`,
                        role: `${SavedSqlGroupAccessTableName}.space_role`,
                        groupUuid: `${SavedSqlGroupAccessTableName}.group_uuid`,
                    })
                    .innerJoin(
                        SavedSqlTableName,
                        `${SavedSqlTableName}.saved_sql_uuid`,
                        `${SavedSqlGroupAccessTableName}.saved_sql_uuid`,
                    )
                    .innerJoin(
                        SpaceTableName,
                        `${SpaceTableName}.space_uuid`,
                        `${SavedSqlTableName}.space_uuid`,
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
                            SavedSqlGroupAccessTableName,
                        ),
                    )
                    .where(
                        `${SavedSqlTableName}.project_uuid`,
                        trx.ref(`${ProjectTableName}.project_uuid`),
                    )
                    .whereNull(`${SavedSqlTableName}.dashboard_uuid`)
                    .whereNull(`${SavedSqlTableName}.deleted_at`)
                    .whereNull(`${SpaceTableName}.deleted_at`),
            );

        return groupDirectAccessRows(rows);
    }
}
