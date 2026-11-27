import { CommercialFeatureFlags } from '../ee/commercialFeatureFlags';
import { FeatureFlags } from '../types/featureFlags';
import { LIVE_SOURCE_FEATURE_FLAGS } from '../utils/liveSourceIntegrations';

/**
 * Flags that must NOT be force-enabled in preview environments. Everything
 * else is on by default there so QA can exercise recent features without a
 * redeploy. Keep the reason next to each entry.
 */
const PREVIEW_EXCLUDED_FEATURE_FLAGS: ReadonlySet<string> = new Set<string>([
    // Blocks or degrades every page.
    FeatureFlags.OrganizationTrialBlock,
    FeatureFlags.OrganizationTrialWarning,
    // Off pending a security review.
    FeatureFlags.SsoOrganizationSettings,
    // Security hardening: previews must not accept long-lived GitHub PATs.
    FeatureFlags.AiMcpGithubPat,
    // Same reason: the dashboard E2E specs drive the navigate-away "New chart"
    // flow, which the in-dashboard modal replaces. Opt-in POC — keep previews
    // on the shipped path until it has its own coverage. The metrics layer
    // rides inside the modal, so it must stay off with it.
    FeatureFlags.InDashboardChartEditor,
    FeatureFlags.DashboardCustomMetrics,
    // Replaces the dashboard filter bar's edit mode with a sidebar that is
    // still being built. Opt-in: previews and the dashboard E2E specs stay on
    // the shipped filter popover.
    FeatureFlags.DashboardControls,
    // Replaces the top navbar the E2E specs navigate through. Opt-in until
    // the sidebar has its own coverage.
    FeatureFlags.LeftNavigation,
    // Derived from instance configuration: left to their config handler so a
    // preview never advertises a feature whose backend isn't configured.
    CommercialFeatureFlags.AiCopilot,
    FeatureFlags.AiThreadImages,
    // Changes permission semantics per org: makes the org custom role's PAT
    // scope authoritative. Opt-in only; QA enables via feature_flag_overrides.
    CommercialFeatureFlags.PatScopeAuthoritative,
    FeatureFlags.EnableTimezoneSupport,
]);

export const ALL_FEATURE_FLAG_IDS: readonly string[] = [
    ...Object.values(FeatureFlags),
    ...Object.values(CommercialFeatureFlags),
].sort();

/**
 * Every flag the preview flag panel lists and lets QA override: the enums
 * plus the integrations' flags. Integration flags are never forced on in
 * previews, since integrations are already on until a flag turns them off.
 */
export const KNOWN_FEATURE_FLAG_IDS: readonly string[] = [
    ...ALL_FEATURE_FLAG_IDS,
    ...LIVE_SOURCE_FEATURE_FLAGS,
].sort();

const KNOWN_FEATURE_FLAG_ID_SET: ReadonlySet<string> = new Set(
    KNOWN_FEATURE_FLAG_IDS,
);

export const isKnownFeatureFlagId = (flagId: string): boolean =>
    KNOWN_FEATURE_FLAG_ID_SET.has(flagId);

/** Flags enabled by default in preview environments. */
export const PREVIEW_ENABLED_FEATURE_FLAGS: ReadonlySet<string> = new Set(
    ALL_FEATURE_FLAG_IDS.filter(
        (flagId) => !PREVIEW_EXCLUDED_FEATURE_FLAGS.has(flagId),
    ),
);
