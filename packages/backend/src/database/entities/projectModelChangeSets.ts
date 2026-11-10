import { type SemanticLayerChangeSource } from '@lightdash/common';
import { Knex } from 'knex';

export const ProjectModelChangeSetsTableName = 'project_model_change_sets';
export const ProjectModelRevisionsTableName = 'project_model_revisions';

export type DbProjectModelChangeSet = {
    project_model_change_set_uuid: string;
    project_uuid: string;
    kind: SemanticLayerChangeSource;
    /** The question that asked for this change; null when none did. */
    prompt_uuid: string | null;
    reverted_by_change_set_uuid: string | null;
    created_by_user_uuid: string | null;
    created_at: Date;
};

export type ProjectModelChangeSetsTable = Knex.CompositeTableType<
    DbProjectModelChangeSet,
    Pick<
        DbProjectModelChangeSet,
        'project_uuid' | 'kind' | 'prompt_uuid' | 'created_by_user_uuid'
    > & { created_at: Knex.Raw },
    Pick<DbProjectModelChangeSet, 'reverted_by_change_set_uuid'>
>;

export type DbProjectModelRevision = {
    project_model_revision_uuid: string;
    project_model_change_set_uuid: string;
    name: string;
    /** The document version this change wrote. */
    document_version: number;
    /** Null when the change created the document. */
    content_before: string | null;
    /** Null when the change deleted the document. */
    content_after: string | null;
};

export type ProjectModelRevisionsTable = Knex.CompositeTableType<
    DbProjectModelRevision,
    Omit<DbProjectModelRevision, 'project_model_revision_uuid'>
>;
