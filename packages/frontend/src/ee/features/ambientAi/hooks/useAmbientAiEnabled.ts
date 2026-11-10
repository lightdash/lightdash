import { useOptionalAiAccessGate } from '../../../../features/aiAccess/useOptionalAiAccessGate';
import useHealth from '../../../../hooks/health/useHealth';
import { useProjectUuid } from '../../../../hooks/useProjectUuid';

export const useAmbientAiEnabled = (
    projectUuid?: string,
    options?: { enabled?: boolean },
) => {
    const routeProjectUuid = useProjectUuid();
    const { data: health } = useHealth();
    const { disabled } = useOptionalAiAccessGate(
        projectUuid ?? routeProjectUuid,
        {
            enabled: options?.enabled ?? true,
            ambientAvailable: health?.ai?.isAmbientAiEnabled === true,
        },
    );
    return !disabled;
};
