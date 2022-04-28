import { Knex } from 'knex';

export const JobsTableName = 'jobs';
export const JobStepsTableName = 'job_steps';

export type DbJobs = {
    job_uuid: string;
    project_uuid: string;
    created_at: Date;
    updated_at: Date;
    job_status: string;
};

export type JobsTable = Knex.CompositeTableType<DbJobs>;

export type DbJobSteps = {
    job_uuid: string;
    created_at: Date;
    step_status: string;
    step_type: string;
    step_label: string;
};

export type JobStepsTable = Knex.CompositeTableType<DbJobSteps>;
