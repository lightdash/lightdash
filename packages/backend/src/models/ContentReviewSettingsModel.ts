import {
    type ContentReviewSettings,
    type UpdateContentReviewSettings,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    ContentReviewSettingsTableName,
    type DbContentReviewSettings,
} from '../database/entities/contentReviewSettings';

type ContentReviewSettingsModelArguments = {
    database: Knex;
};

const parseRow = (row: DbContentReviewSettings): ContentReviewSettings => ({
    projectUuid: row.project_uuid,
    reviewerGroupUuid: row.reviewer_group_uuid,
    verifyOnApproveDefault: row.verify_on_approve_default,
    slackChannelId: row.slack_channel_id,
});

export const getDefaultContentReviewSettings = (
    projectUuid: string,
): ContentReviewSettings => ({
    projectUuid,
    reviewerGroupUuid: null,
    verifyOnApproveDefault: true,
    slackChannelId: null,
});

export class ContentReviewSettingsModel {
    private readonly database: Knex;

    constructor({ database }: ContentReviewSettingsModelArguments) {
        this.database = database;
    }

    async get(projectUuid: string): Promise<ContentReviewSettings> {
        const row = await this.database(ContentReviewSettingsTableName)
            .where('project_uuid', projectUuid)
            .first();
        return row
            ? parseRow(row)
            : getDefaultContentReviewSettings(projectUuid);
    }

    async upsert(
        projectUuid: string,
        update: UpdateContentReviewSettings,
    ): Promise<ContentReviewSettings> {
        const current = await this.get(projectUuid);
        const next: ContentReviewSettings = { ...current, ...update };
        const [row] = await this.database(ContentReviewSettingsTableName)
            .insert({
                project_uuid: projectUuid,
                reviewer_group_uuid: next.reviewerGroupUuid,
                verify_on_approve_default: next.verifyOnApproveDefault,
                slack_channel_id: next.slackChannelId,
            })
            .onConflict('project_uuid')
            .merge({
                reviewer_group_uuid: next.reviewerGroupUuid,
                verify_on_approve_default: next.verifyOnApproveDefault,
                slack_channel_id: next.slackChannelId,
                updated_at: this.database.fn.now(),
            })
            .returning('*');
        return parseRow(row);
    }
}
