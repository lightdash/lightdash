import { ApiError, Job, JobStatusType, JobType } from '@lightdash/common';
import { notifications } from '@mantine/notifications';
import { IconArrowRight } from '@tabler/icons-react';
import {
    createContext,
    Dispatch,
    FC,
    SetStateAction,
    useCallback,
    useEffect,
    useState,
} from 'react';
import { useQueryClient } from 'react-query';
import useToaster from '../../hooks/toaster/useToaster';
import {
    jobStatusLabel,
    runningStepsInfo,
    TOAST_KEY_FOR_REFRESH_JOB,
    useJob,
} from '../../hooks/useRefreshServer';

export interface ContextType {
    isJobsDrawerOpen: boolean;
    setIsJobsDrawerOpen: Dispatch<SetStateAction<boolean>>;
    activeJobId: string | undefined;
    setActiveJobId: Dispatch<SetStateAction<any>>;
    activeJob: Job | undefined;
    activeJobIsRunning: boolean | undefined;
}

export const Context = createContext<ContextType>(undefined as any);

export const ActiveJobProvider: FC = ({ children }) => {
    const [isJobsDrawerOpen, setIsJobsDrawerOpen] = useState(false);
    const [activeJobId, setActiveJobId] = useState();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError, showToastInfo } = useToaster();

    const toastJobStatus = useCallback(
        (job: Job | undefined) => {
            if (!job || isJobsDrawerOpen) return;

            const toastTitle = jobStatusLabel(job?.jobStatus);
            switch (job.jobStatus) {
                case 'DONE':
                    if (job.jobType === JobType.CREATE_PROJECT) {
                        queryClient.invalidateQueries(['projects']);
                        queryClient.invalidateQueries([
                            'projects',
                            'defaultProject',
                        ]);
                    }
                    showToastSuccess({
                        key: TOAST_KEY_FOR_REFRESH_JOB,
                        title: toastTitle,
                    });
                    break;
                case 'RUNNING':
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
        [showToastInfo, showToastSuccess, queryClient, isJobsDrawerOpen],
    );

    const toastJobError = (error: ApiError) => {
        showToastError({
            key: TOAST_KEY_FOR_REFRESH_JOB,
            title: 'Failed to refresh server',
            subtitle: error.error.message,
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
                toastJobStatus(activeJob);
            }
        }
        if (
            activeJobId &&
            activeJob &&
            activeJob.jobStatus === JobStatusType.DONE
        ) {
            queryClient.refetchQueries('user'); // a new project level permission might be added to the user
        }
    }, [activeJob, activeJobId, toastJobStatus, isJobsDrawerOpen, queryClient]);

    const activeJobIsRunning = activeJob && activeJob?.jobStatus === 'RUNNING';

    return (
        <Context.Provider
            value={{
                isJobsDrawerOpen,
                setIsJobsDrawerOpen,
                activeJobId,
                setActiveJobId,
                activeJob,
                activeJobIsRunning,
            }}
        >
            {children}
        </Context.Provider>
    );
};
