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
};

export type SemanticStudioBranchCompilesTable = Knex.CompositeTableType<
    DbSemanticStudioBranchCompile,
    Pick<
        DbSemanticStudioBranchCompile,
        'semantic_studio_workspace_uuid' | 'compile_request_uuid' | 'status'
    >,
    Partial<
        Pick<
            DbSemanticStudioBranchCompile,
            'compile_request_uuid' | 'status' | 'branch' | 'error'
        >
    > & {
        explores?: string;
        requested_at?: Knex.Raw;
        compiled_at?: Knex.Raw;
    }
>;
