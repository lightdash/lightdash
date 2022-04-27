export const enum JobStatusType {
    STARTED = 'STARTED',
    DONE = 'DONE',
    RUNNING = 'RUNNING',
    ERROR = 'ERROR',
}

export type Job = {
    jobUuid: string;
    projectUuid: string;
    createdAt: Date;
    updatedAt: Date;
    jobStatus: JobStatusType;
    jobResults?: string;
    steps: [];
};
