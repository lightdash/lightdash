import { Knex } from 'knex';

export const DocumentsTableName = 'documents';
export const DocumentVersionsTableName = 'document_versions';
export const DocumentVersionSavedChartsTableName =
    'document_version_saved_charts';

export type DbDocument = {
    document_id: number;
    document_uuid: string;
    project_uuid: string;
    /** Null for a personal Document, visible only to its creator and admins. */
    space_id: number | null;
    slug: string;
    name: string;
    description: string;
    created_by_user_uuid: string | null;
    document_owner_user_uuid: string | null;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
    deleted_by_user_uuid: string | null;
    deleted_with_space: boolean;
    document_views_count: number;
    document_first_viewed_at: Date | null;
    next_chart_number: number;
};

export type DocumentsTable = Knex.CompositeTableType<
    DbDocument,
    Pick<
        DbDocument,
        | 'project_uuid'
        | 'space_id'
        | 'slug'
        | 'name'
        | 'description'
        | 'created_by_user_uuid'
    > &
        Partial<Pick<DbDocument, 'document_owner_user_uuid'>>,
    Partial<
        Pick<
            DbDocument,
            | 'space_id'
            | 'slug'
            | 'name'
            | 'description'
            | 'document_owner_user_uuid'
            | 'updated_at'
            | 'deleted_at'
            | 'deleted_by_user_uuid'
            | 'deleted_with_space'
            | 'document_views_count'
            | 'document_first_viewed_at'
            | 'next_chart_number'
        >
    >
>;

export type DbDocumentVersion = {
    document_version_id: number;
    document_version_uuid: string;
    document_id: number;
    version_number: number;
    schema_version: number;
    /** Version 1 cells; null for versions written in version 2. Dropped once no release reads it. */
    content: unknown | null;
    markdown: string | null;
    chart_data: unknown | null;
    created_by_user_uuid: string | null;
    created_at: Date;
};

export type DocumentVersionsTable = Knex.CompositeTableType<
    DbDocumentVersion,
    Pick<
        DbDocumentVersion,
        | 'document_id'
        | 'version_number'
        | 'schema_version'
        | 'markdown'
        | 'chart_data'
        | 'created_by_user_uuid'
    >,
    never
>;
