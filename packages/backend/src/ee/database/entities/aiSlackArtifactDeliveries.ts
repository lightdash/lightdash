import { type ToolRunQueryArgsTransformed } from '@lightdash/common';
import { type Knex } from 'knex';

// Immutable execution references, not result rows or a request to rerun SQL.
type SlackArtifactExecution = {
    artifactUuid: string;
    versionUuid: string;
    queryUuid: string;
    rowLimit: number;
};

export type SlackRunQueryRenderInput = SlackArtifactExecution & {
    source: 'runQuery';
    queryTool: ToolRunQueryArgsTransformed;
};

/** queryUuid is the presented node's run; the chart comes from the artifact version. */
export type SlackComposerRenderInput = SlackArtifactExecution & {
    source: 'composer';
};

export type SlackArtifactRenderInput =
    | SlackRunQueryRenderInput
    | SlackComposerRenderInput;

/** Rows written before composer inputs have no source and are runQuery. */
export type StoredSlackArtifactRenderInput =
    | SlackArtifactRenderInput
    | Omit<SlackRunQueryRenderInput, 'source'>;

export const toSlackArtifactRenderInput = (
    input: StoredSlackArtifactRenderInput,
): SlackArtifactRenderInput =>
    'source' in input ? input : { ...input, source: 'runQuery' };

export const AiSlackArtifactDeliveriesTableName =
    'ai_slack_artifact_deliveries';

export type DbAiSlackArtifactDelivery = {
    ai_prompt_uuid: string;
    render_inputs: Record<string, StoredSlackArtifactRenderInput>;
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
