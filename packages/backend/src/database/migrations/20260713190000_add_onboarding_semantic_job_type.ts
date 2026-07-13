import { Knex } from 'knex';

const JobTypesTableName = 'job_types';
const OnboardingSemanticJobType = 'ONBOARDING_SEMANTIC';

export async function up(knex: Knex): Promise<void> {
    await knex(JobTypesTableName).insert({
        job_type: OnboardingSemanticJobType,
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex(JobTypesTableName)
        .where('job_type', OnboardingSemanticJobType)
        .delete();
}
