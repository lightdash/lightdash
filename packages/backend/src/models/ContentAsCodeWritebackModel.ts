import { Knex } from 'knex';
import {
    ContentAsCodeWritebacksTableName,
    type DbContentAsCodeWriteback,
} from '../database/entities/contentAsCodeWritebacks';

export type ContentAsCodeWriteback = {
    uuid: string;
    projectUuid: string;
    contentType: string;
    slug: string;
    branch: string;
    prNumber: number | null;
    prUrl: string | null;
    status: string;
    error: string | null;
    createdByUserUuid: string | null;
    createdAt: Date;
    updatedAt: Date;
};

// 'pending' = job queued or PR not opened yet; 'open' = PR live on the repo.
// 'closed' rows are history; a new save then starts a fresh row.
export type ContentAsCodeWritebackStatus =
    | 'pending'
    | 'open'
    | 'closed'
    | 'error';

type ContentAsCodeWritebackModelArguments = {
    database: Knex;
};

const parseRow = (row: DbContentAsCodeWriteback): ContentAsCodeWriteback => ({
    uuid: row.content_as_code_writeback_uuid,
    projectUuid: row.project_uuid,
    contentType: row.content_type,
    slug: row.slug,
    branch: row.branch,
    prNumber: row.pr_number,
    prUrl: row.pr_url,
    status: row.status,
    error: row.error,
    createdByUserUuid: row.created_by_user_uuid,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

export class ContentAsCodeWritebackModel {
    private readonly database: Knex;

    constructor({ database }: ContentAsCodeWritebackModelArguments) {
        this.database = database;
    }

    async findLive(
        projectUuid: string,
        contentType: string,
        slug: string,
    ): Promise<ContentAsCodeWriteback | undefined> {
        const row = await this.database(ContentAsCodeWritebacksTableName)
            .where({
                project_uuid: projectUuid,
                content_type: contentType,
                slug,
            })
            .whereIn('status', ['pending', 'open'])
            .first();
        return row ? parseRow(row) : undefined;
    }

    async listByProject(
        projectUuid: string,
    ): Promise<ContentAsCodeWriteback[]> {
        const rows = await this.database(ContentAsCodeWritebacksTableName)
            .where({ project_uuid: projectUuid })
            .orderBy('updated_at', 'desc');
        return rows.map(parseRow);
    }

    async create(args: {
        projectUuid: string;
        contentType: string;
        slug: string;
        branch: string;
        createdByUserUuid: string | null;
    }): Promise<ContentAsCodeWriteback> {
        const [row] = await this.database(ContentAsCodeWritebacksTableName)
            .insert({
                project_uuid: args.projectUuid,
                content_type: args.contentType,
                slug: args.slug,
                branch: args.branch,
                status: 'pending',
                created_by_user_uuid: args.createdByUserUuid,
            })
            .returning('*');
        return parseRow(row);
    }

    async update(
        uuid: string,
        update: {
            prNumber?: number | null;
            prUrl?: string | null;
            status?: ContentAsCodeWritebackStatus;
            error?: string | null;
        },
    ): Promise<void> {
        await this.database(ContentAsCodeWritebacksTableName)
            .where({ content_as_code_writeback_uuid: uuid })
            .update({
                ...(update.prNumber !== undefined && {
                    pr_number: update.prNumber,
                }),
                ...(update.prUrl !== undefined && { pr_url: update.prUrl }),
                ...(update.status !== undefined && { status: update.status }),
                ...(update.error !== undefined && { error: update.error }),
                updated_at: new Date(),
            });
    }
}
