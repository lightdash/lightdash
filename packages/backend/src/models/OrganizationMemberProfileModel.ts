import {
    getUserAvatarUrl,
    isUserAvatarColorValue,
    KnexPaginateArgs,
    KnexPaginatedData,
    NotFoundError,
    OpenIdIdentityIssuerType,
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
import { OpenIdIdentitiesTableName } from '../database/entities/openIdIdentities';
import { OrganizationMembershipCustomRolesTableName } from '../database/entities/organizationMembershipCustomRoles';
import {
    DbOrganizationMembership,
    DbOrganizationMembershipIn,
    OrganizationMembershipsTableName,
} from '../database/entities/organizationMemberships';
import {
    DbOrganization,
    OrganizationTableName,
} from '../database/entities/organizations';
import { UserAvatarsTableName } from '../database/entities/userAvatars';
import { UserOAuthGrantsTableName } from '../database/entities/userOAuthGrants';
import { DbUser, UserTableName } from '../database/entities/users';
import KnexPaginate from '../database/pagination';
import {
    assertAdminDemotionAllowed,
    clearOrganizationExtraRoles,
} from './roleSetUtils';
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
    role_uuid: string | null;
    has_extra_roles: boolean;
    expires_at?: Date;
    avatar_gradient: string | null;
    avatar_content_hash: string | null;
};

const hasExtraRolesColumn = (db: Knex) =>
    db.raw(
        `EXISTS (SELECT 1 FROM ?? AS x WHERE x.organization_id = ??.organization_id AND x.user_id = ??.user_id) AS has_extra_roles`,
        [
            OrganizationMembershipCustomRolesTableName,
            OrganizationMembershipsTableName,
            OrganizationMembershipsTableName,
        ],
    );

const selectColumns = (db: Knex) => [
    `${UserTableName}.user_uuid`,
    `${UserTableName}.user_id`,
    `${UserTableName}.first_name`,
    `${UserTableName}.last_name`,
    `${UserTableName}.is_active`,
    `${EmailTableName}.email`,
    `${OrganizationTableName}.organization_uuid`,
    `${OrganizationMembershipsTableName}.role`,
    `${OrganizationMembershipsTableName}.role_uuid`,
    `${InviteLinkTableName}.expires_at`,
    `${UserTableName}.created_at as user_created_at`,
    `${UserTableName}.updated_at as user_updated_at`,
    `${UserTableName}.avatar_gradient`,
    `${UserAvatarsTableName}.content_hash as avatar_content_hash`,
    hasExtraRolesColumn(db),
];

export class OrganizationMemberProfileModel {
    private readonly database: Knex;

    private readonly queryBuilder: () => Knex.QueryBuilder<
        DbOrganizationMemberProfile[]
    >;

    constructor({ database }: { database: Knex }) {
        this.database = database;
        // Internal user records (today: service accounts; future: persisted
        // embed users, AI agents) live in the `users` table for FK purposes
        // but are not human organization members. Excluding them here keeps
        // every listing surface — admin UI, SCIM /Users, share pickers —
        // free of non-human principals without per-callsite filtering.
        this.queryBuilder = () =>
            database(OrganizationMembershipsTableName)
                .innerJoin(
                    UserTableName,
                    `${OrganizationMembershipsTableName}.user_id`,
                    `${UserTableName}.user_id`,
                )
                .where(`${UserTableName}.is_internal`, false)
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
                )
                .leftJoin(
                    UserAvatarsTableName,
                    `${UserTableName}.user_uuid`,
                    `${UserAvatarsTableName}.user_uuid`,
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
            roleUuid: member.role_uuid || undefined,
            hasMultipleRoles: member.has_extra_roles,
            isActive: member.is_active,
            isInviteExpired,
            isPending,
            userCreatedAt: member.user_created_at,
            userUpdatedAt: member.user_updated_at,
            avatarUrl: member.avatar_content_hash
                ? getUserAvatarUrl(member.user_uuid, member.avatar_content_hash)
                : null,
            avatarGradient:
                member.avatar_gradient &&
                isUserAvatarColorValue(member.avatar_gradient)
                    ? member.avatar_gradient
                    : null,
        };
    }

    async getOrganizationMembers({
        organizationUuid,
        paginateArgs,
        searchQuery,
        sort,
        exactMatchFilter,
        googleOidcOnly,
    }: {
        organizationUuid: string;
        paginateArgs?: KnexPaginateArgs;
        searchQuery?: string;
        sort?: { column: string; direction: 'asc' | 'desc' };
        exactMatchFilter?: { column: string; value: string };
        googleOidcOnly?: boolean;
    }): Promise<KnexPaginatedData<OrganizationMemberProfile[]>> {
        let query = this.queryBuilder()
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .select<DbOrganizationMemberProfile[]>(
                selectColumns(this.database),
            );

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

        // Filter by users with Google Drive refresh token (using subquery to avoid duplicates)
        if (googleOidcOnly) {
            query = query.where((builder) =>
                builder
                    .whereExists(
                        this.database
                            .select(1)
                            .from(UserOAuthGrantsTableName)
                            .whereRaw(
                                `${UserOAuthGrantsTableName}.user_uuid = ${UserTableName}.user_uuid`,
                            )
                            .andWhere(
                                `${UserOAuthGrantsTableName}.provider`,
                                OpenIdIdentityIssuerType.GOOGLE,
                            ),
                    )
                    .orWhereExists(
                        this.database
                            .select(1)
                            .from(OpenIdIdentitiesTableName)
                            .whereRaw(
                                `${OpenIdIdentitiesTableName}.user_id = ${UserTableName}.user_id`,
                            )
                            .andWhere(
                                `${OpenIdIdentitiesTableName}.issuer_type`,
                                OpenIdIdentityIssuerType.GOOGLE,
                            )
                            .whereNotNull(
                                `${OpenIdIdentitiesTableName}.refresh_token`,
                            ),
                    ),
            );
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

    async getAllOrganizationMembers(
        organizationUuid: string,
    ): Promise<OrganizationMemberProfile[]> {
        const members = await this.queryBuilder()
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .select<DbOrganizationMemberProfile[]>(selectColumns(this.database))
            .orderBy(`${EmailTableName}.email`, 'asc');

        const usersHaveAuthenticationRows =
            await UserModel.findIfUsersHaveAuthentication(this.database, {
                userUuids: members.map((member) => member.user_uuid),
            });
        const usersHaveAuthenticationMap = new Map(
            usersHaveAuthenticationRows.map((row) => [
                row.user_uuid,
                row.has_authentication,
            ]),
        );

        return members.map((member) =>
            OrganizationMemberProfileModel.parseRow(
                member,
                usersHaveAuthenticationMap.get(member.user_uuid) || false,
            ),
        );
    }

    /** Returns the subset of the given user uuids that are members of the organization. */
    async findOrganizationMemberUuids(
        organizationUuid: string,
        userUuids: string[],
    ): Promise<string[]> {
        if (userUuids.length === 0) return [];

        const members = await this.queryBuilder()
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .whereIn(`${UserTableName}.user_uuid`, userUuids)
            .select<Pick<DbOrganizationMemberProfile, 'user_uuid'>[]>(
                `${UserTableName}.user_uuid`,
            );

        return members.map((member) => member.user_uuid);
    }

    async findOrganizationMembersByEmails(
        organizationUuid: string,
        emails: string[],
    ): Promise<OrganizationMemberProfile[]> {
        const normalizedEmails = [
            ...new Set(emails.map((email) => email.trim().toLowerCase())),
        ];
        if (normalizedEmails.length === 0) return [];

        const members = await this.queryBuilder()
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .whereRaw('LOWER(??) = ANY(?::text[])', [
                `${EmailTableName}.email`,
                normalizedEmails,
            ])
            .select<DbOrganizationMemberProfile[]>(selectColumns(this.database))
            .orderBy(`${EmailTableName}.email`, 'asc')
            .orderBy(`${UserTableName}.user_uuid`, 'asc');

        const usersHaveAuthenticationRows =
            await UserModel.findIfUsersHaveAuthentication(this.database, {
                userUuids: members.map((member) => member.user_uuid),
            });
        const usersHaveAuthenticationMap = new Map(
            usersHaveAuthenticationRows.map((row) => [
                row.user_uuid,
                row.has_authentication,
            ]),
        );

        return members.map((member) =>
            OrganizationMemberProfileModel.parseRow(
                member,
                usersHaveAuthenticationMap.get(member.user_uuid) || false,
            ),
        );
    }

    async getOrganizationMembersAndGroups(
        organizationUuid: string,
        includeGroups?: number,
        paginateArgs?: KnexPaginateArgs,
        searchQuery?: string,
        googleOidcOnly?: boolean,
    ): Promise<KnexPaginatedData<OrganizationMemberProfileWithGroups[]>> {
        let orgMembersAndGroupsQuery = this.database(UserTableName)
            // See queryBuilder above — exclude internal (non-human) user
            // records like service accounts.
            .where(`${UserTableName}.is_internal`, false)
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
            .leftJoin(
                UserAvatarsTableName,
                `${UserTableName}.user_uuid`,
                `${UserAvatarsTableName}.user_uuid`,
            )
            .groupBy(
                `${UserTableName}.user_uuid`,
                `${UserTableName}.user_id`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                `${UserTableName}.is_active`,
                `${EmailTableName}.email`,
                `${OrganizationTableName}.organization_uuid`,
                `${OrganizationMembershipsTableName}.organization_id`,
                `${OrganizationMembershipsTableName}.user_id`,
                `${OrganizationMembershipsTableName}.role`,
                `${OrganizationMembershipsTableName}.role_uuid`,
                `${InviteLinkTableName}.expires_at`,
                `${UserTableName}.avatar_gradient`,
                `${UserAvatarsTableName}.content_hash`,
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
                `${OrganizationMembershipsTableName}.role_uuid`,
                `${InviteLinkTableName}.expires_at`,
                `${UserTableName}.created_at as user_created_at`,
                `${UserTableName}.updated_at as user_updated_at`,
                `${UserTableName}.avatar_gradient`,
                `${UserAvatarsTableName}.content_hash as avatar_content_hash`,
                hasExtraRolesColumn(this.database),
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

        // Filter by users with Google Drive refresh token (using subquery to avoid duplicates)
        if (googleOidcOnly) {
            orgMembersAndGroupsQuery = orgMembersAndGroupsQuery.where(
                (builder) =>
                    builder
                        .whereExists(
                            this.database
                                .select(1)
                                .from(UserOAuthGrantsTableName)
                                .whereRaw(
                                    `${UserOAuthGrantsTableName}.user_uuid = ${UserTableName}.user_uuid`,
                                )
                                .andWhere(
                                    `${UserOAuthGrantsTableName}.provider`,
                                    OpenIdIdentityIssuerType.GOOGLE,
                                ),
                        )
                        .orWhereExists(
                            this.database
                                .select(1)
                                .from(OpenIdIdentitiesTableName)
                                .whereRaw(
                                    `${OpenIdIdentitiesTableName}.user_id = ${UserTableName}.user_id`,
                                )
                                .andWhere(
                                    `${OpenIdIdentitiesTableName}.issuer_type`,
                                    OpenIdIdentityIssuerType.GOOGLE,
                                )
                                .whereNotNull(
                                    `${OpenIdIdentitiesTableName}.refresh_token`,
                                ),
                        ),
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
            .select<DbOrganizationMemberProfile[]>(
                selectColumns(this.database),
            );
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
        const [dbMember] = await this.queryBuilder()
            .where(`${UserTableName}.user_uuid`, userUuid)
            .andWhere(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .select<DbOrganizationMemberProfile[]>(
                selectColumns(this.database),
            );

        if (!dbMember) {
            throw new NotFoundError('No matching member found in organization');
        }

        const usersHaveAuthenticationRows =
            await UserModel.findIfUsersHaveAuthentication(this.database, {
                userUuids: [userUuid],
            });

        const member =
            dbMember &&
            OrganizationMemberProfileModel.parseRow(
                dbMember,
                usersHaveAuthenticationRows[0]?.has_authentication,
            );

        return member;
    }

    async getOrganizationMemberByEmail(
        organizationUuid: string,
        email: string,
    ): Promise<OrganizationMemberProfile> {
        const [dbMember] = await this.queryBuilder()
            .where(`${EmailTableName}.email`, email)
            .andWhere(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .select<DbOrganizationMemberProfile[]>(
                selectColumns(this.database),
            );

        if (!dbMember) {
            throw new NotFoundError('No matching member found in organization');
        }

        const usersHaveAuthenticationRows =
            await UserModel.findIfUsersHaveAuthentication(this.database, {
                userUuids: [dbMember.user_uuid],
            });

        const member =
            dbMember &&
            OrganizationMemberProfileModel.parseRow(
                dbMember,
                usersHaveAuthenticationRows[0]?.has_authentication,
            );

        return member;
    }

    async updateOrganizationMember(
        organizationUuid: string,
        userUuid: string,
        data: OrganizationMemberProfileUpdate,
    ): Promise<OrganizationMemberProfile> {
        if (data.role) {
            const { role } = data;
            // A singular write replaces the whole role set (extras cleared) and
            // may not demote the organization's last active admin.
            await this.database.transaction(async (trx) => {
                const membership = await trx(OrganizationMembershipsTableName)
                    .join(
                        OrganizationTableName,
                        `${OrganizationTableName}.organization_id`,
                        `${OrganizationMembershipsTableName}.organization_id`,
                    )
                    .join(
                        UserTableName,
                        `${UserTableName}.user_id`,
                        `${OrganizationMembershipsTableName}.user_id`,
                    )
                    .where(
                        `${OrganizationTableName}.organization_uuid`,
                        organizationUuid,
                    )
                    .where(`${UserTableName}.user_uuid`, userUuid)
                    .first<
                        Pick<
                            DbOrganizationMembership,
                            'organization_id' | 'user_id'
                        >
                    >(
                        `${OrganizationMembershipsTableName}.organization_id`,
                        `${OrganizationMembershipsTableName}.user_id`,
                    );
                if (!membership) {
                    return;
                }
                await assertAdminDemotionAllowed(
                    trx,
                    membership.organization_id,
                    membership.user_id,
                    role,
                );
                await trx(OrganizationMembershipsTableName)
                    .where({
                        organization_id: membership.organization_id,
                        user_id: membership.user_id,
                    })
                    .update({ role });
                await clearOrganizationExtraRoles(
                    trx,
                    membership.organization_id,
                    membership.user_id,
                );
            });
        }
        return this.getOrganizationMemberByUuid(organizationUuid, userUuid);
    }
}
