import { Intent, SpinnerSize } from '@blueprintjs/core';
import { IToastProps } from '@blueprintjs/core/src/components/toast/toast';
import { Ability } from '@casl/ability';
import {
    ApiError,
    ApiHealthResults,
    defineUserAbility,
    HealthState,
    Job,
    JobType,
    LightdashUserWithProjectRoles,
    MemberAbility,
} from '@lightdash/common';
import * as Sentry from '@sentry/react';
import { Integrations } from '@sentry/tracing';
import MDEditor from '@uiw/react-md-editor';
import Cohere from 'cohere-js';
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
import { useQuery, useQueryClient } from 'react-query';
import { UseQueryResult } from 'react-query/types/react/types';
import { IntercomProvider } from 'react-use-intercom';
import { lightdashApi } from '../api';
import { AppToaster } from '../components/AppToaster';
import { AbilityContext } from '../components/common/Authorization';
import { ToastSpinner } from '../components/ToastSpinner';
import { ErrorLogs, useErrorLogs } from '../hooks/useErrorLogs';
import {
    jobStatusLabel,
    runningStepsInfo,
    TOAST_KEY_FOR_REFRESH_JOB,
    useJob,
} from '../hooks/useRefreshServer';

const getHealthState = async () =>
    lightdashApi<ApiHealthResults>({
        url: `/health`,
        method: 'GET',
        body: undefined,
    });

type User = LightdashUserWithProjectRoles & { ability: MemberAbility };
const getUserState = async (): Promise<User> => {
    const user = await lightdashApi<LightdashUserWithProjectRoles>({
        url: `/user`,
        method: 'GET',
        body: undefined,
    });
    return {
        ...user,
        ability: defineUserAbility(user, user.projectRoles),
    };
};

interface Message extends Omit<IToastProps, 'message'> {
    title: string;
    subtitle?: string;
    key?: string;
}

interface AppContext {
    health: UseQueryResult<HealthState, ApiError>;
    user: UseQueryResult<User, ApiError>;
    isJobsDrawerOpen: boolean;
    setIsJobsDrawerOpen: Dispatch<SetStateAction<boolean>>;
    activeJobId: string | undefined;
    setActiveJobId: Dispatch<SetStateAction<any>>;
    activeJob: Job | undefined;
    activeJobIsRunning: boolean | undefined;
    showToastSuccess: (props: Message) => void;
    showToastError: (props: Message) => void;
    showToastInfo: (props: Message) => void;
    errorLogs: ErrorLogs;
}

const Context = createContext<AppContext>(undefined as any);

export const AppProvider: FC = ({ children }) => {
    const [isSentryLoaded, setIsSentryLoaded] = useState(false);
    const [isCohereLoaded, setIsCohereLoaded] = useState(false);
    const [isJobsDrawerOpen, setIsJobsDrawerOpen] = useState(false);
    const [activeJobId, setActiveJobId] = useState();
    const queryClient = useQueryClient();

    const health = useQuery<HealthState, ApiError>({
        queryKey: 'health',
        queryFn: getHealthState,
    });
    const user = useQuery<User, ApiError>({
        queryKey: 'user',
        queryFn: getUserState,
        enabled: !!health.data?.isAuthenticated,
        retry: false,
    });

    const [isHeadwayLoaded, setIsHeadwayLoaded] = useState(false);

    useEffect(() => {
        if (health.data && !isSentryLoaded && health.data.sentry.dsn) {
            Sentry.init({
                dsn: health.data.sentry.dsn,
                release: health.data.sentry.release,
                environment: health.data.sentry.environment,
                integrations: [new Integrations.BrowserTracing()],
                tracesSampleRate: 1.0,
            });
            setIsSentryLoaded(true);
        }
    }, [isSentryLoaded, setIsSentryLoaded, health]);

    useEffect(() => {
        if (
            !isCohereLoaded &&
            health.data &&
            health.data.cohere.token.length > 0
        ) {
            Cohere.init(health.data.cohere.token);
            setIsCohereLoaded(true);
        }
        if (user.data) {
            Cohere.identify(user.data.userUuid, {
                displayName: `${user.data.firstName} ${user.data.lastName}`,
                email: user.data.email,
            });
        }
    }, [health, isCohereLoaded, user]);

    useEffect(() => {
        if (!isHeadwayLoaded) {
            const script = document.createElement('script');
            script.async = false;
            script.src = 'https://cdn.headwayapp.co/widget.js';
            document.head.appendChild(script);
            setIsHeadwayLoaded(true);
        }
    }, [isHeadwayLoaded, health]);

    const showToastSuccess = useCallback<AppContext['showToastSuccess']>(
        ({ title, subtitle, key, ...rest }) => {
            AppToaster.show(
                {
                    intent: Intent.SUCCESS,
                    icon: 'tick-circle',
                    timeout: 5000,
                    message: (
                        <div>
                            <p style={{ fontWeight: 'bold', marginBottom: 0 }}>
                                {title}
                            </p>
                            {subtitle && (
                                <MDEditor.Markdown
                                    source={subtitle}
                                    linkTarget="_blank"
                                />
                            )}
                        </div>
                    ),
                    ...rest,
                },
                key || title,
            );
        },
        [],
    );

    const showToastError = useCallback<AppContext['showToastError']>(
        (props) => {
            showToastSuccess({
                intent: Intent.DANGER,
                icon: 'error',
                ...props,
            });
        },
        [showToastSuccess],
    );

    const showToastInfo = useCallback<AppContext['showToastInfo']>(
        (props) => {
            showToastSuccess({
                intent: Intent.NONE,
                icon: 'info-sign',
                ...props,
            });
        },
        [showToastSuccess],
    );

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
    }, [activeJob, activeJobId, toastJobStatus, isJobsDrawerOpen]);

    const activeJobIsRunning = activeJob && activeJob?.jobStatus === 'RUNNING';
    const errorLogs = useErrorLogs();

    const value = {
        health,
        user,
        showToastSuccess,
        showToastError,
        showToastInfo,
        isJobsDrawerOpen,
        setIsJobsDrawerOpen,
        activeJobId,
        setActiveJobId,
        activeJob,
        activeJobIsRunning,
        errorLogs,
    };

    useEffect(() => {
        if (health.error) {
            const [first, ...rest] = health.error.error.message.split('\n');
            AppToaster.show(
                {
                    intent: 'danger',
                    message: (
                        <div>
                            <b>{first}</b>
                            <p>{rest.join('\n')}</p>
                        </div>
                    ),
                    timeout: 0,
                    icon: 'error',
                },
                first,
            );
        }
    }, [health]);

    return (
        <Context.Provider value={value}>
            <IntercomProvider
                appId={health.data?.intercom.appId || ''}
                shouldInitialize={!!health.data?.intercom.appId}
                apiBase={health.data?.intercom.apiBase || ''}
                autoBoot
            >
                <AbilityContext.Provider value={new Ability()}>
                    {children}
                </AbilityContext.Provider>
            </IntercomProvider>
        </Context.Provider>
    );
};

export function useApp(): AppContext {
    const context = useContext(Context);
    if (context === undefined) {
        throw new Error('useApp must be used within a AppProvider');
    }
    return context;
}
