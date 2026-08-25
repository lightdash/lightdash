import { Knex } from 'knex';

export const ContentDraftsTableName = 'content_drafts';

export type DbContentDraft = {
    content_draft_uuid: string;
    project_uuid: string;
    content_type: string;
    content_uuid: string;
    slug: string;
    author_user_uuid: string;
    draft: object;
    status: string;
    pr_url: string | null;
    created_at: Date;
    updated_at: Date;
};

export type CreateDbContentDraft = Pick<
    DbContentDraft,
    | 'project_uuid'
    | 'content_type'
    | 'content_uuid'
    | 'slug'
    | 'author_user_uuid'
    | 'draft'
>;

export type UpdateDbContentDraft = Partial<
    Pick<DbContentDraft, 'draft' | 'status' | 'pr_url' | 'updated_at'>
>;

export type ContentDraftsTable = Knex.CompositeTableType<
    DbContentDraft,
    CreateDbContentDraft,
    UpdateDbContentDraft
>;
