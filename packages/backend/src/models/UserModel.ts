import bcrypt from 'bcrypt';
import {
    CreateInitialUserArgs,
    CreateOrganizationUser,
    LightdashUser,
    SessionUser,
    UpdateUserArgs,
} from 'common';
import { Knex } from 'knex';
import {
    createEmail,
    deleteEmail,
    EmailTableName,
} from '../database/entities/emails';
import { InviteLinkTableName } from '../database/entities/inviteLinks';
import { createOrganizationMembership } from '../database/entities/organizationMemberships';
import { createOrganization } from '../database/entities/organizations';
import { createPasswordLogin } from '../database/entities/passwordLogins';
import {
    DbUser,
    DbUserIn,
    DbUserUpdate,
    UserTableName,
} from '../database/entities/users';
import { NotExistsError, NotFoundError, ParameterError } from '../errors';
import { InviteLinkModel } from './InviteLinkModel';

export type DbUserDetails = {
    user_id: number;
    user_uuid: string;
    first_name: string;
    last_name: string;
    created_at: Date;
    is_tracking_anonymized: boolean;
    email: string | undefined;
    organization_uuid: string;
    organization_name: string;
};
export type DbOrganizationUser = Pick<
    DbUserDetails,
    'user_uuid' | 'first_name' | 'last_name' | 'email'
>;

export const mapDbUserDetailsToLightdashUser = (
    user: DbUserDetails,
): LightdashUser => {
    if (!user.organization_uuid || !user.organization_name) {
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
        userId: number,
        currentEmail: string | undefined,
        { firstName, lastName, email }: UpdateUserArgs,
    ): Promise<LightdashUser> {
        await this.database.transaction(async (trx) => {
            try {
                await trx<DbUser>('users')
                    .where('user_id', userId)
                    .update<DbUserUpdate>({
                        first_name: firstName,
                        last_name: lastName,
                    });

                if (currentEmail !== email) {
                    if (currentEmail) {
                        await deleteEmail(trx, {
                            user_id: userId,
                            email: currentEmail,
                        });
                    }
                    await createEmail(trx, {
                        user_id: userId,
                        email,
                        is_primary: true,
                    });
                }
            } catch (e) {
                await trx.rollback(e);
                throw e;
            }
        });
        return this.getUserByPrimaryEmail(email);
    }

    async delete(userUuid: string): Promise<void> {
        await this.database(UserTableName)
            .where('user_uuid', userUuid)
            .delete();
    }

    async createUser({
        inviteCode,
        firstName,
        lastName,
        email,
        password,
        isMarketingOptedIn,
        isTrackingAnonymized,
    }: CreateOrganizationUser): Promise<LightdashUser> {
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
            email,
        );
        if (duplicatedEmails.length > 0) {
            throw new ParameterError('Email already exists');
        }

        const user = await this.database.transaction(async (trx) => {
            try {
                const [newUser] = await trx<DbUser>('users')
                    .insert<DbUserIn>({
                        first_name: firstName.trim(),
                        last_name: lastName.trim(),
                        is_marketing_opted_in: isMarketingOptedIn,
                        is_tracking_anonymized: isTrackingAnonymized,
                    })
                    .returning('*');
                await createEmail(trx, {
                    user_id: newUser.user_id,
                    email,
                    is_primary: true,
                });
                await createPasswordLogin(trx, {
                    user_id: newUser.user_id,
                    password_hash: await bcrypt.hash(
                        password,
                        await bcrypt.genSalt(),
                    ),
                });
                await createOrganizationMembership(trx, {
                    organization_id: inviteLink.organization_id,
                    user_id: newUser.user_id,
                });
                return newUser;
            } catch (e) {
                await trx.rollback(e);
                throw e;
            }
        });
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

    async createInitialUser({
        firstName,
        lastName,
        organizationName,
        email,
        password,
        isMarketingOptedIn,
        isTrackingAnonymized,
    }: CreateInitialUserArgs): Promise<LightdashUser> {
        const user = await this.database.transaction(async (trx) => {
            try {
                const newOrg = await createOrganization(trx, {
                    organization_name: organizationName.trim(),
                });
                const [newUser] = await trx<DbUser>('users')
                    .insert<DbUserIn>({
                        first_name: firstName.trim(),
                        last_name: lastName.trim(),
                        is_marketing_opted_in: isMarketingOptedIn,
                        is_tracking_anonymized: isTrackingAnonymized,
                    })
                    .returning('*');
                await createEmail(trx, {
                    user_id: newUser.user_id,
                    email,
                    is_primary: true,
                });
                await createPasswordLogin(trx, {
                    user_id: newUser.user_id,
                    password_hash: await bcrypt.hash(
                        password,
                        await bcrypt.genSalt(),
                    ),
                });
                await createOrganizationMembership(trx, {
                    organization_id: newOrg.organization_id,
                    user_id: newUser.user_id,
                });

                return newUser;
            } catch (e) {
                await trx.rollback(e);
                throw e;
            }
        });
        return this.getUserDetailsByUuid(user.user_uuid);
    }

    async findSessionUserByUuid(userUuid: string): Promise<SessionUser> {
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
}
