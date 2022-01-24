import bcrypt from 'bcrypt';
import {
    CompleteUserArgs,
    CreateUserArgs,
    isOpenIdUser,
    LightdashMode,
    LightdashUser,
    OpenIdUser,
    SessionUser,
    UpdateUserArgs,
} from 'common';
import { Knex } from 'knex';
import { URL } from 'url';
import { lightdashConfig } from '../config/lightdashConfig';
import {
    createEmail,
    deleteEmail,
    EmailTableName,
} from '../database/entities/emails';
import { InviteLinkTableName } from '../database/entities/inviteLinks';
import {
    DbOpenIdIssuer,
    OpenIdIdentitiesTableName,
} from '../database/entities/openIdIdentities';
import { createOrganizationMembership } from '../database/entities/organizationMemberships';
import { createOrganization } from '../database/entities/organizations';
import {
    createPasswordLogin,
    PasswordLoginTableName,
} from '../database/entities/passwordLogins';
import {
    DbUser,
    DbUserIn,
    DbUserUpdate,
    UserTableName,
} from '../database/entities/users';
import { NotExistsError, NotFoundError, ParameterError } from '../errors';
import { InviteLinkModel } from './InviteLinkModel';
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
};
export type DbOrganizationUser = Pick<
    DbUserDetails,
    'user_uuid' | 'first_name' | 'last_name' | 'email'
>;

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
        createUser: CreateUserArgs | OpenIdUser,
    ) {
        const userIn: DbUserIn = isOpenIdUser(createUser)
            ? {
                  first_name: createUser.openId.firstName || '',
                  last_name: createUser.openId.lastName || '',
                  is_marketing_opted_in: false,
                  is_tracking_anonymized: canTrackingBeAnonymized(),
                  is_setup_complete: false,
              }
            : {
                  first_name: createUser.firstName.trim(),
                  last_name: createUser.lastName.trim(),
                  is_marketing_opted_in: false,
                  is_tracking_anonymized: canTrackingBeAnonymized(),
                  is_setup_complete: false,
              };
        const [newUser] = await trx<DbUser>('users')
            .insert<DbUserIn>(userIn)
            .returning('*');
        if (isOpenIdUser(createUser)) {
            const issuer = new URL('/', createUser.openId.issuer).origin; // normalise issuer
            await trx(OpenIdIdentitiesTableName)
                .insert({
                    issuer,
                    subject: createUser.openId.subject,
                    user_id: newUser.user_id,
                    email: createUser.openId.email,
                })
                .returning('*');
        } else {
            await createEmail(trx, {
                user_id: newUser.user_id,
                email: createUser.email,
                is_primary: true,
            });
            await createPasswordLogin(trx, {
                user_id: newUser.user_id,
                password_hash: await bcrypt.hash(
                    createUser.password,
                    await bcrypt.genSalt(),
                ),
            });
        }
        await createOrganizationMembership(trx, {
            organization_id: organizationId,
            user_id: newUser.user_id,
        });
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

    async getUserByPrimaryEmail(email: string): Promise<LightdashUser> {
        const [user] = await userDetailsQueryBuilder(this.database)
            .where('email', email)
            .select('*');
        if (user === undefined) {
            throw new NotFoundError(`No user found with email ${email}`);
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

    async completeUser(
        userUuid: string,
        {
            isMarketingOptedIn,
            isTrackingAnonymized,
        }: Omit<CompleteUserArgs, 'organizationName' | 'jobTitle'>,
    ): Promise<LightdashUser> {
        await this.database<DbUser>('users')
            .where('user_uuid', userUuid)
            .update<DbUserUpdate>({
                is_setup_complete: true,
                is_marketing_opted_in: isMarketingOptedIn,
                is_tracking_anonymized: canTrackingBeAnonymized()
                    ? isTrackingAnonymized
                    : false,
            });
        return this.getUserDetailsByUuid(userUuid);
    }

    async delete(userUuid: string): Promise<void> {
        await this.database(UserTableName)
            .where('user_uuid', userUuid)
            .delete();
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
            .select<(DbUserDetails & DbOpenIdIssuer)[]>('*');
        return (
            user && {
                ...mapDbUserDetailsToLightdashUser(user),
                userId: user.user_id,
            }
        );
    }

    async createUser(
        inviteCode: string,
        createUser: CreateUserArgs | OpenIdUser,
    ): Promise<LightdashUser> {
        const inviteCodeHash = InviteLinkModel._hash(inviteCode);
        const inviteLinks = await this.database(InviteLinkTableName).where(
            'invite_code_hash',
            inviteCodeHash,
        );
        if (inviteLinks.length === 0) {
            throw new NotExistsError('No invite link found');
        }
        const inviteLink = inviteLinks[0];

        const duplicatedEmails = await this.database(EmailTableName).where(
            'email',
            isOpenIdUser(createUser)
                ? createUser.openId.email
                : createUser.email,
        );
        if (duplicatedEmails.length > 0) {
            throw new ParameterError('Email already in use');
        }

        const user = await this.database.transaction(async (trx) =>
            UserModel.createUserTransaction(
                trx,
                inviteLink.organization_id,
                createUser,
            ),
        );
        return this.getUserDetailsByUuid(user.user_uuid);
    }

    async getAllByOrganization(
        organizationUuid: string,
    ): Promise<DbOrganizationUser[]> {
        if (!organizationUuid) {
            throw new NotExistsError('Organization not found');
        }
        return userDetailsQueryBuilder(this.database)
            .where('organization_uuid', organizationUuid)
            .select<DbOrganizationUser[]>([
                'users.user_uuid',
                'users.first_name',
                'users.last_name',
                'emails.email',
            ]);
    }

    async createInitialUser(
        createUser: CreateUserArgs | OpenIdUser,
    ): Promise<LightdashUser> {
        const user = await this.database.transaction(async (trx) => {
            const newOrg = await createOrganization(trx, {
                organization_name: '',
            });
            return UserModel.createUserTransaction(
                trx,
                newOrg.organization_id,
                createUser,
            );
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
        return {
            userId: user.user_id,
            ...mapDbUserDetailsToLightdashUser(user),
        };
    }

    async findSessionUserByPrimaryEmail(email: string): Promise<SessionUser> {
        const [user] = await userDetailsQueryBuilder(this.database)
            .where('email', email)
            .select('*');
        if (user === undefined) {
            throw new NotFoundError(`Cannot find user with uuid ${email}`);
        }
        return {
            userId: user.user_id,
            ...mapDbUserDetailsToLightdashUser(user),
        };
    }

    static lightdashUserFromSession(sessionUser: SessionUser): LightdashUser {
        const { userId, ...lightdashUser } = sessionUser;
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
}
