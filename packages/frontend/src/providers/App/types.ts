import { type ApiError, type HealthState } from '@lightdash/common';
import { type UseQueryResult } from '@tanstack/react-query';
import { type UserWithAbility } from '../../hooks/user/useUser';

export interface AppContext {
    health: UseQueryResult<HealthState, ApiError>;
    user: UseQueryResult<UserWithAbility, ApiError>;
}
