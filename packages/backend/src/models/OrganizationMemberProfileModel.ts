import {
    KnexPaginateArgs,
    KnexPaginatedData,
    NotFoundError,
    OrganizationMemberProfile,
    OrganizationMemberProfileUpdate,
    OrganizationMemberProfileWithGroups,
    OrganizationMemberRole,
} from '@lightdash/common';
import { Knex } from 'knex';
import { EmailTableName } from '../database/entities/emails';
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
import { GroupTableName } from '../database/entities/groups';
import { InviteLinkTableName } from '../database/entities/inviteLinks';
import {
    DbOrganizationMembership,
    DbOrganizationMembershipIn,
    OrganizationMembershipsTableName,
} from '../database/entities/organizationMemberships';
import {
    DbOrganization,
    OrganizationTableName,
} from '../database/entities/organizations';
import { DbUser, UserTableName } from '../database/entities/users';
import KnexPaginate from '../database/pagination';
import { getColumnMatchRegexQuery } from './SearchModel/utils/search';
import { UserModel } from './UserModel';

type DbOrganizationMemberProfile = {
    user_uuid: string;
    user_created_at: Date;
    user_updated_at: Date;
    first_name: string;
    last_name: string;
    is_active: boolean;
    email: string;
    organization_uuid: string;
    role: OrganizationMemberRole;
    expires_at?: Date;
};

const SelectColumns = [
    `${UserTableName}.user_uuid`,
    `${UserTableName}.user_id`,
    `${UserTableName}.first_name`,
    `${UserTableName}.last_name`,
    `${UserTableName}.is_active`,
    `${EmailTableName}.email`,
    `${OrganizationTableName}.organization_uuid`,
    `${OrganizationMembershipsTableName}.role`,
    `${InviteLinkTableName}.expires_at`,
    `${UserTableName}.created_at as user_created_at`,
    `${UserTableName}.updated_at as user_updated_at`,
];

export class OrganizationMemberProfileModel {
    private readonly database: Knex;

    private readonly queryBuilder: () => Knex.QueryBuilder<
        DbOrganizationMemberProfile[]
    >;

    constructor({ database }: { database: Knex }) {
        this.database = database;
        this.queryBuilder = () =>
            database(OrganizationMembershipsTableName)
                .innerJoin(
                    UserTableName,
                    `${OrganizationMembershipsTableName}.user_id`,
                    `${UserTableName}.user_id`,
                )
                .joinRaw(
                    `INNER JOIN ${EmailTableName} ON ${UserTableName}.user_id = ${EmailTableName}.user_id AND ${EmailTableName}.is_primary`,
                )
                .innerJoin(
                    OrganizationTableName,
                    `${OrganizationMembershipsTableName}.organization_id`,
                    `${OrganizationTableName}.organization_id`,
                )
                .leftJoin(
                    InviteLinkTableName,
                    `${UserTableName}.user_uuid`,
                    `${InviteLinkTableName}.user_uuid`,
                );
    }

    private static parseRow(
        member: DbOrganizationMemberProfile,
        hasAuthentication: boolean = false,
    ): OrganizationMemberProfile {
        const isPending = !hasAuthentication;
        const isInviteExpired =
            !isPending && !!member.expires_at && member.expires_at < new Date();

        return {
            userUuid: member.user_uuid,
            firstName: member.first_name,
            lastName: member.last_name,
            email: member.email,
            organizationUuid: member.organization_uuid,
            role: member.role,
            isActive: member.is_active,
            isInviteExpired,
            isPending,
            userCreatedAt: member.user_created_at,
            userUpdatedAt: member.user_updated_at,
        };
    }

    async findOrganizationMember(
        organizationUuid: string,
        userUuid: string,
    ): Promise<OrganizationMemberProfile | undefined> {
        const [member] = await this.queryBuilder()
            .where(`${UserTableName}.user_uuid`, userUuid)
            .andWhere(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .select<DbOrganizationMemberProfile[]>(SelectColumns);

        const usersHaveAuthenticationRows =
            await UserModel.findIfUsersHaveAuthentication(this.database, {
                userUuids: [userUuid],
            });

        return (
            member &&
            OrganizationMemberProfileModel.parseRow(
                member,
                usersHaveAuthenticationRows[0]?.has_authentication,
            )
        );
    }

    async getOrganizationMembers({
        organizationUuid,
        paginateArgs,
        searchQuery,
        sort,
        exactMatchFilter,
    }: {
        organizationUuid: string;
        paginateArgs?: KnexPaginateArgs;
        searchQuery?: string;
        sort?: { column: string; direction: 'asc' | 'desc' };
        exactMatchFilter?: { column: string; value: string };
    }): Promise<KnexPaginatedData<OrganizationMemberProfile[]>> {
        let query = this.queryBuilder()
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .select<DbOrganizationMemberProfile[]>(SelectColumns);

        // Apply exact match filter if provided
        if (exactMatchFilter) {
            query = query.where(
                exactMatchFilter.column,
                exactMatchFilter.value,
            );
        }

        // Apply search query if present
        if (searchQuery) {
            query = getColumnMatchRegexQuery(query, searchQuery, [
                'first_name',
                'last_name',
                'email',
                'role',
            ]);
        }

        // Apply sorting if present
        if (sort && sort.column && sort.direction) {
            query = query.orderBy(sort.column, sort.direction);
        }

        // Paginate the results
        const { pagination, data } = await KnexPaginate.paginate(
            query,
            paginateArgs,
        );

        const usersHaveAuthenticationRows =
            await UserModel.findIfUsersHaveAuthentication(this.database, {
                userUuids: data.map((m) => m.user_uuid),
            });

        const usersHaveAuthenticationMap = new Map(
            usersHaveAuthenticationRows.map((row) => [
                row.user_uuid,
                row.has_authentication,
            ]),
        );

        return {
            pagination,
            data: data.map((m) =>
                OrganizationMemberProfileModel.parseRow(
                    m,
                    usersHaveAuthenticationMap.get(m.user_uuid) || false,
                ),
            ),
        };
    }

    async getOrganizationMembersAndGroups(
        organizationUuid: string,
        includeGroups?: number,
        paginateArgs?: KnexPaginateArgs,
        searchQuery?: string,
    ): Promise<KnexPaginatedData<OrganizationMemberProfileWithGroups[]>> {
        let orgMembersAndGroupsQuery = this.database(UserTableName)
            .leftJoin(
                OrganizationMembershipsTableName,
                `${UserTableName}.user_id`,
                `${OrganizationMembershipsTableName}.user_id`,
            )
            .leftJoin(
                OrganizationTableName,
                `${OrganizationMembershipsTableName}.organization_id`,
                `${OrganizationTableName}.organization_id`,
            )
            .leftJoin(
                GroupMembershipTableName,
                `${UserTableName}.user_id`,
                `${GroupMembershipTableName}.user_id`,
            )
            .leftJoin(
                GroupTableName,
                `${GroupMembershipTableName}.group_uuid`,
                `${GroupTableName}.group_uuid`,
            )
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .joinRaw(
                `INNER JOIN ${EmailTableName} ON ${UserTableName}.user_id = ${EmailTableName}.user_id AND ${EmailTableName}.is_primary`,
            )
            .leftJoin(
                InviteLinkTableName,
                `${UserTableName}.user_uuid`,
                `${InviteLinkTableName}.user_uuid`,
            )
            .groupBy(
                `${UserTableName}.user_uuid`,
                `${UserTableName}.user_id`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                `${UserTableName}.is_active`,
                `${EmailTableName}.email`,
                `${OrganizationTableName}.organization_uuid`,
                `${OrganizationMembershipsTableName}.role`,
                `${InviteLinkTableName}.expires_at`,
            )
            .select(
                `${UserTableName}.user_uuid`,
                `${UserTableName}.user_id`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                `${UserTableName}.is_active`,
                `${EmailTableName}.email`,
                `${OrganizationTableName}.organization_uuid`,
                `${OrganizationMembershipsTableName}.role`,
                `${InviteLinkTableName}.expires_at`,
                `${UserTableName}.created_at as user_created_at`,
                `${UserTableName}.updated_at as user_updated_at`,
            )
            .select<DbOrganizationMemberProfile[]>(
                this.database.raw(
                    `ARRAY_AGG(DISTINCT ${GroupTableName}.group_uuid) FILTER (WHERE ${GroupTableName}.group_uuid IS NOT NULL) as group_uuids`,
                ),
                this.database.raw(
                    `ARRAY_AGG(DISTINCT ${GroupTableName}.name) FILTER (WHERE ${GroupTableName}.name IS NOT NULL) as group_names`,
                ),
            );

        if (includeGroups !== undefined) {
            orgMembersAndGroupsQuery =
                orgMembersAndGroupsQuery.limit(includeGroups);
        }

        if (searchQuery) {
            orgMembersAndGroupsQuery = getColumnMatchRegexQuery(
                orgMembersAndGroupsQuery,
                searchQuery,
                ['first_name', 'last_name', 'email', 'role'],
            );
        }

        const { pagination, data } = await KnexPaginate.paginate(
            orgMembersAndGroupsQuery,
            paginateArgs,
        );

        // Had to cast data as the typescript types do not pick up the raw select keys
        const result = data as (DbOrganizationMemberProfile & {
            group_uuids: string[];
            group_names: string[];
            groups: { name: string; uuid: string }[];
        })[];

        const updatedMembers = result.map((row) => ({
            ...row,
            groups:
                !row.group_uuids && !row.group_names
                    ? []
                    : row.group_uuids.map((groupUuid, index) => ({
                          uuid: groupUuid,
                          name: row.group_names[index],
                      })),
        }));

        const usersHaveAuthenticationRows =
            await UserModel.findIfUsersHaveAuthentication(this.database, {
                userUuids: updatedMembers.map((m) => m.user_uuid),
            });
        const usersHaveAuthenticationMap = new Map(
            usersHaveAuthenticationRows.map((row) => [
                row.user_uuid,
                row.has_authentication,
            ]),
        );

        return {
            pagination,
            data: updatedMembers.map((m) => ({
                ...OrganizationMemberProfileModel.parseRow(
                    m,
                    usersHaveAuthenticationMap.get(m.user_uuid) || false,
                ),
                groups: m.groups,
            })),
        };
    }

    async getOrganizationAdmins(
        organizationUuid: string,
    ): Promise<OrganizationMemberProfile[]> {
        const members = await this.queryBuilder()
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .andWhere('role', 'admin')
            .select<DbOrganizationMemberProfile[]>(SelectColumns);
        const usersHaveAuthenticationRows =
            await UserModel.findIfUsersHaveAuthentication(this.database, {
                userUuids: members.map((m) => m.user_uuid),
            });
        const usersHaveAuthenticationMap = new Map(
            usersHaveAuthenticationRows.map((row) => [
                row.user_uuid,
                row.has_authentication,
            ]),
        );

        return members.map((m) =>
            OrganizationMemberProfileModel.parseRow(
                m,
                usersHaveAuthenticationMap.get(m.user_uuid) || false,
            ),
        );
    }

    createOrganizationMembership = async (
        membershipIn: DbOrganizationMembershipIn,
    ) => {
        await this.database<DbOrganizationMembership>(
            'organization_memberships',
        ).insert<DbOrganizationMembershipIn>(membershipIn);
    };

    async createOrganizationMembershipByUuid({
        organizationUuid,
        userUuid,
        role,
    }: {
        organizationUuid: string;
        userUuid: string;
        role: OrganizationMemberRole;
    }): Promise<void> {
        // Look up user_id from user_uuid
        const user = await this.database
            .select('user_id')
            .from(UserTableName)
            .where('user_uuid', userUuid)
            .first();

        if (!user) {
            throw new NotFoundError(`User with UUID ${userUuid} not found.`);
        }

        // Look up organization_id from organization_uuid
        const organization = await this.database
            .select('organization_id')
            .from(OrganizationTableName)
            .where('organization_uuid', organizationUuid)
            .first();

        if (!organization) {
            throw new NotFoundError(
                `Organization with UUID ${organizationUuid} not found.`,
            );
        }

        // Insert new organization membership
        await this.createOrganizationMembership({
            user_id: user.user_id,
            organization_id: organization.organization_id,
            role,
        });
    }

    async getOrganizationMemberByUuid(
        organizationUuid: string,
        userUuid: string,
    ): Promise<OrganizationMemberProfile> {
        const member = await this.findOrganizationMember(
            organizationUuid,
            userUuid,
        );
        if (!member) {
            throw new NotFoundError('No matching member found in organization');
        }
        return member;
    }

    async updateOrganizationMember(
        organizationUuid: string,
        userUuid: string,
        data: OrganizationMemberProfileUpdate,
    ): Promise<OrganizationMemberProfile> {
        if (data.role) {
            const sqlParams = {
                organizationUuid,
                userUuid,
                role: data.role,
            };
            await this.database.raw<
                (DbOrganizationMemberProfile & DbOrganization & DbUser)[]
            >(
                `
                    UPDATE organization_memberships AS m
                    SET role = :role FROM organizations AS o, users AS u
                    WHERE o.organization_id = m.organization_id
                      AND u.user_id = m.user_id
                      AND user_uuid = :userUuid
                      AND organization_uuid = :organizationUuid
                        RETURNING *
                `,
                sqlParams,
            );
        }
        return this.getOrganizationMemberByUuid(organizationUuid, userUuid);
    }
}
