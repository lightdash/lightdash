import {
    CreateGroup,
    Group,
    GroupMembership,
    GroupWithMembers,
    NotExistsError,
    NotFoundError,
    ProjectGroupAccess,
    UnexpectedDatabaseError,
    UpdateGroupWithMembers,
} from '@lightdash/common';
import { Knex } from 'knex';
import differenceBy from 'lodash/differenceBy';
import { EmailTableName } from '../database/entities/emails';
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
import { OrganizationTableName } from '../database/entities/organizations';
import {
    DBProjectGroupAccess,
    ProjectGroupAccessTableName,
    UpdateDBProjectGroupAccess,
} from '../database/entities/projectGroupAccess';
import { UserTableName } from '../database/entities/users';

export class GroupsModel {
    database: Knex;

    constructor(deps: { database: Knex }) {
        this.database = deps.database;
    }

    async find(filters: { organizationUuid: string }): Promise<Group[]> {
        const query = this.database('groups')
            .innerJoin(
                'organizations',
                'groups.organization_id',
                'organizations.organization_id',
            )
            .select();
        if (filters.organizationUuid) {
            query.where(
                'organizations.organization_uuid',
                filters.organizationUuid,
            );
        }
        const groups = await query;
        return groups.map((group) => ({
            uuid: group.group_uuid,
            name: group.name,
            createdAt: group.created_at,
            organizationUuid: group.organization_uuid,
        }));
    }

    async createGroup(
        group: CreateGroup & { organizationUuid: string },
    ): Promise<Group> {
        const results = await this.database.raw<{
            rows: { created_at: Date; group_uuid: string }[];
        }>(
            `
            INSERT INTO groups (name, organization_id)
            SELECT ?, organization_id
            FROM organizations
            WHERE organization_uuid = ?
            RETURNING group_uuid, groups.created_at
        `,
            [group.name, group.organizationUuid],
        );
        const [row] = results.rows;
        if (row === undefined) {
            throw new UnexpectedDatabaseError(`Failed to create organization`);
        }
        return {
            uuid: row.group_uuid,
            name: group.name,
            createdAt: row.created_at,
            organizationUuid: group.organizationUuid,
        };
    }

    async getGroup(groupUuid: string): Promise<Group> {
        const [group] = await this.database('groups')
            .innerJoin(
                'organizations',
                'groups.organization_id',
                'organizations.organization_id',
            )
            .where('group_uuid', groupUuid)
            .select();
        if (group === undefined) {
            throw new NotFoundError(`No group found`);
        }
        return {
            uuid: group.group_uuid,
            name: group.name,
            createdAt: group.created_at,
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
            memberProfilesQuery.limit(includeMembers);
        }

        if (offset !== undefined) {
            memberProfilesQuery.offset(offset);
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
            uuid: group.uuid,
            name: group.name,
            createdAt: group.createdAt,
            organizationUuid: group.organizationUuid,
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

    async addGroupMember(
        member: GroupMembership,
    ): Promise<GroupMembership | undefined> {
        // This will return undefined if
        // - the group uuid doesn't exist
        // - the user uuid doesn't exist
        // - the user is already a member of the group
        // - the user is not a member of the group's parent organization
        const {
            rows: [insertedMembership],
        } = await this.database.raw(
            `
            INSERT INTO group_memberships (group_uuid, user_id, organization_id)
            SELECT groups.group_uuid, users.user_id, organization_memberships.organization_id
            FROM groups
            INNER JOIN organization_memberships ON groups.organization_id = organization_memberships.organization_id
            INNER JOIN users ON organization_memberships.user_id = users.user_id
                AND users.user_uuid = :userUuid
            WHERE groups.group_uuid = :groupUuid
            ON CONFLICT DO NOTHING
            RETURNING *
        `,
            member,
        );
        return insertedMembership === undefined ? undefined : member;
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

    async updateGroup(
        groupUuid: string,
        update: UpdateGroupWithMembers,
    ): Promise<Group | GroupWithMembers> {
        // TODO: fix include member count
        const existingGroup = await this.getGroupWithMembers(groupUuid, 10000);
        if (existingGroup === undefined) {
            throw new NotFoundError(`No group found`);
        }

        await this.database.transaction(async (trx) => {
            if (update.name) {
                await trx('groups')
                    .update({ name: update.name })
                    .where('group_uuid', groupUuid);
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
    }) {
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
            return;
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

        await this.database('group_memberships')
            .insert(insertData)
            .onConflict()
            .ignore();
    }
}
