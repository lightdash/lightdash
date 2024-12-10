import {
    AlreadyExistsError,
    CreateGroup,
    Group,
    GroupMember,
    GroupMembership,
    GroupWithMembers,
    NotExistsError,
    NotFoundError,
    ProjectGroupAccess,
    UnexpectedDatabaseError,
    UpdateGroupWithMembers,
    type KnexPaginateArgs,
    type KnexPaginatedData,
} from '@lightdash/common';
import { Knex } from 'knex';
import { uniq } from 'lodash';
import differenceBy from 'lodash/differenceBy';
import { DbEmail, EmailTableName } from '../database/entities/emails';
import {
    DbGroupMembership,
    GroupMembershipTableName,
} from '../database/entities/groupMemberships';
import { DbGroup, GroupTableName } from '../database/entities/groups';
import {
    OrganizationTableName,
    type DbOrganization,
} from '../database/entities/organizations';
import {
    DBProjectGroupAccess,
    ProjectGroupAccessTableName,
    UpdateDBProjectGroupAccess,
} from '../database/entities/projectGroupAccess';
import { DbUser, UserTableName } from '../database/entities/users';
import KnexPaginate from '../database/pagination';
import { getColumnMatchRegexQuery } from './SearchModel/utils/search';

export class GroupsModel {
    database: Knex;

    constructor(args: { database: Knex }) {
        this.database = args.database;
    }

    static async addGroupMembers(
        trx: Knex,
        groupUuid: string,
        memberUuids: string[],
    ): Promise<GroupMembership[]> {
        // Check if the group exists
        const group = await trx('groups')
            .where('group_uuid', groupUuid)
            .first('group_uuid', 'organization_id');
        if (group === undefined) {
            throw new NotFoundError(`No group found`);
        }

        // Check what members exist and are part of the organization
        const users = await trx('users')
            .innerJoin(
                'organization_memberships',
                'users.user_id',
                'organization_memberships.user_id',
            )
            .where(
                'organization_memberships.organization_id',
                group.organization_id,
            )
            .whereIn('user_uuid', memberUuids)
            .select('users.user_id', 'user_uuid');

        if (users.length === 0) {
            return [];
        }

        const membershipsToAdd = users.map((user) => ({
            group_uuid: groupUuid,
            user_id: user.user_id,
            organization_id: group.organization_id,
        }));

        // Add members to the group
        const membershipsAdded = await trx('group_memberships')
            .insert(membershipsToAdd)
            .onConflict()
            .ignore()
            .returning('*');

        // Return the added memberships
        return membershipsAdded.reduce<GroupMembership[]>((acc, membership) => {
            const user = users.find((u) => u.user_id === membership.user_id);
            if (user) {
                acc.push({
                    groupUuid: membership.group_uuid,
                    userUuid: user.user_uuid,
                });
            }
            return acc;
        }, []);
    }

    async find(
        filters: {
            organizationUuid: string;
            searchQuery?: string; // will fuzzy search on name
            name?: string; // will exact match on name
        },
        paginateArgs?: KnexPaginateArgs,
    ): Promise<KnexPaginatedData<Group[]>> {
        let query = this.database('groups')
            .innerJoin(
                'organizations',
                'groups.organization_id',
                'organizations.organization_id',
            )
            .select<(DbGroup & Pick<DbOrganization, 'organization_uuid'>)[]>(
                'groups.*',
                'organizations.organization_uuid',
            );

        // Exact match for organization UUID
        if (filters.organizationUuid) {
            query = query.where(
                'organizations.organization_uuid',
                filters.organizationUuid,
            );
        }

        // Exact match for name
        if (filters.name) {
            query = query.where('groups.name', filters.name);
        }

        // Fuzzy search using regex if searchQuery is provided
        if (filters.searchQuery) {
            query = getColumnMatchRegexQuery(query, filters.searchQuery, [
                'name',
            ]);
        }

        const { pagination, data } = await KnexPaginate.paginate(
            query,
            paginateArgs,
        );

        return {
            pagination,
            data: data.map((group) => ({
                uuid: group.group_uuid,
                name: group.name,
                createdAt: group.created_at,
                createdByUserUuid: group.created_by_user_uuid,
                updatedAt: group.updated_at,
                updatedByUserUuid: group.updated_by_user_uuid,
                organizationUuid: group.organization_uuid,
            })),
        };
    }

    async findGroupMembers(
        filters: {
            organizationUuid?: string;
            groupUuids?: string[];
        },
        options?: {
            paginateArgs?: KnexPaginateArgs;
        },
    ): Promise<KnexPaginatedData<Array<GroupMember & GroupMembership>>> {
        const membersQuery = this.database
            .from(GroupMembershipTableName)
            .innerJoin(
                UserTableName,
                `${GroupMembershipTableName}.user_id`,
                `${UserTableName}.user_id`,
            )
            .innerJoin(
                EmailTableName,
                `${UserTableName}.user_id`,
                `${EmailTableName}.user_id`,
            )
            .andWhere(`${EmailTableName}.is_primary`, true)
            .select<
                Array<
                    Pick<DbGroupMembership, 'group_uuid'> &
                        Pick<DbUser, 'user_uuid' | 'first_name' | 'last_name'> &
                        Pick<DbEmail, 'email'>
                >
            >(
                `${GroupMembershipTableName}.group_uuid`,
                `${UserTableName}.user_uuid`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                `${EmailTableName}.email`,
            );

        if (filters.organizationUuid) {
            void membersQuery
                .innerJoin(
                    OrganizationTableName,
                    `${GroupMembershipTableName}.organization_id`,
                    `${OrganizationTableName}.organization_id`,
                )
                .where(
                    `${OrganizationTableName}.organization_uuid`,
                    filters.organizationUuid,
                );
        }

        if (filters.groupUuids && filters.groupUuids.length > 0) {
            void membersQuery.whereIn(
                `${GroupMembershipTableName}.group_uuid`,
                filters.groupUuids,
            );
        }

        const { pagination, data } = await KnexPaginate.paginate(
            membersQuery,
            options?.paginateArgs,
        );
        return {
            pagination,
            data: data.map((row) => ({
                groupUuid: row.group_uuid,
                userUuid: row.user_uuid,
                email: row.email,
                firstName: row.first_name,
                lastName: row.last_name,
            })),
        };
    }

    async createGroup({
        createdByUserUuid,
        createGroup,
    }: {
        createdByUserUuid: string | null;
        createGroup: CreateGroup & { organizationUuid: string };
    }): Promise<GroupWithMembers> {
        const groupUuid = await this.database.transaction(async (trx) => {
            try {
                const results = await trx.raw<{
                    rows: { created_at: Date; group_uuid: string }[];
                }>(
                    `
                    INSERT INTO groups (name, created_by_user_uuid, organization_id)
                    SELECT ?, ?, organization_id
                    FROM organizations
                    WHERE organization_uuid = ? RETURNING group_uuid, groups.created_at
                `,
                    [
                        createGroup.name.trim(),
                        createdByUserUuid,
                        createGroup.organizationUuid,
                    ],
                );

                const [row] = results.rows;
                if (row === undefined) {
                    throw new UnexpectedDatabaseError(`Failed to create group`);
                }

                if (createGroup.members && createGroup.members.length > 0) {
                    await GroupsModel.addGroupMembers(
                        trx,
                        row.group_uuid,
                        createGroup.members.map((m) => m.userUuid),
                    );
                }
                return row.group_uuid;
            } catch (error) {
                // Unique violation in PostgreSQL
                if (error.code === '23505') {
                    throw new AlreadyExistsError(`Group name already exists`);
                }
                throw error; // Re-throw other errors
            }
        });

        return this.getGroupWithMembers(groupUuid);
    }

    async getGroup(groupUuid: string): Promise<Group> {
        const [group] = await this.database('groups')
            .innerJoin(
                'organizations',
                'groups.organization_id',
                'organizations.organization_id',
            )
            .where('group_uuid', groupUuid)
            .select<(DbGroup & Pick<DbOrganization, 'organization_uuid'>)[]>(
                'groups.*',
                'organizations.organization_uuid',
            );
        if (group === undefined) {
            throw new NotFoundError(`No group found`);
        }
        return {
            uuid: group.group_uuid,
            name: group.name,
            createdAt: group.created_at,
            createdByUserUuid: group.created_by_user_uuid,
            updatedAt: group.updated_at,
            updatedByUserUuid: group.updated_by_user_uuid,
            organizationUuid: group.organization_uuid,
        };
    }

    async getGroupWithMembers(
        groupUuid: string,
        includeMembers?: number,
        offset?: number,
    ): Promise<GroupWithMembers> {
        const group = await this.getGroup(groupUuid);

        const membersQuery = this.database
            .from(GroupMembershipTableName)
            .innerJoin(
                UserTableName,
                `${GroupMembershipTableName}.user_id`,
                `${UserTableName}.user_id`,
            )
            .innerJoin(
                EmailTableName,
                `${UserTableName}.user_id`,
                `${EmailTableName}.user_id`,
            )
            .innerJoin(
                OrganizationTableName,
                `${GroupMembershipTableName}.organization_id`,
                `${OrganizationTableName}.organization_id`,
            )
            .where(`${GroupMembershipTableName}.group_uuid`, groupUuid)
            .andWhere(`${EmailTableName}.is_primary`, true);

        const memberProfilesQuery = membersQuery.clone();

        if (includeMembers !== undefined) {
            void memberProfilesQuery.limit(includeMembers);
        }

        if (offset !== undefined) {
            void memberProfilesQuery.offset(offset);
        }

        const memberProfiles = await memberProfilesQuery.select(
            `${UserTableName}.user_uuid`,
            `${UserTableName}.first_name`,
            `${UserTableName}.last_name`,
            `${EmailTableName}.email`,
        );

        const memberUuids = await membersQuery.select(
            this.database.raw(
                `ARRAY_AGG(${UserTableName}.user_uuid) as member_uuids`,
            ),
        );

        return {
            ...group,
            members: memberProfiles.map((row) => ({
                userUuid: row.user_uuid,
                email: row.email,
                firstName: row.first_name,
                lastName: row.last_name,
            })),
            memberUuids: memberUuids?.[0]?.member_uuids ?? [],
        };
    }

    async deleteGroup(groupUuid: string): Promise<void> {
        await this.database('groups').where('group_uuid', groupUuid).del();
    }

    async addGroupMembers(
        groupUuid: string,
        memberUuids: string[],
    ): Promise<GroupMembership[]> {
        return GroupsModel.addGroupMembers(
            this.database,
            groupUuid,
            memberUuids,
        );
    }

    async removeGroupMember(member: GroupMembership): Promise<boolean> {
        const deletedRows = await this.database('group_memberships')
            .innerJoin('users', 'group_memberships.user_id', 'users.user_id')
            .where('group_uuid', member.groupUuid)
            .andWhere('users.user_uuid', member.userUuid)
            .del()
            .returning('*');
        return deletedRows.length > 0;
    }

    async updateGroup({
        updatedByUserUuid,
        groupUuid,
        update,
    }: {
        updatedByUserUuid: string | null;
        groupUuid: string;
        update: UpdateGroupWithMembers;
    }): Promise<GroupWithMembers> {
        const existingGroup = await this.getGroupWithMembers(groupUuid, 10000);
        if (existingGroup === undefined) {
            throw new NotFoundError(`No group found`);
        }

        await this.database.transaction(async (trx) => {
            if (update.name) {
                try {
                    await trx(GroupTableName)
                        .update({
                            name: update.name.trim(),
                            updated_at: new Date(),
                            updated_by_user_uuid: updatedByUserUuid,
                        })
                        .where('group_uuid', groupUuid);
                } catch (error) {
                    // Unique violation in PostgreSQL
                    if (error.code === '23505') {
                        throw new AlreadyExistsError(
                            `Group name already exists`,
                        );
                    }
                    throw error; // Re-throw other errors
                }
            }

            if (update.members !== undefined) {
                const membersToAdd = differenceBy(
                    update.members,
                    existingGroup.members,
                    'userUuid',
                );
                const membersToRemove = differenceBy(
                    existingGroup.members,
                    update.members || [],
                    'userUuid',
                );
                if (membersToAdd.length > 0) {
                    const newMembers = await trx
                        .select([
                            'groups.group_uuid',
                            'users.user_id',
                            'organization_memberships.organization_id',
                        ])
                        .from('groups')
                        .innerJoin(
                            'organization_memberships',
                            'groups.organization_id',
                            'organization_memberships.organization_id',
                        )
                        .innerJoin(
                            'users',
                            'organization_memberships.user_id',
                            'users.user_id',
                        )
                        .whereIn(
                            'users.user_uuid',
                            membersToAdd.map((m) => m.userUuid),
                        )
                        .andWhere('groups.group_uuid', groupUuid);

                    // Check if the initial and resulting counts match
                    if (newMembers.length !== membersToAdd.length) {
                        throw new Error(`Some provided user UUIDs are invalid`);
                    }

                    await trx('group_memberships')
                        .insert(newMembers)
                        .onConflict()
                        .ignore();
                }
                if (membersToRemove.length > 0) {
                    await trx('group_memberships')
                        .innerJoin(
                            'users',
                            'group_memberships.user_id',
                            'users.user_id',
                        )
                        .where('group_uuid', groupUuid)
                        .whereIn(
                            'users.user_uuid',
                            membersToRemove.map((m) => m.userUuid),
                        )
                        .del();
                }
            }
        });
        // TODO: fix include member count
        return this.getGroupWithMembers(groupUuid, 10000);
    }

    async addProjectAccess({
        groupUuid,
        projectUuid,
        role,
    }: ProjectGroupAccess): Promise<DBProjectGroupAccess> {
        const query = this.database(ProjectGroupAccessTableName)
            .insert({ group_uuid: groupUuid, project_uuid: projectUuid, role })
            .onConflict()
            .ignore()
            .returning('*');

        const rows = await query;

        if (rows.length === 0) {
            throw new UnexpectedDatabaseError(`Failed to add project access`);
        }

        const [row] = rows;
        return row;
    }

    async removeProjectAccess({
        projectUuid,
        groupUuid,
    }: Pick<
        ProjectGroupAccess,
        'groupUuid' | 'projectUuid'
    >): Promise<boolean> {
        const query = this.database(ProjectGroupAccessTableName)
            .delete()
            .where('project_uuid', projectUuid)
            .andWhere('group_uuid', groupUuid)
            .returning('*');

        const rows = await query;

        return rows.length > 0;
    }

    async updateProjectAccess(
        {
            projectUuid,
            groupUuid,
        }: Pick<ProjectGroupAccess, 'groupUuid' | 'projectUuid'>,
        updateAttributes: UpdateDBProjectGroupAccess,
    ): Promise<DBProjectGroupAccess> {
        const query = this.database(ProjectGroupAccessTableName)
            .update(updateAttributes)
            .where('project_uuid', projectUuid)
            .andWhere('group_uuid', groupUuid)
            .returning('*');

        const rows = await query;

        if (rows.length === 0) {
            throw new UnexpectedDatabaseError(
                `Failed to update project access`,
            );
        }

        const [row] = rows;
        return row;
    }

    async addUserToGroupsIfExist({
        userUuid,
        groups,
        organizationUuid,
    }: {
        userUuid: string;
        groups: string[];
        organizationUuid: string;
    }): Promise<string[]> {
        const organization = await this.database('organizations')
            .where('organization_uuid', organizationUuid)
            .first('organization_id');
        if (!organization) {
            throw new NotExistsError('Cannot find organization');
        }

        const existingGroups = await this.database('groups')
            .whereIn('name', groups)
            .andWhere('organization_id', organization.organization_id)
            .select('group_uuid', 'organization_id');

        if (existingGroups.length === 0) {
            return [];
        }

        const userIdToInsert = (
            await this.database('users')
                .where('user_uuid', userUuid)
                .first('user_id')
        )?.user_id;
        if (!userIdToInsert) {
            throw new NotExistsError('Cannot find user');
        }

        const insertData = existingGroups.map((group) => ({
            group_uuid: group.group_uuid,
            user_id: userIdToInsert,
            organization_id: organization.organization_id,
        }));

        const groupsUpdated = await this.database('group_memberships')
            .insert(insertData)
            .onConflict()
            .ignore()
            .returning('group_uuid');
        return uniq(groupsUpdated.map((row) => row.group_uuid));
    }
}
