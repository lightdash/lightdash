import { type ToolRunQueryArgsTransformed } from '@lightdash/common';
import { type Knex } from 'knex';

// Immutable execution references, not result rows or a request to rerun SQL.
export type SlackArtifactRenderInput = {
    artifactUuid: string;
    versionUuid: string;
    queryUuid: string;
    rowLimit: number;
    queryTool: ToolRunQueryArgsTransformed;
};

export const AiSlackArtifactDeliveriesTableName =
    'ai_slack_artifact_deliveries';

export type DbAiSlackArtifactDelivery = {
    ai_prompt_uuid: string;
    render_inputs: Record<string, SlackArtifactRenderInput>;
    rendered_images: Record<string, string>;
    message_ts: string | null;
    attempts: number;
    outcome: 'delivered' | 'unavailable' | 'cancelled' | null;
    finished_at: Date | null;
    created_at: Date;
    updated_at: Date;
};

export type AiSlackArtifactDeliveriesTable = Knex.CompositeTableType<
    DbAiSlackArtifactDelivery,
    Pick<DbAiSlackArtifactDelivery, 'ai_prompt_uuid' | 'render_inputs'>,
    {
        [K in Exclude<
            keyof DbAiSlackArtifactDelivery,
            'ai_prompt_uuid' | 'created_at'
        >]?: DbAiSlackArtifactDelivery[K] | Knex.Raw;
    }
>;
