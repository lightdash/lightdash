import { Knex } from 'knex';

type DbOnboarding = {
    onboarding_id: number;
    organization_id: number;
    ranQuery_at: Date | null;
    shownSuccess_at: Date | null;
};

type CreateDbOnboarding = Pick<
    DbOnboarding,
    'organization_id' | 'ranQuery_at' | 'shownSuccess_at'
>;

type UpdateDbOnboarding = Partial<
    Pick<DbOnboarding, 'ranQuery_at' | 'shownSuccess_at'>
>;

export const OnboardingTableName = 'onboarding';
export type OnboardingTable = Knex.CompositeTableType<
    DbOnboarding,
    CreateDbOnboarding,
    UpdateDbOnboarding
>;
