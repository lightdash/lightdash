import { ApiError, HealthState } from '@lightdash/common';
import { UseQueryResult } from '@tanstack/react-query';
import { createContext, FC, useContext } from 'react';
import useHealth from '../hooks/health/useHealth';
import useUser, { UserWithAbility } from '../hooks/user/useUser';

interface AppContext {
    health: UseQueryResult<HealthState, ApiError>;
    user: UseQueryResult<UserWithAbility, ApiError>;
}

// used in test mocks
// ts-unused-exports:disable-next-line
export const AppProviderContext = createContext<AppContext>(undefined as any);

export const AppProvider: FC<React.PropsWithChildren<{}>> = ({ children }) => {
    const health = useHealth();
    const user = useUser(!!health?.data?.isAuthenticated);

    const value = {
        health,
        user,
    };

    return (
        <AppProviderContext.Provider value={value}>
            {children}
        </AppProviderContext.Provider>
    );
};

export function useApp(): AppContext {
    const context = useContext(AppProviderContext);
    if (context === undefined) {
        throw new Error('useApp must be used within a AppProvider');
    }
    return context;
}
