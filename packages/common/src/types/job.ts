export type Job = {
    jobUuid: string;
    projectUuid: string;
    createdAt: Date;
    updatedAt: Date;
    jobStatus: string;
    jobResults?: string;
    steps: [];
};
