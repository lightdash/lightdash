import { type SchedulerJobStatus } from '@lightdash/common';
import { type Icon as TablerIconType } from '@tabler/icons-react';

export type TrackedJob = {
    jobId: string;
    status: SchedulerJobStatus;
    startedAt: Date;
    errorMessage: string | null;
};

export type RegisterJobsParams = {
    jobIds: string[];
    label?: string;
    showToast?: boolean;
    toastKey?: string;
    toastTitle?: string;
    toastIcon?: TablerIconType;
    onComplete?: (jobId: string) => void;
    onError?: (jobId: string, errorMessage: string) => void;
};

export type SchedulerJobsContextType = {
    jobs: TrackedJob[];
    registerJobs: (params: RegisterJobsParams) => void;
    hasActiveJobs: boolean;
};
