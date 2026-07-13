import { Knex } from 'knex';

const JobTypesTableName = 'job_types';
const OnboardingProfileJobType = 'ONBOARDING_PROFILE';

export async function up(knex: Knex): Promise<void> {
    await knex(JobTypesTableName).insert({
        job_type: OnboardingProfileJobType,
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex(JobTypesTableName)
        .where('job_type', OnboardingProfileJobType)
        .delete();
}
