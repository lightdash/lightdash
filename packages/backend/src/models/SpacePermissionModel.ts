import {
    DirectSpaceAccess,
    DirectSpaceAccessOrigin,
    OrganizationSpaceAccess,
    ProjectRoleOrigin,
    ProjectSpaceAccess,
} from '@lightdash/common';
import { Knex } from 'knex';
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
    ): Promise<
        Record<
            string,
            {
                access: DirectSpaceAccess[];
                isPrivate: boolean;
            }
        >
    > {
        return wrapSentryTransaction(
            'SpaceModel.getDirectSpaceAccess',
            { spaceUuidsCount: spaceUuids.length },
            async () => {
                const spacesDirectAccess: (DirectSpaceAccess & {
                    isPrivate: boolean;
                })[] = await this.database(SpaceUserAccessTableName)
                    .select({
                        userUuid: `${SpaceUserAccessTableName}.user_uuid`,
                        spaceUuid: `${SpaceUserAccessTableName}.space_uuid`,
                        isPrivate: `${SpaceTableName}.is_private`,
                        role: `${SpaceUserAccessTableName}.space_role`,
                        from: this.database.raw(
                            `'${DirectSpaceAccessOrigin.USER}'`,
                        ),
                    })
                    .innerJoin(
                        SpaceTableName,
                        `${SpaceUserAccessTableName}.space_uuid`,
                        `${SpaceTableName}.space_uuid`,
                    )

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
                                isPrivate: `${SpaceTableName}.is_private`,
                                role: `${SpaceGroupAccessTableName}.space_role`,
                                from: this.database.raw(
                                    `'${DirectSpaceAccessOrigin.GROUP}'`,
                                ),
                            })
                            .innerJoin(
                                SpaceTableName,
                                `${SpaceGroupAccessTableName}.space_uuid`,
                                `${SpaceTableName}.space_uuid`,
                            )
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
                    Record<
                        string,
                        {
                            access: DirectSpaceAccess[];
                            isPrivate: boolean;
                        }
                    >
                >((acc, spaceDirectAccess) => {
                    if (!acc[spaceDirectAccess.spaceUuid]) {
                        acc[spaceDirectAccess.spaceUuid] = {
                            access: [],
                            isPrivate: spaceDirectAccess.isPrivate,
                        };
                    }

                    const { isPrivate, ...access } = spaceDirectAccess;
                    acc[spaceDirectAccess.spaceUuid].access.push(access);
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
    ): Promise<
        Record<string, { access: ProjectSpaceAccess[]; isPrivate: boolean }>
    > {
        return wrapSentryTransaction(
            'SpaceModel.getProjectAccess',
            { spaceUuidsCount: spaceUuids.length },
            async () => {
                const projectSpacesAccess: (ProjectSpaceAccess & {
                    isPrivate: boolean;
                })[] = await this.database(SpaceTableName)
                    .select({
                        userUuid: `${UserTableName}.user_uuid`,
                        spaceUuid: `${SpaceTableName}.space_uuid`,
                        isPrivate: `${SpaceTableName}.is_private`,
                        role: `${ProjectMembershipsTableName}.role`,
                        from: this.database.raw(`'${ProjectRoleOrigin.USER}'`),
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
                                isPrivate: `${SpaceTableName}.is_private`,
                                from: this.database.raw(
                                    `'${ProjectRoleOrigin.GROUP}'`,
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
                            .whereIn(`${SpaceTableName}.space_uuid`, spaceUuids)
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
                    Record<
                        string,
                        { access: ProjectSpaceAccess[]; isPrivate: boolean }
                    >
                >((acc, projectSpaceAccess) => {
                    if (!acc[projectSpaceAccess.spaceUuid]) {
                        acc[projectSpaceAccess.spaceUuid] = {
                            access: [],
                            isPrivate: projectSpaceAccess.isPrivate,
                        };
                    }

                    const { isPrivate, ...access } = projectSpaceAccess;
                    acc[projectSpaceAccess.spaceUuid].access.push(access);
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
    ): Promise<
        Record<
            string,
            { access: OrganizationSpaceAccess[]; isPrivate: boolean }
        >
    > {
        return wrapSentryTransaction(
            'SpaceModel.getOrganizationAccess',
            { spaceUuidsCount: spaceUuids.length },
            async () => {
                const organizationSpacesAccess: (OrganizationSpaceAccess & {
                    isPrivate: boolean;
                })[] = await this.database(SpaceTableName)
                    .select({
                        userUuid: `${UserTableName}.user_uuid`,
                        spaceUuid: `${SpaceTableName}.space_uuid`,
                        isPrivate: `${SpaceTableName}.is_private`,
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
                    .modify((qb) => {
                        if (filters?.userUuid) {
                            void qb.where(
                                `${UserTableName}.user_uuid`,
                                filters.userUuid,
                            );
                        }
                    });

                return organizationSpacesAccess.reduce<
                    Record<
                        string,
                        {
                            access: OrganizationSpaceAccess[];
                            isPrivate: boolean;
                        }
                    >
                >((acc, organizationSpaceAccess) => {
                    if (!acc[organizationSpaceAccess.spaceUuid]) {
                        acc[organizationSpaceAccess.spaceUuid] = {
                            access: [],
                            isPrivate: organizationSpaceAccess.isPrivate,
                        };
                    }

                    const { isPrivate, ...access } = organizationSpaceAccess;
                    acc[organizationSpaceAccess.spaceUuid].access.push(access);
                    return acc;
                }, {});
            },
        );
    }
}
