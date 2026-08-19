import { subject } from '@casl/ability';
import { LightdashMode } from '@lightdash/common';
import useHealth from '../../../../hooks/health/useHealth';
import { useImpersonation } from '../../../../hooks/user/useImpersonation';
import useApp from '../../../../providers/App/useApp';

export const canStartDeepResearch = ({
    canCreate,
    isEnvironmentReady,
    isDemo,
    isImpersonating,
}: {
    canCreate: boolean;
    isEnvironmentReady: boolean;
    isDemo: boolean;
    isImpersonating: boolean;
}): boolean => isEnvironmentReady && canCreate && !isDemo && !isImpersonating;

export const useDeepResearchAccess = (projectUuid: string | undefined) => {
    const { user } = useApp();
    const health = useHealth();
    const { isImpersonating } = useImpersonation();
    const organizationUuid = user.data?.organizationUuid;
    const canCreate =
        !!organizationUuid &&
        !!projectUuid &&
        (user.data?.ability.can(
            'create',
            subject('AiDeepResearch', { organizationUuid, projectUuid }),
        ) ??
            false);

    return canStartDeepResearch({
        canCreate,
        isEnvironmentReady: health.data !== undefined,
        isDemo: health.data?.mode === LightdashMode.DEMO,
        isImpersonating,
    });
};
