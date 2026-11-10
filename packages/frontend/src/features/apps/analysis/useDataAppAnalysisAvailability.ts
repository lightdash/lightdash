import { useAiOrganizationSettings } from '../../../ee/features/aiCopilot/hooks/useAiOrganizationSettings';
import useApp from '../../../providers/App/useApp';

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

/**
 * Whether a viewer-facing surface offers the analysis entry point. Analysis
 * is on by flag everywhere AI is, so an off org would otherwise show an
 * "off" panel on every dashboard and app; only admins, who can turn it on,
 * see that.
 */
export const isAnalysisEntryVisible = (
    availability: DataAppAnalysisAvailability,
    canManageOrganization: boolean,
): boolean =>
    availability.status === 'available' ||
    (availability.status === 'unavailable' &&
        availability.reason === 'org_setting_off' &&
        canManageOrganization);

export const useIsAnalysisEntryVisible = (
    availability: DataAppAnalysisAvailability,
): boolean => {
    const { user } = useApp();
    return isAnalysisEntryVisible(
        availability,
        user.data?.ability.can('manage', 'Organization') ?? false,
    );
};
