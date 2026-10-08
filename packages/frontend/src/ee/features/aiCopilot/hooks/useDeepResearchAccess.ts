import { subject } from '@casl/ability';
import { FeatureFlags } from '@lightdash/common';
import useHealth from '../../../../hooks/health/useHealth';
import { useImpersonation } from '../../../../hooks/user/useImpersonation';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../../providers/App/useApp';

export const canStartDeepResearch = ({
    canCreate,
    isDocumentsEnabled,
    isEnvironmentReady,
    isImpersonating,
}: {
    canCreate: boolean;
    isDocumentsEnabled: boolean;
    isEnvironmentReady: boolean;
    isImpersonating: boolean;
}): boolean =>
    isEnvironmentReady && canCreate && isDocumentsEnabled && !isImpersonating;

export const useDeepResearchAccess = (projectUuid: string | undefined) => {
    const { user } = useApp();
    const health = useHealth();
    const { isImpersonating } = useImpersonation();
    const documentsFlag = useServerFeatureFlag(FeatureFlags.Documents);
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
        isDocumentsEnabled: documentsFlag.data?.enabled ?? false,
        isEnvironmentReady: health.data !== undefined,
        isImpersonating,
    });
};
