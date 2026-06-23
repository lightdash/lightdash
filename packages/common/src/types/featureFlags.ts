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
     * Enable the data-app external-fetch proxy: external connections, the proxy
     * endpoint, the admin settings page, and the iframe bridge path. Disabled by
     * default; must be turned on per organization. When off, every external-access
     * code path is locked down.
     */
    EnableDataAppExternalAccess = 'enable-data-app-external-access',

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
     * Enable the `searchSemanticLayer` agent tool, which lets the AI agent
     * list/search metrics and dimensions across ALL explores at once (backed
     * by the catalog search index) to answer project-wide questions like
     * "find duplicate or confusingly similar metrics". Off by default while
     * the tool and its prompt routing are validated.
     */
    SearchSemanticLayer = 'search-semantic-layer',

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
     * Enable one-click "Connect GitHub" setup for AI agent MCP servers. When
     * enabled (and the org has a GitHub App installation the user can manage),
     * the agent MCP settings offer a button that provisions the hosted GitHub
     * MCP using the org's existing installation token — no manual URL/auth.
     */
    GithubMcpOneClick = 'github-mcp-one-click',

    /**
     * Let users link their personal GitHub account (user-to-server OAuth
     * token) so write-back commits and pull requests are authored as them
     * instead of the Lightdash GitHub App bot. Off by default while the
     * link/unlink UX and token lifecycle are validated; when off, write-backs
     * keep today's bot identity.
     */
    GithubUserCredentials = 'github-user-credentials',

    /**
     * Let the AI agent discover and read any repository the org's GitHub App
     * installation can see, through a read-only shell (ls/cat/find/grep/head)
     * backed by the GitHub API — no E2B sandbox/clone. `discoverRepos` lists
     * accessible repos and `exploreRepo` reads them through a single virtual
     * filesystem: the dbt project is mounted (subPath-scoped) at `/dbt` and every
     * accessible repo whole at `/<owner>/<repo>`, with per-repo trees fetched
     * lazily and a per-run materialization budget bounding recursive walks. Lets
     * the agent inspect source before diagnosing, instead of guessing or spinning
     * up a writeback sandbox.
     *
     * Value kept as `repo-fs` for backwards compatibility with existing flag
     * configuration; the symbol was renamed from `RepoFs`.
     */
    RepoDiscovery = 'repo-fs',

    /**
     * Gate the org-level export Limits settings panel (per-org query max rows
     * and CSV cells limit). Backend enforcement of any stored overrides is
     * always on; this flag only controls who can see/configure the panel.
     */
    ProLimits = 'pro-limits',

    /**
     * Show the AWS IAM authentication option on the Redshift connection form.
     * When off, only username/password auth is offered. Lets IAM auth be
     * rolled out / disabled per-org at runtime without a deploy.
     */
    RedshiftIamAuth = 'redshift-iam-auth',
}

export type FeatureFlag = {
    id: string;
    enabled: boolean;
};

export function isFeatureFlags(value: string): value is FeatureFlags {
    return Object.values(FeatureFlags).includes(value as FeatureFlags);
}
