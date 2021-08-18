import { Knex } from 'knex';
import { NotExistsError } from '../errors';
import { DbUserDetails, UserTableName } from '../database/entities/users';

type DbOrganizationUser = Pick<
    DbUserDetails,
    'user_uuid' | 'first_name' | 'last_name' | 'email'
>;

export class UserModel {
    private database: Knex;

    constructor(database: Knex) {
        this.database = database;
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
