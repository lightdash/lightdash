import {
    FeatureFlags,
    isPersonalSignInExpiredMessage,
} from '@lightdash/common';
import { useServerFeatureFlag } from './useServerOrClientFeatureFlag';

export const useIsPersonalSignInExpired = (
    message: string | null | undefined,
): boolean => {
    const flag = useServerFeatureFlag(FeatureFlags.ExpiredSignInState);
    return (
        flag.data?.enabled === true &&
        Boolean(message && isPersonalSignInExpiredMessage(message))
    );
};
