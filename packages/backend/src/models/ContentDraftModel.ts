import { Knex } from 'knex';
import {
    ContentDraftsTableName,
    type DbContentDraft,
} from '../database/entities/contentDrafts';

export type ContentDraft = {
    uuid: string;
    authorName: string | null;
    projectUuid: string;
    contentType: string;
    contentUuid: string;
    slug: string;
    authorUserUuid: string;
    draft: object;
    status: string;
    prUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
};

type ContentDraftModelArguments = {
    database: Knex;
};

const parseRow = (
    row: DbContentDraft & { author_name?: string | null },
): ContentDraft => ({
    uuid: row.content_draft_uuid,
    authorName: row.author_name ?? null,
    projectUuid: row.project_uuid,
    contentType: row.content_type,
    contentUuid: row.content_uuid,
    slug: row.slug,
    authorUserUuid: row.author_user_uuid,
    draft: row.draft,
    status: row.status,
    prUrl: row.pr_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

export class ContentDraftModel {
    private readonly database: Knex;

    constructor({ database }: ContentDraftModelArguments) {
        this.database = database;
    }

    async upsertOpenDraft(args: {
        projectUuid: string;
        contentType: string;
        contentUuid: string;
        slug: string;
        authorUserUuid: string;
        draft: object;
    }): Promise<ContentDraft> {
        const existing = await this.database(ContentDraftsTableName)
            .where({
                project_uuid: args.projectUuid,
                content_type: args.contentType,
                content_uuid: args.contentUuid,
                author_user_uuid: args.authorUserUuid,
                status: 'open',
            })
            .first();
        if (existing) {
            // Saves carry partial payloads — the dashboard update modal sends
            // only name, description and palette — so replacing the draft
            // would silently discard tiles or filters the author drafted
            // earlier. `||` merges shallowly in a single statement, so
            // concurrent saves cannot lose a field between read and write.
            const [row] = await this.database(ContentDraftsTableName)
                .where({ content_draft_uuid: existing.content_draft_uuid })
                .update({
                    draft: this.database.raw('draft || ?::jsonb', [
                        JSON.stringify(args.draft),
                    ]),
                    updated_at: new Date(),
                })
                .returning('*');
            return parseRow(row);
        }
        const now = new Date();
        const [row] = await this.database(ContentDraftsTableName)
            .insert({
                project_uuid: args.projectUuid,
                content_type: args.contentType,
                content_uuid: args.contentUuid,
                slug: args.slug,
                author_user_uuid: args.authorUserUuid,
                draft: args.draft,
                // Same clock as updates, so relative times stay consistent
                created_at: now,
                updated_at: now,
            })
            .returning('*');
        return parseRow(row);
    }

    async findOpenDraft(
        projectUuid: string,
        contentType: string,
        contentUuid: string,
        authorUserUuid: string,
    ): Promise<ContentDraft | undefined> {
        const row = await this.database(ContentDraftsTableName)
            .where({
                project_uuid: projectUuid,
                content_type: contentType,
                content_uuid: contentUuid,
                author_user_uuid: authorUserUuid,
                status: 'open',
            })
            .first();
        return row ? parseRow(row) : undefined;
    }

    async listOpenForContent(
        projectUuid: string,
        contentType: string,
        contentUuid: string,
    ): Promise<ContentDraft[]> {
        const rows = await this.database(ContentDraftsTableName)
            .where({
                project_uuid: projectUuid,
                content_type: contentType,
                content_uuid: contentUuid,
                status: 'open',
            })
            .orderBy('updated_at', 'desc');
        return rows.map(parseRow);
    }

    async countOpenForContent(
        projectUuid: string,
        contentType: string,
        contentUuid: string,
        excludeAuthorUuid: string,
    ): Promise<number> {
        const [row] = await this.database(ContentDraftsTableName)
            .where({
                project_uuid: projectUuid,
                content_type: contentType,
                content_uuid: contentUuid,
                status: 'open',
            })
            .whereNot('author_user_uuid', excludeAuthorUuid)
            .count<{ count: string }[]>('* as count');
        return Number(row?.count ?? 0);
    }

    async get(uuid: string): Promise<ContentDraft | undefined> {
        const row = await this.database(ContentDraftsTableName)
            .leftJoin(
                'users',
                'users.user_uuid',
                `${ContentDraftsTableName}.author_user_uuid`,
            )
            .where({ content_draft_uuid: uuid })
            .select<DbContentDraft & { author_name: string | null }>(
                `${ContentDraftsTableName}.*`,
                this.database.raw(
                    "users.first_name || ' ' || users.last_name as author_name",
                ),
            )
            .first();
        return row ? parseRow(row) : undefined;
    }

    async listByProject(projectUuid: string): Promise<ContentDraft[]> {
        const rows = await this.database(ContentDraftsTableName)
            .leftJoin(
                'users',
                'users.user_uuid',
                `${ContentDraftsTableName}.author_user_uuid`,
            )
            .where(`${ContentDraftsTableName}.project_uuid`, projectUuid)
            .select<(DbContentDraft & { author_name: string | null })[]>(
                `${ContentDraftsTableName}.*`,
                this.database.raw(
                    "users.first_name || ' ' || users.last_name as author_name",
                ),
            )
            .orderBy('updated_at', 'desc');
        return rows.map(parseRow);
    }

    async update(
        uuid: string,
        update: { status?: string; prUrl?: string | null },
    ): Promise<void> {
        await this.database(ContentDraftsTableName)
            .where({ content_draft_uuid: uuid })
            .update({
                ...(update.status !== undefined && { status: update.status }),
                ...(update.prUrl !== undefined && { pr_url: update.prUrl }),
                updated_at: new Date(),
            });
    }
}
