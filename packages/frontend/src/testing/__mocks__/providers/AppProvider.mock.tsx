import { Ability } from '@casl/ability';
import {
    ApiError,
    HealthState,
    LightdashUserWithAbilityRules,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { FC, PropsWithChildren } from 'react';
import { UserWithAbility } from '../../../hooks/user/useUser';
import { AppProviderContext } from '../../../providers/AppProvider';
import mockHealthResponse from '../api/healthResponse.mock';
import { mockUserResponse } from '../api/userResponse.mock';

export type AppProviderMockProps = {
    mocks?: {
        health?: Partial<HealthState>;
        user?: Partial<LightdashUserWithAbilityRules>;
    };
};

const AppProviderMock: FC<PropsWithChildren<AppProviderMockProps>> = ({
    children,
    mocks,
}) => {
    const health = useQuery<HealthState, ApiError>({
        queryKey: ['health'],
        queryFn: () => mockHealthResponse(mocks?.health),
    });

    const user = useQuery<UserWithAbility, ApiError>({
        queryKey: ['user'],
        queryFn: () => {
            const userResponse = mockUserResponse(mocks?.user);

            return {
                ...userResponse,
                ability: new Ability(userResponse.abilityRules),
            };
        },
        enabled: !!health.data?.isAuthenticated,
    });

    return (
        <AppProviderContext.Provider
            value={{
                health,
                user,
                isFullscreen: false,
                toggleFullscreen: () => {},
            }}
        >
            {children}
        </AppProviderContext.Provider>
    );
};

export default AppProviderMock;
