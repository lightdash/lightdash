import {
    CreateGroup,
    Group,
    GroupMembership,
    GroupWithMembers,
    NotFoundError,
    UnexpectedDatabaseError,
} from '@lightdash/common';
import { Knex } from 'knex';

export class GroupsModel {
    database: Knex;

    constructor(deps: { database: Knex }) {
        this.database = deps.database;
    }

    async listGroupsInOrganization(organizationUuid: string): Promise<Group[]> {
        const groups = await this.database('groups')
            .innerJoin(
                'organizations',
                'groups.organization_id',
                'organizations.organization_id',
            )
            .select();
        return groups.map((group) => ({
            uuid: group.group_uuid,
            name: group.name,
            createdAt: group.created_at,
            organizationUuid,
        }));
    }

    async createGroup(group: CreateGroup): Promise<Group> {
        const [row] = await this.database.raw<
            { created_at: Date; group_uuid: string }[]
        >(
            `
            INSERT INTO groups (name, organization_id)
            SELECT ?, organization_id
            FROM organizations
            WHERE organization_uuid = ?
            RETURNING group_uuid, groups.created_at
        `,
            [group.name, group.organizationUuid],
        );
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

    async getGroupWithMembers(groupUuid: string): Promise<GroupWithMembers> {
        const rows = await this.database('groups')
            .innerJoin(
                'group_memberships',
                'groups.group_uuid',
                'group_memberships.group_uuid',
            )
            .innerJoin('users', 'group_memberships.user_id', 'users.user_id')
            .innerJoin('emails', 'users.user_id', 'emails.user_id')
            .innerJoin(
                'organizations',
                'groups.organization_id',
                'organizations.organization_id',
            )
            .where('groups.group_uuid', groupUuid)
            .andWhere('emails.is_primary', true)
            .select();
        if (rows.length === 0) {
            throw new NotFoundError(`No group found`);
        }
        return {
            uuid: rows[0].group_uuid,
            name: rows[0].name,
            createdAt: rows[0].created_at,
            organizationUuid: rows[0].organization_uuid,
            members: rows.map((row) => ({
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

    // TODO: do we need to enforce that only org_members from the same org can join or do we want to manage this as business logic?
    async addGroupMember(
        member: GroupMembership,
    ): Promise<GroupMembership | undefined> {
        // This will return undefined if
        // - the group uuid doesn't exist
        // - the user uuid doesn't exist
        // - the user is already a member of the group
        // - the user is not a member of the group's parent organization
        const [insertedMembership] = await this.database.raw(
            `
            INSERT INTO group_memberships (group_uuid, user_id, organization_id)
            SELECT groups.group_uuid, users.user_id, organization_memberships.organization_id
            FROM groups
            INNER JOIN organization_memberships ON groups.organization_id = organization_memberships.organization_id
            INNER JOIN users ON organization_memberships.user_id = users.user_id
                AND users.user_uuid = :userUuid
            WHERE groups.group_uuid = :groupUuid
            ON CONFLICT DO NOTHING
            RETURNING users.user_id, groups.group_uuid
        `,
            member,
        );
        return insertedMembership === undefined
            ? insertedMembership
            : {
                  groupUuid: insertedMembership.group_uuid,
                  userUuid: insertedMembership.user_uuid,
              };
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
}
