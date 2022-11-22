import { ShareUrl } from '@lightdash/common';
import { Knex } from 'knex';
import { DbOrganization } from '../database/entities/organizations';
import { DbShareUrl, ShareTableName } from '../database/entities/share';
import { DbUser } from '../database/entities/users';

type Dependencies = {
    database: Knex;
};
export class ShareModel {
    private database: Knex;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
    }

    async createSharedUrl(shareUrl: ShareUrl): Promise<ShareUrl> {
        const [user] = await this.database('users')
            .select('user_id')
            .where('user_uuid', shareUrl.createdByUserUuid);

        const [organization] = await this.database('organizations')
            .select('organization_id')
            .where('organization_uuid', shareUrl.organizationUuid);

        await this.database(ShareTableName).insert({
            nanoid: shareUrl.nanoid,
            path: shareUrl.path,
            params: shareUrl.params,
            organization_id: organization.organization_id,
            created_by_user_id: user.user_id,
        });

        return shareUrl;
    }

    async getSharedUrl(nanoid: string): Promise<ShareUrl> {
        const [row] = await this.database(ShareTableName)
            .leftJoin(
                'organizations',
                `${ShareTableName}.organization_id`,
                `organizations.organization_id`,
            )
            .leftJoin(
                'users',
                `${ShareTableName}.created_by_user_id`,
                `users.user_id`,
            )
            .where('nanoid', nanoid)
            .select<(DbShareUrl & DbUser & DbOrganization)[]>('*');

        return {
            nanoid: row.nanoid,
            params: row.params,
            createdByUserUuid: row.user_uuid,
            organizationUuid: row.organization_uuid,
            path: row.path,
        };
    }
}
