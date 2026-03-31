import { Knex } from 'knex';

export const SlackUnfurlImageTableName = 'slack_unfurl_images';

export type DbSlackUnfurlImage = {
    nanoid: string;
    s3_key: string;
    organization_uuid: string;
    created_at: Date;
};

type CreateSlackUnfurlImage = Omit<DbSlackUnfurlImage, 'created_at'>;

export type SlackUnfurlImageTable = Knex.CompositeTableType<
    DbSlackUnfurlImage,
    CreateSlackUnfurlImage
>;
