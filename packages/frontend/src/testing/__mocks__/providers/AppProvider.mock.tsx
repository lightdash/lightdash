import { Ability } from '@casl/ability';
import {
    type ApiError,
    type HealthState,
    type LightdashUserWithAbilityRules,
    type PossibleAbilities,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type FC, type PropsWithChildren } from 'react';
import { type UserWithAbility } from '../../../hooks/user/useUser';
import AppProviderContext from '../../../providers/App/context';
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
                ability: new Ability<PossibleAbilities>(
                    userResponse.abilityRules,
                ),
            };
        },
        enabled: !!health.data?.isAuthenticated,
    });

    return (
        <AppProviderContext.Provider
            value={{
                health,
                user,
            }}
        >
            {children}
        </AppProviderContext.Provider>
    );
};

export default AppProviderMock;
