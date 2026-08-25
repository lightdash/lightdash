import { type ContentAsCodeAppliedRevision } from '@lightdash/common';
import { Knex } from 'knex';
import {
    ContentAsCodeAppliedRevisionsTableName,
    type DbContentAsCodeAppliedRevision,
} from '../database/entities/contentAsCodeAppliedRevisions';

type ContentAsCodeAppliedRevisionModelArguments = {
    database: Knex;
};

type AppliedRevisionInput = {
    contentType: ContentAsCodeAppliedRevision['contentType'];
    slug: string;
    contentHash: string;
};

const mapDbRevision = (
    row: DbContentAsCodeAppliedRevision,
): ContentAsCodeAppliedRevision => ({
    contentType:
        row.content_type as ContentAsCodeAppliedRevision['contentType'],
    slug: row.slug,
    contentHash: row.content_hash,
    appliedAt: row.applied_at,
    appliedByUserUuid: row.applied_by_user_uuid,
});

export class ContentAsCodeAppliedRevisionModel {
    readonly database: Knex;

    constructor(args: ContentAsCodeAppliedRevisionModelArguments) {
        this.database = args.database;
    }

    async upsertMany(
        projectUuid: string,
        appliedByUserUuid: string | null,
        revisions: AppliedRevisionInput[],
    ): Promise<void> {
        if (revisions.length === 0) {
            return;
        }

        const appliedAt = new Date();
        await this.database(ContentAsCodeAppliedRevisionsTableName)
            .insert(
                revisions.map((revision) => ({
                    project_uuid: projectUuid,
                    content_type: revision.contentType,
                    slug: revision.slug,
                    content_hash: revision.contentHash,
                    applied_at: appliedAt,
                    applied_by_user_uuid: appliedByUserUuid,
                })),
            )
            .onConflict(['project_uuid', 'content_type', 'slug'])
            .merge(['content_hash', 'applied_at', 'applied_by_user_uuid']);
    }

    async listByProject(
        projectUuid: string,
    ): Promise<ContentAsCodeAppliedRevision[]> {
        const rows = await this.database(
            ContentAsCodeAppliedRevisionsTableName,
        )
            .select('*')
            .where('project_uuid', projectUuid)
            .orderBy('applied_at', 'desc')
            .orderBy('slug', 'asc');

        return rows.map(mapDbRevision);
    }
}
