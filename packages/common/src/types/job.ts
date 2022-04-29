export const enum JobStatusType {
    STARTED = 'STARTED',
    DONE = 'DONE',
    RUNNING = 'RUNNING',
    ERROR = 'ERROR',
}

export const enum JobStepStatusType {
    STARTED = 'STARTED',
    DONE = 'DONE',
    RUNNING = 'RUNNING',
    ERROR = 'ERROR',
    PENDING = 'PENDING',
    SKIPPED = 'SKIPPED',
}
export const enum JobStepType {
    /* CLONING = 'CLONING',
    INSTALLING_DEPENDENCIES = 'INSTALLING_DEPENDENCIES',
    COMPILING_DBT = 'COMPILING_DBT',
    GETTING_SCHEMA = 'GETTING_SCHEMA',
    COMPILING_METRICS = 'COMPILING_METRICS', */
    TESTING_ADAPTOR = 'TESTING_ADAPTOR',
    COMPILING = 'COMPILING',
    CREATING_PROJECT = 'CREATING_PROJECT',
    CACHING = 'CACHING',
}

export const JobLabels = {
    /* CLONING: 'Cloning dbt project from Github',
    INSTALLING_DEPENDENCIES: 'Installing dbt project dependencies',
    COMPILING_DBT: 'Compiling dbt project',
    GETTING_SCHEMA: 'Getting latest data warehouse schema',
    COMPILING_METRICS: 'Compiling metrics & dimensions', */
    TESTING_ADAPTOR: 'Testing adaptor',
    COMPILING: 'Compiling',
    CREATING_PROJECT: 'Creating project',
    CACHING: 'Saving cache',
};

export type Job = {
    jobUuid: string;
    projectUuid: string;
    createdAt: Date;
    updatedAt: Date;
    jobStatus: JobStatusType;
    jobResults?: string;
    steps: JobStep[];
};

export type JobStep = {
    jobUuid: string;
    createdAt: Date;
    updatedAt: Date;
    stepStatus: JobStepStatusType;
    stepType: JobStepType;
    stepLabel: string;
};
