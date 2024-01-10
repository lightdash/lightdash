import {
    CreateGroup,
    Group,
    GroupMembership,
    GroupWithMembers,
    NotFoundError,
    ProjectGroupAccess,
    ProjectMemberRole,
    UnexpectedDatabaseError,
    UpdateGroup,
    UpdateGroupWithMembers,
} from '@lightdash/common';
import { Knex } from 'knex';
import differenceBy from 'lodash/differenceBy';
import { GroupTableName } from '../database/entities/groups';
import { OrganizationTableName } from '../database/entities/organizations';
import {
    DBProjectGroupAccess,
    ProjectGroupAccessTableName,
} from '../database/entities/projectGroupAccess';
import { ProjectTableName } from '../database/entities/projects';

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
        const rows = await this.database('groups')
            .with('members', (query) => {
                let memberQuery = query
                    .from('group_memberships')
                    .innerJoin(
                        'users',
                        'group_memberships.user_id',
                        'users.user_id',
                    )
                    .innerJoin('emails', 'users.user_id', 'emails.user_id')
                    .where('group_memberships.group_uuid', groupUuid)
                    .andWhere('emails.is_primary', true);

                if (includeMembers !== undefined) {
                    memberQuery = memberQuery.limit(includeMembers);
                }

                if (offset !== undefined) {
                    memberQuery = memberQuery.offset(offset);
                }

                return memberQuery.select(
                    'group_memberships.group_uuid',
                    'users.user_uuid',
                    'users.first_name',
                    'users.last_name',
                    'emails.email',
                );
            })
            .innerJoin(
                'organizations',
                'groups.organization_id',
                'organizations.organization_id',
            )
            .leftJoin('members', 'groups.group_uuid', 'members.group_uuid')
            .where('groups.group_uuid', groupUuid)
            .select();

        if (rows.length === 0) {
            throw new NotFoundError(`No group found`);
        }
        return {
            uuid: rows[0].group_uuid,
            name: rows[0].name,
            createdAt: rows[0].created_at,
            organizationUuid: rows[0].organization_uuid,
            members: (rows[0].user_uuid ? rows : []).map((row) => ({
                userUuid: row.user_uuid,
                email: row.email,
                firstName: row.first_name,
                lastName: row.last_name,
            })),
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
}
