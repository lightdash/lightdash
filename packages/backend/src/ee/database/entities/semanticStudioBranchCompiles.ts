import { type Explore, type ExploreError } from '@lightdash/common';
import { Knex } from 'knex';

export const SemanticStudioBranchCompilesTableName =
    'semantic_studio_branch_compiles';

export type BranchCompileStatus = 'compiling' | 'ready' | 'failed';

export type DbSemanticStudioBranchCompile = {
    semantic_studio_workspace_uuid: string;
    /** The latest request; a compile that finishes for an older one is dropped. */
    compile_request_uuid: string;
    status: BranchCompileStatus;
    /** The branch last compiled; null until a compile has resolved it. */
    branch: string | null;
    error: string | null;
    /** The last successful compile, kept through later failures. */
    explores: (Explore | ExploreError)[] | null;
    requested_at: Date;
    compiled_at: Date | null;
    /** Asked for after an agent's save, so a failure can go back to the agent. */
    requested_by_agent: boolean;
    /** When the agent was sent this compile's failure; at most once per compile. */
    follow_up_claimed_at: Date | null;
};

export type SemanticStudioBranchCompilesTable = Knex.CompositeTableType<
    DbSemanticStudioBranchCompile,
    Pick<
        DbSemanticStudioBranchCompile,
        'semantic_studio_workspace_uuid' | 'compile_request_uuid' | 'status'
    > &
        Partial<Pick<DbSemanticStudioBranchCompile, 'requested_by_agent'>>,
    Partial<
        Pick<
            DbSemanticStudioBranchCompile,
            | 'compile_request_uuid'
            | 'status'
            | 'branch'
            | 'error'
            | 'requested_by_agent'
        >
    > & {
        explores?: string;
        requested_at?: Knex.Raw;
        compiled_at?: Knex.Raw;
        follow_up_claimed_at?: Knex.Raw | null;
    }
>;
