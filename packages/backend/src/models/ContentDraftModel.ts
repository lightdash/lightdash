import {
    type ChartAsCode,
    type ContentAsCodeWritebackStatus,
    type DashboardAsCode,
} from '@lightdash/common';
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
    writebackStatus: ContentAsCodeWritebackStatus | null;
    writtenBackPublished: ChartAsCode | DashboardAsCode | null;
    writtenBackDraft: ChartAsCode | DashboardAsCode | null;
    // The upload snapshot the draft started from, and the slug's current one
    baseSnapshot: object | null;
    baseSnapshotHash: string | null;
    currentSnapshotHash: string | null;
    createdAt: Date;
    updatedAt: Date;
};

export type ContentDraftBase = { snapshot: object; hash: string };

// Save payloads carry every field of their form, changed or not; a draft
// should only claim the fields the author actually changed
export const pruneUnchangedDraftFields = <T extends object>(
    published: object,
    fields: T,
): T =>
    Object.fromEntries(
        Object.entries(fields).filter(
            ([key, value]) =>
                !(key in published) ||
                JSON.stringify(value) !==
                    JSON.stringify((published as Record<string, unknown>)[key]),
        ),
    ) as T;

type ContentDraftModelArguments = {
    database: Knex;
};

const parseRow = (
    row: DbContentDraft & {
        author_name?: string | null;
        writeback_status?: string | null;
        current_snapshot_hash?: string | null;
    },
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
    writebackStatus:
        (row.writeback_status as ContentAsCodeWritebackStatus | null) ?? null,
    writtenBackPublished:
        (row.written_back_published as ChartAsCode | DashboardAsCode | null) ??
        null,
    writtenBackDraft:
        (row.written_back_draft as ChartAsCode | DashboardAsCode | null) ??
        null,
    baseSnapshot: row.base_snapshot,
    baseSnapshotHash: row.base_snapshot_hash,
    currentSnapshotHash: row.current_snapshot_hash ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

// The slug's last-applied upload snapshot, to tell stale drafts apart
const currentSnapshotHashSubquery = (knex: Knex) =>
    knex.raw(
        `(select s.snapshot_hash from content_as_code_snapshots s where s.project_uuid = ${ContentDraftsTableName}.project_uuid and s.content_type = ${ContentDraftsTableName}.content_type and s.slug = ${ContentDraftsTableName}.slug) as current_snapshot_hash`,
    );

// The latest write-back row for a draft carries the PR state
const writebackStatusSubquery = (knex: Knex) =>
    knex.raw(
        `(select status from content_as_code_writebacks w where w.content_draft_uuid = ${ContentDraftsTableName}.content_draft_uuid order by w.created_at desc limit 1) as writeback_status`,
    );

// Called from the chart and dashboard model delete paths so every delete,
// including cascades, releases the drafts that pointed at the content
export const dismissOpenContentDrafts = async (
    database: Knex,
    contentType: 'chart' | 'dashboard',
    contentUuids: string[],
): Promise<number> => {
    if (contentUuids.length === 0) return 0;
    return database(ContentDraftsTableName)
        .where({ content_type: contentType, status: 'open' })
        .whereIn('content_uuid', contentUuids)
        .update({ status: 'dismissed', updated_at: new Date() });
};

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
        base: ContentDraftBase | null;
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
            // Drafts from before bases were recorded adopt one on their
            // next save; a recorded base is never moved by a save
            const adoptedBase =
                existing.base_snapshot_hash === null ? args.base : null;
            const [row] = await this.database(ContentDraftsTableName)
                .where({ content_draft_uuid: existing.content_draft_uuid })
                .update({
                    draft: this.database.raw('draft || ?::jsonb', [
                        JSON.stringify(args.draft),
                    ]),
                    ...(adoptedBase !== null && {
                        base_snapshot: adoptedBase.snapshot,
                        base_snapshot_hash: adoptedBase.hash,
                    }),
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
                base_snapshot: args.base?.snapshot ?? null,
                base_snapshot_hash: args.base?.hash ?? null,
                // Same clock as updates, so relative times stay consistent
                created_at: now,
                updated_at: now,
            })
            .returning('*');
        return parseRow(row);
    }

    // Moves the draft onto a newer upload snapshot, dropping the overlay keys
    // the author chose to take from the repo
    async rebase(
        uuid: string,
        args: { base: ContentDraftBase; removeKeys: string[] },
    ): Promise<void> {
        await this.database(ContentDraftsTableName)
            .where({ content_draft_uuid: uuid })
            .update({
                ...(args.removeKeys.length > 0 && {
                    draft: this.database.raw('draft - ?::text[]', [
                        args.removeKeys,
                    ]),
                }),
                base_snapshot: args.base.snapshot,
                base_snapshot_hash: args.base.hash,
                updated_at: new Date(),
            });
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

    async findLatestDismissedDraft(
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
                status: 'dismissed',
            })
            .orderBy('updated_at', 'desc')
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

    async countOpenByProject(projectUuid: string): Promise<number> {
        const [row] = await this.database(ContentDraftsTableName)
            .where({
                project_uuid: projectUuid,
                status: 'open',
            })
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
            .select<
                DbContentDraft & {
                    author_name: string | null;
                    writeback_status: string | null;
                    current_snapshot_hash: string | null;
                }
            >(
                `${ContentDraftsTableName}.*`,
                this.database.raw(
                    "users.first_name || ' ' || users.last_name as author_name",
                ),
                writebackStatusSubquery(this.database),
                currentSnapshotHashSubquery(this.database),
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
            .select<
                (DbContentDraft & {
                    author_name: string | null;
                    writeback_status: string | null;
                    current_snapshot_hash: string | null;
                })[]
            >(
                `${ContentDraftsTableName}.*`,
                this.database.raw(
                    "users.first_name || ' ' || users.last_name as author_name",
                ),
                writebackStatusSubquery(this.database),
                currentSnapshotHashSubquery(this.database),
            )
            .orderBy(`${ContentDraftsTableName}.updated_at`, 'desc');
        return rows.map(parseRow);
    }

    async update(
        uuid: string,
        update: {
            status?: string;
            prUrl?: string | null;
            writtenBackPublished?: ChartAsCode | DashboardAsCode | null;
            writtenBackDraft?: ChartAsCode | DashboardAsCode | null;
        },
    ): Promise<void> {
        await this.database(ContentDraftsTableName)
            .where({ content_draft_uuid: uuid })
            .update({
                ...(update.status !== undefined && { status: update.status }),
                ...(update.prUrl !== undefined && { pr_url: update.prUrl }),
                ...(update.writtenBackPublished !== undefined && {
                    written_back_published: update.writtenBackPublished,
                }),
                ...(update.writtenBackDraft !== undefined && {
                    written_back_draft: update.writtenBackDraft,
                }),
                updated_at: new Date(),
            });
    }
}
