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
        const [share] = await this.database(ShareTableName)
            .insert(shareUrl)
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
