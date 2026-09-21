import { type Knex } from 'knex';
import {
    AiPromptTableName,
    AiSlackPromptTableName,
} from '../database/entities/ai';
import { AiArtifactVersionsTableName } from '../database/entities/aiArtifacts';
import {
    AiSlackArtifactDeliveriesTableName as TABLE,
    type DbAiSlackArtifactDelivery,
    type SlackArtifactRenderInput,
} from '../database/entities/aiSlackArtifactDeliveries';

export const SLACK_ARTIFACT_DELIVERY_MAX_ATTEMPTS = 6;

/** Durable outbox for optional images. The prompt's answer is independent of
 * rendering/delivery, and deleting the prompt cascades this state away. */
export class AiSlackArtifactDeliveryModel {
    constructor(private readonly database: Knex) {}

    async register(
        promptUuid: string,
        input: SlackArtifactRenderInput,
    ): Promise<boolean> {
        const serialized = JSON.stringify({ [input.versionUuid]: input });
        if (
            Buffer.byteLength(serialized) > 256_000 ||
            !Number.isSafeInteger(input.rowLimit) ||
            input.rowLimit < 1 ||
            input.rowLimit > 100_000
        )
            return false;

        // Validate attribution in the write itself. A version from another
        // prompt, or a web-only prompt, can never enter this Slack outbox.
        const { rows } = await this.database.raw<{
            rows: Array<{ ai_prompt_uuid: string }>;
        }>(
            `
            INSERT INTO ${TABLE} (ai_prompt_uuid, render_inputs)
            SELECT v.ai_prompt_uuid, ?::jsonb
            FROM ${AiArtifactVersionsTableName} v
            JOIN ${AiSlackPromptTableName} s ON s.ai_prompt_uuid = v.ai_prompt_uuid
            WHERE v.ai_prompt_uuid = ? AND v.ai_artifact_version_uuid = ? AND v.ai_artifact_uuid = ?
            ON CONFLICT (ai_prompt_uuid) DO UPDATE SET
                render_inputs = excluded.render_inputs || ${TABLE}.render_inputs,
                updated_at = now()
            WHERE ${TABLE}.finished_at IS NULL
              AND octet_length((excluded.render_inputs || ${TABLE}.render_inputs)::text) <= 2000000
            RETURNING ai_prompt_uuid
        `,
            [serialized, promptUuid, input.versionUuid, input.artifactUuid],
        );
        return rows.length > 0;
    }

    async get(
        promptUuid: string,
    ): Promise<DbAiSlackArtifactDelivery | undefined> {
        return this.database(TABLE).where('ai_prompt_uuid', promptUuid).first();
    }

    async claim(
        promptUuid: string,
    ): Promise<DbAiSlackArtifactDelivery | undefined> {
        // The scheduler serializes jobs per prompt. The persisted counter also
        // bounds attempts across outbox sweeps and replacement jobs.
        const [row] = await this.database(TABLE)
            .where('ai_prompt_uuid', promptUuid)
            .whereNull('finished_at')
            .where('attempts', '<', SLACK_ARTIFACT_DELIVERY_MAX_ATTEMPTS)
            .update({
                attempts: this.database.raw('attempts + 1'),
                updated_at: this.database.fn.now(),
            })
            .returning('*');
        return row;
    }

    async setMessage(promptUuid: string, messageTs: string): Promise<void> {
        await this.database(TABLE)
            .where('ai_prompt_uuid', promptUuid)
            .whereNull('finished_at')
            .update({
                message_ts: messageTs,
                updated_at: this.database.fn.now(),
            });
    }

    async saveImage(
        promptUuid: string,
        versionUuid: string,
        url: string,
    ): Promise<void> {
        await this.database(TABLE)
            .where('ai_prompt_uuid', promptUuid)
            .whereNull('finished_at')
            .whereRaw('jsonb_exists(render_inputs, ?)', [versionUuid])
            .update({
                rendered_images: this.database.raw(
                    '?::jsonb || rendered_images',
                    [JSON.stringify({ [versionUuid]: url })],
                ),
                updated_at: this.database.fn.now(),
            });
    }

    async finish(
        promptUuid: string,
        outcome: NonNullable<DbAiSlackArtifactDelivery['outcome']>,
        attempt?: number,
    ): Promise<void> {
        await this.database(TABLE)
            .where('ai_prompt_uuid', promptUuid)
            .whereNull('finished_at')
            .modify((query) => {
                if (attempt !== undefined) query.where('attempts', attempt);
            })
            .update({
                outcome,
                finished_at: this.database.fn.now(),
                updated_at: this.database.fn.now(),
            });
    }

    async findPending(now = new Date()): Promise<string[]> {
        // A hard worker exit can leave its final attempt unfinished. Close a
        // bounded batch after twice the worker timeout; expired outboxes must
        // also stop retrying once their original query cache may be gone.
        const staleBefore = new Date(now.getTime() - 120_000);
        const expiresBefore = new Date(now.getTime() - 86_400_000);
        await this.database(TABLE)
            .whereIn(
                'ai_prompt_uuid',
                this.database(TABLE)
                    .select('ai_prompt_uuid')
                    .whereNull('finished_at')
                    .where('updated_at', '<', staleBefore)
                    .andWhere((query) =>
                        query
                            .where(
                                'attempts',
                                '>=',
                                SLACK_ARTIFACT_DELIVERY_MAX_ATTEMPTS,
                            )
                            .orWhere('created_at', '<=', expiresBefore),
                    )
                    .orderBy('updated_at', 'asc')
                    .limit(100),
            )
            .whereNull('finished_at')
            .where('updated_at', '<', staleBefore)
            .update({
                outcome: 'unavailable',
                finished_at: now,
                updated_at: now,
            });
        const rows = await this.database(TABLE)
            .join(
                AiPromptTableName,
                `${AiPromptTableName}.ai_prompt_uuid`,
                `${TABLE}.ai_prompt_uuid`,
            )
            .whereNull('finished_at')
            .whereNotNull(`${AiPromptTableName}.response`)
            .whereNull(`${AiPromptTableName}.error_message`)
            .where('attempts', '<', SLACK_ARTIFACT_DELIVERY_MAX_ATTEMPTS)
            .where(`${TABLE}.created_at`, '>', expiresBefore)
            .where(`${TABLE}.updated_at`, '<', new Date(now.getTime() - 60_000))
            .orderBy(`${TABLE}.updated_at`, 'asc')
            .limit(100)
            .select(`${TABLE}.ai_prompt_uuid`);
        return rows.map(({ ai_prompt_uuid }) => ai_prompt_uuid);
    }
}
