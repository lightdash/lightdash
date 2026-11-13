import { type SemanticStudioWorkspacePullRequestState } from '@lightdash/common';
import { Knex } from 'knex';

export const SemanticStudioWorkspacesTableName = 'semantic_studio_workspaces';

export type DbSemanticStudioWorkspace = {
    semantic_studio_workspace_uuid: string;
    organization_uuid: string;
    project_uuid: string;
    created_by_user_uuid: string | null;
    ai_thread_uuid: string;
    name: string;
    is_active: boolean;
    /** The pull request `pull_request_state` was last checked for. */
    pull_request_url: string | null;
    pull_request_state: SemanticStudioWorkspacePullRequestState | null;
    created_at: Date;
    updated_at: Date;
    finished_at: Date | null;
};

export type SemanticStudioWorkspacesTable = Knex.CompositeTableType<
    DbSemanticStudioWorkspace,
    Pick<
        DbSemanticStudioWorkspace,
        | 'organization_uuid'
        | 'project_uuid'
        | 'created_by_user_uuid'
        | 'ai_thread_uuid'
        | 'name'
        | 'is_active'
    >,
    Partial<
        Pick<
            DbSemanticStudioWorkspace,
            'name' | 'is_active' | 'pull_request_url' | 'pull_request_state'
        >
    > & { updated_at?: Knex.Raw; finished_at?: Knex.Raw | null }
>;
