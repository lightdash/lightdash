import { Knex } from 'knex';

export const UserLearnProgressTableName = 'user_learn_progress';

export type DbUserLearnProgress = {
    user_uuid: string;
    scope: string;
    first_started_at: Date;
    last_started_at: Date;
    completed_at: Date | null;
};

export type UserLearnProgressTable = Knex.CompositeTableType<
    DbUserLearnProgress,
    Pick<DbUserLearnProgress, 'user_uuid' | 'scope'> &
        Partial<
            Pick<
                DbUserLearnProgress,
                'first_started_at' | 'last_started_at' | 'completed_at'
            >
        >,
    Partial<Pick<DbUserLearnProgress, 'last_started_at' | 'completed_at'>>
>;
