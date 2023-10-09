import { SpinnerSize } from '@blueprintjs/core';
import { ApiError, Job, JobStatusType, JobType } from '@lightdash/common';
import React, {
    createContext,
    Dispatch,
    FC,
    SetStateAction,
    useCallback,
    useContext,
    useEffect,
    useState,
} from 'react';
import { useQueryClient } from 'react-query';
import { AppToaster } from '../components/AppToaster';
import { ToastSpinner } from '../components/ToastSpinner';
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

export const ActiveJobProvider: FC = ({ children }) => {
    const [isJobsDrawerOpen, setIsJobsDrawerOpen] = useState(false);
    const [activeJobId, setActiveJobId] = useState();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError, showToastInfo } = useToaster();

    const toastJobStatus = useCallback(
        (job: Job | undefined) => {
            if (job && !isJobsDrawerOpen) {
                const toastTitle = `${jobStatusLabel(job?.jobStatus).label}`;
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
                            subtitle: job?.steps
                                ? runningStepsInfo(job?.steps)
                                      .runningStepMessage
                                : '',
                            icon: <ToastSpinner size={SpinnerSize.SMALL} />,
                            timeout: 0,
                            action: {
                                text: 'View log',
                                icon: 'arrow-right',
                                onClick: () => setIsJobsDrawerOpen(true),
                            },
                            className: 'toast-with-no-close-button',
                        });
                        break;
                    case 'ERROR':
                        AppToaster.dismiss(TOAST_KEY_FOR_REFRESH_JOB);
                        setIsJobsDrawerOpen(true);
                }
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
                AppToaster.dismiss(TOAST_KEY_FOR_REFRESH_JOB);
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

export function useActiveJob(): ContextType {
    const context = useContext(Context);
    if (context === undefined) {
        throw new Error('useActiveJob must be used within a ActiveJobProvider');
    }
    return context;
}
