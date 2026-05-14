import { NotFoundError } from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbSlackUnfurlImage,
    SlackUnfurlImageTableName,
} from '../database/entities/slackUnfurlImage';

type SlackUnfurlImageModelArguments = {
    database: Knex;
};

export class SlackUnfurlImageModel {
    private database: Knex;

    constructor(args: SlackUnfurlImageModelArguments) {
        this.database = args.database;
    }

    async create(data: {
        nanoid: string;
        s3Key: string;
        organizationUuid: string;
    }): Promise<void> {
        await this.database(SlackUnfurlImageTableName).insert({
            nanoid: data.nanoid,
            s3_key: data.s3Key,
            organization_uuid: data.organizationUuid,
        });
    }

    async get(nanoid: string): Promise<DbSlackUnfurlImage> {
        const row = await this.database(SlackUnfurlImageTableName)
            .where('nanoid', nanoid)
            .select('*')
            .first();

        if (row === undefined) {
            throw new NotFoundError('Slack unfurl image not found');
        }

        return row;
    }

    async delete(nanoid: string): Promise<void> {
        await this.database(SlackUnfurlImageTableName)
            .where('nanoid', nanoid)
            .delete();
    }
}
