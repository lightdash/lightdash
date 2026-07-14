import { Knex } from 'knex';

const JobTypesTableName = 'job_types';
const OnboardingDashboardJobType = 'ONBOARDING_DASHBOARD';

export async function up(knex: Knex): Promise<void> {
    await knex(JobTypesTableName).insert({
        job_type: OnboardingDashboardJobType,
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex(JobTypesTableName)
        .where('job_type', OnboardingDashboardJobType)
        .delete();
}
