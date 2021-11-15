import bcrypt from 'bcrypt';
import { CreateOrganizationUser } from 'common';
import { Knex } from 'knex';
import { createEmail, EmailTableName } from '../database/entities/emails';
import { InviteLinkTableName } from '../database/entities/inviteLinks';
import { createOrganizationMembership } from '../database/entities/organizationMemberships';
import { createPasswordLogin } from '../database/entities/passwordLogins';
import {
    createUser,
    DbUserDetails,
    getUserDetailsByUuid,
    UserTableName,
} from '../database/entities/users';
import { NotExistsError, ParameterError } from '../errors';
import { InviteLinkModel } from './InviteLinkModel';

type DbOrganizationUser = Pick<
    DbUserDetails,
    'user_uuid' | 'first_name' | 'last_name' | 'email'
>;

export class UserModel {
    private database: Knex;

    constructor(database: Knex) {
        this.database = database;
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
    }: CreateOrganizationUser): Promise<DbUserDetails> {
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
        return getUserDetailsByUuid(this.database, user.user_uuid);
    }

    async getAllByOrganization(
        organizationUuid: string,
    ): Promise<DbOrganizationUser[]> {
        if (!organizationUuid) {
            throw new NotExistsError('Organization not found');
        }

        return this.database(UserTableName)
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
            )
            .select<DbOrganizationUser[]>([
                'users.user_uuid',
                'users.first_name',
                'users.last_name',
                'emails.email',
            ])
            .where('organization_uuid', organizationUuid);
    }
}
