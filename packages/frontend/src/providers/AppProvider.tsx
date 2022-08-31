import { Ability } from '@casl/ability';
import { ApiError, HealthState } from '@lightdash/common';
import React, { createContext, FC, useContext } from 'react';
import { UseQueryResult } from 'react-query/types/react/types';
import { IntercomProvider } from 'react-use-intercom';
import { AbilityContext } from '../components/common/Authorization';
import useHealth from '../hooks/health/useHealth';
import useCohere from '../hooks/thirdPartyServices/useCohere';
import useHeadway from '../hooks/thirdPartyServices/useHeadway';
import useSentry from '../hooks/thirdPartyServices/useSentry';
import useUser, { UserWithAbility } from '../hooks/user/useUser';
import { ActiveJobProvider } from './ActiveJobProvider';
import { ErrorLogsProvider } from './ErrorLogsProvider';

interface AppContext {
    health: UseQueryResult<HealthState, ApiError>;
    user: UseQueryResult<UserWithAbility, ApiError>;
}

const Context = createContext<AppContext>(undefined as any);

const defaultAbility = new Ability();

export const AppProvider: FC = ({ children }) => {
    const health = useHealth();
    const user = useUser(!!health?.data?.isAuthenticated);

    useSentry(health?.data?.sentry);
    useCohere(health?.data?.cohere, user.data);
    useHeadway();

    const value = {
        health,
        user,
    };

    return (
        <Context.Provider value={value}>
            <IntercomProvider
                appId={health.data?.intercom.appId || ''}
                shouldInitialize={!!health.data?.intercom.appId}
                apiBase={health.data?.intercom.apiBase || ''}
                autoBoot
            >
                <AbilityContext.Provider value={defaultAbility}>
                    <ActiveJobProvider>
                        <ErrorLogsProvider>{children}</ErrorLogsProvider>
                    </ActiveJobProvider>
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
