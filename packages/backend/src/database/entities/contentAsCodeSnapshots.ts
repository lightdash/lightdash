import { Knex } from 'knex';

export const ContentAsCodeSnapshotsTableName = 'content_as_code_snapshots';

export type DbContentAsCodeSnapshot = {
    content_as_code_snapshot_uuid: string;
    project_uuid: string;
    content_type: string;
    slug: string;
    snapshot: object;
    snapshot_hash: string;
    applied_at: Date;
    applied_by_user_uuid: string | null;
};

export type CreateDbContentAsCodeSnapshot = Pick<
    DbContentAsCodeSnapshot,
    | 'project_uuid'
    | 'content_type'
    | 'slug'
    | 'snapshot'
    | 'snapshot_hash'
    | 'applied_by_user_uuid'
>;

export type UpdateDbContentAsCodeSnapshot = Pick<
    DbContentAsCodeSnapshot,
    'snapshot' | 'snapshot_hash' | 'applied_at' | 'applied_by_user_uuid'
>;

export type ContentAsCodeSnapshotTable = Knex.CompositeTableType<
    DbContentAsCodeSnapshot,
    CreateDbContentAsCodeSnapshot,
    UpdateDbContentAsCodeSnapshot
>;
