/**
 * Consider adding a short description of the feature flag and how it
 * will be used.
 *
 * If the feature flag is no longer in use, remove it from this enum.
 */
export enum FeatureFlags {
    /* Show user groups */
    UserGroupsEnabled = 'user-groups-enabled',

    /* Gate new timezone features: warehouse session timezone, timezone-aware
       DATE_TRUNC, per-viewer (user-profile) timezone resolution, result
       formatting, etc. Temporary — remove once stable. */
    EnableTimezoneSupport = 'enable-timezone-support',

    /**
     * Enable scheduler task that replaces custom metrics after project compile
     */
    ReplaceCustomMetricsOnCompile = 'replace-custom-metrics-on-compile',

    /**
     * Enable the dynamic calculation of series color, when not manually set on the chart config.
     * This aims to make the colors more consistent, depending on the groups, but this could cause the opposite effect.
     * For more details, see https://github.com/lightdash/lightdash/issues/13831
     */
    CalculateSeriesColor = 'calculate-series-color',

    /**
     * Enable the ability to write back custom bin dimensions to dbt.
     */
    WriteBackCustomBinDimensions = 'write-back-custom-bin-dimensions',

    /**
     * Enable the ability to show the warehouse execution time and total time in the chart tile.
     */
    ShowExecutionTime = 'show-execution-time',

    /**
     * Enable the ability to create custom visualizations with AI
     */
    AiCustomViz = 'ai-custom-viz',

    /**
     * Enable viewing and editing YAML source files in the Explore UI
     */
    EditYamlInUi = 'edit-yaml-in-ui',

    /**
     * Enable Google Chat as a scheduled delivery destination
     */
    GoogleChatEnabled = 'google-chat-enabled',

    /**
     * On multi-org (shared-tenant) instances, route an organization's recurring
     * scheduled deliveries into a per-org graphile-worker named queue
     * (`delivery:<organizationUuid>`) so they run serially and a single org can't
     * occupy every worker / crash the headless browser pool. Default off; enable
     * per-org for gradual rollout.
     */
    ScheduledDeliveryPerOrgQueue = 'scheduled-delivery-per-org-queue',

    /**
     * Enable admin user impersonation. When disabled, impersonation
     * actions are blocked and active sessions are cleared.
     */
    UserImpersonation = 'user-impersonation',

    /**
     * Enable custom group bins for string dimensions
     */
    CustomGroupBins = 'custom-group-bins',

    /**
     * Enable changing the explore a chart points to from the chart UI
     */
    ChangeChartExplore = 'change-chart-explore',

    /**
     * Keep visited dashboard tabs mounted in the DOM (hidden) for instant
     * re-switching. Enabled by default; disabled per-org for orgs where
     * large dashboards spiked browser memory to 3 GB+ from accumulated
     * tab content.
     */
    DashboardTabsInMemory = 'dashboard-tabs-in-memory',

    /**
     * Enable creating and editing metric filters on dashboards.
     * When enabled, the "Add filter" UI includes metrics alongside dimensions.
     * Existing metric filters are always displayed regardless of this flag.
     */
    MetricDashboardFilters = 'metric-dashboard-filters',

    /**
     * Enable data apps feature. Works alongside the APPS_RUNTIME_ENABLED
     * env var — data apps are enabled if either this flag or the env var
     * is true. Disabled by default.
     */
    EnableDataApps = 'enable-data-apps',

    /**
     * Per-organization gate for declaring custom npm dependencies in data
     * apps. Layered ON TOP of the instance-level
     * LIGHTDASH_APP_CUSTOM_DEPENDENCIES_ENABLED env var: both must be true to
     * upload an app with a custom dependency set. Lets cloud enable the
     * feature for specific orgs without instance-wide exposure. Disabled by
     * default (self-hosted single-org can enable instance-wide via
     * LIGHTDASH_ENABLE_FEATURE_FLAGS).
     */
    EnableDataAppCustomDependencies = 'enable-data-app-custom-dependencies',

    /**
     * Enable AI Dashboard Summary feature (generates summaries of dashboard
     * contents using the AI Copilot).
     */
    AiDashboardSummary = 'ai-dashboard-summary',

    /**
     * Enable Autopilot project health agent.
     */
    AiAutopilot = 'ai-autopilot',

    /**
     * Enable long-running, read-only Deep Research investigations from AI chat.
     */
    AiDeepResearch = 'ai-deep-research',

    /**
     * @deprecated Rolled out to all customers. Keep for persisted feature flag config only.
     */
    AiAgentRevamp = 'ai-agent-revamp',

    /**
     * Enable the Hexbin (H3 hexagonal binning) layer type for Map charts.
     * Gates the option in the Map Type segmented control. Existing charts
     * already saved with the hexbin layer continue to render either way.
     */
    HexbinMap = 'hexbin-map',

    /**
     * Show the per-organization Single Sign-On settings panel (Azure AD and
     * future SSO providers). Off by default while the domain-claim trust
     * model is hardened — see security review notes. Enable per-org for
     * vetted customers on shared multi-org instances.
     */
    SsoOrganizationSettings = 'sso-organization-settings',

    /**
     * Expose the "Leave organization" action in the General settings danger
     * zone and accept the corresponding API call. When disabled the panel is
     * hidden and the endpoint returns a 403 — protects against accidental
     * self-removal during early rollout and lets us disable the feature
     * per-org if it causes operational issues.
     */
    LeaveOrganization = 'leave-organization',

    /**
     * Enable query results caching. DB value (user/org override or flag
     * default) takes precedence; falls back to the RESULTS_CACHE_ENABLED env
     * var when no DB row is set. Lets shared-instance customers (eu1/app)
     * opt in per-org without a redeploy.
     */
    ResultsCacheEnabled = 'results-cache-enabled',

    /**
     * Allow dashboard editors to mark individual dashboard filters as locked.
     * Locked filters are visible to viewers but cannot be edited from view
     * mode, and URL/embed filter overrides targeting a locked filter's field
     * are ignored. Gates the authoring UI; the override-stripping behaviour
     * always runs regardless of the flag so saved-locked filters stay safe
     * if the flag is later turned off.
     */
    LockDashboardFilters = 'lock-dashboard-filters',

    /**
     * Filter requirement groups + the guided locked-dashboard UX; off = legacy
     * required-filter behavior and `requiredGroupId` is ignored.
     */
    DashboardFilterRequirements = 'dashboard-filter-requirements',

    /**
     * Gate the "Schedule delivery" entry point for data apps. Disabled by
     * default while the screenshot pipeline is producing blank pages in
     * production. Enable per-org once the underlying rendering issue is
     * fixed.
     */
    DataAppsScheduledDeliveries = 'data-apps-scheduled-deliveries',

    /**
     * Show a persistent trial warning banner for an organization on shared
     * instances. This does not block product access.
     */
    OrganizationTrialWarning = 'organization-trial-warning',

    /**
     * Block an organization from running queries because its trial has
     * expired. Stronger than OrganizationTrialWarning — this DOES block a
     * product action (query execution). Off by default; enable per-org.
     */
    OrganizationTrialBlock = 'organization-trial-block',

    /**
     * Enable the admin API endpoint that captures AI review judge replay
     * inputs (candidate + evidence packet) for the offline eval scoreboard.
     * Off by default — intended only for orgs running classifier evals.
     */
    AiReviewReplayCapture = 'ai-review-replay-capture',

    /**
     * Enable the AI writeback sandbox agent's preview-deploy secondary task:
     * detecting whether a repo deploys Lightdash preview projects via GitHub
     * Actions, offering to set it up during a writeback, and the
     * setupPreviewDeploy tool (direct or on consent). Off by default and
     * independent of AiWriteback, so this outward-facing behaviour (it opens
     * extra PRs) can be dark-launched and killed without touching writeback.
     */
    AiPreviewDeploySetup = 'ai-preview-deploy-setup',

    /**
     * Enable the built-in system agent fallback in Slack. When enabled, if a
     * Slack channel has no configured agent, the system will use the built-in
     * system agent instead of showing an error. Independent of AiWriteback so
     * the features can be toggled separately.
     */
    AiSlackSystemAgentFallback = 'ai-slack-system-agent-fallback',

    /**
     * Gate the org-level export Limits settings panel (per-org query max rows
     * and CSV cells limit). Backend enforcement of any stored overrides is
     * always on; this flag only controls who can see/configure the panel.
     */
    ProLimits = 'pro-limits',

    /**
     * Replace the discoverFields sub-agent with a deterministic grep over an
     * in-memory, annotated view of the project's cached explores (explore =
     * directory, field = file). Connection-agnostic (reads compiled explores,
     * never the warehouse or git) — lets the main agent navigate fields itself
     * instead of paying the discoverFields sub-agent round-trip. Experimental.
     */
    AiGrepFields = 'ai-grep-fields',

    /**
     * Guard the agent's `searchFieldValues` tool against pathological warehouse
     * scans. When on, an empty/whitespace query — which compiles to
     * `LIKE '%%'`, i.e. "distinct the entire column" — is rejected immediately
     * with an actionable message instead of running a leading-wildcard full
     * scan that can take minutes on high-cardinality fields. Default off, so
     * behaviour is byte-identical to today when disabled; a live toggle lets the
     * new behaviour be trialled per-org without a redeploy. Experimental.
     */
    AiFieldValueSearchGuard = 'ai-field-value-search-guard',

    /**
     * Allow a single Lightdash project to connect to multiple dbt sources
     * (repos/CLI deploys). Each source stores its latest compiled manifest in
     * S3; on every deploy or preview the backend merges all sources' manifests
     * into one, compiles once, and writes a single combined explore set. Off by
     * default; the N=0 short-circuit (a project with zero registered sources
     * runs today's single-source code path byte-for-byte) is the regression
     * firewall. Enable per-org for gradual rollout.
     */
    MultiDbtSources = 'multi-dbt-sources',

    /**
     * Enable the general-purpose coding agent: the WRITE counterpart to repo
     * discovery (`repo-fs`). Lets the AI agent make a code change to any repo
     * the org's GitHub/GitLab App installation can write (intersected with the
     * triggering user's own access) and open a pull request — not just the
     * project's dbt repo. Reuses the AI-writeback E2B → signed-commit → PR
     * pipeline via a lean, no-Bash sandbox template and the `editRepo` tool.
     * Off by default and EE/license-gated; the per-repo write authz lives in
     * the service (`manage:SourceCode` + user∩installation), since this flag
     * is presence-of-feature, not permission.
     */
    CodingAgent = 'ai-coding-agent',

    /**
     * Let org admins set their own Anthropic/OpenAI API keys for AI agents.
     */
    OrgAiProviderApiKeys = 'org-ai-provider-api-keys',

    /**
     * Gate the dbt-less "connect to your warehouse" onboarding path and the
     * Snowflake "connect via CLI (SSO)" auth method in project creation.
     * Off by default; enable per-org for gradual rollout.
     */
    WarehouseConnectOnboarding = 'warehouse-connect-onboarding',

    /**
     * Cloud-only: let an organization send report/notification emails from
     * their own verified domain (email whitelabelling) instead of the
     * Lightdash address. Gates both the setup UI and the admin API. Requires a
     * Postmark account token to be configured on the instance — self-hosters
     * without one can't self-serve, so the feature stays hidden. Off by
     * default; enable per-org.
     */
    EmailWhitelabel = 'email-whitelabel',

    /**
     * Replaces the user-completion modal with a full-page organization setup
     * experience (name your organization, pick a theme colour, and tell us
     * about yourself) shown after registration. Off by default.
     */
    OrganizationSetupPage = 'organization-setup-page',

    /**
     * Allow self-serve signup with just an email address: the register page
     * collects only an email, the account is created without a password or
     * names, and ownership is proven via the existing email OTP verification.
     * Users can set a password later (settings or password reset). Off by
     * default; instance-wide toggle (evaluated anonymously, so per-org
     * overrides don't apply).
     */
    EmailOnlySignup = 'email-only-signup',
}

export type FeatureFlag = {
    id: string;
    enabled: boolean;
};

export function isFeatureFlags(value: string): value is FeatureFlags {
    return Object.values(FeatureFlags).includes(value as FeatureFlags);
}
