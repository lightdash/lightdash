import { Knex } from 'knex';

export const DocumentsTableName = 'documents';
export const DocumentVersionsTableName = 'document_versions';

export type DbDocument = {
    document_id: number;
    document_uuid: string;
    project_uuid: string;
    space_id: number;
    slug: string;
    name: string;
    description: string;
    created_by_user_uuid: string | null;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
    deleted_by_user_uuid: string | null;
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
    >,
    Partial<
        Pick<
            DbDocument,
            | 'space_id'
            | 'slug'
            | 'name'
            | 'description'
            | 'updated_at'
            | 'deleted_at'
            | 'deleted_by_user_uuid'
        >
    >
>;

export type DbDocumentVersion = {
    document_version_id: number;
    document_version_uuid: string;
    document_id: number;
    version_number: number;
    schema_version: number;
    content: unknown;
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
        | 'content'
        | 'created_by_user_uuid'
    >,
    never
>;
