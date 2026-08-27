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
import { SpaceTableName } from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';
import {
    getActiveGrantedGroupPredicate,
    getActiveProjectMemberPredicate,
    groupDirectAccessRows,
    type DirectAccess,
    type DirectAccessRow,
} from './directAccessModelUtils';

export class AppAccessModel {
    constructor(private readonly database: Knex) {}

    async getUserAccess(
        appUuids: string[],
        userUuid: string,
        {
            trx = this.database,
            organizationUuid,
            includeDeleted = false,
        }: {
            trx?: Knex;
            organizationUuid: string;
            includeDeleted?: boolean;
        },
    ): Promise<Record<string, DirectAccess>> {
        const uniqueAppUuids = [...new Set(appUuids)];
        if (uniqueAppUuids.length === 0) {
            return {};
        }

        const joinAppProject = (join: Knex.JoinClause) => {
            join.on(
                `${ProjectTableName}.project_uuid`,
                `${AppsTableName}.project_uuid`,
            );
        };
        const joinAppSpace = (join: Knex.JoinClause) => {
            join.on(
                `${SpaceTableName}.space_uuid`,
                `${AppsTableName}.space_uuid`,
            ).andOn(
                `${SpaceTableName}.project_id`,
                `${ProjectTableName}.project_id`,
            );
        };
        const whereAppLocationIsActive = (query: Knex.QueryBuilder) => {
            void query
                .whereNull(`${AppsTableName}.space_uuid`)
                .orWhere((spaceApp) => {
                    void spaceApp
                        .whereNotNull(`${SpaceTableName}.space_uuid`)
                        .whereNull(`${SpaceTableName}.deleted_at`);
                });
        };

        const rows: DirectAccessRow[] = await trx(AppUserAccessTableName)
            .select({
                resourceUuid: `${AppUserAccessTableName}.app_uuid`,
                organizationUuid: `${OrganizationTableName}.organization_uuid`,
                projectUuid: `${ProjectTableName}.project_uuid`,
                spaceUuid: `${AppsTableName}.space_uuid`,
                role: `${AppUserAccessTableName}.space_role`,
                groupUuid: trx.raw('NULL'),
            })
            .innerJoin(
                AppsTableName,
                `${AppsTableName}.app_id`,
                `${AppUserAccessTableName}.app_uuid`,
            )
            .innerJoin(ProjectTableName, joinAppProject)
            .leftJoin(SpaceTableName, joinAppSpace)
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
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .where(getActiveProjectMemberPredicate(trx))
            .modify((query) => {
                if (!includeDeleted) {
                    void query.whereNull(`${AppsTableName}.deleted_at`);
                }
            })
            .where(whereAppLocationIsActive)
            .unionAll(
                trx(AppGroupAccessTableName)
                    .select({
                        resourceUuid: `${AppGroupAccessTableName}.app_uuid`,
                        organizationUuid: `${OrganizationTableName}.organization_uuid`,
                        projectUuid: `${ProjectTableName}.project_uuid`,
                        spaceUuid: `${AppsTableName}.space_uuid`,
                        role: `${AppGroupAccessTableName}.space_role`,
                        groupUuid: `${AppGroupAccessTableName}.group_uuid`,
                    })
                    .innerJoin(
                        AppsTableName,
                        `${AppsTableName}.app_id`,
                        `${AppGroupAccessTableName}.app_uuid`,
                    )
                    .innerJoin(ProjectTableName, joinAppProject)
                    .leftJoin(SpaceTableName, joinAppSpace)
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
                            AppGroupAccessTableName,
                        ),
                    )
                    .modify((query) => {
                        if (!includeDeleted) {
                            void query.whereNull(`${AppsTableName}.deleted_at`);
                        }
                    })
                    .where(whereAppLocationIsActive),
            );

        return groupDirectAccessRows(rows);
    }
}
