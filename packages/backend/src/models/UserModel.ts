import {
    ActivateUser,
    AlreadyExistsError,
    CreateUserArgs,
    CreateUserWithRole,
    ForbiddenError,
    getUserAbilityBuilder,
    InvalidUser,
    isOpenIdUser,
    LightdashMode,
    LightdashUser,
    LightdashUserWithAbilityRules,
    NotExistsError,
    NotFoundError,
    OpenIdIdentityIssuerType,
    OpenIdUser,
    OrganizationMemberRole,
    ParameterError,
    PersonalAccessToken,
    ProjectMemberProfile,
    ProjectMemberRole,
    SessionUser,
    UpdateUserArgs,
    validatePassword,
} from '@lightdash/common';
import bcrypt from 'bcrypt';
import { Knex } from 'knex';
import { LightdashConfig } from '../config/parseConfig';
import {
    createEmail,
    deleteEmail,
    EmailTableName,
} from '../database/entities/emails';
import { OpenIdIdentitiesTableName } from '../database/entities/openIdIdentities';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import {
    DbOrganization,
    OrganizationTableName,
} from '../database/entities/organizations';
import {
    DbPasswordLoginIn,
    PasswordLoginTableName,
} from '../database/entities/passwordLogins';
import { DbPersonalAccessToken } from '../database/entities/personalAccessTokens';
import {
    DbUser,
    DbUserIn,
    DbUserUpdate,
    UserTableName,
} from '../database/entities/users';
import { PersonalAccessTokenModel } from './DashboardModel/PersonalAccessTokenModel';
import Transaction = Knex.Transaction;

export type DbUserDetails = {
    user_id: number;
    user_uuid: string;
    first_name: string;
    last_name: string;
    created_at: Date;
    is_tracking_anonymized: boolean;
    is_marketing_opted_in: boolean;
    email: string | undefined;
    organization_uuid?: string;
    organization_name?: string;
    organization_created_at?: Date;
    organization_id: number;
    is_setup_complete: boolean;
    role?: OrganizationMemberRole;
    is_active: boolean;
    updated_at: Date;
};

export const mapDbUserDetailsToLightdashUser = (
    user: DbUserDetails,
    hasAuthentication: boolean,
): LightdashUser => ({
    userUuid: user.user_uuid,
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
    isActive: user.is_active,
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
};

export class UserModel {
    private readonly lightdashConfig: LightdashConfig;

    private readonly database: Knex;

    constructor({ database, lightdashConfig }: UserModelArguments) {
        this.database = database;
        this.lightdashConfig = lightdashConfig;
    }

    private canTrackingBeAnonymized() {
        return this.lightdashConfig.mode !== LightdashMode.CLOUD_BETA;
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
            .select<{ user_uuid: string; has_authentication: false }[]>(
                `${UserTableName}.user_uuid`,
                trx.raw(
                    `CASE WHEN COALESCE(password_logins.user_id, openid_identities.user_id, null) IS NOT NULL THEN TRUE ELSE FALSE END as has_authentication`,
                ),
            )
            .distinctOn(`user_uuid`)
            .whereIn(`${UserTableName}.user_uuid`, filters.userUuids);
    }

    private async hasAuthentication(userUuid: string): Promise<boolean> {
        const [usersHaveAuthenticationRows] =
            await UserModel.findIfUsersHaveAuthentication(this.database, {
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
        },
    ) {
        const userIn: DbUserIn = isOpenIdUser(createUser)
            ? {
                  first_name: createUser.openId.firstName || '',
                  last_name: createUser.openId.lastName || '',
                  is_marketing_opted_in: false,
                  is_tracking_anonymized: this.canTrackingBeAnonymized(),
                  is_setup_complete: false,
                  is_active: createUser.isActive,
              }
            : {
                  first_name: createUser.firstName.trim(),
                  last_name: createUser.lastName.trim(),
                  is_marketing_opted_in: false,
                  is_tracking_anonymized: this.canTrackingBeAnonymized(),
                  is_setup_complete: false,
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
            if (createUser.password) {
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
            );

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
        const [user] = await userDetailsQueryBuilder(this.database)
            .leftJoin(
                'password_logins',
                'users.user_id',
                'password_logins.user_id',
            )
            .where('email', email)
            .select<(DbUserDetails & { password_hash: string })[]>(
                '*',
                'organizations.created_at as organization_created_at',
            );
        if (user === undefined) {
            throw new NotFoundError(
                `No user found with email ${email} and password`,
            );
        }
        const match = await bcrypt.compare(password, user.password_hash || '');
        if (!match) {
            throw new NotFoundError(
                `No User found with email ${email} and password`,
            );
        }
        return mapDbUserDetailsToLightdashUser(
            user,
            await this.hasAuthentication(user.user_uuid),
        );
    }

    async hasPassword(userUuid: string): Promise<boolean> {
        const [user] = await this.database('password_logins')
            .leftJoin('users', 'users.user_id', 'password_logins.user_id')
            .where('users.user_uuid', userUuid);
        return user !== undefined;
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
        }: Partial<UpdateUserArgs>,
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
            }
        });
        return this.getUserDetailsByUuid(userUuid);
    }

    async delete(userUuid: string): Promise<void> {
        await this.database(UserTableName)
            .where('user_uuid', userUuid)
            .delete();
    }

    private async getUserProjectRoles(
        userId: number,
        userUuid: string,
    ): Promise<
        Pick<ProjectMemberProfile, 'projectUuid' | 'role' | 'userUuid'>[]
    > {
        const projectMemberships = await this.database('project_memberships')
            .leftJoin(
                'projects',
                'project_memberships.project_id',
                'projects.project_id',
            )
            .select('*')
            .where('user_id', userId);

        return projectMemberships.map((membership) => ({
            projectUuid: membership.project_uuid,
            role: membership.role,
            userUuid,
        }));
    }

    private async getUserGroupProjectRoles(
        userId: number,
        organizationId: number,
        userUuid: string,
    ): Promise<
        Pick<ProjectMemberProfile, 'projectUuid' | 'role' | 'userUuid'>[]
    > {
        // Remember: primary key for an organization is organization_id,user_id - not user_id alone
        const query = this.database('group_memberships')
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
            .select('projects.project_uuid', 'project_group_access.role');
        const projectMemberships = await query;
        return projectMemberships.map((membership) => ({
            projectUuid: membership.project_uuid,
            role: membership.role,
            userUuid,
        }));
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
        const lightdashUser = mapDbUserDetailsToLightdashUser(
            user,
            await this.hasAuthentication(user.user_uuid),
        );
        const projectRoles = await this.getUserProjectRoles(
            user.user_id,
            user.user_uuid,
        );
        const groupProjectRoles = await this.getUserGroupProjectRoles(
            user.user_id,
            user.organization_id,
            user.user_uuid,
        );
        const abilityBuilder = getUserAbilityBuilder({
            user: lightdashUser,
            projectProfiles: [...projectRoles, ...groupProjectRoles],
            permissionsConfig: {
                pat: this.lightdashConfig.auth.pat,
            },
        });

        return {
            userId: user.user_id,
            abilityRules: abilityBuilder.rules,
            ability: abilityBuilder.build(),
            ...lightdashUser,
        };
    }

    async createPendingUser(
        organizationUuid: string,
        createUser: CreateUserWithRole,
    ): Promise<LightdashUser> {
        const [org] = await this.database(OrganizationTableName)
            .where('organization_uuid', organizationUuid)
            .select('organization_id');
        if (!org) {
            throw new NotExistsError('Cannot find organization');
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

        const user = await this.database.transaction(async (trx) => {
            const newUser = await this.createUserTransaction(trx, {
                ...createUser,
                isActive: true,
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

            if (!isOpenIdUser(activateUser)) {
                await UserModel.createPasswordLogin(trx, {
                    user_id: user.user_id,
                    password_hash: await bcrypt.hash(
                        activateUser.password,
                        await bcrypt.genSalt(),
                    ),
                });
            } else {
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
        createUser: CreateUserArgs | OpenIdUser,
        isActive: boolean = true,
    ): Promise<LightdashUser> {
        const user = await this.database.transaction(async (trx) => {
            if (
                !isOpenIdUser(createUser) &&
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
            .select('*', 'organizations.created_at as organization_created_at');
        if (user === undefined) {
            throw new NotFoundError(`Cannot find user with uuid ${userUuid}`);
        }
        const lightdashUser = mapDbUserDetailsToLightdashUser(
            user,
            await this.hasAuthentication(user.user_uuid),
        );
        const projectRoles = await this.getUserProjectRoles(
            user.user_id,
            user.user_uuid,
        );
        const groupProjectRoles = await this.getUserGroupProjectRoles(
            user.user_id,
            user.organization_id,
            user.user_uuid,
        );
        const abilityBuilder = getUserAbilityBuilder({
            user: lightdashUser,
            projectProfiles: [...projectRoles, ...groupProjectRoles],
            permissionsConfig: {
                pat: this.lightdashConfig.auth.pat,
            },
        });
        return {
            ...lightdashUser,
            userId: user.user_id,
            abilityRules: abilityBuilder.rules,
            ability: abilityBuilder.build(),
        };
    }

    async findSessionUserAndOrgByUuid(
        userUuid: string,
        organizationUuid: string,
    ): Promise<SessionUser> {
        const [user] = await userDetailsQueryBuilder(this.database)
            .where('user_uuid', userUuid)
            .andWhere('organizations.organization_uuid', organizationUuid) // We filter organizationUuid here
            .select('*', 'organizations.created_at as organization_created_at');

        if (user === undefined) {
            throw new InvalidUser(
                `Cannot find user with uuid ${userUuid} and org ${organizationUuid}`,
            );
        }
        const lightdashUser = mapDbUserDetailsToLightdashUser(
            user,
            await this.hasAuthentication(user.user_uuid),
        );
        const projectRoles = await this.getUserProjectRoles(
            user.user_id,
            user.user_uuid,
        );
        const groupProjectRoles = await this.getUserGroupProjectRoles(
            user.user_id,
            user.organization_id,
            user.user_uuid,
        );
        const abilityBuilder = getUserAbilityBuilder({
            user: lightdashUser,
            projectProfiles: [...projectRoles, ...groupProjectRoles],
            permissionsConfig: {
                pat: this.lightdashConfig.auth.pat,
            },
        });
        return {
            ...lightdashUser,
            userId: user.user_id,
            abilityRules: abilityBuilder.rules,
            ability: abilityBuilder.build(),
        };
    }

    async findSessionUserByPrimaryEmail(
        email: string,
    ): Promise<SessionUser | undefined> {
        const [user] = await userDetailsQueryBuilder(this.database)
            .where('email', email)
            .andWhere('emails.is_primary', true)
            .select('*', 'organizations.created_at as organization_created_at');
        if (user === undefined) {
            return undefined;
        }
        const lightdashUser = mapDbUserDetailsToLightdashUser(
            user,
            await this.hasAuthentication(user.user_uuid),
        );
        const projectRoles = await this.getUserProjectRoles(
            user.user_id,
            user.user_uuid,
        );
        const groupProjectRoles = await this.getUserGroupProjectRoles(
            user.user_id,
            user.organization_id,
            user.user_uuid,
        );
        const abilityBuilder = getUserAbilityBuilder({
            user: lightdashUser,
            projectProfiles: [...projectRoles, ...groupProjectRoles],
            permissionsConfig: {
                pat: this.lightdashConfig.auth.pat,
            },
        });

        return {
            ...lightdashUser,
            abilityRules: abilityBuilder.rules,
            ability: abilityBuilder.build(),
            userId: user.user_id,
        };
    }

    static lightdashUserFromSession(
        sessionUser: SessionUser,
    ): LightdashUserWithAbilityRules {
        const { userId, ability, ...lightdashUser } = sessionUser;
        return lightdashUser;
    }

    async findUserByEmail(email: string): Promise<LightdashUser | undefined> {
        const [user] = await userDetailsQueryBuilder(this.database)
            .where('email', email)
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
        const user = await this.findSessionUserByUUID(userUuid);
        await this.database(PasswordLoginTableName)
            .insert({
                user_id: user.userId,
                password_hash: await bcrypt.hash(
                    password,
                    await bcrypt.genSalt(),
                ),
            })
            .onConflict('user_id')
            .merge();
    }

    async findSessionUserByPersonalAccessToken(
        token: string,
    ): Promise<
        | { user: SessionUser; personalAccessToken: PersonalAccessToken }
        | undefined
    > {
        const tokenHash = PersonalAccessTokenModel._hash(token);
        const [row] = await userDetailsQueryBuilder(this.database)
            .innerJoin(
                'personal_access_tokens',
                'personal_access_tokens.created_by_user_id',
                'users.user_id',
            )
            .where('token_hash', tokenHash)
            .select<(DbUserDetails & DbPersonalAccessToken)[]>(
                '*',
                'organizations.created_at as organization_created_at',
            );
        if (row === undefined) {
            return undefined;
        }
        const lightdashUser = mapDbUserDetailsToLightdashUser(
            row,
            await this.hasAuthentication(row.user_uuid),
        );
        const projectRoles = await this.getUserProjectRoles(
            row.user_id,
            row.user_uuid,
        );
        const groupProjectRoles = await this.getUserGroupProjectRoles(
            row.user_id,
            row.organization_id,
            row.user_uuid,
        );
        const abilityBuilder = getUserAbilityBuilder({
            user: lightdashUser,
            projectProfiles: [...projectRoles, ...groupProjectRoles],
            permissionsConfig: {
                pat: this.lightdashConfig.auth.pat,
            },
        });
        return {
            user: {
                ...mapDbUserDetailsToLightdashUser(
                    row,
                    await this.hasAuthentication(row.user_uuid),
                ),
                abilityRules: abilityBuilder.rules,
                ability: abilityBuilder.build(),
                userId: row.user_id,
            },
            personalAccessToken:
                PersonalAccessTokenModel.mapDbObjectToPersonalAccessToken(row),
        };
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
            throw new NotExistsError('Cannot find user');
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
            throw new NotExistsError('Cannot find organization');
        }

        const [user] = await this.database(UserTableName)
            .where('user_uuid', userUuid)
            .select('user_id');
        if (!user) {
            throw new NotExistsError('Cannot find user');
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
                    const [project] = await this.database('projects')
                        .select('project_id')
                        .where('project_uuid', projectUuid);

                    if (project) {
                        await this.database('project_memberships').insert({
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

    async getRefreshToken(userUuid: string) {
        const [row] = await this.database(UserTableName)
            .leftJoin(
                'openid_identities',
                'users.user_id',
                'openid_identities.user_id',
            )
            .where('user_uuid', userUuid)
            .whereNotNull('refresh_token')
            .select('refresh_token');

        if (!row) {
            throw new NotExistsError('Cannot find user with refresh token');
        }

        if (!row.refresh_token) {
            throw new NotExistsError('Cannot find refresh token');
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
}
