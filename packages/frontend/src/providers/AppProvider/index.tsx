import { ApiError, HealthState } from '@lightdash/common';
import { createContext, FC } from 'react';
import { UseQueryResult } from 'react-query/types/react/types';
import useHealth from '../../hooks/health/useHealth';
import useUser, { UserWithAbility } from '../../hooks/user/useUser';

export interface AppContext {
    health: UseQueryResult<HealthState, ApiError>;
    user: UseQueryResult<UserWithAbility, ApiError>;
}

export const Context = createContext<AppContext>(undefined as any);

export const AppProvider: FC = ({ children }) => {
    const health = useHealth();
    const user = useUser(!!health?.data?.isAuthenticated);

    const value = {
        health,
        user,
    };

    return <Context.Provider value={value}>{children}</Context.Provider>;
};
