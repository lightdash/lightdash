import { type SemanticLayerDraftModelInput } from '@lightdash/common';
import { Knex } from 'knex';

export const ProjectModelDraftChangesTableName = 'project_model_draft_changes';

export type DraftChangeStatus = 'draft' | 'applied' | 'discarded';
export type SettledDraftChangeStatus = Exclude<DraftChangeStatus, 'draft'>;

export type DbProjectModelDraftChange = {
    project_model_draft_change_uuid: string;
    project_uuid: string;
    created_by_user_uuid: string;
    /** The question that asked for this change; null when none did. */
    prompt_uuid: string | null;
    models: SemanticLayerDraftModelInput[];
    status: DraftChangeStatus;
    /** The change set that took this live; null when it was live already or never applied. */
    applied_change_set_uuid: string | null;
    created_at: Date;
};

export type ProjectModelDraftChangesTable = Knex.CompositeTableType<
    DbProjectModelDraftChange,
    Pick<
        DbProjectModelDraftChange,
        'project_uuid' | 'created_by_user_uuid' | 'prompt_uuid'
    > & { models: string; created_at?: Date },
    Partial<
        Pick<DbProjectModelDraftChange, 'status' | 'applied_change_set_uuid'>
    > & { models?: string }
>;
