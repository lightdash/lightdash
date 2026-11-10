import { useAiOrganizationSettings } from '../../../ee/features/aiCopilot/hooks/useAiOrganizationSettings';

export type DataAppAnalysisUnavailableReason =
    | 'org_setting_off'
    | 'copilot_off';

export type DataAppAnalysisAvailability =
    | { status: 'loading' }
    | {
          status: 'available';
          canContinueInAskAi: boolean;
      }
    | {
          status: 'unavailable';
          reason: DataAppAnalysisUnavailableReason;
      };

export const UNAVAILABLE_COPY: Record<
    DataAppAnalysisUnavailableReason,
    string
> = {
    copilot_off: 'AI is not enabled for this organization.',
    org_setting_off: 'AI analysis is turned off for this organization.',
};

/** Settings page an org admin turns the blocker on at; null when nothing in-product does. */
export const UNAVAILABLE_SETTINGS_PATH: Record<
    DataAppAnalysisUnavailableReason,
    string | null
> = {
    copilot_off: '/generalSettings/ai/general',
    org_setting_off: '/generalSettings/dataApps/aiAnalysis',
};

/**
 * Mirrors the backend gates so the entry point can explain a disabled state
 * instead of failing a request. The backend re-checks everything. Consent
 * (org setting) and AI entitlement are shared across targets; data-app
 * analysis is only offered inside data apps, which have their own gate.
 */
export const useAnalysisAvailability = (): DataAppAnalysisAvailability => {
    const { data: aiSettings, isInitialLoading } = useAiOrganizationSettings();

    if (isInitialLoading) {
        return { status: 'loading' };
    }
    if (!aiSettings?.isCopilotEnabled && !aiSettings?.isTrial) {
        return { status: 'unavailable', reason: 'copilot_off' };
    }
    if (!aiSettings.dataAppRuntimeAiEnabled) {
        return { status: 'unavailable', reason: 'org_setting_off' };
    }
    return {
        status: 'available',
        canContinueInAskAi: aiSettings.dataAppContinueInAskAiEnabled ?? true,
    };
};

export const useDataAppAnalysisAvailability = (): DataAppAnalysisAvailability =>
    useAnalysisAvailability();
