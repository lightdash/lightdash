import { type SchedulerAiAugmentationType } from '@lightdash/common';
import { Knex } from 'knex';

export const SchedulerAiAugmentationTableName = 'scheduler_ai_augmentation';

export type DbSchedulerAiAugmentation = {
    scheduler_uuid: string;
    augmentation_type: SchedulerAiAugmentationType;
    prompt: string;
    agent_uuid: string | null;
    source_thread_uuid: string | null;
    created_at: Date;
    updated_at: Date;
};

export type SchedulerAiAugmentationTable = Knex.CompositeTableType<
    DbSchedulerAiAugmentation,
    Pick<
        DbSchedulerAiAugmentation,
        | 'scheduler_uuid'
        | 'augmentation_type'
        | 'prompt'
        | 'agent_uuid'
        | 'source_thread_uuid'
    >,
    Partial<
        Pick<
            DbSchedulerAiAugmentation,
            | 'augmentation_type'
            | 'prompt'
            | 'agent_uuid'
            | 'source_thread_uuid'
            | 'updated_at'
        >
    >
>;
