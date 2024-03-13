import { type ApiError, type HealthState } from '@lightdash/common';
import { type UseQueryResult } from '@tanstack/react-query';
import { createContext, useContext, useEffect, type FC } from 'react';
import { useLocation } from 'react-router-dom';
import { useToggle } from 'react-use';
import useHealth from '../hooks/health/useHealth';
import useUser, { type UserWithAbility } from '../hooks/user/useUser';

interface AppContext {
    health: UseQueryResult<HealthState, ApiError>;
    user: UseQueryResult<UserWithAbility, ApiError>;
    isFullscreen: boolean;
    toggleFullscreen: (nextValue?: boolean) => void;
}

// used in test mocks
// ts-unused-exports:disable-next-line
export const AppProviderContext = createContext<AppContext>(undefined as any);

export const AppProvider: FC<React.PropsWithChildren<{}>> = ({ children }) => {
    const health = useHealth();
    const user = useUser(!!health?.data?.isAuthenticated);
    const [isFullscreen, toggleFullscreen] = useToggle(false);
    const location = useLocation();

    const value = {
        health,
        user,
        isFullscreen,
        toggleFullscreen,
    };

    useEffect(() => {
        toggleFullscreen(false);
    }, [location, toggleFullscreen]);

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
