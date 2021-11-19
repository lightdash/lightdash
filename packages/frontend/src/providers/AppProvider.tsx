import { Intent } from '@blueprintjs/core';
import { IToastProps } from '@blueprintjs/core/src/components/toast/toast';
import MDEditor from '@uiw/react-md-editor';
import { ApiError, ApiHealthResults, HealthState, LightdashUser } from 'common';
import React, {
    createContext,
    FC,
    useCallback,
    useContext,
    useEffect,
} from 'react';
import { useQuery } from 'react-query';
import { UseQueryResult } from 'react-query/types/react/types';
import { lightdashApi } from '../api';
import { AppToaster } from '../components/AppToaster';
import { ErrorLogs, useErrorLogs } from '../hooks/useErrorLogs';

const getHealthState = async () =>
    lightdashApi<ApiHealthResults>({
        url: `/health`,
        method: 'GET',
        body: undefined,
    });

const getUserState = async () =>
    lightdashApi<LightdashUser>({
        url: `/user`,
        method: 'GET',
        body: undefined,
    });

interface Message extends Omit<IToastProps, 'message'> {
    title: string;
    subtitle?: string;
    key?: string;
}

interface AppContext {
    health: UseQueryResult<HealthState, ApiError>;
    user: UseQueryResult<LightdashUser, ApiError>;
    showToastSuccess: (props: Message) => void;
    showToastError: (props: Message) => void;
    errorLogs: ErrorLogs;
}

const Context = createContext<AppContext>(undefined as any);

export const AppProvider: FC = ({ children }) => {
    const health = useQuery<HealthState, ApiError>({
        queryKey: 'health',
        queryFn: getHealthState,
    });
    const user = useQuery<LightdashUser, ApiError>({
        queryKey: 'user',
        queryFn: getUserState,
        enabled: !!health.data?.isAuthenticated,
        retry: false,
    });

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
    const errorLogs = useErrorLogs();

    const value = {
        health,
        user,
        showToastSuccess,
        showToastError,
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

    return <Context.Provider value={value}>{children}</Context.Provider>;
};

export function useApp(): AppContext {
    const context = useContext(Context);
    if (context === undefined) {
        throw new Error('useApp must be used within a AppProvider');
    }
    return context;
}
