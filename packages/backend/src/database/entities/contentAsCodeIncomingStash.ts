import { Knex } from 'knex';

export const ContentAsCodeIncomingStashTableName =
    'content_as_code_incoming_stash';

export type DbContentAsCodeIncomingStash = {
    content_as_code_incoming_stash_uuid: string;
    project_uuid: string;
    content_type: string;
    slug: string;
    incoming_snapshot: object;
    incoming_hash: string;
    rejected_at: Date;
};

export type CreateDbContentAsCodeIncomingStash = Pick<
    DbContentAsCodeIncomingStash,
    | 'project_uuid'
    | 'content_type'
    | 'slug'
    | 'incoming_snapshot'
    | 'incoming_hash'
>;

export type ContentAsCodeIncomingStashTable = Knex.CompositeTableType<
    DbContentAsCodeIncomingStash,
    CreateDbContentAsCodeIncomingStash,
    Pick<
        DbContentAsCodeIncomingStash,
        'incoming_snapshot' | 'incoming_hash' | 'rejected_at'
    >
>;
