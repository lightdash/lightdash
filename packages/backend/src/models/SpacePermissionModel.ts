import {
    DirectSpaceAccess,
    DirectSpaceAccessOrigin,
    OrganizationSpaceAccess,
    ProjectSpaceAccess,
    ProjectSpaceAccessOrigin,
    UserInfo,
} from '@lightdash/common';
import { Knex } from 'knex';
import { EmailTableName } from '../database/entities/emails';
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { OrganizationTableName } from '../database/entities/organizations';
import { ProjectGroupAccessTableName } from '../database/entities/projectGroupAccess';
import { ProjectMembershipsTableName } from '../database/entities/projectMemberships';
import { ProjectTableName } from '../database/entities/projects';
import {
    SpaceGroupAccessTableName,
    SpaceTableName,
    SpaceUserAccessTableName,
} from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';
import { wrapSentryTransaction } from '../utils';

export class SpacePermissionModel {
    constructor(private readonly database: Knex) {}

    /**
     * Gets direct space access for a list of spaces
     * @param spaceUuids - the uuids of the spaces to get direct access for
     * @param filters - the filters to apply to the query
     * @returns a record of space uuids to direct space access
     */
    async getDirectSpaceAccess(
        spaceUuids: string[],
        filters?: { userUuid?: string },
    ): Promise<Record<string, DirectSpaceAccess[]>> {
        return wrapSentryTransaction(
            'SpaceModel.getDirectSpaceAccess',
            { spaceUuidsCount: spaceUuids.length },
            async () => {
                const spacesDirectAccess: DirectSpaceAccess[] =
                    await this.database(SpaceUserAccessTableName)
                        .select({
                            userUuid: `${SpaceUserAccessTableName}.user_uuid`,
                            spaceUuid: `${SpaceUserAccessTableName}.space_uuid`,
                            role: `${SpaceUserAccessTableName}.space_role`,
                            from: this.database.raw(
                                `'${DirectSpaceAccessOrigin.USER_ACCESS}'`,
                            ),
                        })
                        .whereIn(
                            `${SpaceUserAccessTableName}.space_uuid`,
                            spaceUuids,
                        )
                        .modify((qb) => {
                            if (filters?.userUuid) {
                                void qb.where(
                                    `${SpaceUserAccessTableName}.user_uuid`,
                                    filters.userUuid,
                                );
                            }
                        })
                        .union(
                            this.database(SpaceGroupAccessTableName)
                                .select({
                                    userUuid: `${UserTableName}.user_uuid`,
                                    spaceUuid: `${SpaceGroupAccessTableName}.space_uuid`,
                                    role: `${SpaceGroupAccessTableName}.space_role`,
                                    from: this.database.raw(
                                        `'${DirectSpaceAccessOrigin.GROUP_ACCESS}'`,
                                    ),
                                })
                                .innerJoin(
                                    GroupMembershipTableName,
                                    `${GroupMembershipTableName}.group_uuid`,
                                    `${SpaceGroupAccessTableName}.group_uuid`,
                                )
                                .innerJoin(
                                    UserTableName,
                                    `${GroupMembershipTableName}.user_id`,
                                    `${UserTableName}.user_id`,
                                )
                                .whereIn(
                                    `${SpaceGroupAccessTableName}.space_uuid`,
                                    spaceUuids,
                                )
                                .modify((qb) => {
                                    if (filters?.userUuid) {
                                        void qb.where(
                                            `${UserTableName}.user_uuid`,
                                            filters.userUuid,
                                        );
                                    }
                                }),
                        );

                return spacesDirectAccess.reduce<
                    Record<string, DirectSpaceAccess[]>
                >((acc, spaceDirectAccess) => {
                    if (!acc[spaceDirectAccess.spaceUuid]) {
                        acc[spaceDirectAccess.spaceUuid] = [];
                    }

                    acc[spaceDirectAccess.spaceUuid].push(spaceDirectAccess);
                    return acc;
                }, {});
            },
        );
    }

    /**
     * Gets space access for a list of spaces based on the project
     * @param spaceUuids - the uuids of the spaces to get access for
     * @param filters - the filters to apply to the query
     * @returns a record of space uuids to space access
     */
    async getProjectSpaceAccess(
        spaceUuids: string[],
        filters?: { userUuid?: string },
    ): Promise<Record<string, ProjectSpaceAccess[]>> {
        return wrapSentryTransaction(
            'SpaceModel.getProjectSpaceAccess',
            { spaceUuidsCount: spaceUuids.length },
            async () => {
                const projectSpacesAccess: ProjectSpaceAccess[] =
                    await this.database(SpaceTableName)
                        .select({
                            userUuid: `${UserTableName}.user_uuid`,
                            spaceUuid: `${SpaceTableName}.space_uuid`,
                            role: `${ProjectMembershipsTableName}.role`,
                            from: this.database.raw(
                                `'${ProjectSpaceAccessOrigin.PROJECT_MEMBERSHIP}'`,
                            ),
                        })
                        .innerJoin(
                            ProjectTableName,
                            `${ProjectTableName}.project_id`,
                            `${SpaceTableName}.project_id`,
                        )
                        .innerJoin(
                            ProjectMembershipsTableName,
                            `${ProjectMembershipsTableName}.project_id`,
                            `${ProjectTableName}.project_id`,
                        )
                        .innerJoin(
                            UserTableName,
                            `${UserTableName}.user_id`,
                            `${ProjectMembershipsTableName}.user_id`,
                        )
                        .whereIn(`${SpaceTableName}.space_uuid`, spaceUuids)
                        .whereNull(`${SpaceTableName}.deleted_at`)
                        .modify((qb) => {
                            if (filters?.userUuid) {
                                void qb.where(
                                    `${UserTableName}.user_uuid`,
                                    filters.userUuid,
                                );
                            }
                        })
                        .union(
                            this.database(SpaceTableName)
                                .select({
                                    userUuid: `${UserTableName}.user_uuid`,
                                    spaceUuid: `${SpaceTableName}.space_uuid`,
                                    role: `${ProjectGroupAccessTableName}.role`,
                                    from: this.database.raw(
                                        `'${ProjectSpaceAccessOrigin.GROUP_MEMBERSHIP}'`,
                                    ),
                                })
                                .innerJoin(
                                    ProjectTableName,
                                    `${ProjectTableName}.project_id`,
                                    `${SpaceTableName}.project_id`,
                                )
                                .innerJoin(
                                    ProjectGroupAccessTableName,
                                    `${ProjectGroupAccessTableName}.project_uuid`,
                                    `${ProjectTableName}.project_uuid`,
                                )
                                .innerJoin(
                                    GroupMembershipTableName,
                                    `${GroupMembershipTableName}.group_uuid`,
                                    `${ProjectGroupAccessTableName}.group_uuid`,
                                )
                                .innerJoin(
                                    UserTableName,
                                    `${UserTableName}.user_id`,
                                    `${GroupMembershipTableName}.user_id`,
                                )
                                .whereIn(
                                    `${SpaceTableName}.space_uuid`,
                                    spaceUuids,
                                )
                                .whereNull(`${SpaceTableName}.deleted_at`)
                                .modify((qb) => {
                                    if (filters?.userUuid) {
                                        void qb.where(
                                            `${UserTableName}.user_uuid`,
                                            filters.userUuid,
                                        );
                                    }
                                }),
                        );

                return projectSpacesAccess.reduce<
                    Record<string, ProjectSpaceAccess[]>
                >((acc, projectSpaceAccess) => {
                    if (!acc[projectSpaceAccess.spaceUuid]) {
                        acc[projectSpaceAccess.spaceUuid] = [];
                    }

                    acc[projectSpaceAccess.spaceUuid].push(projectSpaceAccess);
                    return acc;
                }, {});
            },
        );
    }

    /**
     * Gets space access for a list of spaces based on the organization
     * @param spaceUuids - the uuids of the spaces to get access for
     * @param filters - the filters to apply to the query
     * @returns a record of space uuids to space access
     */
    async getOrganizationSpaceAccess(
        spaceUuids: string[],
        filters?: { userUuid?: string },
    ): Promise<Record<string, OrganizationSpaceAccess[]>> {
        return wrapSentryTransaction(
            'SpaceModel.getOrganizationSpaceAccess',
            { spaceUuidsCount: spaceUuids.length },
            async () => {
                const organizationSpacesAccess: OrganizationSpaceAccess[] =
                    await this.database(SpaceTableName)
                        .select({
                            userUuid: `${UserTableName}.user_uuid`,
                            spaceUuid: `${SpaceTableName}.space_uuid`,
                            role: `${OrganizationMembershipsTableName}.role`,
                        })
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
                            OrganizationMembershipsTableName,
                            `${OrganizationMembershipsTableName}.organization_id`,
                            `${OrganizationTableName}.organization_id`,
                        )
                        .innerJoin(
                            UserTableName,
                            `${UserTableName}.user_id`,
                            `${OrganizationMembershipsTableName}.user_id`,
                        )
                        .whereIn(`${SpaceTableName}.space_uuid`, spaceUuids)
                        .whereNull(`${SpaceTableName}.deleted_at`)
                        .modify((qb) => {
                            if (filters?.userUuid) {
                                void qb.where(
                                    `${UserTableName}.user_uuid`,
                                    filters.userUuid,
                                );
                            }
                        });

                return organizationSpacesAccess.reduce<
                    Record<string, OrganizationSpaceAccess[]>
                >((acc, organizationSpaceAccess) => {
                    if (!acc[organizationSpaceAccess.spaceUuid]) {
                        acc[organizationSpaceAccess.spaceUuid] = [];
                    }

                    acc[organizationSpaceAccess.spaceUuid].push(
                        organizationSpaceAccess,
                    );
                    return acc;
                }, {});
            },
        );
    }

    async getSpaceInfo(spaceUuids: string[]): Promise<
        Record<
            string,
            {
                isPrivate: boolean;
                projectUuid: string;
                organizationUuid: string;
            }
        >
    > {
        return wrapSentryTransaction(
            'SpaceModel.getSpaceInfo',
            { spaceUuidsCount: spaceUuids.length },
            async () => {
                if (spaceUuids.length === 0) {
                    return {};
                }

                const rows = await this.database(SpaceTableName)
                    .select({
                        spaceUuid: `${SpaceTableName}.space_uuid`,
                        isPrivate: `${SpaceTableName}.is_private`,
                        projectUuid: `${ProjectTableName}.project_uuid`,
                        organizationUuid: `${OrganizationTableName}.organization_uuid`,
                    })
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
                    .whereIn(`${SpaceTableName}.space_uuid`, spaceUuids)
                    .whereNull(`${SpaceTableName}.deleted_at`);

                return rows.reduce<
                    Record<
                        string,
                        {
                            isPrivate: boolean;
                            projectUuid: string;
                            organizationUuid: string;
                        }
                    >
                >((acc, row) => {
                    acc[row.spaceUuid] = {
                        isPrivate: row.isPrivate,
                        projectUuid: row.projectUuid,
                        organizationUuid: row.organizationUuid,
                    };
                    return acc;
                }, {});
            },
        );
    }
}
