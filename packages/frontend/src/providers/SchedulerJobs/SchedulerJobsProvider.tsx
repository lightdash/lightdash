import { SchedulerJobStatus } from '@lightdash/common';
import { type Icon as TablerIconType } from '@tabler/icons-react';
import { useQueries } from '@tanstack/react-query';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { getSchedulerJobStatus } from '../../features/scheduler/hooks/useScheduler';
import useToaster from '../../hooks/toaster/useToaster';
import SchedulerJobsContext from './context';
import JobProgressToastBody from './JobProgressToastBody';
import { type RegisterJobsParams, type TrackedJob } from './types';

type JobCallbacks = {
    onComplete?: (jobId: string) => void;
    onError?: (jobId: string, errorMessage: string) => void;
};

const TERMINAL_STATUSES = new Set<SchedulerJobStatus>([
    SchedulerJobStatus.COMPLETED,
    SchedulerJobStatus.ERROR,
]);

const DEFAULT_TOAST_KEY = 'scheduler-jobs-progress';

const SchedulerJobsProvider: FC<React.PropsWithChildren> = ({ children }) => {
    const [jobs, setJobs] = useState<TrackedJob[]>([]);
    const [toastKey, setToastKey] = useState<string>(DEFAULT_TOAST_KEY);
    const [toastTitle, setToastTitle] = useState<string | null>(null);
    const [toastIcon, setToastIcon] = useState<TablerIconType | null>(null);
    const [toastLabel, setToastLabel] = useState<string | null>(null);
    const [showToastEnabled, setShowToastEnabled] = useState(false);

    const callbacksRef = useRef<Map<string, JobCallbacks>>(new Map());
    const processedRef = useRef<Map<string, SchedulerJobStatus>>(new Map());

    const { showToastInfo, showToastSuccess, showToastError } = useToaster();

    const activeJobs = useMemo(
        () => jobs.filter((j) => !TERMINAL_STATUSES.has(j.status)),
        [jobs],
    );

    const registerJobs = useCallback((params: RegisterJobsParams) => {
        const { jobIds, onComplete, onError } = params;

        const shouldShowToast = params.showToast !== false;
        setShowToastEnabled(shouldShowToast);

        if (shouldShowToast) {
            if (params.toastKey) setToastKey(params.toastKey);
            if (params.toastTitle) setToastTitle(params.toastTitle);
            if (params.toastIcon) setToastIcon(() => params.toastIcon ?? null);
        }

        const now = new Date();

        const newEntries: TrackedJob[] = jobIds.map((jobId) => ({
            jobId,
            status: SchedulerJobStatus.SCHEDULED,
            startedAt: now,
            errorMessage: null,
        }));

        newEntries.forEach((entry) => {
            callbacksRef.current.set(entry.jobId, {
                onComplete,
                onError,
            });
        });

        setJobs((prev) => {
            const hasExistingActiveJobs = prev.some(
                (j) => !TERMINAL_STATUSES.has(j.status),
            );
            // Clear label when multiple registrations happen (e.g. Promise.all)
            // so the toast falls back to progress bar view
            if (hasExistingActiveJobs) {
                setToastLabel(null);
            } else {
                setToastLabel(params.label ?? null);
            }

            const existingIds = new Set(prev.map((j) => j.jobId));
            const fresh = newEntries.filter((e) => !existingIds.has(e.jobId));
            return [...prev, ...fresh];
        });
    }, []);

    // Poll active jobs
    const queryResults = useQueries({
        queries: activeJobs.map((job) => ({
            queryKey: ['schedulerJobStatus', job.jobId],
            queryFn: () => getSchedulerJobStatus(job.jobId),
            refetchInterval: 2000,
            enabled: !TERMINAL_STATUSES.has(job.status),
        })),
    });

    useEffect(() => {
        queryResults.forEach((result, index) => {
            if (!result.data) return;

            const job = activeJobs[index];
            if (!job) return;

            const prevStatus = processedRef.current.get(job.jobId);
            if (prevStatus === result.data.status) return;

            processedRef.current.set(job.jobId, result.data.status);

            const newStatus = result.data.status;
            const details = result.data.details;

            const errorMessage =
                newStatus === SchedulerJobStatus.ERROR
                    ? ((details?.error as string) ?? 'Unknown error')
                    : null;

            setJobs((prev) =>
                prev.map((j) => {
                    if (j.jobId !== job.jobId) return j;
                    if (j.status === newStatus) return j;
                    return {
                        ...j,
                        status: newStatus,
                        errorMessage: errorMessage ?? j.errorMessage,
                    };
                }),
            );

            if (TERMINAL_STATUSES.has(newStatus)) {
                const callbacks = callbacksRef.current.get(job.jobId);
                if (callbacks) {
                    if (
                        newStatus === SchedulerJobStatus.COMPLETED &&
                        callbacks.onComplete
                    ) {
                        callbacks.onComplete(job.jobId);
                    }
                    if (
                        newStatus === SchedulerJobStatus.ERROR &&
                        callbacks.onError
                    ) {
                        callbacks.onError(
                            job.jobId,
                            errorMessage ?? 'Unknown error',
                        );
                    }
                }
            }
        });
    }, [queryResults, activeJobs]);

    // Show/update toast based on job progress
    useEffect(() => {
        if (!showToastEnabled || jobs.length === 0) return;

        const completedCount = jobs.filter((j) =>
            TERMINAL_STATUSES.has(j.status),
        ).length;
        const erroredCount = jobs.filter(
            (j) => j.status === SchedulerJobStatus.ERROR,
        ).length;
        const allDone = completedCount === jobs.length;

        const title = toastTitle ?? 'Background jobs';
        const icon = toastIcon ? (
            <MantineIcon icon={toastIcon} size="xl" />
        ) : undefined;

        if (allDone) {
            if (erroredCount > 0) {
                showToastError({
                    key: toastKey,
                    title,
                    icon,
                    subtitle: (
                        <JobProgressToastBody jobs={jobs} label={toastLabel} />
                    ),
                    autoClose: 8000,
                });
            } else {
                showToastSuccess({
                    key: toastKey,
                    title,
                    icon,
                    subtitle: (
                        <JobProgressToastBody jobs={jobs} label={toastLabel} />
                    ),
                    autoClose: 5000,
                });
            }
            // Clear jobs after all done
            setJobs([]);
            setShowToastEnabled(false);
        } else {
            showToastInfo({
                key: toastKey,
                title,
                icon,
                loading: true,
                autoClose: false,
                subtitle: (
                    <JobProgressToastBody jobs={jobs} label={toastLabel} />
                ),
            });
        }
    }, [
        jobs,
        showToastEnabled,
        toastKey,
        toastTitle,
        toastIcon,
        toastLabel,
        showToastInfo,
        showToastSuccess,
        showToastError,
    ]);

    const hasActiveJobs = activeJobs.length > 0;

    const contextValue = useMemo(
        () => ({
            jobs,
            registerJobs,
            hasActiveJobs,
        }),
        [jobs, registerJobs, hasActiveJobs],
    );

    return (
        <SchedulerJobsContext.Provider value={contextValue}>
            {children}
        </SchedulerJobsContext.Provider>
    );
};

export default SchedulerJobsProvider;
