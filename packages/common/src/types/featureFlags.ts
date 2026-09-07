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
     * Enable the dynamic calculation of series color, when not manually set on the chart config.
     * This aims to make the colors more consistent, depending on the groups, but this could cause the opposite effect.
     * For more details, see https://github.com/lightdash/lightdash/issues/13831
     */
    CalculateSeriesColor = 'calculate-series-color',

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
     * Keep Explorer fields mounted on the left while chart selection and
     * configuration render in a right sidebar.
     */
    ExplorerChartGallery = 'explorer-chart-gallery',

    /**
     * Per-organization gate for declaring custom npm dependencies in data
     * apps. Disabled by default; self-hosted instances can enable it globally
     * via LIGHTDASH_ENABLE_FEATURE_FLAGS.
     */
    EnableDataAppCustomDependencies = 'enable-data-app-custom-dependencies',

    /**
     * Enable Autopilot project health agent.
     */
    AiAutopilot = 'ai-autopilot',

    /**
     * Legacy no-op retained so existing self-hosted feature flag configuration
     * remains valid. Deep Research now follows AI Copilot availability.
     */
    AiDeepResearch = 'ai-deep-research',

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
     * Show the organization roadmap and enable its read-only API proxy.
     */
    OrganizationRoadmap = 'organization-roadmap',

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
     * Show the coding-agent project onboarding flow. This gates only the UI;
     * the CLI, APIs, and installed skills remain available independently.
     */
    CodingAgentOnboarding = 'coding-agent-onboarding',

    /**
     * Allow storing long-lived GitHub personal access tokens as GitHub MCP
     * credentials (guided connect flow and generic bearer endpoints targeting
     * the hosted GitHub MCP URL). Off by default — orgs should authenticate
     * via the Lightdash GitHub App, which mints a short-lived installation
     * token per run and stores no long-lived secret. When off, previously
     * stored PATs are also ignored at runtime. Enable
     * per-org only as a stopgap for orgs that cannot install the GitHub App.
     */
    AiMcpGithubPat = 'ai-mcp-github-pat',

    /**
     * Gate the whole new onboarding experience as one unit: email-only
     * signup (register collects only an email; ownership proven via email
     * OTP), the full-page organization setup experience shown after
     * registration, and the dbt-less "connect to your warehouse" onboarding
     * path including the Snowflake "connect via CLI (SSO)" auth method in
     * project creation. Off by default. Note: the register page evaluates
     * this flag anonymously, so per-org overrides do not apply there —
     * enable instance-wide (or for everyone in posthog) to turn on signup.
     */
    NewOnboarding = 'new-onboarding',

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
     * Advertise compact filter expressions to AI agent and MCP metric-query
     * tools, resolving them to the existing filter model at the tool boundary.
     * Off by default while the public contract is rolled out per organization.
     */
    AiFilterExpressions = 'ai-filter-expressions',

    /* Merge two or more queries into one warehouse statement from the
       explorer. Gated because it compiles novel SQL shapes (multi-CTE joins,
       conditional-aggregation widening) that no other path exercises. */
    MergeQueries = 'merge-queries',

    /**
     * Enable the async compose SQL endpoint
     * (POST /api/v2/projects/{projectUuid}/query/compose-sql), which runs
     * DuckDB SQL over other queries' results, exposed as named tables via
     * the request's references map ({"orders": "<queryUuid>"}).
     * Off by default; on in preview/dev environments via
     * PREVIEW_ENABLED_FEATURE_FLAGS.
     */
    ComposeSqlRunner = 'compose-sql-runner',

    /**
     * Enable the multi-source query endpoints
     * (/api/v2/projects/{projectUuid}/query-sources/*): source discovery,
     * schema scans, source-query submission and batch status. Off by
     * default; on in preview/dev environments via
     * PREVIEW_ENABLED_FEATURE_FLAGS.
     */
    MultiSourceQuery = 'multi-source-query',

    /**
     * Enable the "My query history" page
     * (/projects/{projectUuid}/query-history) and its listing endpoint
     * (GET /api/v2/projects/{projectUuid}/query/history). Off by default.
     */
    QueryHistory = 'query-history',

    /**
     * Run merges as composition: each source executes separately against
     * the warehouse and the DuckDB compose engine joins the results. Falls
     * back to the single-statement warehouse merge when the compose engine
     * is unavailable or the merge needs a pivot. Off by default.
     */
    MergeOnCompose = 'merge-on-compose',

    /**
     * Configurable retention for AI agent threads. Off by default; enabled
     * per-org on demand for enterprise customers.
     */
    AiThreadRetention = 'ai-thread-retention',

    /**
     * External data sources: upload CSV files or connect Google Sheets as
     * project tables. Tables are ingested to typed parquet in object storage,
     * generated as explores (ExploreType.EXTERNAL_SOURCE), and queried on the
     * DuckDB compose engine — so this requires the enterprise pre-aggregates
     * engine and its S3 configuration. Off by default.
     */
    ExternalSources = 'external-sources',

    /**
     * Prevent users from deleting their own AI agent threads. Admins can
     * still delete threads from the agent admin threads view. Off by default.
     */
    AiDisableThreadDeletion = 'ai-disable-thread-deletion',

    /**
     * Enables the chart type library tab: browsing and installing official
     * chart types from the configured chart registry. Default: off.
     */
    ChartTypeRegistry = 'chart-type-registry',

    /**
     * Custom metrics created while building a chart inside a dashboard are
     * kept on the dashboard and offered when building later charts there.
     * Off by default.
     */
    DashboardCustomMetrics = 'dashboard-custom-metrics',

    /**
     * AI agent battle mode: send one prompt to two models in paired threads
     * and compare the answers side by side with response timings. Internal
     * experiment, off by default.
     */
    AiAgentBattleMode = 'ai-agent-battle-mode',
}

export type FeatureFlag = {
    id: string;
    enabled: boolean;
};

export function isFeatureFlags(value: string): value is FeatureFlags {
    return Object.values(FeatureFlags).includes(value as FeatureFlags);
}
