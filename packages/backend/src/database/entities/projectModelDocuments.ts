import { Knex } from 'knex';

export const ProjectModelDocumentsTableName = 'project_model_documents';

export type DbProjectModelDocument = {
    project_model_document_uuid: string;
    project_uuid: string;
    name: string;
    content: string;
    /** Bumped by every write, so a stale read is caught. */
    document_version: number;
};

export type ProjectModelDocumentsTable = Knex.CompositeTableType<
    DbProjectModelDocument,
    Omit<DbProjectModelDocument, 'project_model_document_uuid'>,
    Pick<DbProjectModelDocument, 'content' | 'document_version'>
>;
