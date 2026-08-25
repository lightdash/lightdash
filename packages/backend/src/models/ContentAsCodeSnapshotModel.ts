import { ContentAsCodeType } from '@lightdash/common';
import { Knex } from 'knex';
import { ContentAsCodeIncomingStashTableName } from '../database/entities/contentAsCodeIncomingStash';
import { ContentAsCodeSnapshotsTableName } from '../database/entities/contentAsCodeSnapshots';

export type ContentAsCodeSnapshotType =
    | ContentAsCodeType.CHART
    | ContentAsCodeType.SQL_CHART
    | ContentAsCodeType.DASHBOARD;

type ContentAsCodeSnapshotModelArguments = {
    database: Knex;
};

export type ContentAsCodeSnapshot = {
    snapshot: object;
    snapshotHash: string;
    appliedAt: Date;
};

export type ContentAsCodeIncomingStash = {
    contentType: string;
    slug: string;
    incomingSnapshot: object;
    incomingHash: string;
    rejectedAt: Date;
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
        };
    }

    async upsert({
        projectUuid,
        contentType,
        slug,
        snapshot,
        snapshotHash,
        appliedByUserUuid,
    }: {
        projectUuid: string;
        contentType: ContentAsCodeSnapshotType;
        slug: string;
        snapshot: object;
        snapshotHash: string;
        appliedByUserUuid: string | null;
    }): Promise<void> {
        await this.database(ContentAsCodeSnapshotsTableName)
            .insert({
                project_uuid: projectUuid,
                content_type: contentType,
                slug,
                snapshot,
                snapshot_hash: snapshotHash,
                applied_by_user_uuid: appliedByUserUuid,
            })
            .onConflict(['project_uuid', 'content_type', 'slug'])
            .merge({
                snapshot,
                snapshot_hash: snapshotHash,
                applied_at: this.database.fn.now(),
                applied_by_user_uuid: appliedByUserUuid,
            });
    }

    // The rejected incoming doc stashed at skip time: without it, post-deploy
    // conflict resolution in the UI would be impossible (upload discards what
    // it skipped)
    async stashIncoming(args: {
        projectUuid: string;
        contentType: ContentAsCodeSnapshotType;
        slug: string;
        incomingSnapshot: object;
        incomingHash: string;
    }): Promise<void> {
        await this.database(ContentAsCodeIncomingStashTableName)
            .insert({
                project_uuid: args.projectUuid,
                content_type: args.contentType,
                slug: args.slug,
                incoming_snapshot: args.incomingSnapshot,
                incoming_hash: args.incomingHash,
            })
            .onConflict(['project_uuid', 'content_type', 'slug'])
            .merge({
                incoming_snapshot: args.incomingSnapshot,
                incoming_hash: args.incomingHash,
                rejected_at: this.database.fn.now(),
            });
    }

    async getIncomingStash(
        projectUuid: string,
        contentType: ContentAsCodeSnapshotType,
        slug: string,
    ): Promise<ContentAsCodeIncomingStash | undefined> {
        const row = await this.database(ContentAsCodeIncomingStashTableName)
            .where({
                project_uuid: projectUuid,
                content_type: contentType,
                slug,
            })
            .first();
        if (row === undefined) return undefined;
        return {
            contentType: row.content_type,
            slug: row.slug,
            incomingSnapshot: row.incoming_snapshot,
            incomingHash: row.incoming_hash,
            rejectedAt: row.rejected_at,
        };
    }

    async listIncomingStash(
        projectUuid: string,
    ): Promise<ContentAsCodeIncomingStash[]> {
        const rows = await this.database(ContentAsCodeIncomingStashTableName)
            .where({ project_uuid: projectUuid })
            .orderBy('rejected_at', 'desc');
        return rows.map((row) => ({
            contentType: row.content_type,
            slug: row.slug,
            incomingSnapshot: row.incoming_snapshot,
            incomingHash: row.incoming_hash,
            rejectedAt: row.rejected_at,
        }));
    }

    async clearIncomingStash(
        projectUuid: string,
        contentType: ContentAsCodeSnapshotType,
        slug: string,
    ): Promise<void> {
        await this.database(ContentAsCodeIncomingStashTableName)
            .where({
                project_uuid: projectUuid,
                content_type: contentType,
                slug,
            })
            .delete();
    }
}
