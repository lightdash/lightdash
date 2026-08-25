import { Knex } from 'knex';

export const ContentAsCodeAppliedRevisionsTableName =
    'content_as_code_applied_revisions';

export type DbContentAsCodeAppliedRevision = {
    content_as_code_applied_revision_uuid: string;
    project_uuid: string;
    content_type: string;
    slug: string;
    snapshot: Record<string, unknown>;
    snapshot_hash: string;
    applied_at: Date;
    applied_by_user_uuid: string | null;
};

export type ContentAsCodeAppliedRevisionsTable = Knex.CompositeTableType<
    DbContentAsCodeAppliedRevision,
    Pick<
        DbContentAsCodeAppliedRevision,
        | 'project_uuid'
        | 'content_type'
        | 'slug'
        | 'snapshot'
        | 'snapshot_hash'
        | 'applied_at'
        | 'applied_by_user_uuid'
    >
>;
