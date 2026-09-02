import {
    JobStatusType,
    JobStepStatusType,
    JobType,
    type ApiError,
    type ApiRefreshResults,
    type Job,
    type JobStep,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import useActiveJob from '../providers/ActiveJob/useActiveJob';
import useToaster from './toaster/useToaster';
import { useProjectUuid } from './useProjectUuid';

export const jobStepStatusLabel = (status: JobStepStatusType) => {
    switch (status) {
        case JobStepStatusType.DONE:
            return 'Completed';
        case JobStepStatusType.PENDING:
            return 'Pending';
        case JobStepStatusType.SKIPPED:
            return 'Skipped';
        case JobStepStatusType.ERROR:
            return 'Error';
        case JobStepStatusType.RUNNING:
            return 'Running';
        default:
            throw new Error('Unknown job step status');
    }
};
export const jobStatusLabel = (status: JobStatusType, jobType?: JobType) => {
    if (jobType === JobType.CREATE_PROJECT) {
        switch (status) {
            case JobStatusType.DONE:
                return 'Project created!';
            case JobStatusType.STARTED:
                return 'Pending project creation';
            case JobStatusType.ERROR:
                return 'Error while creating project';
            case JobStatusType.RUNNING:
                return 'Creating your project';
            default:
                throw new Error('Unknown job status');
        }
    }
    switch (status) {
        case JobStatusType.DONE:
            return 'Successfully synced dbt project!';
        case JobStatusType.STARTED:
            return 'Pending sync';
        case JobStatusType.ERROR:
            return 'Error while syncing dbt project';
        case JobStatusType.RUNNING:
            return 'Syncing dbt project';
        default:
            throw new Error('Unknown job status');
    }
};

export const getJobCompletionToast = (
    job: Job,
): { variant: 'success' | 'warning'; title: string } => {
    if (
        job.jobType === JobType.COMPILE_PROJECT &&
        job.jobResults?.errorCount !== undefined &&
        job.jobResults.errorCount > 0 &&
        job.jobResults.total !== undefined
    ) {
        return {
            variant: 'warning',
            title: `Synced: ${job.jobResults.errorCount} of ${job.jobResults.total} tables have errors`,
        };
    }

    return {
        variant: 'success',
        title: jobStatusLabel(job.jobStatus, job.jobType),
    };
};

export const runningStepsInfo = (steps: JobStep[]) => {
    const runningStep = steps.find((step) => {
        return step.stepStatus === 'RUNNING';
    });
    const numberOfCompletedSteps = steps.filter((step) => {
        return step.stepStatus === 'DONE';
    }).length;
    const completedStepsMessage = `${numberOfCompletedSteps}/${steps.length}`;
    const runningStepMessage = `Step ${Math.min(
        numberOfCompletedSteps + 1,
        steps.length,
    )}/${steps.length}: ${runningStep?.stepLabel || ''}`;

    return {
        runningStep,
        numberOfCompletedSteps,
        completedStepsMessage,
        runningStepMessage,
        totalSteps: steps.length,
    };
};

export const TOAST_KEY_FOR_REFRESH_JOB = 'refresh-job';

export type RefreshServerVariables = { syncContent: boolean };

const refresh = async (
    projectUuid: string,
    { syncContent }: RefreshServerVariables,
) =>
    lightdashApi<ApiRefreshResults>({
        method: 'POST',
        url: `/projects/${projectUuid}/refresh`,
        body: JSON.stringify({ syncContent }),
    });

const getJob = async (jobUuid: string) =>
    lightdashApi<Job>({
        method: 'GET',
        url: `/jobs/${jobUuid}`,
        body: undefined,
    });

export const useJob = (
    jobId: string | undefined,
    onSuccess: (job: Job) => void,
    onError: (error: ApiError) => void,
) => {
    const queryClient = useQueryClient();

    return useQuery<Job, ApiError>({
        queryKey: ['job', jobId],
        queryFn: () => getJob(jobId || ''),
        enabled: !!jobId,
        refetchInterval: (data) =>
            data === undefined ||
            [JobStatusType.DONE, JobStatusType.ERROR].includes(data.jobStatus)
                ? false
                : 500,
        staleTime: 0,
        onSuccess: async (job) => {
            if (job.jobStatus === JobStatusType.DONE) {
                await queryClient.invalidateQueries(['tables']);
            }
            onSuccess(job);
        },
        onError,
    });
};

export const useRefreshServer = () => {
    const projectUuid = useProjectUuid();
    const queryClient = useQueryClient();
    const { setActiveJobId } = useActiveJob();
    const { showToastApiError } = useToaster();
    return useMutation<ApiRefreshResults, ApiError, RefreshServerVariables>({
        mutationKey: ['refresh', projectUuid],
        mutationFn: (variables) => refresh(projectUuid!, variables),
        onSettled: async () =>
            queryClient.setQueryData(['status', projectUuid], 'loading'),
        onSuccess: (data) => setActiveJobId(data.jobUuid),
        onError: ({ error }) =>
            showToastApiError({
                title: 'Error syncing dbt project',
                apiError: error,
            }),
    });
};
