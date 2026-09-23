import { FeatureFlags } from '@lightdash/common';
import { useAiOrganizationSettings } from '../../../ee/features/aiCopilot/hooks/useAiOrganizationSettings';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';

export type DataAppAnalysisUnavailableReason =
    | 'not_rolled_out'
    | 'org_setting_off'
    | 'copilot_off';

export type DataAppAnalysisAvailability =
    | { status: 'loading' }
    | {
          status: 'available';
          canContinueInAskAi: boolean;
          /** Org default for analysing on load; an app may override it. */
          autoAnalyseDefault: boolean;
      }
    | {
          status: 'unavailable';
          reason: DataAppAnalysisUnavailableReason;
      };

export const UNAVAILABLE_COPY: Record<
    DataAppAnalysisUnavailableReason,
    string
> = {
    not_rolled_out: 'AI analysis is not available for this organization yet.',
    copilot_off: 'AI is not enabled for this organization.',
    org_setting_off:
        'AI analysis in data apps is turned off for this organization.',
};

/** Settings page an org admin turns the blocker on at; null when nothing in-product does. */
export const UNAVAILABLE_SETTINGS_PATH: Record<
    DataAppAnalysisUnavailableReason,
    string | null
> = {
    not_rolled_out: null,
    copilot_off: '/generalSettings/ai/general',
    org_setting_off: '/generalSettings/dataApps/aiAnalysis',
};

/**
 * Mirrors the backend gates so the entry point can explain a disabled state
 * instead of failing a request. The backend re-checks everything.
 */
export const useDataAppAnalysisAvailability =
    (): DataAppAnalysisAvailability => {
        const analysisFlag = useServerFeatureFlag(
            FeatureFlags.EnableDataAppAnalysis,
        );
        const { data: aiSettings, isInitialLoading } =
            useAiOrganizationSettings();

        if (analysisFlag.isInitialLoading || isInitialLoading) {
            return { status: 'loading' };
        }
        if (!analysisFlag.data?.enabled) {
            return { status: 'unavailable', reason: 'not_rolled_out' };
        }
        if (!aiSettings?.isCopilotEnabled && !aiSettings?.isTrial) {
            return { status: 'unavailable', reason: 'copilot_off' };
        }
        if (!aiSettings.dataAppRuntimeAiEnabled) {
            return { status: 'unavailable', reason: 'org_setting_off' };
        }
        return {
            status: 'available',
            canContinueInAskAi:
                aiSettings.dataAppContinueInAskAiEnabled ?? true,
            autoAnalyseDefault: aiSettings.dataAppAutoAnalysisEnabled ?? false,
        };
    };
