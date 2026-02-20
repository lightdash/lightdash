import {
    DirectSpaceAccess,
    DirectSpaceAccessOrigin,
    InvalidSpaceStateError,
    NotFoundError,
    OrganizationSpaceAccess,
    ProjectSpaceAccess,
    ProjectSpaceAccessOrigin,
    SpaceAccessUserMetadata,
    type SpaceGroup,
    type SpaceInheritanceChain,
} from '@lightdash/common';
import { Knex } from 'knex';
import { EmailTableName } from '../database/entities/emails';
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
import { GroupTableName } from '../database/entities/groups';
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

/**
 * ! This needs to be removed once nested spaces permissions are fully implemented
 * Nested spaces MVP - get is_private from root space
 * Returns a raw SQL expression to determine if a space is private.
 * For nested spaces, it checks the root space's privacy setting.
 * @returns SQL string for determining privacy setting
 */
export const getRootSpaceIsPrivateQuery = (): string => `
                CASE
                    WHEN ${SpaceTableName}.parent_space_uuid IS NOT NULL AND ${SpaceTableName}.is_default_user_space = false THEN
                        (SELECT ps.is_private
                         FROM ${SpaceTableName} ps
                         WHERE ps.path @> ${SpaceTableName}.path
                         AND nlevel(ps.path) = 1
                         AND ps.project_id = ${SpaceTableName}.project_id
                         LIMIT 1)
                    ELSE
                        ${SpaceTableName}.is_private
                END
            `;

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
                    .whereIn(`${SpaceTableName}.space_uuid`, spaceUuids);

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

    /**
     * Fetches user metadata (firstName, lastName, email) for a list of user UUIDs.
     * Used to enrich SpaceAccess[] into SpaceShare[] for the share modal UI.
     */
    async getUserMetadataByUuids(
        userUuids: string[],
    ): Promise<Record<string, SpaceAccessUserMetadata>> {
        if (userUuids.length === 0) return {};

        const rows = await this.database(UserTableName)
            .innerJoin(
                EmailTableName,
                `${UserTableName}.user_id`,
                `${EmailTableName}.user_id`,
            )
            .where(`${EmailTableName}.is_primary`, true)
            .whereIn(`${UserTableName}.user_uuid`, userUuids)
            .select<(SpaceAccessUserMetadata & { userUuid: string })[]>({
                userUuid: `${UserTableName}.user_uuid`,
                firstName: `${UserTableName}.first_name`,
                lastName: `${UserTableName}.last_name`,
                email: `${EmailTableName}.email`,
            });

        return Object.fromEntries(rows.map((r) => [r.userUuid, r]));
    }

    /**
     * Gets the group access for a space.
     * @param spaceUuid - The UUID of the space to get group access for
     * @returns The group access entries for the space (or its root space)
     */
    async getGroupAccess(spaceUuid: string): Promise<SpaceGroup[]> {
        const access = await this.database
            .table(SpaceGroupAccessTableName)
            .select({
                groupUuid: `${SpaceGroupAccessTableName}.group_uuid`,
                spaceRole: `${SpaceGroupAccessTableName}.space_role`,
                groupName: `${GroupTableName}.name`,
            })
            .leftJoin(
                `${GroupTableName}`,
                `${GroupTableName}.group_uuid`,
                `${SpaceGroupAccessTableName}.group_uuid`,
            )
            .where('space_uuid', spaceUuid);
        return access;
    }

    /**
     * Gets the inheritance chain for an array of spaces, walking up from the space
     * to the first ancestor with inherit_parent_permissions=false (or root).
     *
     * The chain is ordered leaf-to-root.
     *
     * @param spaceUuids - The UUIDs of the spaces to get chains for
     * @returns A record of space UUIDs to their inheritance chains
     */
    async getInheritanceChains(
        spaceUuids: string[],
    ): Promise<Record<string, SpaceInheritanceChain>> {
        return wrapSentryTransaction(
            'SpacePermissionModel.getInheritanceChains',
            { spaceUuidsCount: spaceUuids.length },
            async () => {
                if (spaceUuids.length === 0) return {};

                const spaces = await this.database(SpaceTableName)
                    .select('space_uuid', 'path', 'project_id')
                    .whereIn('space_uuid', spaceUuids);

                if (spaces.length === 0) return {};

                const valuesPlaceholders = spaces
                    .map(() => '(?, ?::ltree, ?::integer)')
                    .join(', ');
                const valuesParams = spaces.flatMap((s) => [
                    s.space_uuid,
                    s.path,
                    s.project_id,
                ]);

                const ancestorRows: {
                    requested_space_uuid: string;
                    space_uuid: string;
                    name: string;
                    inherit_parent_permissions: boolean;
                    parent_space_uuid: string | null;
                }[] = await this.database
                    .raw(
                        `SELECT
                        req.space_uuid AS requested_space_uuid,
                        a.space_uuid,
                        a.name,
                        a.inherit_parent_permissions,
                        a.parent_space_uuid
                    FROM (VALUES ${valuesPlaceholders}) AS req(space_uuid, path, project_id)
                    JOIN ${SpaceTableName} a
                        ON a.path @> req.path
                        AND a.project_id = req.project_id
                    ORDER BY req.space_uuid, nlevel(a.path) DESC`,
                        valuesParams,
                    )
                    .then(
                        (raw: { rows: unknown[] }) =>
                            raw.rows as {
                                requested_space_uuid: string;
                                space_uuid: string;
                                name: string;
                                inherit_parent_permissions: boolean;
                                parent_space_uuid: string | null;
                            }[],
                    );

                // Group ancestor rows by requested space (order is preserved)
                const ancestorsBySpace = new Map<string, typeof ancestorRows>();
                for (const row of ancestorRows) {
                    let list = ancestorsBySpace.get(row.requested_space_uuid);
                    if (!list) {
                        list = [];
                        ancestorsBySpace.set(row.requested_space_uuid, list);
                    }
                    list.push(row);
                }

                const result: Record<string, SpaceInheritanceChain> = {};
                for (const requestedUuid of spaceUuids) {
                    const myAncestors =
                        ancestorsBySpace.get(requestedUuid) ?? [];
                    if (myAncestors.length === 0) {
                        // Space not found in DB — skip silently (caller
                        // will notice the missing key in the result map).
                        // eslint-disable-next-line no-continue
                        continue;
                    }

                    // Walk from leaf toward root, collecting chain items
                    const chain: SpaceInheritanceChain['chain'] = [];
                    let lastAncestor: (typeof myAncestors)[number] | undefined;

                    for (const ancestor of myAncestors) {
                        chain.push({
                            spaceUuid: ancestor.space_uuid,
                            spaceName: ancestor.name,
                            inheritParentPermissions:
                                ancestor.inherit_parent_permissions,
                        });
                        lastAncestor = ancestor;

                        if (!ancestor.inherit_parent_permissions) {
                            break;
                        }
                    }

                    const inheritsFromOrgOrProject =
                        lastAncestor !== undefined &&
                        lastAncestor.parent_space_uuid === null &&
                        lastAncestor.inherit_parent_permissions === true;

                    result[requestedUuid] = { chain, inheritsFromOrgOrProject };
                }

                return result;
            },
        );
    }
}
