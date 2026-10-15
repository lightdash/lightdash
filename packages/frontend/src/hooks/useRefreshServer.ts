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
import { useTranslation } from 'react-i18next';
import { lightdashApi } from '../api';
import i18n from '../i18n/i18n';
import useActiveJob from '../providers/ActiveJob/useActiveJob';
import useToaster from './toaster/useToaster';
import { useProjectUuid } from './useProjectUuid';

export const jobStepStatusLabel = (status: JobStepStatusType) => {
    switch (status) {
        case JobStepStatusType.DONE:
            return i18n.t('useRefreshServer.steps.done', { ns: 'app' });
        case JobStepStatusType.PENDING:
            return i18n.t('useRefreshServer.steps.pending', { ns: 'app' });
        case JobStepStatusType.SKIPPED:
            return i18n.t('useRefreshServer.steps.skipped', { ns: 'app' });
        case JobStepStatusType.ERROR:
            return i18n.t('useRefreshServer.steps.error', { ns: 'app' });
        case JobStepStatusType.RUNNING:
            return i18n.t('useRefreshServer.steps.running', { ns: 'app' });
        default:
            throw new Error('Unknown job step status');
    }
};
export const jobStatusLabel = (status: JobStatusType, jobType?: JobType) => {
    if (jobType === JobType.CREATE_PROJECT) {
        switch (status) {
            case JobStatusType.DONE:
                return i18n.t('useRefreshServer.create.done', { ns: 'app' });
            case JobStatusType.STARTED:
                return i18n.t('useRefreshServer.create.started', { ns: 'app' });
            case JobStatusType.ERROR:
                return i18n.t('useRefreshServer.create.error', { ns: 'app' });
            case JobStatusType.RUNNING:
                return i18n.t('useRefreshServer.create.running', { ns: 'app' });
            default:
                throw new Error('Unknown job status');
        }
    }
    switch (status) {
        case JobStatusType.DONE:
            return i18n.t('useRefreshServer.sync.done', { ns: 'app' });
        case JobStatusType.STARTED:
            return i18n.t('useRefreshServer.sync.started', { ns: 'app' });
        case JobStatusType.ERROR:
            return i18n.t('useRefreshServer.sync.error', { ns: 'app' });
        case JobStatusType.RUNNING:
            return i18n.t('useRefreshServer.sync.running', { ns: 'app' });
        default:
            throw new Error('Unknown job status');
    }
};

export const getJobCompletionToast = (
    job: Job,
): { variant: 'success' | 'warning'; title: string; message?: string } => {
    const tableErrors =
        job.jobType === JobType.COMPILE_PROJECT &&
        job.jobResults?.errorCount !== undefined &&
        job.jobResults.errorCount > 0 &&
        job.jobResults.total !== undefined
            ? i18n.t('useRefreshServer.tablesWithErrors', {
                  ns: 'app',
                  count: job.jobResults.errorCount,
                  total: job.jobResults.total,
              })
            : null;
    if (
        job.jobType === JobType.COMPILE_PROJECT &&
        job.jobResults?.connectionWarnings?.length
    ) {
        return {
            variant: 'warning',
            title: tableErrors
                ? i18n.t('useRefreshServer.connectionsFailedWithTables', {
                      ns: 'app',
                      tableErrors,
                  })
                : i18n.t('useRefreshServer.connectionsFailed', { ns: 'app' }),
            message: job.jobResults.connectionWarnings
                .map((warning) => `- ${warning}`)
                .join('\n'),
        };
    }
    if (tableErrors) {
        return {
            variant: 'warning',
            title: i18n.t('useRefreshServer.synced', {
                ns: 'app',
                tableErrors,
            }),
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
    const runningStepMessage = i18n.t('useRefreshServer.runningStep', {
        ns: 'app',
        step: Math.min(numberOfCompletedSteps + 1, steps.length),
        total: steps.length,
        label: runningStep?.stepLabel || '',
    });

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
    const { t } = useTranslation('app');
    const { showToastApiError } = useToaster();
    return useMutation<ApiRefreshResults, ApiError, RefreshServerVariables>({
        mutationKey: ['refresh', projectUuid],
        mutationFn: (variables) => refresh(projectUuid!, variables),
        onSettled: async () =>
            queryClient.setQueryData(['status', projectUuid], 'loading'),
        onSuccess: (data) => setActiveJobId(data.jobUuid),
        onError: ({ error }) =>
            showToastApiError({
                title: t('useRefreshServer.errorSyncingProject'),
                apiError: error,
            }),
    });
};
