import { Knex } from 'knex';

export const SlackChannelProjectMappingsTableName =
    'slack_channel_project_mappings';

type DbSlackChannelProjectMapping = {
    project_uuid: string;
    slack_channel_id: string;
    organization_uuid: string;
    available_tags: string[] | null;
};

export type SlackChannelProjectMappingsTable =
    Knex.CompositeTableType<DbSlackChannelProjectMapping>;
