import {
    CreateGroup,
    Group,
    GroupMembership,
    GroupWithMembers,
    NotFoundError,
    UnexpectedDatabaseError,
    UpdateGroup,
} from '@lightdash/common';
import { Knex } from 'knex';

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

    async getGroupWithMembers(groupUuid: string, includeMembers?: number) {
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

    async updateGroup(groupUuid: string, update: UpdateGroup): Promise<Group> {
        // Updates with joins not supported by knex
        const results = await this.database.raw<{
            rows: {
                group_uuid: string;
                name: string;
                created_at: Date;
                organization_uuid: string;
            }[];
        }>(
            `
            UPDATE groups
            SET name = :name
            FROM organizations
            WHERE groups.group_uuid = :groupUuid
            AND groups.organization_id = organizations.organization_id
            RETURNING groups.group_uuid, groups.name, groups.created_at, organizations.organization_uuid
            `,
            {
                groupUuid,
                name: update.name,
            },
        );
        const [updatedGroup] = results.rows;
        if (updatedGroup === undefined) {
            throw new NotFoundError(`No group found`);
        }
        return {
            uuid: updatedGroup.group_uuid,
            name: updatedGroup.name,
            createdAt: updatedGroup.created_at,
            organizationUuid: updatedGroup.organization_uuid,
        };
    }
}
