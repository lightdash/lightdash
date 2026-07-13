import { OnboardingStepStatus, OnboardingStepType } from '@lightdash/common';
import { Knex } from 'knex';

export const OnboardingProjectStateTableName = 'onboarding_project_state';

export type DbOnboardingProjectState = {
    onboarding_project_state_uuid: string;
    project_uuid: string;
    step: OnboardingStepType;
    status: OnboardingStepStatus;
    result: Record<string, unknown> | null;
    created_at: Date;
    updated_at: Date;
};

type CreateDbOnboardingProjectState = Pick<
    DbOnboardingProjectState,
    'project_uuid' | 'step' | 'status'
> & {
    result: string | null;
};

type UpdateDbOnboardingProjectState = Pick<
    DbOnboardingProjectState,
    'status' | 'updated_at'
> & {
    result: string | null;
};

export type OnboardingProjectStateTable = Knex.CompositeTableType<
    DbOnboardingProjectState,
    CreateDbOnboardingProjectState,
    UpdateDbOnboardingProjectState
>;
