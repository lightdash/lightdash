import { type Knex } from 'knex';
import {
    LearnCommandOutputTableName,
    LearnCommandsTableName,
    LearnWorkspaceFilesTableName,
    type DbLearnCommand,
} from '../database/entities/learnSandbox';

const ACTIVE: DbLearnCommand['status'][] = ['queued', 'running'];
const FINISHED: DbLearnCommand['status'][] = ['done', 'error', 'timeout'];

const parseArgv = (argv: DbLearnCommand['argv']): string[] => {
    if (Array.isArray(argv)) {
        return argv;
    }
    // knex-mock-client returns jsonb columns as raw strings in tests; pg
    // parses jsonb automatically in production, so this is a defensive fallback.
    return JSON.parse(argv as unknown as string) as string[];
};

const mapCommand = (row: DbLearnCommand): DbLearnCommand => ({
    ...row,
    argv: parseArgv(row.argv),
});

export class LearnWorkspaceModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async listFiles(
        projectUuid: string,
    ): Promise<{ path: string; content: string }[]> {
        return this.database(LearnWorkspaceFilesTableName)
            .select('path', 'content')
            .where('project_uuid', projectUuid)
            .orderBy('path');
    }

    async getFile(
        projectUuid: string,
        path: string,
    ): Promise<{ path: string; content: string } | undefined> {
        return this.database(LearnWorkspaceFilesTableName)
            .select('path', 'content')
            .where({ project_uuid: projectUuid, path })
            .first();
    }

    async upsertFile(
        projectUuid: string,
        path: string,
        content: string,
    ): Promise<void> {
        await this.database(LearnWorkspaceFilesTableName)
            .insert({ project_uuid: projectUuid, path, content })
            .onConflict(['project_uuid', 'path'])
            .merge({ content, updated_at: this.database.fn.now() });
    }

    async createCommand({
        projectUuid,
        userUuid,
        argv,
    }: {
        projectUuid: string;
        userUuid: string;
        argv: string[];
    }): Promise<{ commandUuid: string }> {
        const [row] = await this.database(LearnCommandsTableName)
            .insert({
                project_uuid: projectUuid,
                user_uuid: userUuid,
                argv: JSON.stringify(argv) as unknown as string[],
                status: 'queued',
            })
            .returning('command_uuid');
        return { commandUuid: row.command_uuid };
    }

    async getCommand(commandUuid: string): Promise<DbLearnCommand | undefined> {
        const row = await this.database(LearnCommandsTableName)
            .where('command_uuid', commandUuid)
            .first();
        return row ? mapCommand(row) : undefined;
    }

    async findActiveCommand(
        projectUuid: string,
    ): Promise<DbLearnCommand | undefined> {
        const row = await this.database(LearnCommandsTableName)
            .where('project_uuid', projectUuid)
            .whereIn('status', ACTIVE)
            .first();
        return row ? mapCommand(row) : undefined;
    }

    async updateCommand(
        commandUuid: string,
        patch: Partial<
            Pick<
                DbLearnCommand,
                | 'status'
                | 'exit_code'
                | 'pat_uuid'
                | 'started_at'
                | 'finished_at'
            >
        >,
    ): Promise<void> {
        await this.database(LearnCommandsTableName)
            .where('command_uuid', commandUuid)
            .update(patch);
    }

    async appendOutput(
        commandUuid: string,
        chunks: { seq: number; stream: 'stdout' | 'stderr'; text: string }[],
    ): Promise<void> {
        if (chunks.length === 0) {
            return;
        }
        await this.database(LearnCommandOutputTableName).insert(
            chunks.map((chunk) => ({
                command_uuid: commandUuid,
                ...chunk,
            })),
        );
    }

    async readOutput(
        commandUuid: string,
        afterSeq: number,
    ): Promise<{ seq: number; stream: 'stdout' | 'stderr'; text: string }[]> {
        return this.database(LearnCommandOutputTableName)
            .select('seq', 'stream', 'text')
            .where('command_uuid', commandUuid)
            .andWhere('seq', '>', afterSeq)
            .orderBy('seq', 'asc');
    }

    async listCommandsWithTokens(): Promise<
        Pick<DbLearnCommand, 'command_uuid' | 'pat_uuid' | 'status'>[]
    > {
        return this.database(LearnCommandsTableName)
            .select('command_uuid', 'pat_uuid', 'status')
            .whereNotNull('pat_uuid')
            .whereIn('status', FINISHED);
    }

    async clearToken(commandUuid: string): Promise<void> {
        await this.database(LearnCommandsTableName)
            .where('command_uuid', commandUuid)
            .update({ pat_uuid: null });
    }
}
