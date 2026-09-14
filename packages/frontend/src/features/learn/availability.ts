import { FeatureFlags } from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { useAiOrganizationSettings } from '../../ee/features/aiCopilot/hooks/useAiOrganizationSettings';
import { useIsCopilotEnabled } from '../../ee/features/aiCopilot/hooks/useIsCopilotEnabled';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import { type LearnGate, type LearnModule } from './catalogue';

/**
 * Whether this instance can run a module. A walkthrough clicks the real
 * product, so a module whose feature the instance hides (no Enterprise
 * licence, or the feature's own switch off) would highlight a control that
 * is not there; the library leaves it out rather than tagging it. The gates
 * are the ones the product's own entry points use: the licence for
 * Enterprise scopes, the licence plus the data apps flag behind the Data App
 * menu item, the
 * AI copilot switch and the agents' visibility setting behind Ask AI. Until
 * a gate has answered, its modules stay out, so the library never shows a
 * card it then takes away.
 */
export const useLearnAvailability = () => {
    const { health } = useApp();
    const dataApps = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const copilot = useIsCopilotEnabled();
    const aiSettings = useAiOrganizationSettings();
    const isEnterprise = health.data?.license?.hasLicenseKey === true;
    const dataAppsOn = dataApps.data?.enabled === true;
    const copilotOn = copilot.isCopilotEnabled;
    const agentsVisible = aiSettings.data?.aiAgentsVisible === true;
    const open = useMemo<Record<LearnGate, boolean>>(
        () => ({
            softDelete: health.data?.softDelete.enabled === true,
            enterprise: isEnterprise,
            // Data apps are Enterprise as well as flagged: without a licence
            // the app endpoints refuse and nothing seeds an app to practise
            // on.
            dataApps: isEnterprise && dataAppsOn,
            aiAgents: isEnterprise && copilotOn && agentsVisible,
        }),
        [
            isEnterprise,
            dataAppsOn,
            copilotOn,
            agentsVisible,
            health.data?.softDelete.enabled,
        ],
    );
    const isOpen = useCallback(
        (module: LearnModule) => module.gate === null || open[module.gate],
        [open],
    );
    // The licence rides on health, which the page already waits for; the
    // other gates are their own requests. Until they have answered, isOpen
    // is provisional and anything counting the catalogue should wait.
    const isSettled =
        !dataApps.isLoading && !copilot.isLoading && !aiSettings.isLoading;
    return { isOpen, isSettled };
};
