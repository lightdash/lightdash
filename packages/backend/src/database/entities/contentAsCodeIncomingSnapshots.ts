import { Knex } from 'knex';

export const ContentAsCodeIncomingSnapshotsTableName =
    'content_as_code_incoming_snapshots';

export type DbContentAsCodeIncomingSnapshot = {
    content_as_code_incoming_snapshot_uuid: string;
    project_uuid: string;
    content_type: string;
    slug: string;
    incoming_snapshot: object;
    incoming_snapshot_hash: string;
    stashed_at: Date;
    stashed_by_user_uuid: string | null;
};

export type CreateDbContentAsCodeIncomingSnapshot = Pick<
    DbContentAsCodeIncomingSnapshot,
    | 'project_uuid'
    | 'content_type'
    | 'slug'
    | 'incoming_snapshot'
    | 'incoming_snapshot_hash'
    | 'stashed_by_user_uuid'
>;

export type UpdateDbContentAsCodeIncomingSnapshot = Pick<
    DbContentAsCodeIncomingSnapshot,
    | 'incoming_snapshot'
    | 'incoming_snapshot_hash'
    | 'stashed_at'
    | 'stashed_by_user_uuid'
>;

export type ContentAsCodeIncomingSnapshotTable = Knex.CompositeTableType<
    DbContentAsCodeIncomingSnapshot,
    CreateDbContentAsCodeIncomingSnapshot,
    UpdateDbContentAsCodeIncomingSnapshot
>;
