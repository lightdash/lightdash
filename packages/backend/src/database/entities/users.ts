import knex, { Knex } from 'knex';
import bcrypt from 'bcrypt';
import { CreateInitialUserArgs } from 'common';
import { NotFoundError } from '../../errors';
import { createOrganization } from './organizations';
import { createEmail } from './emails';
import database from '../database';
import { createPasswordLogin } from './passwordLogins';
import { createOrganizationMembership } from './organizationMemberships';

type DbUserDetails = {
    user_uuid: string;
    first_name: string;
    last_name: string;
    created_at: Date;
    is_tracking_anonymized: boolean;
    email: string | undefined;
    password_hash: string | undefined;
    organization_uuid: string | undefined;
    organization_name: string | undefined;
};

type DbUser = {
    user_id: number;
    user_uuid: string;
    first_name: string;
    last_name: string;
    created_at: Date;
    is_marketing_opted_in: boolean;
    is_tracking_anonymized: boolean;
};

type DbUserIn = {
    first_name: string;
    last_name: string;
    is_marketing_opted_in: boolean;
    is_tracking_anonymized: boolean;
};

export const createUser = async (
    db: Knex,
    userIn: DbUserIn,
): Promise<DbUser> => {
    const user = await db<DbUser>('users')
        .insert<DbUserIn>(userIn)
        .returning('*');
    return user[0];
};

const userDetailsQueryBuilder = (db: Knex) =>
    db<DbUser>('users')
        .joinRaw(
            'LEFT JOIN emails ON users.user_id = emails.user_id AND emails.is_primary',
        )
        .leftJoin('password_logins', 'users.user_id', 'password_logins.user_id')
        .leftJoin(
            'organization_memberships',
            'users.user_id',
            'organization_memberships.user_id',
        )
        .leftJoin(
            'organizations',
            'organization_memberships.organization_id',
            'organizations.organization_id',
        )
        .select<DbUserDetails[]>([
            'users.user_uuid',
            'users.first_name',
            'users.last_name',
            'users.created_at',
            'users.is_tracking_anonymized',
            'emails.email',
            'password_logins.password_hash',
            'organizations.organization_uuid',
            'organizations.organization_name',
        ])
        .limit(1);

// DB errors
// - user not exist
export const getUserDetailsByUuid = async (
    db: Knex,
    userUuid: string,
): Promise<DbUserDetails> => {
    const results = await userDetailsQueryBuilder(db).where(
        'user_uuid',
        userUuid,
    );
    if (results.length === 0) {
        throw new NotFoundError(`Cannot find user with uuid ${userUuid}`);
    }
    return results[0];
};

export const getUserDetailsByPrimaryEmail = async (db: Knex, email: string) => {
    const results = await userDetailsQueryBuilder(db).where('email', email);
    if (results.length === 0) {
        throw new NotFoundError(`No user found with email ${email}`);
    }
    return results[0];
};

export const createInitialUser = async ({
    firstName,
    lastName,
    organizationName,
    email,
    password,
    isMarketingOptedIn,
    isTrackingAnonymized,
}: CreateInitialUserArgs): Promise<DbUserDetails> => {
    const user = await database.transaction(async (trx) => {
        try {
            const newOrg = await createOrganization(trx, {
                organization_name: organizationName.trim(),
            });
            const newUser = await createUser(trx, {
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                is_marketing_opted_in: isMarketingOptedIn,
                is_tracking_anonymized: isTrackingAnonymized,
            });
            await createEmail(trx, {
                user_id: newUser.user_id,
                email,
                is_primary: true,
            });
            await createPasswordLogin(trx, {
                user_id: newUser.user_id,
                password_hash: bcrypt.hashSync(password, bcrypt.genSaltSync()),
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
    const fullUser = await getUserDetailsByUuid(database, user.user_uuid);
    return fullUser;
};

export const hasUsers = async (db: Knex): Promise<boolean> => {
    const results = await userDetailsQueryBuilder(db);
    return results.length > 0;
};
