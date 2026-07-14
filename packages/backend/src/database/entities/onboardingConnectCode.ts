import { Knex } from 'knex';

export const OnboardingConnectCodeTableName = 'onboarding_connect_codes';

export type DbOnboardingConnectCode = {
    onboarding_connect_code_uuid: string;
    code_hash: string;
    project_uuid: string;
    created_by_user_uuid: string;
    expires_at: Date;
    used_at: Date | null;
    created_at: Date;
};

type CreateDbOnboardingConnectCode = Pick<
    DbOnboardingConnectCode,
    'code_hash' | 'project_uuid' | 'created_by_user_uuid' | 'expires_at'
>;

type UpdateDbOnboardingConnectCode = Pick<DbOnboardingConnectCode, 'used_at'>;

export type OnboardingConnectCodeTable = Knex.CompositeTableType<
    DbOnboardingConnectCode,
    CreateDbOnboardingConnectCode,
    UpdateDbOnboardingConnectCode
>;
