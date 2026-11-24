import {
    type ProjectContextEntry,
    type SemanticLayerDraftModelInput,
} from '@lightdash/common';
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
    /** The pull request that carries this to the project's repository; null when it went live here or never applied. */
    applied_pull_request_url: string | null;
    /** The version each model was at when this change was made, by model name; null for a model that was not there. Null on changes made before versions were recorded. */
    base_versions: Record<string, number | null> | null;
    /** The Studio workspace this change belongs to; null on changes made before drafts had workspaces. */
    workspace_uuid: string | null;
    /** Someone other than the owner who discarded this; null when the owner did, or it was not discarded. */
    discarded_by_user_uuid: string | null;
    /** When someone other than the owner discarded this; null otherwise. */
    discarded_at: Date | null;
    /** Project context entries this change adds or replaces by id; null when it touches no project context. */
    project_context_entries: ProjectContextEntry[] | null;
    created_at: Date;
};

export type ProjectModelDraftChangesTable = Knex.CompositeTableType<
    DbProjectModelDraftChange,
    Pick<
        DbProjectModelDraftChange,
        | 'project_uuid'
        | 'created_by_user_uuid'
        | 'prompt_uuid'
        | 'workspace_uuid'
    > & {
        models: string;
        base_versions?: string | null;
        project_context_entries?: string | null;
        created_at?: Date;
    },
    Partial<
        Pick<
            DbProjectModelDraftChange,
            | 'status'
            | 'applied_change_set_uuid'
            | 'applied_pull_request_url'
            | 'discarded_by_user_uuid'
            | 'discarded_at'
        >
    > & { models?: string; base_versions?: Knex.Raw; created_at?: Knex.Raw }
>;
