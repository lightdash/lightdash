import { type Knex } from 'knex';
import {
    AppGroupAccessTableName,
    AppUserAccessTableName,
} from '../database/entities/appAccess';
import { AppsTableName } from '../database/entities/apps';
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { OrganizationTableName } from '../database/entities/organizations';
import { ProjectTableName } from '../database/entities/projects';
import { UserTableName } from '../database/entities/users';
import {
    getActiveProjectMemberPredicate,
    groupDirectAccessRows,
    type DirectAccess,
    type DirectAccessRow,
} from './directAccessModelUtils';

export type AppDirectAccess = DirectAccess;

export class AppAccessModel {
    constructor(private readonly database: Knex) {}

    async getUserAccess(
        appUuids: string[],
        userUuid: string,
        { trx = this.database }: { trx?: Knex } = {},
    ): Promise<Record<string, AppDirectAccess>> {
        const uniqueAppUuids = [...new Set(appUuids)];
        if (uniqueAppUuids.length === 0) {
            return {};
        }

        const rows: DirectAccessRow[] = await trx(AppUserAccessTableName)
            .select({
                resourceUuid: `${AppUserAccessTableName}.app_uuid`,
                organizationUuid: `${OrganizationTableName}.organization_uuid`,
                projectUuid: `${ProjectTableName}.project_uuid`,
                role: `${AppUserAccessTableName}.space_role`,
                groupUuid: trx.raw('NULL'),
            })
            .innerJoin(
                AppsTableName,
                `${AppsTableName}.app_id`,
                `${AppUserAccessTableName}.app_uuid`,
            )
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_uuid`,
                `${AppsTableName}.project_uuid`,
            )
            .innerJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${AppUserAccessTableName}.user_uuid`,
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
            .whereIn(`${AppUserAccessTableName}.app_uuid`, uniqueAppUuids)
            .where(`${AppUserAccessTableName}.user_uuid`, userUuid)
            .where(getActiveProjectMemberPredicate(trx))
            .whereNull(`${AppsTableName}.deleted_at`)
            .unionAll(
                trx(AppGroupAccessTableName)
                    .select({
                        resourceUuid: `${AppGroupAccessTableName}.app_uuid`,
                        organizationUuid: `${OrganizationTableName}.organization_uuid`,
                        projectUuid: `${ProjectTableName}.project_uuid`,
                        role: `${AppGroupAccessTableName}.space_role`,
                        groupUuid: `${AppGroupAccessTableName}.group_uuid`,
                    })
                    .innerJoin(
                        AppsTableName,
                        `${AppsTableName}.app_id`,
                        `${AppGroupAccessTableName}.app_uuid`,
                    )
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
                    .innerJoin(
                        GroupMembershipTableName,
                        `${GroupMembershipTableName}.group_uuid`,
                        `${AppGroupAccessTableName}.group_uuid`,
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
                        `${AppGroupAccessTableName}.app_uuid`,
                        uniqueAppUuids,
                    )
                    .where(`${UserTableName}.user_uuid`, userUuid)
                    .where(getActiveProjectMemberPredicate(trx))
                    .whereRaw('?? = ??', [
                        `${GroupMembershipTableName}.organization_id`,
                        `${ProjectTableName}.organization_id`,
                    ])
                    .whereNull(`${AppsTableName}.deleted_at`),
            );

        return groupDirectAccessRows(rows);
    }
}
