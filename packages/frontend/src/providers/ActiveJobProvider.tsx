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
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
    type Dispatch,
    type FC,
    type SetStateAction,
} from 'react';
import useToaster from '../hooks/toaster/useToaster';
import {
    jobStatusLabel,
    runningStepsInfo,
    TOAST_KEY_FOR_REFRESH_JOB,
    useJob,
} from '../hooks/useRefreshServer';

interface ContextType {
    isJobsDrawerOpen: boolean;
    setIsJobsDrawerOpen: Dispatch<SetStateAction<boolean>>;
    activeJobId: string | undefined;
    setActiveJobId: Dispatch<SetStateAction<any>>;
    activeJob: Job | undefined;
    activeJobIsRunning: boolean | undefined;
}

const Context = createContext<ContextType>(undefined as any);

export const ActiveJobProvider: FC<React.PropsWithChildren<{}>> = ({
    children,
}) => {
    const [isJobsDrawerOpen, setIsJobsDrawerOpen] = useState(false);
    const [activeJobId, setActiveJobId] = useState();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError, showToastInfo } = useToaster();

    const toastJobStatus = useCallback(
        async (job: Job | undefined) => {
            if (!job || isJobsDrawerOpen) return;

            const toastTitle = jobStatusLabel(job?.jobStatus);

            switch (job.jobStatus) {
                case 'DONE':
                    if (job.jobType === JobType.CREATE_PROJECT) {
                        await queryClient.invalidateQueries(['projects']);
                        await queryClient.invalidateQueries([
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

export function useActiveJob(): ContextType {
    const context = useContext(Context);
    if (context === undefined) {
        throw new Error('useActiveJob must be used within a ActiveJobProvider');
    }
    return context;
}
