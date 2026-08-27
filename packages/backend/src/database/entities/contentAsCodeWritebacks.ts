import { Knex } from 'knex';

export const ContentAsCodeProjectSettingsTableName =
    'content_as_code_project_settings';

export type DbContentAsCodeProjectSettings = {
    project_uuid: string;
    sync_enabled: boolean;
    stamped_at: Date;
};

export type CreateDbContentAsCodeProjectSettings = Pick<
    DbContentAsCodeProjectSettings,
    'project_uuid' | 'sync_enabled'
>;

export type ContentAsCodeProjectSettingsTable = Knex.CompositeTableType<
    DbContentAsCodeProjectSettings,
    CreateDbContentAsCodeProjectSettings,
    Pick<DbContentAsCodeProjectSettings, 'sync_enabled' | 'stamped_at'>
>;

export const ContentAsCodeWritebacksTableName = 'content_as_code_writebacks';

export type DbContentAsCodeWriteback = {
    content_as_code_writeback_uuid: string;
    project_uuid: string;
    content_type: string;
    slug: string;
    content_draft_uuid: string | null;
    branch: string;
    pr_number: number | null;
    pr_url: string | null;
    status: string;
    error: string | null;
    created_by_user_uuid: string | null;
    created_at: Date;
    updated_at: Date;
};

export type CreateDbContentAsCodeWriteback = Pick<
    DbContentAsCodeWriteback,
    | 'project_uuid'
    | 'content_type'
    | 'slug'
    | 'content_draft_uuid'
    | 'branch'
    | 'status'
    | 'created_by_user_uuid'
>;

export type UpdateDbContentAsCodeWriteback = Partial<
    Pick<
        DbContentAsCodeWriteback,
        'pr_number' | 'pr_url' | 'status' | 'error' | 'updated_at'
    >
>;

export type ContentAsCodeWritebackTable = Knex.CompositeTableType<
    DbContentAsCodeWriteback,
    CreateDbContentAsCodeWriteback,
    UpdateDbContentAsCodeWriteback
>;
