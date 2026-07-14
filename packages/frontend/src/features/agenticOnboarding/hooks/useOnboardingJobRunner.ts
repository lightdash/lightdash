import {
    isApiError,
    JobStatusType,
    JobStepStatusType,
    type ApiError,
    type ApiJobStartedResults,
    type ConnectionCheckStatus,
    type DashboardBuildResult,
    type Job,
    type JobStep,
    type ProfileResult,
    type SemanticLayerResult,
} from '@lightdash/common';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { lightdashApi } from '../../../api';
import { type StepChecklistItem } from '../components/connect/StepChecklist';

export type OnboardingJobKind = 'profile' | 'semantic-layer' | 'dashboard';

export type OnboardingRunnerPhase =
    | 'checking'
    | 'scheduling'
    | 'polling'
    | 'ready'
    | 'error';

const scheduleJob = (
    projectUuid: string,
    kind: OnboardingJobKind,
): Promise<ApiJobStartedResults> =>
    lightdashApi<ApiJobStartedResults>({
        url: `/projects/${projectUuid}/onboarding/${kind}`,
        method: 'POST',
        body: undefined,
    });

const getJob = (jobUuid: string): Promise<Job> =>
    lightdashApi<Job>({
        url: `/jobs/${jobUuid}`,
        method: 'GET',
        body: undefined,
    });

const getResult = <
    T extends ProfileResult | SemanticLayerResult | DashboardBuildResult,
>(
    projectUuid: string,
    kind: OnboardingJobKind,
): Promise<T> =>
    lightdashApi<T>({
        url: `/projects/${projectUuid}/onboarding/${kind}`,
        method: 'GET',
        body: undefined,
    });

const jobStepStatusToChecklistStatus = (
    status: JobStepStatusType,
): ConnectionCheckStatus => {
    switch (status) {
        case JobStepStatusType.DONE:
            return 'passed';
        case JobStepStatusType.RUNNING:
            return 'running';
        case JobStepStatusType.ERROR:
            return 'failed';
        case JobStepStatusType.SKIPPED:
            return 'skipped';
        case JobStepStatusType.PENDING:
        default:
            return 'pending';
    }
};

const stepDurationMs = (step: JobStep): number | null => {
    if (step.stepStatus !== JobStepStatusType.DONE || !step.startedAt) {
        return null;
    }
    const started = new Date(step.startedAt).getTime();
    const ended = new Date(step.updatedAt).getTime();
    if (Number.isNaN(started) || Number.isNaN(ended) || ended < started) {
        return null;
    }
    return ended - started;
};

const jobStepsToChecklistItems = (steps: JobStep[]): StepChecklistItem[] =>
    steps.map((step) => ({
        id: step.stepType,
        label: step.stepLabel,
        status: jobStepStatusToChecklistStatus(step.stepStatus),
        durationMs: stepDurationMs(step),
    }));

const errorMessageFromApiError = (error: unknown): string => {
    if (isApiError(error)) {
        return error.error.message;
    }
    if (error instanceof Error) {
        return error.message;
    }
    return 'Something went wrong';
};

export type OnboardingJobRunner<T> = {
    phase: OnboardingRunnerPhase;
    steps: JobStep[];
    checklistItems: StepChecklistItem[];
    result: T | null;
    errorMessage: string | null;
    retry: () => void;
};

/**
 * Drives an onboarding async step: GET the result first, and if none exists
 * yet (404) schedule a Graphile job and poll it via the jobs endpoint,
 * surfacing live job steps. On DONE it fetches the result; on ERROR it exposes
 * the failed step's message so the caller can offer a retry.
 */
export const useOnboardingJobRunner = <
    T extends ProfileResult | SemanticLayerResult | DashboardBuildResult,
>({
    projectUuid,
    kind,
}: {
    projectUuid: string | null;
    kind: OnboardingJobKind;
}): OnboardingJobRunner<T> => {
    const [phase, setPhase] = useState<OnboardingRunnerPhase>('checking');
    const [jobUuid, setJobUuid] = useState<string | null>(null);
    const [steps, setSteps] = useState<JobStep[]>([]);
    const [result, setResult] = useState<T | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const scheduleMutation = useMutation<{ jobUuid: string }, ApiError>({
        mutationFn: () => scheduleJob(projectUuid ?? '', kind),
        onSuccess: ({ jobUuid: newJobUuid }) => {
            setJobUuid(newJobUuid);
            setPhase('polling');
        },
        onError: (error) => {
            setErrorMessage(errorMessageFromApiError(error));
            setPhase('error');
        },
    });
    const { mutate: scheduleJobMutate } = scheduleMutation;

    const loadResultThenReady = useCallback(async () => {
        if (!projectUuid) return;
        try {
            const loaded = await getResult<T>(projectUuid, kind);
            setResult(loaded);
            setPhase('ready');
        } catch (error) {
            setErrorMessage(errorMessageFromApiError(error));
            setPhase('error');
        }
    }, [projectUuid, kind]);

    const checkExisting = useCallback(async () => {
        if (!projectUuid) return;
        try {
            const loaded = await getResult<T>(projectUuid, kind);
            setResult(loaded);
            setPhase('ready');
        } catch (error) {
            if (isApiError(error) && error.error.statusCode === 404) {
                setPhase('scheduling');
                scheduleJobMutate();
            } else {
                setErrorMessage(errorMessageFromApiError(error));
                setPhase('error');
            }
        }
    }, [projectUuid, kind, scheduleJobMutate]);

    useEffect(() => {
        if (projectUuid && phase === 'checking') {
            void checkExisting();
        }
    }, [projectUuid, phase, checkExisting]);

    useQuery<Job, ApiError>({
        queryKey: ['onboarding-job', jobUuid],
        queryFn: () => getJob(jobUuid ?? ''),
        enabled: !!jobUuid && phase === 'polling',
        refetchInterval: (data) =>
            data === undefined ||
            [JobStatusType.DONE, JobStatusType.ERROR].includes(data.jobStatus)
                ? false
                : 500,
        staleTime: 0,
        onSuccess: (job) => {
            setSteps(job.steps);
            if (job.jobStatus === JobStatusType.DONE) {
                void loadResultThenReady();
            } else if (job.jobStatus === JobStatusType.ERROR) {
                const failedStep = job.steps.find(
                    (step) => step.stepStatus === JobStepStatusType.ERROR,
                );
                setErrorMessage(
                    failedStep?.stepError ??
                        'We hit a problem finishing this step.',
                );
                setPhase('error');
            }
        },
        onError: (error) => {
            setErrorMessage(errorMessageFromApiError(error));
            setPhase('error');
        },
    });

    const retry = useCallback(() => {
        setErrorMessage(null);
        setSteps([]);
        setJobUuid(null);
        setPhase('scheduling');
        scheduleJobMutate();
    }, [scheduleJobMutate]);

    const checklistItems = useMemo(
        () => jobStepsToChecklistItems(steps),
        [steps],
    );

    return {
        phase,
        steps,
        checklistItems,
        result,
        errorMessage,
        retry,
    };
};
