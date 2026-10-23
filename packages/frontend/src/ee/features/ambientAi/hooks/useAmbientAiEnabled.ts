import { useAiAccessGate } from '../../../../features/aiAccess/useAiAccessGate';
import useHealth from '../../../../hooks/health/useHealth';
import { useProjectUuid } from '../../../../hooks/useProjectUuid';

/**
 * Checks if the ambient ai is enabled.
 * It checks if the shared anthropic api key is available or if AI copilot is available
 */
export const useAmbientAiEnabled = (projectUuid?: string) => {
    const routeProjectUuid = useProjectUuid();
    const { disabled } = useAiAccessGate(projectUuid ?? routeProjectUuid);
    const { data: health } = useHealth();
    return (
        !disabled &&
        (health?.ai.isAmbientAiEnabled || health?.ai.isCopilotAvailable)
    );
};
