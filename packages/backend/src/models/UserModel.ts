import {
    ActivateUser,
    CreateUserArgs,
    CreateUserWithRole,
    getUserAbilityBuilder,
    isOpenIdUser,
    LightdashMode,
    LightdashUser,
    LightdashUserWithAbilityRules,
    NotExistsError,
    NotFoundError,
    OpenIdUser,
    OrganizationMemberRole,
    ParameterError,
    PersonalAccessToken,
    ProjectMemberProfile,
    SessionUser,
    UpdateUserArgs,
} from '@lightdash/common';
import bcrypt from 'bcrypt';
import { Knex } from 'knex';
import { lightdashConfig } from '../config/lightdashConfig';
import {
    createEmail,
    deleteEmail,
    EmailTableName,
} from '../database/entities/emails';
import { OpenIdIdentitiesTableName } from '../database/entities/openIdIdentities';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import {
    createOrganization,
    OrganizationTableName,
} from '../database/entities/organizations';
import {
    createPasswordLogin,
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
    organization_uuid: string;
    organization_name: string;
    is_setup_complete: boolean;
    role: OrganizationMemberRole;
    is_active: boolean;
};

const canTrackingBeAnonymized = () =>
    lightdashConfig.mode !== LightdashMode.CLOUD_BETA;

export const mapDbUserDetailsToLightdashUser = (
    user: DbUserDetails,
): LightdashUser => {
    if (!user.organization_uuid) {
        throw new NotFoundError(
            `Cannot find organization for user with uuid ${user.user_uuid}`,
        );
    }
    return {
        userUuid: user.user_uuid,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        organizationUuid: user.organization_uuid,
        organizationName: user.organization_name,
        isTrackingAnonymized: user.is_tracking_anonymized,
        isMarketingOptedIn: user.is_marketing_opted_in,
        isSetupComplete: user.is_setup_complete,
        role: user.role,
        isActive: user.is_active,
    };
};

const userDetailsQueryBuilder = (
    db: Knex,
): Knex.QueryBuilder<DbUserDetails[]> =>
    db('users')
        .joinRaw(
            'LEFT JOIN emails ON users.user_id = emails.user_id AND emails.is_primary',
        )
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

export class UserModel {
    private readonly database: Knex;

    constructor(database: Knex) {
        this.database = database;
    }

    static async createUserTransaction(
        trx: Transaction,
        organizationId: number,
        createUser: (CreateUserArgs | OpenIdUser) & { isActive: boolean },
    ) {
        const userIn: DbUserIn = isOpenIdUser(createUser)
            ? {
                  first_name: createUser.openId.firstName || '',
                  last_name: createUser.openId.lastName || '',
                  is_marketing_opted_in: false,
                  is_tracking_anonymized: canTrackingBeAnonymized(),
                  is_setup_complete: false,
                  is_active: createUser.isActive,
              }
            : {
                  first_name: createUser.firstName.trim(),
                  last_name: createUser.lastName.trim(),
                  is_marketing_opted_in: false,
                  is_tracking_anonymized: canTrackingBeAnonymized(),
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
                    email: createUser.openId.email,
                })
                .returning('*');
            await createEmail(trx, {
                user_id: newUser.user_id,
                email: createUser.openId.email,
                is_primary: true,
            });
        } else {
            await createEmail(trx, {
                user_id: newUser.user_id,
                email: createUser.email,
                is_primary: true,
            });
            if (createUser.password) {
                await createPasswordLogin(trx, {
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

    async hasUsers(): Promise<boolean> {
        const results = await userDetailsQueryBuilder(this.database);
        return results.length > 0;
    }

    async getUserDetailsByUuid(userUuid: string): Promise<LightdashUser> {
        const [user] = await userDetailsQueryBuilder(this.database)
            .where('user_uuid', userUuid)
            .select('*');
        if (user === undefined) {
            throw new NotFoundError(`Cannot find user with uuid ${userUuid}`);
        }
        return mapDbUserDetailsToLightdashUser(user);
    }

    async getUserDetailsById(userId: number): Promise<LightdashUser> {
        const [user] = await userDetailsQueryBuilder(this.database)
            .where('user_id', userId)
            .select('*');
        if (user === undefined) {
            throw new NotFoundError('Cannot find user');
        }
        return mapDbUserDetailsToLightdashUser(user);
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
            .select<(DbUserDetails & { password_hash: string })[]>('*');
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
        return mapDbUserDetailsToLightdashUser(user);
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
            .select<(DbUserDetails & { password_hash: string })[]>('*');
        if (user === undefined) {
            throw new NotFoundError(
                `No user found with uuid ${userUuid} and password`,
            );
        }
        const match = await bcrypt.compare(password, user.password_hash || '');
        if (!match) {
            throw new NotFoundError(
                `No User found with uuid ${userUuid} and password`,
            );
        }
        return mapDbUserDetailsToLightdashUser(user);
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
        }: Partial<UpdateUserArgs>,
    ): Promise<LightdashUser> {
        await this.database.transaction(async (trx) => {
            try {
                const [user] = await trx(UserTableName)
                    .where('user_uuid', userUuid)
                    .update<DbUserUpdate>({
                        first_name: firstName,
                        last_name: lastName,
                        is_setup_complete: isSetupComplete,
                        is_marketing_opted_in: isMarketingOptedIn,
                        is_tracking_anonymized: canTrackingBeAnonymized()
                            ? isTrackingAnonymized
                            : false,
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
                        email,
                        is_primary: true,
                    });
                }
            } catch (e) {
                await trx.rollback(e);
                throw e;
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
    ): Promise<Pick<ProjectMemberProfile, 'projectUuid' | 'role'>[]> {
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
            .select<DbUserDetails[]>('*');
        if (user === undefined) {
            return user;
        }
        const lightdashUser = mapDbUserDetailsToLightdashUser(user);
        const projectRoles = await this.getUserProjectRoles(user.user_id);
        const abilityBuilder = getUserAbilityBuilder(
            lightdashUser,
            projectRoles,
        );

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

        const duplicatedEmails = await this.database(EmailTableName).where(
            'email',
            isOpenIdUser(createUser)
                ? createUser.openId.email
                : createUser.email,
        );
        if (duplicatedEmails.length > 0) {
            throw new ParameterError('Email already in use');
        }

        const user = await this.database.transaction(async (trx) => {
            const newUser = await UserModel.createUserTransaction(
                trx,
                org.organization_id,
                { ...createUser, isActive: false },
            );
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
        await this.database.transaction(async (trx) => {
            try {
                const [user] = await trx(UserTableName)
                    .where('user_uuid', userUuid)
                    .update<DbUserUpdate>({
                        first_name: isOpenIdUser(activateUser)
                            ? activateUser.openId.firstName
                            : activateUser.firstName,
                        last_name: isOpenIdUser(activateUser)
                            ? activateUser.openId.lastName
                            : activateUser.lastName,
                        is_active: true,
                    })
                    .returning('*');

                if (!isOpenIdUser(activateUser)) {
                    await createPasswordLogin(trx, {
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
                            email: activateUser.openId.email,
                        })
                        .returning('*');
                }
            } catch (e) {
                await trx.rollback(e);
                throw e;
            }
        });
        return this.getUserDetailsByUuid(userUuid);
    }

    async createNewUserWithOrg(
        createUser: CreateUserArgs | OpenIdUser,
    ): Promise<LightdashUser> {
        const user = await this.database.transaction(async (trx) => {
            const duplicatedEmails = await trx(EmailTableName).where(
                'email',
                isOpenIdUser(createUser)
                    ? createUser.openId.email
                    : createUser.email,
            );
            if (duplicatedEmails.length > 0) {
                throw new ParameterError('Email already in use');
            }

            const newOrg = await createOrganization(trx, {
                organization_name: '',
            });
            const newUser = await UserModel.createUserTransaction(
                trx,
                newOrg.organization_id,
                { ...createUser, isActive: true },
            );
            await trx(OrganizationMembershipsTableName).insert({
                organization_id: newOrg.organization_id,
                user_id: newUser.user_id,
                role: OrganizationMemberRole.ADMIN,
            });
            return newUser;
        });
        return this.getUserDetailsByUuid(user.user_uuid);
    }

    async findSessionUserByUUID(userUuid: string): Promise<SessionUser> {
        const [user] = await userDetailsQueryBuilder(this.database)
            .where('user_uuid', userUuid)
            .select('*');
        if (user === undefined) {
            throw new NotFoundError(`Cannot find user with uuid ${userUuid}`);
        }
        const lightdashUser = mapDbUserDetailsToLightdashUser(user);
        const projectRoles = await this.getUserProjectRoles(user.user_id);
        const abilityBuilder = getUserAbilityBuilder(
            lightdashUser,
            projectRoles,
        );
        return {
            ...lightdashUser,
            userId: user.user_id,
            abilityRules: abilityBuilder.rules,
            ability: abilityBuilder.build(),
        };
    }

    async findSessionUserByPrimaryEmail(email: string): Promise<SessionUser> {
        const [user] = await userDetailsQueryBuilder(this.database)
            .where('email', email)
            .select('*');
        if (user === undefined) {
            throw new NotFoundError(`Cannot find user with uuid ${email}`);
        }
        const lightdashUser = mapDbUserDetailsToLightdashUser(user);
        const projectRoles = await this.getUserProjectRoles(user.user_id);
        const abilityBuilder = getUserAbilityBuilder(
            lightdashUser,
            projectRoles,
        );
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
        const [user] = await userDetailsQueryBuilder(this.database).where(
            'email',
            email,
        );
        return user ? mapDbUserDetailsToLightdashUser(user) : undefined;
    }

    async upsertPassword(userUuid: string, password: string): Promise<void> {
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
            .select<(DbUserDetails & DbPersonalAccessToken)[]>('*');
        if (row === undefined) {
            return undefined;
        }
        const lightdashUser = mapDbUserDetailsToLightdashUser(row);
        const projectRoles = await this.getUserProjectRoles(row.user_id);
        const abilityBuilder = getUserAbilityBuilder(
            lightdashUser,
            projectRoles,
        );
        return {
            user: {
                ...mapDbUserDetailsToLightdashUser(row),
                abilityRules: abilityBuilder.rules,
                ability: abilityBuilder.build(),
                userId: row.user_id,
            },
            personalAccessToken:
                PersonalAccessTokenModel.mapDbObjectToPersonalAccessToken(row),
        };
    }
}
