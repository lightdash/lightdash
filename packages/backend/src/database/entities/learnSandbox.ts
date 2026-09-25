import type { Knex } from 'knex';

export const LearnWorkspaceFilesTableName = 'learn_workspace_files';
export type DbLearnWorkspaceFile = {
    project_uuid: string;
    path: string;
    content: string;
    updated_at: Date;
};
export type LearnWorkspaceFilesTable = Knex.CompositeTableType<
    DbLearnWorkspaceFile,
    Omit<DbLearnWorkspaceFile, 'updated_at'>,
    Pick<DbLearnWorkspaceFile, 'content' | 'updated_at'>
>;

export const LearnCommandsTableName = 'learn_commands';
export type DbLearnCommand = {
    command_uuid: string;
    project_uuid: string;
    user_uuid: string;
    argv: string[];
    status: 'queued' | 'running' | 'done' | 'error' | 'timeout';
    exit_code: number | null;
    pat_uuid: string | null;
    created_at: Date;
    started_at: Date | null;
    finished_at: Date | null;
};
export type LearnCommandsTable = Knex.CompositeTableType<
    DbLearnCommand,
    Pick<DbLearnCommand, 'project_uuid' | 'user_uuid' | 'argv' | 'status'>,
    Partial<
        Pick<
            DbLearnCommand,
            'status' | 'exit_code' | 'pat_uuid' | 'started_at' | 'finished_at'
        >
    >
>;

export const LearnCommandOutputTableName = 'learn_command_output';
export type DbLearnCommandOutput = {
    command_uuid: string;
    seq: number;
    stream: 'stdout' | 'stderr';
    text: string;
};
export type LearnCommandOutputTable =
    Knex.CompositeTableType<DbLearnCommandOutput>;
