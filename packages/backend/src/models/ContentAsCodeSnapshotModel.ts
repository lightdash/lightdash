import { ContentAsCodeType } from '@lightdash/common';
import { Knex } from 'knex';
import { ContentAsCodeSnapshotsTableName } from '../database/entities/contentAsCodeSnapshots';

// Knowledge documents are not a content-as-code resource of their own: they
// ride inside the agent upload, keyed by `<agent slug>/<document name>`.
export const AI_AGENT_KNOWLEDGE_DOCUMENT_SNAPSHOT_TYPE =
    'ai_agent_knowledge_document';

export type ContentAsCodeSnapshotType =
    | ContentAsCodeType.CHART
    | ContentAsCodeType.SQL_CHART
    | ContentAsCodeType.DASHBOARD
    | typeof AI_AGENT_KNOWLEDGE_DOCUMENT_SNAPSHOT_TYPE;

export const getKnowledgeDocumentSnapshotSlug = (
    agentSlug: string,
    documentName: string,
): string => `${agentSlug}/${documentName}`;

type ContentAsCodeSnapshotModelArguments = {
    database: Knex;
};

export type ContentAsCodeSnapshot = {
    snapshot: object;
    snapshotHash: string;
    appliedAt: Date;
    // Where the item lives in the repo, when the applying client said
    filePath: string | null;
};

export class ContentAsCodeSnapshotModel {
    private readonly database: Knex;

    constructor({ database }: ContentAsCodeSnapshotModelArguments) {
        this.database = database;
    }

    async get(
        projectUuid: string,
        contentType: ContentAsCodeSnapshotType,
        slug: string,
    ): Promise<ContentAsCodeSnapshot | undefined> {
        const row = await this.database(ContentAsCodeSnapshotsTableName)
            .where({
                project_uuid: projectUuid,
                content_type: contentType,
                slug,
            })
            .first();
        if (row === undefined) return undefined;
        return {
            snapshot: row.snapshot,
            snapshotHash: row.snapshot_hash,
            appliedAt: row.applied_at,
            filePath: row.file_path,
        };
    }

    async upsert({
        projectUuid,
        contentType,
        slug,
        snapshot,
        snapshotHash,
        appliedByUserUuid,
        filePath,
    }: {
        projectUuid: string;
        contentType: ContentAsCodeSnapshotType;
        slug: string;
        snapshot: object;
        snapshotHash: string;
        appliedByUserUuid: string | null;
        // null: the client did not say, keep whatever is stored
        filePath: string | null;
    }): Promise<void> {
        const filePathColumn = filePath === null ? {} : { file_path: filePath };
        await this.database(ContentAsCodeSnapshotsTableName)
            .insert({
                project_uuid: projectUuid,
                content_type: contentType,
                slug,
                snapshot,
                snapshot_hash: snapshotHash,
                applied_by_user_uuid: appliedByUserUuid,
                ...filePathColumn,
            })
            .onConflict(['project_uuid', 'content_type', 'slug'])
            .merge({
                snapshot,
                snapshot_hash: snapshotHash,
                applied_at: this.database.fn.now(),
                applied_by_user_uuid: appliedByUserUuid,
                ...filePathColumn,
            });
    }

    async findSlugs(
        projectUuid: string,
        contentType: ContentAsCodeSnapshotType,
        slugs: string[],
    ): Promise<Set<string>> {
        if (slugs.length === 0) return new Set();
        const rows = await this.database(ContentAsCodeSnapshotsTableName)
            .select('slug')
            .where({ project_uuid: projectUuid, content_type: contentType })
            .whereIn('slug', slugs);
        return new Set(rows.map((row) => row.slug));
    }

    async delete(
        projectUuid: string,
        contentType: ContentAsCodeSnapshotType,
        slug: string,
    ): Promise<void> {
        await this.database(ContentAsCodeSnapshotsTableName)
            .where({
                project_uuid: projectUuid,
                content_type: contentType,
                slug,
            })
            .delete();
    }
}
