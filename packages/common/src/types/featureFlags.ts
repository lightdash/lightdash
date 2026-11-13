/**
 * Consider adding a short description of the feature flag and how it
 * will be used.
 *
 * If the feature flag is no longer in use, remove it from this enum.
 */
export enum FeatureFlags {
    DbtExplicitCredentials = 'dbt-explicit-credentials',
    /**
     * Agent identity gates agent query identity, organisation settings and
     * Snowflake agent sign-in. Off by default; organization scope; no handler.
     */
    AgentIdentity = 'agent-identity',
    OAuthScopeEnforcement = 'oauth-scope-enforcement',

    MultiConnectionProjects = 'multi-connection-projects',
    /**
     * CLI previews inherit the parent's connection settings on a different
     * Snowflake warehouse.
     * Off by default; organization scope; no handler.
     */
    PreviewInheritsAcrossWarehouses = 'preview-inherits-across-warehouses',
    /** Extra warehouse connections of a different type to the project's original connection. */
    MixedWarehouseConnections = 'mixed-warehouse-connections',
    /** Backend-provisioned usage analytics projects. */
    /* Gate new timezone features: warehouse session timezone, timezone-aware
       DATE_TRUNC, per-viewer (user-profile) timezone resolution, result
       formatting, etc. Temporary — remove once stable. */
    EnableTimezoneSupport = 'enable-timezone-support',

    /**
     * Enable the ability to show the warehouse execution time and total time in the chart tile.
     */
    ShowExecutionTime = 'show-execution-time',

    /**
     * Enable admin user impersonation. When disabled, impersonation
     * actions are blocked and active sessions are cleared.
     */
    UserImpersonation = 'user-impersonation',

    /**
     * Keep visited dashboard tabs mounted in the DOM (hidden) for instant
     * re-switching. Enabled by default; disabled per-org for orgs where
     * large dashboards spiked browser memory to 3 GB+ from accumulated
     * tab content.
     */
    DashboardTabsInMemory = 'dashboard-tabs-in-memory',

    /**
     * Enable dashboard controls: the new bar and sidebar for filter
     * controls.
     * Rolled out per organization. Temporary: remove once the new bar
     * replaces the shipped one.
     */
    DashboardControls = 'dashboard-controls',

    /**
     * Dashboard edit ergonomics: editing uses a grid twice as fine (72
     * columns, half-height rows), so tiles can land on half-steps, saved as
     * fractional positions. Rolled out per organization. Temporary: remove
     * once it is the default.
     */
    DashboardEditErgonomics = 'dashboard-edit-ergonomics',

    /**
     * Data apps availability, computed rather than rolled out: on for any org
     * with AI (the AI copilot flag or an AI trial) on an instance with a
     * configured sandbox runtime. Overrides and the flag default are ignored
     * (see CommercialFeatureFlagModel). Self-hosted deployments can still
     * force it on with APPS_RUNTIME_ENABLED=true, which the config parser
     * translates into the enable allowlist. Does not gate Chart Studio, which
     * is available with a valid licence and a configured sandbox provider.
     */
    EnableDataApps = 'enable-data-apps',

    /**
     * AI access (in-app agent, Slack agent, MCP) skips the results cache,
     * earlier results and pre-aggregates. Off by default; organization scope.
     */
    AiAccessSkipResultsCache = 'ai-access-skip-results-cache',

    /**
     * Per-user / per-organization gate for the data app state store
     * (`useAppState` / `useSharedAppState` in the SDK and its endpoints).
     * Resolves user override, then organization, then instance default.
     * Disabled by default on Cloud and self-hosted.
     */
    EnableDataAppState = 'enable-data-app-state',

    /**
     * Per-organization gate for Viewer access to data apps. Viewers open
     * apps shared with them and run only the queries each app version's
     * saved data references cover. Disabled by default on Cloud and
     * self-hosted.
     */
    DataAppConsumerAccess = 'data-app-consumer-access',

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

    /**
     * Offer AI agents the askUser tool in web app threads: the agent ends its
     * turn with clickable clarifying questions. Off by default; enable per org.
     */
    AiAgentAskUser = 'ai-agent-ask-user',

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
     * Enable api query sources: queries sent live to an external API (HogQL
     * to PostHog) through a project connection, and the Live data sources
     * project settings page. Off by default; enable per org. Also on wherever
     * NewOnboarding is on, unless a user or org override turns it off.
     */
    ApiQuerySources = 'api-query-sources',

    /**
     * Keeps the models of a project that has no dbt connection on the server,
     * and lets the Semantic Studio agent draft changes to them for a person to
     * apply. Off by default; organization-scoped.
     */
    SemanticStudioEditing = 'semantic-studio-editing',

    /**
     * Saves a Semantic Studio change to a GitHub dbt repository with a script
     * run in an in-process sandbox, committed through the GitHub API, instead
     * of a coding-agent sandbox. Off by default; organization-scoped.
     */
    SemanticStudioCodeMode = 'semantic-studio-code-mode',

    /**
     * Configurable retention for AI agent threads. Off by default; enabled
     * per-org on demand for enterprise customers.
     */
    AiThreadRetention = 'ai-thread-retention',

    /**
     * Prevent users from deleting their own AI agent threads. Admins can
     * still delete threads from the agent admin threads view. Off by default.
     */
    AiDisableThreadDeletion = 'ai-disable-thread-deletion',

    /**
     * Custom metrics created while building a chart inside a dashboard are
     * kept on the dashboard and offered when building later charts there.
     * Off by default.
     */
    DashboardCustomMetrics = 'dashboard-custom-metrics',
    /**
     * Build and edit charts in a full-screen modal over the dashboard
     * instead of navigating away. Off by default.
     */
    InDashboardChartEditor = 'in-dashboard-chart-editor',

    /**
     * AI agent battle mode: send one prompt to two models in paired threads
     * and compare the answers side by side with response timings. Internal
     * experiment, off by default.
     */
    AiAgentBattleMode = 'ai-agent-battle-mode',
    /**
     * Slack agent answers send eligible bar/line charts as native charts. Off by default; standard
     * resolver for the prompt author: ENV enable/disable lists, then user → org override → default.
     */
    AiAgentSlackNativeCharts = 'ai-agent-slack-native-charts',
    /**
     * Organization-scoped: keep dbt's partial_parse.msgpack from a compile on
     * the worker and seed the next compile of the same project and dbt source
     * with it, so `dbt ls` re-parses only changed files. dbt checks file
     * hashes, profile, vars and its own version and falls back to a full parse
     * on any mismatch. Off by default.
     */
    DbtPartialParse = 'dbt-partial-parse',
    /**
     * Organization-scoped: Athena connections can authenticate with this
     * instance's Google workload identity instead of AWS keys. Only enable on
     * instances whose pods run as their own Google service account.
     */
    AthenaWebIdentityAuth = 'athena-web-identity-auth',
    /**
     * Organization-scoped: the Mobile page under Your settings, with links to
     * install and sign in to the mobile apps. Off by default.
     */
    MobileSettings = 'mobile-settings',
    /**
     * Organization-scoped: the sign-in step on the Mobile page and its
     * endpoints. Off by default until an app release supports QR sign-in.
     */
    MobileQrSignIn = 'mobile-qr-sign-in',
    /**
     * Organization-scoped, off by default: BigQuery workload identity federation.
     * Only enable on instances whose pods run as their own Google service account.
     */
    BigqueryWorkloadIdentityAuth = 'bigquery-workload-identity-auth',
    /**
     * Organization-scoped: org admins can bring their own AI provider keys,
     * restrict model visibility, and route those keys through a custom base
     * URL (an OpenAI/Anthropic/Gemini-compatible gateway). Off by default;
     * while off, stored org provider config is ignored and the instance
     * providers are used. Enable it for an org BEFORE it stores a key.
     */
    OrgAiCustomProviders = 'org-ai-custom-providers',
    /**
     * Experiment, off by default: dashboards always fit the screen in view
     * mode, and the fit to screen toggle is removed. Enabled for internal
     * instances only while we gather feedback.
     */
    DashboardFitToScreenDefault = 'dashboard-fit-to-screen-default',
    /**
     * Org-scoped, off: composer charts as dashboard tiles. Not for orgs embedding with
     * @lightdash/sdk < TBD (first with PR #32548): older SDKs crash the whole embed.
     */
    ComposerCharts = 'composer-charts',
}

export type FeatureFlag = {
    id: string;
    enabled: boolean;
};

export function isFeatureFlags(value: string): value is FeatureFlags {
    return Object.values(FeatureFlags).includes(value as FeatureFlags);
}
