import { Knex } from 'knex';

export const UserOnboardingTableName = 'user_onboarding';

export type DbUserOnboarding = {
    user_uuid: string;
    completed_tours: Record<string, boolean>;
    created_at: Date;
    updated_at: Date;
};

export type UserOnboardingTable = Knex.CompositeTableType<
    DbUserOnboarding,
    Pick<DbUserOnboarding, 'user_uuid' | 'completed_tours'>,
    Pick<DbUserOnboarding, 'completed_tours' | 'updated_at'>
>;
