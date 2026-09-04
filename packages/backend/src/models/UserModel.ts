import { Ability, AbilityBuilder } from '@casl/ability';
import {
    ActivateUser,
    AlreadyExistsError,
    applyServiceAccountAbilities,
    buildAbilityFromScopes,
    collapseAbilityRules,
    CommercialFeatureFlags,
    CreateUserArgs,
    CreateUserWithRole,
    ForbiddenError,
    getUserAbilityBuilder,
    getUserAvatarUrl,
    InvalidUser,
    isOpenIdUser,
    isUserAvatarColorValue,
    LightdashMode,
    LightdashUser,
    LightdashUserWithAbilityRules,
    MemberAbility,
    NotFoundError,
    OpenIdIdentityIssuerType,
    OpenIdUser,
    OrganizationMemberRole,
    ParameterError,
    PasswordLoginBlockedError,
    PersonalAccessToken,
    ProjectAbilityProfile,
    projectMemberAbilities,
    ProjectMemberProfile,
    ProjectMemberRole,
    ProjectType,
    Role,
    RoleWithScopes,
    ServiceAccount,
    ServiceAccountScope,
    SessionUser,
    UpdateUserArgs,
    validatePassword,
} from '@lightdash/common';
import bcrypt from 'bcrypt';
import { Knex } from 'knex';
import NodeCache from 'node-cache';
import { LightdashConfig } from '../config/parseConfig';
import {
    createEmail,
    deleteEmail,
    EmailTableName,
} from '../database/entities/emails';
import { OpenIdIdentitiesTableName } from '../database/entities/openIdIdentities';
import { OrganizationMembershipCustomRolesTableName } from '../database/entities/organizationMembershipCustomRoles';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import {
    DbOrganization,
    OrganizationTableName,
} from '../database/entities/organizations';
import {
    DbPasswordLogin,
    DbPasswordLoginIn,
    PasswordLoginTableName,
} from '../database/entities/passwordLogins';
import { DbPersonalAccessToken } from '../database/entities/personalAccessTokens';
import { ProjectGroupAccessCustomRolesTableName } from '../database/entities/projectGroupAccessCustomRoles';
import { ProjectMembershipCustomRolesTableName } from '../database/entities/projectMembershipCustomRoles';
import { ProjectMembershipsTableName } from '../database/entities/projectMemberships';
import { ProjectTableName } from '../database/entities/projects';
import {
    RolesTableName,
    ScopedRolesTableName,
} from '../database/entities/roles';
import {
    DbUser,
    DbUserIn,
    DbUserUpdate,
    UserTableName,
} from '../database/entities/users';
import Logger from '../logging/logger';
import { deprecatedHash, hashWithSecret } from '../utils/hash';
import {
    CachedPatSessionUser,
    PatSessionCache,
} from './caches/PatSessionCache';
import { PersonalAccessTokenModel } from './DashboardModel/PersonalAccessTokenModel';
import { FeatureFlagModel } from './FeatureFlagModel/FeatureFlagModel';
import Transaction = Knex.Transaction;

const DUMMY_PASSWORD_HASH =
    '$2b$10$a.FcCmXh5HpTV62l7zh1b.yhpfcv/L5F/.8u2DMzar5eH1Qtrltvy';

export type CreatePasswordlessUserArgs = {
    firstName: string;
    lastName: string;
    email: CreateUserArgs['email'];
};

type CreateLocalUserArgs = CreateUserArgs | CreatePasswordlessUserArgs;

export type DbUserDetails = {
    user_id: number;
    user_uuid: string;
    first_name: string;
    last_name: string;
    created_at: Date;
    is_tracking_anonymized: boolean;
    is_marketing_opted_in: boolean;
    email: string | undefined;
    is_verified?: boolean;
    organization_uuid?: string;
    organization_name?: string;
    organization_created_at?: Date;
    organization_id: number;
    is_setup_complete: boolean;
    role?: OrganizationMemberRole;
    role_uuid?: string;
    is_active: boolean;
    is_internal: boolean;
    timezone: string | null;
    avatar_gradient: string | null;
    avatar_content_hash: string | null;
    updated_at: Date;
};

export const mapDbUserDetailsToLightdashUser = (
    user: DbUserDetails,
    hasAuthentication: boolean,
): LightdashUser => ({
    userUuid: user.user_uuid,
    userId: user.user_id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    organizationUuid: user.organization_uuid,
    organizationName: user.organization_name,
    organizationCreatedAt: user.organization_created_at,
    isTrackingAnonymized: user.is_tracking_anonymized,
    isMarketingOptedIn: user.is_marketing_opted_in,
    isSetupComplete: user.is_setup_complete,
    role: user.role,
    roleUuid: user.role_uuid,
    isActive: user.is_active,
    timezone: user.timezone,
    avatarUrl: user.avatar_content_hash
        ? getUserAvatarUrl(user.user_uuid, user.avatar_content_hash)
        : null,
    avatarGradient:
        user.avatar_gradient && isUserAvatarColorValue(user.avatar_gradient)
            ? user.avatar_gradient
            : null,
    isPending: !hasAuthentication,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
});

const userDetailsQueryBuilder = (
    db: Knex,
): Knex.QueryBuilder<DbUserDetails[]> =>
    db('users')
        .joinRaw(
            'LEFT JOIN emails ON users.user_id = emails.user_id AND emails.is_primary',
        )
        // Derived join projects only the hash — never the image bytea.
        .leftJoin(
            db('user_avatars')
                .select(
                    'user_uuid as avatar_user_uuid',
                    'content_hash as avatar_content_hash',
                )
                .as('user_avatar_hashes'),
            'users.user_uuid',
            'user_avatar_hashes.avatar_user_uuid',
        )
        // TODO remove this org join, we should do this in the service
        .leftJoin(
            'organization_memberships',
            'users.user_id',
            'organization_memberships.user_id',
        )
        .leftJoin(
            'organizations',
            'organization_memberships.organization_id',
            'organizations.organization_id',
        );

type UserModelArguments = {
    database: Knex;
    lightdashConfig: LightdashConfig;
    featureFlagModel: FeatureFlagModel;
};

const sessionUserCache =
    process.env.EXPERIMENTAL_CACHE === 'true'
        ? new NodeCache({
              stdTTL: 30, // time to live in seconds
              checkperiod: 60, // cleanup interval in seconds
          })
        : undefined;

export class UserModel {
    private readonly lightdashConfig: LightdashConfig;

    private readonly database: Knex;

    private readonly featureFlagModel: FeatureFlagModel;

    constructor({
        database,
        lightdashConfig,
        featureFlagModel,
    }: UserModelArguments) {
        this.database = database;
        this.lightdashConfig = lightdashConfig;
        this.featureFlagModel = featureFlagModel;
    }

    private canTrackingBeAnonymized() {
        return this.lightdashConfig.mode !== LightdashMode.CLOUD_BETA;
    }

    // Per-pod eviction: other pods keep their entry until the 30s TTL expires
    // eslint-disable-next-line class-methods-use-this
    invalidateSessionUserCache(userUuid: string): void {
        const cache = sessionUserCache;
        if (!cache) return;
        const prefix = `${userUuid}::`;
        cache
            .keys()
            .filter((key) => key.startsWith(prefix))
            .forEach((key) => cache.del(key));
    }

    async getSessionUserFromCacheOrDB(
        userUuid: string,
        organizationUuid: string,
    ) {
        const cacheKey = `${userUuid}::${organizationUuid}`;
        // Try to get from cache first
        const cachedUser = sessionUserCache?.get<SessionUser>(cacheKey);
        if (cachedUser?.isSetupComplete && cachedUser.isEmailVerified) {
            // Return cached user
            return { sessionUser: cachedUser, cacheHit: true };
        }
        // If not in cache, get from database
        const sessionUser = await this.findSessionUserAndOrgByUuid(
            userUuid,
            organizationUuid,
        );
        // Store in cache
        if (sessionUser.isSetupComplete && sessionUser.isEmailVerified) {
            sessionUserCache?.set(cacheKey, sessionUser);
        }
        return { sessionUser, cacheHit: false };
    }

    // DB Errors:
    // user_id does not exist (foreign key)
    static async createPasswordLogin(
        db: Knex,
        passwordLoginIn: DbPasswordLoginIn,
    ) {
        await db(PasswordLoginTableName)
            .insert<DbPasswordLoginIn>(passwordLoginIn)
            .onConflict('user_id')
            .merge();
    }

    static findIfUsersHaveAuthentication(
        trx: Knex,
        filters: { userUuids: string[] },
    ) {
        return trx(UserTableName)
            .leftJoin(
                PasswordLoginTableName,
                `${UserTableName}.user_id`,
                `${PasswordLoginTableName}.user_id`,
            )
            .leftJoin(
                OpenIdIdentitiesTableName,
                `${UserTableName}.user_id`,
                `${OpenIdIdentitiesTableName}.user_id`,
            )
            .joinRaw(
                `LEFT JOIN ${EmailTableName} AS verified_primary_emails ON ${UserTableName}.user_id = verified_primary_emails.user_id AND verified_primary_emails.is_primary AND verified_primary_emails.is_verified`,
            )
            .select<{ user_uuid: string; has_authentication: false }[]>(
                `${UserTableName}.user_uuid`,
                trx.raw(
                    `CASE WHEN COALESCE(password_logins.user_id, openid_identities.user_id, verified_primary_emails.user_id, null) IS NOT NULL THEN TRUE ELSE FALSE END as has_authentication`,
                ),
            )
            .distinctOn(`user_uuid`)
            .whereIn(`${UserTableName}.user_uuid`, filters.userUuids);
    }

    private async hasAuthentication(
        userUuid: string,
        trx: Knex = this.database,
    ): Promise<boolean> {
        const [usersHaveAuthenticationRows] =
            await UserModel.findIfUsersHaveAuthentication(trx, {
                userUuids: [userUuid],
            });
        if (usersHaveAuthenticationRows === undefined) {
            throw new NotFoundError(`Cannot find user with uuid ${userUuid}`);
        }
        return usersHaveAuthenticationRows.has_authentication;
    }

    private async createUserTransaction(
        trx: Transaction,
        createUser: (Omit<CreateUserWithRole, 'role'> | OpenIdUser) & {
            isActive: boolean;
            isSetupComplete: boolean;
            isVerified?: boolean;
        },
    ) {
        const userIn: DbUserIn = isOpenIdUser(createUser)
            ? {
                  first_name: createUser.openId.firstName || '',
                  last_name: createUser.openId.lastName || '',
                  is_marketing_opted_in: false,
                  is_tracking_anonymized: this.canTrackingBeAnonymized(),
                  is_setup_complete: createUser.isSetupComplete,
                  is_active: createUser.isActive,
              }
            : {
                  first_name: createUser.firstName.trim(),
                  last_name: createUser.lastName.trim(),
                  is_marketing_opted_in: false,
                  is_tracking_anonymized: this.canTrackingBeAnonymized(),
                  is_setup_complete: createUser.isSetupComplete,
                  is_active: createUser.isActive,
              };
        const [newUser] = await trx<DbUser>('users')
            .insert<DbUserIn>(userIn)
            .returning('*');
        if (isOpenIdUser(createUser)) {
            await trx(OpenIdIdentitiesTableName)
                .insert({
                    issuer_type: createUser.openId.issuerType,
                    issuer: createUser.openId.issuer,
                    subject: createUser.openId.subject,
                    user_id: newUser.user_id,
                    email: createUser.openId.email.toLowerCase(),
                })
                .returning('*');
            await createEmail(trx, {
                user_id: newUser.user_id,
                email: createUser.openId.email.toLowerCase(),
                is_primary: true,
            });
        } else {
            await createEmail(trx, {
                user_id: newUser.user_id,
                email: createUser.email.toLowerCase(),
                is_primary: true,
            });
            if ('password' in createUser && createUser.password) {
                if (!validatePassword(createUser.password)) {
                    throw new ParameterError(
                        "Password doesn't meet requirements",
                    );
                }
                await UserModel.createPasswordLogin(trx, {
                    user_id: newUser.user_id,
                    password_hash: await bcrypt.hash(
                        createUser.password,
                        await bcrypt.genSalt(),
                    ),
                });
            }
        }
        return newUser;
    }

    async getOrganizationsForUser(
        userUuid: string,
    ): Promise<
        Pick<
            LightdashUser,
            'organizationUuid' | 'organizationCreatedAt' | 'organizationName'
        >[]
    > {
        const organizations = await this.database('organization_memberships')
            .leftJoin(
                'organizations',
                'organization_memberships.organization_id',
                'organizations.organization_id',
            )
            .where(
                'user_id',
                this.database('users')
                    .where('user_uuid', userUuid)
                    .select('user_id'),
            )
            .select<DbOrganization[]>(
                'organizations.organization_uuid',
                'organizations.created_at',
                'organizations.organization_name',
            )
            .orderBy('organizations.created_at', 'asc')
            .orderBy('organizations.organization_id', 'asc');

        return organizations.map((organization) => ({
            organizationUuid: organization.organization_uuid,
            organizationCreatedAt: organization.created_at,
            organizationName: organization.organization_name,
        }));
    }

    async hasUsers(): Promise<boolean> {
        const results = await userDetailsQueryBuilder(this.database);
        return results.length > 0;
    }

    async getIsTrackingAnonymizedByUserUuids(
        userUuids: string[],
    ): Promise<Record<string, boolean>> {
        if (userUuids.length === 0) {
            return {};
        }
        const users = await this.database(UserTableName)
            .whereIn('user_uuid', userUuids)
            .select<Pick<DbUser, 'user_uuid' | 'is_tracking_anonymized'>[]>(
                'user_uuid',
                'is_tracking_anonymized',
            );
        return Object.fromEntries(
            users.map((user) => [user.user_uuid, user.is_tracking_anonymized]),
        );
    }

    async getUserDetailsByUuid(userUuid: string): Promise<LightdashUser> {
        const [user] = await userDetailsQueryBuilder(this.database)
            .where('user_uuid', userUuid)
            .select('*', 'organizations.created_at as organization_created_at');
        if (user === undefined) {
            throw new NotFoundError(`Cannot find user with uuid ${userUuid}`);
        }

        return mapDbUserDetailsToLightdashUser(
            user,
            await this.hasAuthentication(userUuid),
        );
    }

    async getUserDetailsById(userId: number): Promise<LightdashUser> {
        const [user] = await userDetailsQueryBuilder(this.database)
            .where('user_id', userId)
            .select('*', 'organizations.created_at as organization_created_at');
        if (user === undefined) {
            throw new NotFoundError('Cannot find user');
        }
        return mapDbUserDetailsToLightdashUser(
            user,
            await this.hasAuthentication(user.user_uuid),
        );
    }

    async getUserByPrimaryEmailAndPassword(
        email: string,
        password: string,
    ): Promise<LightdashUser> {
        const result = await this.database.transaction(async (trx) => {
            const passwordLogin = await trx(PasswordLoginTableName)
                .innerJoin(
                    'emails',
                    `${PasswordLoginTableName}.user_id`,
                    'emails.user_id',
                )
                .innerJoin(
                    UserTableName,
                    `${PasswordLoginTableName}.user_id`,
                    `${UserTableName}.user_id`,
                )
                .where('emails.email', email)
                .andWhere('emails.is_primary', true)
                .andWhere(`${UserTableName}.is_internal`, false)
                .forUpdate(`${PasswordLoginTableName}`)
                .first<DbPasswordLogin>(`${PasswordLoginTableName}.*`);

            if (passwordLogin === undefined) {
                await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
                throw new NotFoundError(
                    `No user found with email ${email} and password`,
                );
            }

            const now = new Date();
            if (
                passwordLogin.blocked_until !== null &&
                passwordLogin.blocked_until > now
            ) {
                throw new PasswordLoginBlockedError(
                    passwordLogin.blocked_until,
                );
            }

            const match = await bcrypt.compare(
                password,
                passwordLogin.password_hash,
            );
            if (!match) {
                const attemptWindowStartedAt = new Date(
                    now.getTime() - 5 * 60 * 1000,
                );
                const failedAttemptCount =
                    passwordLogin.last_attempt_at >= attemptWindowStartedAt
                        ? passwordLogin.failed_attempt_count + 1
                        : 1;
                const blockedUntil =
                    failedAttemptCount >= 5
                        ? new Date(now.getTime() + 30 * 60 * 1000)
                        : null;

                await trx(PasswordLoginTableName)
                    .where('user_id', passwordLogin.user_id)
                    .update({
                        failed_attempt_count: failedAttemptCount,
                        last_attempt_at: now,
                        blocked_until: blockedUntil,
                    });

                if (blockedUntil !== null) {
                    return {
                        user: null,
                        error: new PasswordLoginBlockedError(blockedUntil),
                    };
                }
                return {
                    user: null,
                    error: new NotFoundError(
                        `No user found with email ${email} and password`,
                    ),
                };
            }

            await trx(PasswordLoginTableName)
                .where('user_id', passwordLogin.user_id)
                .update({
                    failed_attempt_count: 0,
                    last_attempt_at: now,
                    blocked_until: null,
                });

            const [user] = await userDetailsQueryBuilder(trx)
                .where(`${UserTableName}.user_id`, passwordLogin.user_id)
                .select(
                    '*',
                    'organizations.created_at as organization_created_at',
                );
            if (user === undefined) {
                throw new NotFoundError(`Cannot find user with email ${email}`);
            }
            return {
                user: mapDbUserDetailsToLightdashUser(
                    user,
                    await this.hasAuthentication(user.user_uuid, trx),
                ),
                error: null,
            };
        });
        if (result.error !== null) {
            throw result.error;
        }
        return result.user;
    }

    async hasPassword(userUuid: string): Promise<boolean> {
        const [user] = await this.database('password_logins')
            .leftJoin('users', 'users.user_id', 'password_logins.user_id')
            .where('users.user_uuid', userUuid);
        return user !== undefined;
    }

    async hasOpenIdIdentity(userUuid: string): Promise<boolean> {
        const identity = await this.database('openid_identities')
            .innerJoin('users', 'users.user_id', 'openid_identities.user_id')
            .where('users.user_uuid', userUuid)
            .first('openid_identities.user_id');
        return identity !== undefined;
    }

    async hasPasswordByEmail(email: string): Promise<boolean> {
        const results = await this.database('password_logins')
            .leftJoin('emails', 'password_logins.user_id', 'emails.user_id')
            .andWhere('emails.email', email)
            .andWhere('emails.is_primary', true)
            .select('password_logins.user_id');
        return results.length > 0;
    }

    async getUserByUuidAndPassword(
        userUuid: string,
        password: string,
    ): Promise<LightdashUser> {
        const [user] = await userDetailsQueryBuilder(this.database)
            .leftJoin(
                'password_logins',
                'users.user_id',
                'password_logins.user_id',
            )
            .where('users.user_uuid', userUuid)
            .select<(DbUserDetails & { password_hash: string })[]>(
                '*',
                'organizations.created_at as organization_created_at',
            );
        if (user === undefined) {
            throw new NotFoundError(`No user found with uuid ${userUuid}`);
        }
        const match = await bcrypt.compare(password, user.password_hash || '');
        if (!match) {
            throw new NotFoundError('Password not recognized.');
        }
        return mapDbUserDetailsToLightdashUser(
            user,
            await this.hasAuthentication(user.user_uuid),
        );
    }

    async updateUser(
        userUuid: string,
        currentEmail: string | undefined,
        {
            firstName,
            lastName,
            email,
            isMarketingOptedIn,
            isTrackingAnonymized,
            isSetupComplete,
            isActive,
            timezone,
            avatarGradient,
            howDidYouHearAboutUs,
        }: Partial<UpdateUserArgs>,
        isEmailVerified: boolean = false,
    ): Promise<LightdashUser> {
        await this.database.transaction(async (trx) => {
            const [user] = await trx(UserTableName)
                .where('user_uuid', userUuid)
                .update<DbUserUpdate>({
                    first_name: firstName,
                    last_name: lastName,
                    is_setup_complete: isSetupComplete,
                    is_marketing_opted_in: isMarketingOptedIn,
                    is_active: isActive,
                    is_tracking_anonymized: this.canTrackingBeAnonymized()
                        ? isTrackingAnonymized
                        : false,
                    timezone,
                    avatar_gradient: avatarGradient,
                    how_did_you_hear_about_us: howDidYouHearAboutUs,
                    updated_at: new Date(),
                })
                .returning('*');

            if (email && currentEmail !== email) {
                if (currentEmail) {
                    await deleteEmail(trx, {
                        user_id: user.user_id,
                        email: currentEmail,
                    });
                }
                await createEmail(trx, {
                    user_id: user.user_id,
                    email: email.toLowerCase(),
                    is_primary: true,
                });
                // If user needs to create a new email
                // we can automatically verify the email
                // This is useful for SCIM users who changed their email
                if (isEmailVerified) {
                    await trx(EmailTableName)
                        .where({
                            user_id: user.user_id,
                            email: email.toLowerCase(),
                        })
                        .update({
                            is_verified: true,
                        });
                }
            }
        });
        if (isActive === false) {
            PatSessionCache.invalidate();
        }
        this.invalidateSessionUserCache(userUuid);
        return this.getUserDetailsByUuid(userUuid);
    }

    async delete(userUuid: string): Promise<void> {
        await this.database(UserTableName)
            .where('user_uuid', userUuid)
            .delete();
        PatSessionCache.invalidate();
        this.invalidateSessionUserCache(userUuid);
    }

    async getUserProjectRoles(
        userUuid: string,
        { trx = this.database }: { trx?: Knex } = {},
    ): Promise<ProjectAbilityProfile[]> {
        type Row = {
            project_id: number;
            project_uuid: string;
            role: ProjectMemberRole | null;
            role_uuid: string | null;
            project_type: ProjectType;
            created_by_user_uuid: string | null;
        };
        const projectMemberships = await trx('project_memberships')
            .leftJoin(
                ProjectTableName,
                'project_memberships.project_id',
                `${ProjectTableName}.project_id`,
            )
            .leftJoin('users', 'project_memberships.user_id', 'users.user_id')
            .select<Row[]>([
                `${ProjectTableName}.project_id`,
                `${ProjectTableName}.project_uuid`,
                'project_memberships.role',
                'project_memberships.role_uuid',
                `${ProjectTableName}.project_type`,
                `${ProjectTableName}.created_by_user_uuid`,
            ])
            .where('users.user_uuid', userUuid);

        const extraRoleUuidsByProjectId = await this.getProjectExtraRoleUuids(
            projectMemberships.map((m) => m.project_id),
            userUuid,
            trx,
        );

        return projectMemberships.map((membership) => ({
            projectUuid: membership.project_uuid,
            role: membership.role || ProjectMemberRole.VIEWER,
            userUuid,
            roleUuid: membership.role_uuid || undefined,
            projectType: membership.project_type,
            projectCreatedByUserUuid: membership.created_by_user_uuid,
            extraRoleUuids:
                extraRoleUuidsByProjectId.get(membership.project_id) ?? [],
        }));
    }

    /** Extra custom roles per project for one user's direct memberships. */
    private async getProjectExtraRoleUuids(
        projectIds: number[],
        userUuid: string,
        trx: Knex = this.database,
    ): Promise<Map<number, string[]>> {
        if (projectIds.length === 0) {
            return new Map();
        }
        const rows = await trx(ProjectMembershipCustomRolesTableName)
            .join(
                'users',
                `${ProjectMembershipCustomRolesTableName}.user_id`,
                'users.user_id',
            )
            .where('users.user_uuid', userUuid)
            .whereIn(
                `${ProjectMembershipCustomRolesTableName}.project_id`,
                projectIds,
            )
            .select<{ project_id: number; role_uuid: string }[]>(
                `${ProjectMembershipCustomRolesTableName}.project_id`,
                `${ProjectMembershipCustomRolesTableName}.role_uuid`,
            )
            .orderBy([
                {
                    column: `${ProjectMembershipCustomRolesTableName}.created_at`,
                },
                {
                    column: `${ProjectMembershipCustomRolesTableName}.role_uuid`,
                },
            ]);
        return rows.reduce<Map<number, string[]>>((acc, row) => {
            acc.set(row.project_id, [
                ...(acc.get(row.project_id) ?? []),
                row.role_uuid,
            ]);
            return acc;
        }, new Map());
    }

    private async getOrganizationExtraRoleUuids(
        userId: number,
        organizationId: number,
        trx: Knex = this.database,
    ): Promise<string[]> {
        return trx(OrganizationMembershipCustomRolesTableName)
            .where({ organization_id: organizationId, user_id: userId })
            .orderBy([{ column: 'created_at' }, { column: 'role_uuid' }])
            .pluck('role_uuid');
    }

    private async getUserGroupProjectRoles(
        userId: number,
        organizationId: number,
        userUuid: string,
        trx: Knex = this.database,
    ): Promise<ProjectAbilityProfile[]> {
        // Remember: primary key for an organization is organization_id,user_id - not user_id alone
        const query = trx('group_memberships')
            .innerJoin(
                'project_group_access',
                'project_group_access.group_uuid',
                'group_memberships.group_uuid',
            )
            .innerJoin(
                'projects',
                'projects.project_uuid',
                'project_group_access.project_uuid',
            )
            .where('group_memberships.organization_id', organizationId)
            .andWhere('group_memberships.user_id', userId)
            .select(
                'projects.project_uuid',
                'project_group_access.group_uuid',
                'project_group_access.role',
                'project_group_access.role_uuid',
                'projects.project_type',
                'projects.created_by_user_uuid',
            );
        const projectMemberships = await query;
        const extraRows: {
            project_uuid: string;
            group_uuid: string;
            role_uuid: string;
        }[] =
            projectMemberships.length === 0
                ? []
                : await trx(ProjectGroupAccessCustomRolesTableName)
                      .innerJoin(
                          'group_memberships',
                          'group_memberships.group_uuid',
                          `${ProjectGroupAccessCustomRolesTableName}.group_uuid`,
                      )
                      .where(
                          'group_memberships.organization_id',
                          organizationId,
                      )
                      .andWhere('group_memberships.user_id', userId)
                      .select(
                          `${ProjectGroupAccessCustomRolesTableName}.project_uuid`,
                          `${ProjectGroupAccessCustomRolesTableName}.group_uuid`,
                          `${ProjectGroupAccessCustomRolesTableName}.role_uuid`,
                      );
        const extrasByAccess = extraRows.reduce<Map<string, string[]>>(
            (acc, row) => {
                const key = `${row.project_uuid}:${row.group_uuid}`;
                acc.set(key, [...(acc.get(key) ?? []), row.role_uuid]);
                return acc;
            },
            new Map(),
        );
        return projectMemberships.map((membership) => ({
            projectUuid: membership.project_uuid,
            role: membership.role,
            userUuid,
            roleUuid: membership.role_uuid || undefined,
            projectType: membership.project_type,
            projectCreatedByUserUuid: membership.created_by_user_uuid,
            extraRoleUuids:
                extrasByAccess.get(
                    `${membership.project_uuid}:${membership.group_uuid}`,
                ) ?? [],
        }));
    }

    private async customRoleScopes(
        roleUuids: string[],
        trx: Knex = this.database,
    ): Promise<Record<Role['roleUuid'], RoleWithScopes['scopes']>> {
        if (roleUuids.length === 0) {
            return {};
        }

        const scopeData = await trx(ScopedRolesTableName)
            .select('role_uuid', 'scope_name')
            .whereIn('role_uuid', roleUuids);

        const scopesRecord: Record<string, string[]> = {};

        scopeData.forEach((row) => {
            const roleUuid = row.role_uuid;
            const scopeName = row.scope_name;

            if (!scopesRecord[roleUuid]) {
                scopesRecord[roleUuid] = [];
            }
            scopesRecord[roleUuid].push(scopeName);
        });

        return scopesRecord;
    }

    /**
     * Whether an org custom role uuid exists in `roles` (vs. missing/unknown).
     * Scoped narrowly to the human primary-org-role empty-role check below —
     * project roles, extra roles, and service accounts keep the legacy
     * "no scopes entry" fallback untouched.
     */
    private async roleExists(
        roleUuid: string,
        trx: Knex = this.database,
    ): Promise<boolean> {
        const row = await trx(RolesTableName)
            .select('role_uuid')
            .where('role_uuid', roleUuid)
            .first();
        return row !== undefined;
    }

    private async generateUserAbilityBuilder(
        user: DbUserDetails,
        trx: Knex = this.database,
    ): Promise<{
        abilityBuilder: AbilityBuilder<MemberAbility>;
        lightdashUser: LightdashUser;
    }> {
        const [
            hasAuthentication,
            projectRoles,
            groupProjectRoles,
            orgExtraRoleUuids,
        ] = await Promise.all([
            this.hasAuthentication(user.user_uuid, trx),
            this.getUserProjectRoles(user.user_uuid, { trx }),
            this.getUserGroupProjectRoles(
                user.user_id,
                user.organization_id,
                user.user_uuid,
                trx,
            ),
            this.getOrganizationExtraRoleUuids(
                user.user_id,
                user.organization_id,
                trx,
            ),
        ]);
        const lightdashUser = mapDbUserDetailsToLightdashUser(
            user,
            hasAuthentication,
        );

        // Service accounts get a dedicated `users` row marked `is_internal`.
        // Two permission shapes coexist:
        //  1. Custom org role (preferred): `organization_memberships.role_uuid`
        //     points at a custom role; CASL composes from its `scoped_roles`
        //     via the standard `buildAbilityFromScopes` path. UI scope-toggling
        //     drives runtime behavior end-to-end.
        //  2. Legacy scopes (back-compat): `service_accounts.scopes` drives
        //     CASL via `applyServiceAccountAbilities`. SAs created before
        //     custom-role support keep working unchanged.
        if (user.is_internal) {
            // Custom-role path: if the SA's user has a role_uuid set, build
            // CASL from that role's scopes. Reuses the same loader the human
            // path uses below. The `customRoles.enabled` flag is intentionally
            // NOT consulted here — it's a feature/UI gate (does the role
            // builder appear in settings?), not a runtime ability gate. Once
            // a role exists in the DB and is bound to the SA's
            // organization_membership, the runtime must respect it. If we
            // silently neutered role-driven SAs whenever an admin toggled
            // the flag off, every CI workflow on those tokens would 403
            // overnight.
            const applyOrgExtraRoles = async (
                builder: AbilityBuilder<MemberAbility>,
            ) => {
                if (orgExtraRoleUuids.length === 0) {
                    return;
                }
                const extraScopes = await this.customRoleScopes(
                    orgExtraRoleUuids,
                    trx,
                );
                orgExtraRoleUuids.forEach((roleUuid) => {
                    const scopes = extraScopes[roleUuid];
                    if (!scopes) {
                        return;
                    }
                    buildAbilityFromScopes(
                        {
                            organizationUuid: user.organization_uuid as string,
                            userUuid: user.user_uuid,
                            scopes,
                            isEnterprise:
                                this.lightdashConfig.license.licenseKey !==
                                undefined,
                            organizationRole: user.role,
                            permissionsConfig: {
                                pat: this.lightdashConfig.auth.pat,
                            },
                        },
                        builder,
                    );
                });
            };
            if (user.role_uuid) {
                const customRoleScopes = await this.customRoleScopes(
                    [user.role_uuid],
                    trx,
                );
                const scopes = customRoleScopes[user.role_uuid];
                if (scopes) {
                    const builder = new AbilityBuilder<MemberAbility>(Ability);
                    const invalid = buildAbilityFromScopes(
                        {
                            organizationUuid: user.organization_uuid as string,
                            userUuid: user.user_uuid,
                            scopes,
                            isEnterprise:
                                this.lightdashConfig.license.licenseKey !==
                                undefined,
                            organizationRole: user.role,
                            permissionsConfig: {
                                pat: this.lightdashConfig.auth.pat,
                            },
                        },
                        builder,
                    );
                    if (invalid.length > 0) {
                        Logger.warn(
                            `Service account ${
                                user.user_uuid
                            } custom role references scopes not in the runtime vocabulary: ${invalid.join(
                                ', ',
                            )}`,
                        );
                    }
                    await applyOrgExtraRoles(builder);
                    await this.applyServiceAccountProjectMemberships(
                        user.user_id,
                        user.user_uuid,
                        builder,
                        trx,
                    );
                    builder.rules = collapseAbilityRules(builder.rules);
                    return {
                        abilityBuilder: builder,
                        lightdashUser,
                    };
                }
            }

            // Legacy scopes path: SA pre-dates custom-role support, or the
            // role lookup didn't resolve. Fall back to the scope-derived
            // ability set.
            const serviceAccount = await this.findServiceAccountByUserUuid(
                user.user_uuid,
                { trx },
            );
            if (serviceAccount) {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                applyServiceAccountAbilities({
                    scopes: serviceAccount.scopes,
                    organizationUuid: serviceAccount.organizationUuid,
                    userUuid: user.user_uuid,
                    builder,
                });
                await applyOrgExtraRoles(builder);
                await this.applyServiceAccountProjectMemberships(
                    user.user_id,
                    user.user_uuid,
                    builder,
                    trx,
                );
                builder.rules = collapseAbilityRules(builder.rules);
                return {
                    abilityBuilder: builder,
                    lightdashUser,
                };
            }
        }

        // Fetch scopes for custom roles. Includes the org-membership role_uuid
        // so org-level custom roles assigned to human users are realized at
        // runtime (getUserAbilityBuilder reads customRoleScopes[user.roleUuid]).
        const customRoleUuids = [
            lightdashUser.roleUuid,
            ...orgExtraRoleUuids,
            ...projectRoles.flatMap((role) => [
                role.roleUuid,
                ...(role.extraRoleUuids ?? []),
            ]),
            ...groupProjectRoles.flatMap((role) => [
                role.roleUuid,
                ...(role.extraRoleUuids ?? []),
            ]),
        ].filter((roleUuid): roleUuid is string => Boolean(roleUuid));
        const isEnterprise =
            this.lightdashConfig.license.licenseKey !== undefined;
        const [customRoleScopes, customRolesFlag, patScopeAuthoritativeFlag] =
            await Promise.all([
                this.customRoleScopes(customRoleUuids, trx),
                this.featureFlagModel.get(
                    {
                        user: lightdashUser,
                        featureFlagId: CommercialFeatureFlags.CustomRoles,
                    },
                    { trx },
                ),
                this.featureFlagModel.get(
                    {
                        user: lightdashUser,
                        featureFlagId:
                            CommercialFeatureFlags.PatScopeAuthoritative,
                    },
                    { trx },
                ),
            ]);

        // Narrow empty-role resolution: only the flagged enterprise human's
        // primary org role uuid is checked for existence when it has no
        // scopes entry. If the role still exists (zero scoped_roles rows),
        // seed an authoritative empty list so it does not fall back to the
        // system role. Service accounts, project roles and extra roles keep
        // the legacy "missing entry falls back" behavior untouched.
        if (
            patScopeAuthoritativeFlag.enabled &&
            isEnterprise &&
            lightdashUser.roleUuid &&
            !(lightdashUser.roleUuid in customRoleScopes)
        ) {
            const exists = await this.roleExists(lightdashUser.roleUuid, trx);
            if (exists) {
                customRoleScopes[lightdashUser.roleUuid] = [];
            }
        }

        const { builder: abilityBuilder, invalidScopes } =
            getUserAbilityBuilder({
                user: lightdashUser,
                orgExtraRoleUuids,
                projectProfiles: [...projectRoles, ...groupProjectRoles],
                permissionsConfig: {
                    pat: this.lightdashConfig.auth.pat,
                },
                customRoleScopes,
                customRolesEnabled:
                    this.lightdashConfig.customRoles.enabled ||
                    customRolesFlag.enabled,
                isEnterprise,
                patScopeAuthoritative: patScopeAuthoritativeFlag.enabled,
            });

        if (invalidScopes.length > 0) {
            Logger.warn(
                `Custom role(s) for user ${
                    lightdashUser.userUuid
                } reference scopes not in the runtime vocabulary: ${[
                    ...new Set(invalidScopes),
                ].join(', ')}`,
            );
        }

        return {
            abilityBuilder,
            lightdashUser,
        };
    }

    /**
     * Apply per-project CASL grants to a service account's ability builder.
     *
     * Reads `project_memberships` rows keyed on the SA's `user_id` (the SA
     * has a dedicated `users` row with `is_internal=true`) and applies the
     * matching `projectMemberAbilities[role]` for each row. Composed on top
     * of whatever org-level scope handler ran first — strictly additive.
     *
     * For SAs created with `scopes: ['system:member']`, this is the only
     * source of useful abilities. For SAs with org-wide scopes (admin etc.)
     * project grants just add (redundant) project-scoped grants — harmless.
     */
    private async applyServiceAccountProjectMemberships(
        userId: number,
        userUuid: string,
        builder: AbilityBuilder<MemberAbility>,
        trx: Knex = this.database,
    ): Promise<void> {
        type Row = {
            project_id: number;
            project_uuid: string;
            role: ProjectMemberRole;
            role_uuid: string | null;
            project_type: ProjectType;
            created_by_user_uuid: string | null;
        };
        const rows = await trx(ProjectMembershipsTableName)
            .leftJoin(
                ProjectTableName,
                `${ProjectMembershipsTableName}.project_id`,
                `${ProjectTableName}.project_id`,
            )
            .select<Row[]>(
                `${ProjectTableName}.project_id`,
                `${ProjectTableName}.project_uuid`,
                `${ProjectMembershipsTableName}.role`,
                `${ProjectMembershipsTableName}.role_uuid`,
                `${ProjectTableName}.project_type`,
                `${ProjectTableName}.created_by_user_uuid`,
            )
            .where(`${ProjectMembershipsTableName}.user_id`, userId);
        const extraRoleUuidsByProjectId = await this.getProjectExtraRoleUuids(
            rows.map((r) => r.project_id),
            userUuid,
            trx,
        );

        // Bulk-load scopes for any custom-role grants. Matches the human
        // path's philosophy (UserModel.generateUserAbilityBuilder): once a
        // role is bound in the DB the runtime must respect it, regardless
        // of the customRoles.enabled feature flag (which gates UI only).
        const customRoleUuids = rows
            .flatMap((r) => [
                r.role_uuid,
                ...(extraRoleUuidsByProjectId.get(r.project_id) ?? []),
            ])
            .filter((u): u is string => u !== null);
        const customRoleScopes =
            customRoleUuids.length > 0
                ? await this.customRoleScopes(customRoleUuids, trx)
                : {};
        const isEnterprise =
            this.lightdashConfig.license.licenseKey !== undefined;

        const aggregatedInvalidScopes = new Set<string>();
        for (const row of rows) {
            const applyScopes = (scopes: string[]) => {
                const invalid = buildAbilityFromScopes(
                    {
                        projectUuid: row.project_uuid,
                        projectType: row.project_type,
                        projectCreatedByUserUuid: row.created_by_user_uuid,
                        userUuid,
                        scopes,
                        isEnterprise,
                        permissionsConfig: {
                            pat: this.lightdashConfig.auth.pat,
                        },
                    },
                    builder,
                );
                invalid.forEach((s) => aggregatedInvalidScopes.add(s));
            };
            const scopes = row.role_uuid
                ? customRoleScopes[row.role_uuid]
                : undefined;
            if (scopes) {
                applyScopes(scopes);
            } else {
                projectMemberAbilities[row.role](
                    {
                        projectUuid: row.project_uuid,
                        userUuid,
                        role: row.role,
                    },
                    builder,
                );
            }
            // Extra custom roles are unioned on top of the slot.
            (extraRoleUuidsByProjectId.get(row.project_id) ?? []).forEach(
                (roleUuid) => {
                    const extraScopes = customRoleScopes[roleUuid];
                    if (extraScopes) {
                        applyScopes(extraScopes);
                    }
                },
            );
        }
        if (aggregatedInvalidScopes.size > 0) {
            Logger.warn(
                `Service account ${userUuid} project custom roles reference scopes not in the runtime vocabulary: ${[
                    ...aggregatedInvalidScopes,
                ].join(', ')}`,
            );
        }
    }

    async findServiceAccountByUserUuid(
        userUuid: string,
        { trx = this.database }: { trx?: Knex } = {},
    ): Promise<
        | Pick<
              ServiceAccount,
              | 'uuid'
              | 'description'
              | 'scopes'
              | 'organizationUuid'
              | 'expiresAt'
          >
        | undefined
    > {
        const row = await trx('service_accounts')
            .where('service_account_user_uuid', userUuid)
            .select<
                {
                    service_account_uuid: string;
                    description: string;
                    scopes: string[];
                    organization_uuid: string;
                    expires_at: Date | null;
                }[]
            >(
                'service_account_uuid',
                'description',
                'scopes',
                'organization_uuid',
                'expires_at',
            )
            .first();
        if (!row) {
            return undefined;
        }
        return {
            uuid: row.service_account_uuid,
            description: row.description,
            scopes: row.scopes as ServiceAccountScope[],
            organizationUuid: row.organization_uuid,
            expiresAt: row.expires_at,
        };
    }

    async findSessionUserByOpenId(
        issuer: string,
        subject: string,
    ): Promise<SessionUser | undefined> {
        const [user] = await userDetailsQueryBuilder(this.database)
            .leftJoin(
                'openid_identities',
                'users.user_id',
                'openid_identities.user_id',
            )
            .where('openid_identities.issuer', issuer)
            .andWhere('openid_identities.subject', subject)
            .select<DbUserDetails[]>(
                '*',
                'organizations.created_at as organization_created_at',
            );
        if (user === undefined) {
            return user;
        }
        const { abilityBuilder, lightdashUser } =
            await this.generateUserAbilityBuilder(user);

        return {
            abilityRules: abilityBuilder.rules,
            ability: abilityBuilder.build(),
            ...lightdashUser,
            isEmailVerified: user.is_verified === true,
        };
    }

    async createPendingUser(
        organizationUuid: string,
        createUser: CreateUserWithRole,
        isActive: boolean = true,
        isSetupComplete?: boolean,
    ): Promise<LightdashUser> {
        const [org] = await this.database(OrganizationTableName)
            .where('organization_uuid', organizationUuid)
            .select('organization_id');
        if (!org) {
            throw new NotFoundError('Cannot find organization');
        }
        const email = isOpenIdUser(createUser)
            ? createUser.openId.email
            : createUser.email;
        const duplicatedEmails = await this.database(EmailTableName).where(
            'email',
            email,
        );
        if (duplicatedEmails.length > 0) {
            throw new ParameterError(`Email ${email} already in use`);
        }

        if (createUser.password && !validatePassword(createUser.password)) {
            throw new ParameterError("Password doesn't meet requirements");
        }

        // Default preserves the legacy analytics-consent skip.
        const setupComplete =
            isSetupComplete ?? !this.lightdashConfig.rudder.writeKey;
        const user = await this.database.transaction(async (trx) => {
            const newUser = await this.createUserTransaction(trx, {
                ...createUser,
                isActive,
                isSetupComplete: setupComplete,
            });
            await trx(OrganizationMembershipsTableName).insert({
                organization_id: org.organization_id,
                user_id: newUser.user_id,
                role: createUser.role,
            });
            return newUser;
        });
        return this.getUserDetailsByUuid(user.user_uuid);
    }

    async activateUser(
        userUuid: string,
        activateUser: ActivateUser | OpenIdUser,
    ): Promise<LightdashUser> {
        if (
            !isOpenIdUser(activateUser) &&
            !validatePassword(activateUser.password)
        ) {
            throw new ParameterError("Password doesn't meet requirements");
        }
        return this.activateInvitedUser(userUuid, activateUser);
    }

    async activateUserWithoutPassword(
        userUuid: string,
    ): Promise<LightdashUser> {
        return this.activateInvitedUser(userUuid, {
            firstName: '',
            lastName: '',
        });
    }

    private async activateInvitedUser(
        userUuid: string,
        activateUser:
            | ActivateUser
            | OpenIdUser
            | Pick<ActivateUser, 'firstName' | 'lastName'>,
    ): Promise<LightdashUser> {
        await this.database.transaction(async (trx) => {
            const [user] = await trx(UserTableName)
                .where('user_uuid', userUuid)
                .update<DbUserUpdate>({
                    first_name: isOpenIdUser(activateUser)
                        ? activateUser.openId.firstName
                        : activateUser.firstName,
                    last_name: isOpenIdUser(activateUser)
                        ? activateUser.openId.lastName
                        : activateUser.lastName,
                    updated_at: new Date(),
                })
                .returning('*');

            if (!isOpenIdUser(activateUser) && 'password' in activateUser) {
                await UserModel.createPasswordLogin(trx, {
                    user_id: user.user_id,
                    password_hash: await bcrypt.hash(
                        activateUser.password,
                        await bcrypt.genSalt(),
                    ),
                });
            } else if (isOpenIdUser(activateUser)) {
                await trx(OpenIdIdentitiesTableName)
                    .insert({
                        issuer_type: activateUser.openId.issuerType,
                        issuer: activateUser.openId.issuer,
                        subject: activateUser.openId.subject,
                        user_id: user.user_id,
                        email: activateUser.openId.email.toLowerCase(),
                    })
                    .returning('*');
            }
        });
        return this.getUserDetailsByUuid(userUuid);
    }

    async createUser(
        createUser: CreateLocalUserArgs | OpenIdUser,
        isActive: boolean = true,
        isSetupComplete?: boolean,
    ): Promise<LightdashUser> {
        const setupComplete =
            isSetupComplete ?? !this.lightdashConfig.rudder.writeKey;
        const user = await this.database.transaction(async (trx) => {
            if (
                !isOpenIdUser(createUser) &&
                'password' in createUser &&
                createUser.password &&
                !validatePassword(createUser.password)
            ) {
                throw new ParameterError("Password doesn't meet requirements");
            }

            const email = isOpenIdUser(createUser)
                ? createUser.openId.email
                : createUser.email;
            const duplicatedEmails = await trx(EmailTableName).where(
                'email',
                email,
            );
            if (duplicatedEmails.length > 0) {
                throw new AlreadyExistsError(`Email ${email} already in use`);
            }

            const newUser = await this.createUserTransaction(trx, {
                ...createUser,
                isActive,
                isSetupComplete: setupComplete,
            });
            return newUser;
        });
        return this.getUserDetailsByUuid(user.user_uuid);
    }

    /**
     * Returns the user with the default organization
     * Used in old methods to get the organizationUuid from the userUuid
     * You should use findSessionUserAndOrgByUuid instead and stop assuming a user has a default organization
     * @deprecated
     */
    async findSessionUserByUUID(userUuid: string): Promise<SessionUser> {
        const [user] = await userDetailsQueryBuilder(this.database)
            .where('user_uuid', userUuid)
            .orderBy('organizations.created_at', 'asc')
            .orderBy('organizations.organization_id', 'asc')
            .select('*', 'organizations.created_at as organization_created_at');
        if (user === undefined) {
            throw new NotFoundError(`Cannot find user with uuid ${userUuid}`);
        }
        const { abilityBuilder, lightdashUser } =
            await this.generateUserAbilityBuilder(user);

        return {
            ...lightdashUser,
            userId: user.user_id,
            abilityRules: abilityBuilder.rules,
            ability: abilityBuilder.build(),
            isEmailVerified: user.is_verified === true,
        };
    }

    async findSessionUserAndOrgByUuid(
        userUuid: string,
        organizationUuid: string,
        { trx = this.database }: { trx?: Knex } = {},
    ): Promise<SessionUser> {
        const [user] = await userDetailsQueryBuilder(trx)
            .where('user_uuid', userUuid)
            .andWhere('organizations.organization_uuid', organizationUuid) // We filter organizationUuid here
            .select('*', 'organizations.created_at as organization_created_at');

        if (user === undefined) {
            throw new InvalidUser(
                `Cannot find user with uuid ${userUuid} and org ${organizationUuid}`,
            );
        }
        const { abilityBuilder, lightdashUser } =
            await this.generateUserAbilityBuilder(user, trx);

        return {
            ...lightdashUser,
            userId: user.user_id,
            abilityRules: abilityBuilder.rules,
            ability: abilityBuilder.build(),
            isEmailVerified: user.is_verified === true,
        };
    }

    async findSessionUserByPrimaryEmail(
        email: string,
    ): Promise<SessionUser | undefined> {
        const [user] = await userDetailsQueryBuilder(this.database)
            .where('email', email)
            .andWhere('emails.is_primary', true)
            .andWhere(`${UserTableName}.is_internal`, false)
            .select('*', 'organizations.created_at as organization_created_at');
        if (user === undefined) {
            return undefined;
        }
        const { abilityBuilder, lightdashUser } =
            await this.generateUserAbilityBuilder(user);

        return {
            ...lightdashUser,
            abilityRules: abilityBuilder.rules,
            ability: abilityBuilder.build(),
            userId: user.user_id,
            isEmailVerified: user.is_verified === true,
        };
    }

    static lightdashUserFromSession(
        sessionUser: SessionUser,
    ): LightdashUserWithAbilityRules {
        const { ability, ...lightdashUser } = sessionUser;
        return lightdashUser;
    }

    async findUserByEmail(email: string): Promise<LightdashUser | undefined> {
        const [user] = await userDetailsQueryBuilder(this.database)
            .where('email', email)
            .andWhere(`${UserTableName}.is_internal`, false)
            .orderBy('organizations.created_at', 'asc')
            .orderBy('organizations.organization_id', 'asc')
            .select('*', 'organizations.created_at as organization_created_at');
        return user
            ? mapDbUserDetailsToLightdashUser(
                  user,
                  await this.hasAuthentication(user.user_uuid),
              )
            : undefined;
    }

    async upsertPassword(userUuid: string, password: string): Promise<void> {
        if (!validatePassword(password)) {
            throw new ParameterError("Password doesn't meet requirements");
        }
        const user = await this.database(UserTableName)
            .where('user_uuid', userUuid)
            .first('user_id');

        if (!user) {
            throw new NotFoundError(`Cannot find user with uuid ${userUuid}`);
        }

        await this.database(PasswordLoginTableName)
            .insert({
                user_id: user.user_id,
                password_hash: await bcrypt.hash(
                    password,
                    await bcrypt.genSalt(),
                ),
            })
            .onConflict('user_id')
            .merge();
    }

    async findSessionUserByPersonalAccessToken(token: string): Promise<
        | {
              data: CachedPatSessionUser;
              cacheHit: boolean;
          }
        | undefined
    > {
        const cached = PatSessionCache.get(token);
        if (cached) {
            return { data: cached, cacheHit: true };
        }
        const findRowByTokenHashes = (tokenHashes: string[]) =>
            userDetailsQueryBuilder(this.database)
                .innerJoin(
                    'personal_access_tokens',
                    'personal_access_tokens.created_by_user_id',
                    'users.user_id',
                )
                .whereIn('personal_access_tokens.token_hash', tokenHashes)
                .select<(DbUserDetails & DbPersonalAccessToken)[]>(
                    '*',
                    'organizations.created_at as organization_created_at',
                );
        // Active bcrypt and legacy sha256 hashes cover every non-rotation
        // deployment with a single bcrypt operation; fallback bcrypt hashes
        // are only derived after a miss — concurrently (config caps fallbacks
        // at three) — and matched with one grouped query that prefers the
        // earliest configured fallback.
        const activeTokenHash = await hashWithSecret(
            token,
            this.lightdashConfig.lightdashSecrets.active,
        );
        const activeRows = await findRowByTokenHashes([
            activeTokenHash,
            deprecatedHash(token),
        ]);
        let row: (typeof activeRows)[number] | undefined = activeRows[0];
        if (row === undefined) {
            const { fallbacks } = this.lightdashConfig.lightdashSecrets;
            if (fallbacks.length > 0) {
                const fallbackTokenHashes = await Promise.all(
                    fallbacks.map((fallbackSecret) =>
                        hashWithSecret(token, fallbackSecret),
                    ),
                );
                const fallbackRows =
                    await findRowByTokenHashes(fallbackTokenHashes);
                row = fallbackTokenHashes
                    .map((fallbackTokenHash) =>
                        fallbackRows.find(
                            (fallbackRow) =>
                                fallbackRow.token_hash === fallbackTokenHash,
                        ),
                    )
                    .find((match) => match !== undefined);
            }
        }
        if (row === undefined) {
            return undefined;
        }
        const { abilityBuilder, lightdashUser } =
            await this.generateUserAbilityBuilder(row);

        const data: CachedPatSessionUser = {
            user: {
                ...lightdashUser,
                abilityRules: abilityBuilder.rules,
                ability: abilityBuilder.build(),
                userId: row.user_id,
                isEmailVerified: row.is_verified === true,
            },
            personalAccessToken:
                PersonalAccessTokenModel.mapDbObjectToPersonalAccessToken(row),
        };
        PatSessionCache.set(token, data);
        return { data, cacheHit: false };
    }

    async createPassword(userId: number, newPassword: string): Promise<void> {
        if (!validatePassword(newPassword)) {
            throw new ParameterError("Password doesn't meet requirements");
        }
        return UserModel.createPasswordLogin(this.database, {
            user_id: userId,
            password_hash: await bcrypt.hash(
                newPassword,
                await bcrypt.genSalt(),
            ),
        });
    }

    async updatePassword(userUuid: string, newPassword: string): Promise<void> {
        if (!validatePassword(newPassword)) {
            throw new ParameterError("Password doesn't meet requirements");
        }
        const user = await this.database(UserTableName)
            .where('user_uuid', userUuid)
            .select('user_id')
            .first();
        if (!user) {
            throw new NotFoundError('Cannot find user');
        }
        return this.database(PasswordLoginTableName)
            .where({
                user_id: user.user_id,
            })
            .update({
                password_hash: await bcrypt.hash(
                    newPassword,
                    await bcrypt.genSalt(),
                ),
            });
    }

    async joinOrg(
        userUuid: string,
        organizationUuid: string,
        role: OrganizationMemberRole,
        projects: { [projectUuid: string]: ProjectMemberRole } | undefined,
    ): Promise<LightdashUser> {
        const [org] = await this.database(OrganizationTableName)
            .where('organization_uuid', organizationUuid)
            .select('organization_id');
        if (!org) {
            throw new NotFoundError('Cannot find organization');
        }

        const [user] = await this.database(UserTableName)
            .where('user_uuid', userUuid)
            .select('user_id');
        if (!user) {
            throw new NotFoundError('Cannot find user');
        }

        await this.database.transaction(async (trx) => {
            const [existingUserMemberships] = await trx(
                OrganizationMembershipsTableName,
            )
                .where('user_id', user.user_id)
                .select('organization_id');
            if (existingUserMemberships) {
                throw new ForbiddenError('User already has an organization');
            }

            await trx(OrganizationMembershipsTableName).insert({
                organization_id: org.organization_id,
                user_id: user.user_id,
                role,
            });

            await trx(UserTableName) // Update updated_at for user
                .where('user_uuid', userUuid)
                .update({ updated_at: new Date() });

            const projectMemberships = Object.entries(projects || {}).map(
                async ([projectUuid, projectRole]) => {
                    const [project] = await trx('projects')
                        .select('project_id')
                        .where('project_uuid', projectUuid);

                    if (project) {
                        await trx('project_memberships').insert({
                            project_id: project.project_id,
                            role: projectRole,
                            user_id: user.user_id,
                        });
                    }
                },
            );

            await Promise.all(projectMemberships);
        });
        return this.getUserDetailsByUuid(userUuid);
    }

    async addProjectMemberships(
        userUuid: string,
        projects: { [projectUuid: string]: ProjectMemberRole },
    ): Promise<void> {
        const [user] = await this.database(UserTableName)
            .where('user_uuid', userUuid)
            .select('user_id');
        if (!user) {
            throw new NotFoundError('Cannot find user');
        }

        const projectMemberships = Object.entries(projects).map(
            async ([projectUuid, projectRole]) => {
                const [project] = await this.database(ProjectTableName)
                    .select('project_id')
                    .where('project_uuid', projectUuid);

                if (project) {
                    await this.database(ProjectMembershipsTableName)
                        .insert({
                            project_id: project.project_id,
                            role: projectRole,
                            user_id: user.user_id,
                        })
                        .onConflict(['project_id', 'user_id'])
                        .ignore();
                }
            },
        );

        await Promise.all(projectMemberships);
    }

    async getRefreshToken(
        userUuid: string,
        issuerType: OpenIdIdentityIssuerType = OpenIdIdentityIssuerType.GOOGLE,
    ): Promise<string> {
        const [row] = await this.database(UserTableName)
            .leftJoin(
                'openid_identities',
                'users.user_id',
                'openid_identities.user_id',
            )
            .where('user_uuid', userUuid)
            .whereNotNull('refresh_token')
            .where('issuer_type', issuerType)
            .select('refresh_token');

        if (!row) {
            throw new NotFoundError('Cannot find user with refresh token');
        }

        if (!row.refresh_token) {
            throw new NotFoundError('Cannot find refresh token');
        }

        return row.refresh_token;
    }

    async getOpenIdIssuers(email: string): Promise<OpenIdIdentityIssuerType[]> {
        const rows = await this.database('emails')
            .leftJoin(
                'openid_identities',
                'emails.user_id',
                'openid_identities.user_id',
            )
            .whereNotNull('openid_identities.issuer_type')
            .andWhere('emails.email', email)
            .andWhere('emails.is_primary', true)
            .select('openid_identities.issuer_type');
        return rows.map((row) => row.issuer_type);
    }

    async getOpenIdByIssuerType(
        userUuid: string,
        issuerType: OpenIdIdentityIssuerType,
    ) {
        const rows = await this.database(OpenIdIdentitiesTableName)
            .leftJoin('users', 'openid_identities.user_id', 'users.user_id')
            .where('users.user_uuid', userUuid)
            .where('issuer_type', issuerType)
            .select('*');

        if (rows.length === 0) {
            throw new NotFoundError('OpenID identity not found');
        }
        if (rows.length > 1) {
            throw new Error('Multiple OpenID identities found');
        }
        return rows[0];
    }
}
