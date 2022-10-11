import { ShareUrl } from '@lightdash/common';
import { Knex } from 'knex';
import { ShareTableName } from '../database/entities/share';

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
            .where('user_uuid', shareUrl.createByUserUuid);

        const [organization] = await this.database('organizations')
            .select('organization_id')
            .where('organization_uuid', shareUrl.organizationUuid);

        const [share] = await this.database(ShareTableName)
            .insert({
                nanoid: shareUrl.nanoid,
                path: shareUrl.path,
                params: shareUrl.params,
                organization_id: organization.organization_id,
                created_by_user_id: user.user_id,
            })
            .returning('*');

        return share;
    }

    async getSharedUrl(nanoid: string): Promise<ShareUrl> {
        const [row] = await this.database(ShareTableName)
            .where('nanoid', nanoid)
            .select<ShareUrl[]>('*');

        return row;
    }
}
