import {
    JobStatusType,
    JobType,
    type ApiError,
    type Job,
} from '@lightdash/common';
import { notifications } from '@mantine/notifications';
import { IconArrowRight } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type FC,
    type SetStateAction,
} from 'react';
import { useNavigate } from 'react-router';
import useToaster from '../../hooks/toaster/useToaster';
import {
    getJobCompletionToast,
    jobStatusLabel,
    runningStepsInfo,
    TOAST_KEY_FOR_REFRESH_JOB,
    useJob,
} from '../../hooks/useRefreshServer';
import Context from './context';

const ActiveJobProvider: FC<React.PropsWithChildren<{}>> = ({ children }) => {
    const [isJobsDrawerOpen, setIsJobsDrawerOpen] = useState(false);
    const [activeJobId, setActiveJobIdState] = useState<string | undefined>();
    const [isQuietJob, setIsQuietJob] = useState(false);
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const {
        showToastSuccess,
        showToastApiError,
        showToastInfo,
        showToastWarning,
    } = useToaster();

    const setActiveJobId = useCallback(
        (jobId: SetStateAction<string | undefined>) => {
            setIsQuietJob(false);
            setActiveJobIdState(jobId);
        },
        [],
    );

    const setQuietActiveJobId = useCallback((jobId: string) => {
        setIsQuietJob(true);
        setActiveJobIdState(jobId);
    }, []);

    const toastJobStatus = useCallback(
        async (job: Job | undefined) => {
            if (!job || isJobsDrawerOpen) return;

            const toastTitle = jobStatusLabel(job?.jobStatus, job?.jobType);

            switch (job.jobStatus) {
                case 'DONE':
                    if (job.jobType === JobType.CREATE_PROJECT) {
                        await queryClient.invalidateQueries(['projects']);
                        await queryClient.invalidateQueries([
                            'projects',
                            'defaultProject',
                        ]);
                        await queryClient.invalidateQueries(['organization']);
                    }
                    await queryClient.invalidateQueries(['parameters']);
                    if (isQuietJob) break;
                    const completionToast = getJobCompletionToast(job);
                    if (completionToast.variant === 'warning') {
                        showToastWarning({
                            key: TOAST_KEY_FOR_REFRESH_JOB,
                            title: completionToast.title,
                            action: job.projectUuid
                                ? {
                                      children: 'View errors',
                                      icon: IconArrowRight,
                                      onClick: () =>
                                          navigate(
                                              `/generalSettings/projectManagement/${job.projectUuid}/validator`,
                                          ),
                                  }
                                : undefined,
                        });
                    } else {
                        showToastSuccess({
                            key: TOAST_KEY_FOR_REFRESH_JOB,
                            title: completionToast.title,
                        });
                    }
                    break;
                case 'RUNNING':
                    if (isQuietJob) break;
                    showToastInfo({
                        key: TOAST_KEY_FOR_REFRESH_JOB,
                        title: toastTitle,
                        subtitle:
                            job.steps.length > 0
                                ? runningStepsInfo(job.steps).runningStepMessage
                                : undefined,
                        loading: true,
                        autoClose: false,
                        withCloseButton: false,
                        action: {
                            children: 'View log',
                            icon: IconArrowRight,
                            onClick: () => setIsJobsDrawerOpen(true),
                        },
                    });
                    break;
                case 'ERROR':
                    notifications.hide(TOAST_KEY_FOR_REFRESH_JOB);
                    setIsJobsDrawerOpen(true);
            }
        },
        [
            showToastInfo,
            showToastSuccess,
            showToastWarning,
            queryClient,
            isJobsDrawerOpen,
            isQuietJob,
            navigate,
        ],
    );

    const toastJobError = ({ error }: ApiError) => {
        showToastApiError({
            key: TOAST_KEY_FOR_REFRESH_JOB,
            title: 'Failed to refresh server',
            apiError: error,
        });
    };
    const { data: activeJob } = useJob(
        activeJobId,
        toastJobStatus,
        toastJobError,
    );

    // Always display either a toast or job bar when job is running
    useEffect(() => {
        if (activeJobId && activeJob && activeJob.jobStatus === 'RUNNING') {
            if (isJobsDrawerOpen) {
                notifications.hide(TOAST_KEY_FOR_REFRESH_JOB);
            } else {
                void toastJobStatus(activeJob);
            }
        }
        if (
            activeJobId &&
            activeJob &&
            activeJob.jobStatus === JobStatusType.DONE
        ) {
            void queryClient.refetchQueries(['user']); // a new project level permission might be added to the user
        }
    }, [activeJob, activeJobId, toastJobStatus, isJobsDrawerOpen, queryClient]);

    const activeJobIsRunning = activeJob && activeJob?.jobStatus === 'RUNNING';
    const contextValue = useMemo(
        () => ({
            isJobsDrawerOpen,
            setIsJobsDrawerOpen,
            activeJobId,
            setActiveJobId,
            setQuietActiveJobId,
            activeJob,
            activeJobIsRunning,
        }),
        [
            activeJob,
            activeJobId,
            activeJobIsRunning,
            isJobsDrawerOpen,
            setActiveJobId,
            setQuietActiveJobId,
        ],
    );

    return <Context.Provider value={contextValue}>{children}</Context.Provider>;
};

export default ActiveJobProvider;
