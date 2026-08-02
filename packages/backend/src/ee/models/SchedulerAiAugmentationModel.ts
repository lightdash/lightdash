import { SchedulerAiAugmentation } from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbSchedulerAiAugmentation,
    SchedulerAiAugmentationTableName,
} from '../database/entities/schedulerAiAugmentation';

const fromRow = (row: DbSchedulerAiAugmentation): SchedulerAiAugmentation => {
    if (row.augmentation_type === 'agent') {
        return {
            type: 'agent',
            prompt: row.prompt,
            // agent_uuid is guaranteed non-null for 'agent' rows by the
            // scheduler_ai_augmentation_shape check constraint.
            agentUuid: row.agent_uuid!,
            sourceThreadUuid: row.source_thread_uuid,
        };
    }
    return {
        type: 'fast_model',
        prompt: row.prompt,
    };
};

const toRow = (
    schedulerUuid: string,
    augmentation: SchedulerAiAugmentation,
): Pick<
    DbSchedulerAiAugmentation,
    | 'scheduler_uuid'
    | 'augmentation_type'
    | 'prompt'
    | 'agent_uuid'
    | 'source_thread_uuid'
> => ({
    scheduler_uuid: schedulerUuid,
    augmentation_type: augmentation.type,
    prompt: augmentation.prompt,
    agent_uuid: augmentation.type === 'agent' ? augmentation.agentUuid : null,
    source_thread_uuid:
        augmentation.type === 'agent' ? augmentation.sourceThreadUuid : null,
});

export class SchedulerAiAugmentationModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async find(schedulerUuid: string): Promise<SchedulerAiAugmentation | null> {
        const row = await this.database(SchedulerAiAugmentationTableName)
            .where('scheduler_uuid', schedulerUuid)
            .first();
        return row ? fromRow(row) : null;
    }

    async findMany(
        schedulerUuids: string[],
    ): Promise<Record<string, SchedulerAiAugmentation>> {
        if (schedulerUuids.length === 0) return {};
        const rows = await this.database(SchedulerAiAugmentationTableName)
            .whereIn('scheduler_uuid', schedulerUuids)
            .select('*');
        return Object.fromEntries(
            rows.map((row) => [row.scheduler_uuid, fromRow(row)]),
        );
    }

    async upsert(
        schedulerUuid: string,
        augmentation: SchedulerAiAugmentation,
    ): Promise<void> {
        const row = toRow(schedulerUuid, augmentation);
        await this.database(SchedulerAiAugmentationTableName)
            .insert(row)
            .onConflict('scheduler_uuid')
            .merge({
                augmentation_type: row.augmentation_type,
                prompt: row.prompt,
                agent_uuid: row.agent_uuid,
                source_thread_uuid: row.source_thread_uuid,
                updated_at: this.database.fn.now(),
            });
    }

    async delete(schedulerUuid: string): Promise<void> {
        await this.database(SchedulerAiAugmentationTableName)
            .where('scheduler_uuid', schedulerUuid)
            .delete();
    }
}
