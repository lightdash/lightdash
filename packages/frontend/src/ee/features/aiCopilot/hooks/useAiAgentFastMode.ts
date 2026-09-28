import { FeatureFlags } from '@lightdash/common';
import { useLocalStorage } from '@mantine/hooks';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';

const FAST_MODE_STORAGE_KEY = 'lightdash-ai-agent-fast-mode';

// Read at send time so every chat surface honours the saved choice.
export const readAiAgentFastMode = (): boolean => {
    try {
        return window.localStorage.getItem(FAST_MODE_STORAGE_KEY) !== 'false';
    } catch {
        return true;
    }
};

export const useAiAgentFastMode = () => {
    const flag = useServerFeatureFlag(FeatureFlags.AiAgentFastDecisions);
    const [enabled, setEnabled] = useLocalStorage<boolean>({
        key: FAST_MODE_STORAGE_KEY,
        defaultValue: true,
        getInitialValueInEffect: false,
    });
    return {
        available: flag.data?.enabled === true,
        enabled,
        setEnabled,
    };
};
