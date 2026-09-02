import { CommercialFeatureFlags } from '../ee/commercialFeatureFlags';
import { FeatureFlags } from '../types/featureFlags';

/**
 * Flags that must NOT be force-enabled in preview environments. Everything
 * else is on by default there so QA can exercise recent features without a
 * redeploy. Keep the reason next to each entry.
 */
const PREVIEW_EXCLUDED_FEATURE_FLAGS: ReadonlySet<string> = new Set<string>([
    // Blocks or degrades every page.
    FeatureFlags.OrganizationTrialBlock,
    FeatureFlags.OrganizationTrialWarning,
    // Changes query or compile semantics, so QA results would be misleading.
    FeatureFlags.CalculateSeriesColor,
    FeatureFlags.ReplaceCustomMetricsOnCompile,
    // Needs per-org worker queues that previews don't run.
    FeatureFlags.ScheduledDeliveryPerOrgQueue,
    // Changes the signup flow and needs SMTP for the email OTP. The register
    // page evaluates it anonymously, so an override can't switch it back off.
    FeatureFlags.NewOnboarding,
    // Acts outside the environment: opens pull requests on real repos.
    FeatureFlags.AiPreviewDeploySetup,
    // Off pending a security review, or only meaningful for eval orgs.
    FeatureFlags.SsoOrganizationSettings,
    FeatureFlags.AiReviewReplayCapture,
    // Security hardening: previews must not accept long-lived GitHub PATs.
    FeatureFlags.AiMcpGithubPat,
    // The Explorer E2E specs drive the legacy chart type picker, which the
    // gallery replaces; keep previews on the shipped path until it has its
    // own coverage. QA can still turn it on with a feature_flag_overrides row.
    FeatureFlags.ExplorerChartGallery,
    // Same reason: the dashboard E2E specs drive the navigate-away "New chart"
    // flow, which the in-dashboard modal replaces. Opt-in POC — keep previews
    // on the shipped path until it has its own coverage.
    FeatureFlags.DashboardCustomMetrics,
    // Derived from instance configuration: left to their config handler so a
    // preview never advertises a feature whose backend isn't configured.
    CommercialFeatureFlags.AiCopilot,
    // Changes permission semantics per org: makes the org custom role's PAT
    // scope authoritative. Opt-in only; QA enables via feature_flag_overrides.
    CommercialFeatureFlags.PatScopeAuthoritative,
    FeatureFlags.ResultsCacheEnabled,
    FeatureFlags.EnableTimezoneSupport,
]);

export const ALL_FEATURE_FLAG_IDS: readonly string[] = [
    ...Object.values(FeatureFlags),
    ...Object.values(CommercialFeatureFlags),
].sort();

const KNOWN_FEATURE_FLAG_IDS: ReadonlySet<string> = new Set(
    ALL_FEATURE_FLAG_IDS,
);

export const isKnownFeatureFlagId = (flagId: string): boolean =>
    KNOWN_FEATURE_FLAG_IDS.has(flagId);

/** Flags enabled by default in preview/Okteto environments. */
export const PREVIEW_ENABLED_FEATURE_FLAGS: ReadonlySet<string> = new Set(
    ALL_FEATURE_FLAG_IDS.filter(
        (flagId) => !PREVIEW_EXCLUDED_FEATURE_FLAGS.has(flagId),
    ),
);
