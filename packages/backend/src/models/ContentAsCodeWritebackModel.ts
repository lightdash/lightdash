import type { ContentAsCodeWritebackStatus } from '@lightdash/common';
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
    contentDraftUuid: string | null;
    branch: string;
    prNumber: number | null;
    prUrl: string | null;
    status: ContentAsCodeWritebackStatus;
    error: string | null;
    createdByUserUuid: string | null;
    createdAt: Date;
    updatedAt: Date;
};

// 'pending' = row created, PR not opened yet; 'open' = PR live on the repo.
// 'merged'/'closed' rows are history; a new write-back then starts a fresh row.

type ContentAsCodeWritebackModelArguments = {
    database: Knex;
};

const parseRow = (row: DbContentAsCodeWriteback): ContentAsCodeWriteback => ({
    uuid: row.content_as_code_writeback_uuid,
    projectUuid: row.project_uuid,
    contentType: row.content_type,
    slug: row.slug,
    contentDraftUuid: row.content_draft_uuid,
    branch: row.branch,
    prNumber: row.pr_number,
    prUrl: row.pr_url,
    status: row.status as ContentAsCodeWritebackStatus,
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

    // Recovery lookup: the newest row that ever carried a PR for this
    // branch, live or not — used to adopt an existing PR after a row was
    // lost to an error
    async findLatestForBranch(
        projectUuid: string,
        contentType: string,
        slug: string,
        branch: string,
    ): Promise<ContentAsCodeWriteback | undefined> {
        const row = await this.database(ContentAsCodeWritebacksTableName)
            .where({
                project_uuid: projectUuid,
                content_type: contentType,
                slug,
                branch,
            })
            .whereNotNull('pr_number')
            .orderBy('updated_at', 'desc')
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
        contentDraftUuid: string | null;
        branch: string;
        createdByUserUuid: string | null;
    }): Promise<ContentAsCodeWriteback> {
        const [row] = await this.database(ContentAsCodeWritebacksTableName)
            .insert({
                project_uuid: args.projectUuid,
                content_type: args.contentType,
                slug: args.slug,
                content_draft_uuid: args.contentDraftUuid,
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
