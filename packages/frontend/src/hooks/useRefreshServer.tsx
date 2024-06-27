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
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { useActiveJob } from '../providers/ActiveJobProvider';
import useToaster from './toaster/useToaster';

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
export const jobStatusLabel = (status: JobStatusType) => {
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

const refresh = async (projectUuid: string) =>
    lightdashApi<ApiRefreshResults>({
        method: 'POST',
        url: `/projects/${projectUuid}/refresh`,
        body: undefined,
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

                if (job.jobType === JobType.COMPILE_PROJECT) {
                    await queryClient.invalidateQueries([
                        'catalog',
                        job.projectUuid,
                    ]);
                }
            }
            onSuccess(job);
        },
        onError,
    });
};

export const useRefreshServer = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const { setActiveJobId } = useActiveJob();
    const { showToastApiError } = useToaster();
    return useMutation<ApiRefreshResults, ApiError>({
        mutationKey: ['refresh', projectUuid],
        mutationFn: () => refresh(projectUuid),
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
