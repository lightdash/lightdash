import { ContentAsCodeType } from '@lightdash/common';
import { Knex } from 'knex';
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
}
