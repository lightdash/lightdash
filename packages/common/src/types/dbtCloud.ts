export enum DbtCloudRunStatus {
    QUEUED = 1,
    STARTING = 2,
    RUNNING = 3,
    SUCCESS = 10,
    ERROR = 20,
    CANCELLED = 30,
}

export const TERMINAL_RUN_STATUSES = [
    DbtCloudRunStatus.SUCCESS,
    DbtCloudRunStatus.ERROR,
    DbtCloudRunStatus.CANCELLED,
] as const;

export type DbtCloudTriggerRunRequest = {
    jobId: string;
    gitBranch: string;
    cause?: string;
    stepsOverride?: string[];
};

export type DbtCloudTriggerRunResponse = {
    runId: number;
};

export type DbtCloudRunStatusResponse = {
    runId: number;
    status: DbtCloudRunStatus;
    statusHumanized: string;
    finishedAt: string | null;
};

export type DbtCloudJobResponse = {
    id: number;
    name: string;
    jobType: string;
    environmentId: number;
    executeSteps: string[];
    settings: {
        threads: number;
        targetName: string;
    };
    deferringEnvironmentId: number | null;
};

export type DbtCloudJobValidationResult = {
    isValid: boolean;
    errors: string[];
    job: DbtCloudJobResponse | null;
};

export const DEFAULT_DBT_CLOUD_BASE_URL = 'https://cloud.getdbt.com';
