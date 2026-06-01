/**
 * Consider adding a short description of the feature flag and how it
 * will be used.
 *
 * If the feature flag is no longer in use, remove it from this enum.
 */
export enum FeatureFlags {
    /* Show user groups */
    UserGroupsEnabled = 'user-groups-enabled',

    /* Send local timezone to the warehouse session */
    EnableUserTimezones = 'enable-user-timezones',

    /* Gate new timezone features: warehouse session timezone, timezone-aware
       DATE_TRUNC, result formatting, etc. Temporary — remove once stable. */
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
     * Enable AI Dashboard Summary feature (generates summaries of dashboard
     * contents using the AI Copilot).
     */
    AiDashboardSummary = 'ai-dashboard-summary',

    /**
     * Enable Autopilot project health agent.
     */
    AiAutopilot = 'ai-autopilot',

    /**
     * Enable AI agent revamp features including built-in skills, the
     * loadSkill tool, and content tools like readContent/editContent/createContent.
     * When enabled, these replace older dashboard-specific content lookup
     * tools in the agent tool surface.
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
     * Show empty-state suggestion chips above the AI agent chat input. Each
     * chip carries a tool hint that biases the agent toward the implied tool
     * on the first turn. Gated for staged rollout while we tune the Haiku
     * prompt and measure click-through.
     */
    AiAgentSuggestions = 'ai-agent-suggestions',

    /**
     * Enable the new pivot-column-sort UI: per-pivot-column sort menu on
     * pivot table headers, sort-direction indicators, and the pinned
     * pivot-column entries in the Sort popover. Backend support
     * (per-metric anchor CTE, pivot_values persistence) is always on;
     * this flag only gates the UI/UX so we can validate with design
     * partners before announcing GA.
     */
    PivotColumnSort = 'pivot-column-sort',

    /**
     * Gate the "Schedule delivery" entry point for data apps. Disabled by
     * default while the screenshot pipeline is producing blank pages in
     * production. Enable per-org once the underlying rendering issue is
     * fixed.
     */
    DataAppsScheduledDeliveries = 'data-apps-scheduled-deliveries',

    /**
     * Enable UI for hiding dimensions in pivot table charts (so a dimension
     * can drive sort order without rendering or leaking into CSV/XLSX).
     * Off by default while we validate with design partners before GA.
     */
    HidePivotDimensions = 'hide-pivot-dimensions',

    /**
     * Enable the "Group repeated row values" toggle on pivot tables — visual
     * dedup of row-header dim values without rendering aggregate subtotal
     * rows. Off by default while we validate the rendering across customer
     * data shapes before GA.
     */
    PivotRowGrouping = 'pivot-row-grouping',

    /**
     * Enable AI agent review classifier experiments.
     */
    AiAgentReviewClassifier = 'ai-agent-review-classifier',

    /**
     * Show a persistent trial warning banner for an organization on shared
     * instances. This does not block product access.
     */
    OrganizationTrialWarning = 'organization-trial-warning',

    /**
     * Enable the (in-progress) AI writeback feature. Spins up an e2b
     * sandbox pre-loaded with dbt and the Claude Code CLI, then runs a
     * user-supplied prompt against it synchronously. Off by default — gated
     * while the sandbox runtime and write-back semantics are still being
     * built out.
     */
    AiWriteback = 'ai-writeback',

    /**
     * Enable the built-in system agent fallback in Slack. When enabled, if a
     * Slack channel has no configured agent, the system will use the built-in
     * system agent instead of showing an error. Independent of AiWriteback so
     * the features can be toggled separately.
     */
    AiSlackSystemAgentFallback = 'ai-slack-system-agent-fallback',

    /**
     * Enable one-click "Connect GitHub" setup for AI agent MCP servers. When
     * enabled (and the org has a GitHub App installation the user can manage),
     * the agent MCP settings offer a button that provisions the hosted GitHub
     * MCP using the org's existing installation token — no manual URL/auth.
     */
    GithubMcpOneClick = 'github-mcp-one-click',

    /**
     * Gate the org-level export Limits settings panel (per-org query max rows
     * and CSV cells limit). Backend enforcement of any stored overrides is
     * always on; this flag only controls who can see/configure the panel.
     */
    ProLimits = 'pro-limits',
}

export type FeatureFlag = {
    id: string;
    enabled: boolean;
};

export function isFeatureFlags(value: string): value is FeatureFlags {
    return Object.values(FeatureFlags).includes(value as FeatureFlags);
}
