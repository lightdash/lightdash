import { type UUID } from '../../types/api/uuid';
import { type ApiConnectorType } from '../../types/querySources';
import { type LiveSourceRateLimitSettings } from './liveSourceRateLimits';

export type ExternalConnectionAuthType =
    | 'none'
    | 'api_key'
    | 'bearer_token'
    | 'google_service_account'
    | 'oauth_client_credentials'
    /** Signed in through the source's OAuth flow; never set through the API. */
    | 'oauth_authorization_code';

export type OAuthClientAuthMethod = 'basic' | 'body';

/** Who a connection serves: data apps through the proxy, or live API queries. */
export type ExternalConnectionKind = 'data_app' | 'live_source';

export type PostHogApiSource = {
    connector: ApiConnectorType.POSTHOG;
    /** The PostHog project id, the number after /project/ in its URL. */
    projectId: string;
};

export type SearchConsoleApiSource = {
    connector: ApiConnectorType.SEARCH_CONSOLE;
    /** The Search Console property, such as https://example.com/ or sc-domain:example.com. */
    siteUrl: string;
};

export type Ga4ApiSource = {
    connector: ApiConnectorType.GA4;
    /** The numeric GA4 property id, without the properties/ prefix. */
    propertyId: string;
};

export type MetaAdsApiSource = {
    connector: ApiConnectorType.META_ADS;
    /** The numeric ad account id, without the act_ prefix. */
    adAccountId: string;
};

export type GoogleAdsApiSource = {
    connector: ApiConnectorType.GOOGLE_ADS;
    /** The 10-digit Google Ads customer id, without dashes. */
    customerId: string;
    /** The manager account the sign-in reaches the customer through, if any. */
    loginCustomerId: string | null;
};

export type YoutubeAnalyticsApiSource = {
    connector: ApiConnectorType.YOUTUBE_ANALYTICS;
    /** The YouTube channel id, starting with UC. */
    channelId: string;
};

export type LinkedInAdsApiSource = {
    connector: ApiConnectorType.LINKEDIN_ADS;
    /** The numeric LinkedIn ad account id, as shown in Campaign Manager. */
    adAccountId: string;
};

export type GithubApiSource = {
    connector: ApiConnectorType.GITHUB;
    /** The user or organization that owns the repository, e.g. lightdash. */
    owner: string;
    /** The repository name, without the owner, e.g. lightdash. */
    repo: string;
};

/** A Pylon workspace; the API token decides which one. */
export type PylonApiSource = {
    connector: ApiConnectorType.PYLON;
};

/** The Attio standard objects a source reads, one explore each, companies first. */
export const ATTIO_OBJECTS = [
    'companies',
    'people',
    'deals',
    'users',
    'workspaces',
] as const;
export type AttioObject = (typeof ATTIO_OBJECTS)[number];

/** The access token picks the Attio workspace, so nothing else is set. */
export type AttioApiSource = {
    connector: ApiConnectorType.ATTIO;
};

/** The HubSpot CRM objects a source reads, one explore each. */
export const HUBSPOT_OBJECTS = [
    'deals',
    'contacts',
    'companies',
    'tickets',
    'leads',
] as const;
export type HubspotObject = (typeof HUBSPOT_OBJECTS)[number];

/**
 * The private app scopes that read one object's records and properties.
 * Tickets predate HubSpot's granular scopes; leads need Sales Hub
 * Professional or Enterprise.
 */
export const getHubspotReadScopes = (object: HubspotObject): string[] => {
    switch (object) {
        case 'tickets':
            return ['tickets'];
        case 'leads':
            return ['crm.objects.leads.read'];
        default:
            return [`crm.objects.${object}.read`, `crm.schemas.${object}.read`];
    }
};

/** The private app's token picks the HubSpot account, so nothing else is set. */
export type HubspotApiSource = {
    connector: ApiConnectorType.HUBSPOT;
};

/** The Salesforce objects a source reads, one explore each, Opportunity first. */
export const SALESFORCE_OBJECTS = [
    'Opportunity',
    'Account',
    'Lead',
    'Contact',
] as const;
export type SalesforceObject = (typeof SALESFORCE_OBJECTS)[number];

/** One sign-in reads every object in SALESFORCE_OBJECTS, so nothing else is set. */
export type SalesforceApiSource = {
    connector: ApiConnectorType.SALESFORCE;
};

/**
 * An Amplitude project; its API key and secret key pick it, and the
 * connection's origin says whether its data lives in the US or the EU.
 */
export type AmplitudeApiSource = {
    connector: ApiConnectorType.AMPLITUDE;
};

/**
 * A Mixpanel project, read with a service account; the connection's origin
 * says whether its data lives in the US, the EU or India.
 */
export type MixpanelApiSource = {
    connector: ApiConnectorType.MIXPANEL;
    /** The Mixpanel project id, the number after /project/ in its URL. */
    projectId: string;
};

/**
 * Hydra, the test integration: its rows are seeded from the sign-in token,
 * and these settings make its fake API slow, fail, page or rate limit.
 * Every setting is optional; one left out takes its default
 * (`HYDRA_DEFAULT_SETTINGS`).
 */
export type HydraApiSource = {
    connector: ApiConnectorType.HYDRA;
    /** Events seeded per sign-in token, over the last 90 days. */
    rowCount?: number;
    /** Rows per call, 10 or more; a bigger report takes several calls. 0 never pages. */
    pageSize?: number;
    /** Milliseconds each call waits before answering. */
    latencyMs?: number;
    /** Up to this many milliseconds more, at random, per call. */
    jitterMs?: number;
    /** Share of calls, 0 to 1, that fail with a 500. */
    errorRate?: number;
    /** Every call answers 401, as a revoked sign-in would. */
    failAuth?: boolean;
    /** The limits Hydra's API enforces, refusing calls past them; null enforces none. */
    vendorLimits?: HydraRateLimits | null;
    /** How Hydra refuses a call past `vendorLimits`. */
    onLimit?: HydraOnLimit;
    /**
     * The limits Lightdash keeps the source's calls under: "vendor" copies
     * `vendorLimits`, and null declares none.
     */
    declaredLimits?: 'vendor' | HydraRateLimits | null;
    /** Fake answers a test sets for given calls, counted per source from 1; the first match wins. */
    mockResponses?: HydraMockResponse[];
};

/** A Hydra source's settings with every default filled in. */
export type HydraSettings = Required<Omit<HydraApiSource, 'connector'>>;

/** Rate limits, in the shape the rate-limit gate reads. */
export type HydraRateLimits = {
    /** Calls in flight at once; null for no cap. */
    concurrentCalls: number | null;
    callsPerSecond: number | null;
    /** Fixed windows of calls, like a minute or an hour: up to 5, unique ids, "second" kept for `callsPerSecond`. */
    buckets: { id: string; windowMs: number; capacity: number }[];
};

export type HydraOnLimit = {
    status: number;
    /** How Retry-After is written: as seconds, as an HTTP date, or left out. */
    retryAfterFormat: 'seconds' | 'date' | 'none';
    /** The body Hydra answers; `{"code": "rate_limited"}` marks a throttle in a non-429. */
    body?: Record<string, unknown>;
};

/**
 * A fake answer a test sets for one call (`call`) or a range (`fromCall`, and `toCall`
 * or every call after). Status 200 answers as usual, skipping `errorRate`;
 * 400 to 599 is answered as given.
 */
export type HydraMockResponse = {
    call?: number;
    fromCall?: number;
    toCall?: number;
    status: number;
    /** Sent as Retry-After; error statuses only. */
    retryAfterSeconds?: number;
    /** The error body; error statuses only. */
    body?: Record<string, unknown>;
};

/** Connector settings of a live source; the server fixes its access rules. */
export type ExternalConnectionApiSource =
    | PostHogApiSource
    | SearchConsoleApiSource
    | Ga4ApiSource
    | MetaAdsApiSource
    | GoogleAdsApiSource
    | YoutubeAnalyticsApiSource
    | LinkedInAdsApiSource
    | GithubApiSource
    | PylonApiSource
    | AttioApiSource
    | HubspotApiSource
    | SalesforceApiSource
    | AmplitudeApiSource
    | MixpanelApiSource
    | HydraApiSource;

/** The settings of one integration's sources. */
export type ApiSourceOf<C extends ApiConnectorType> = Extract<
    ExternalConnectionApiSource,
    { connector: C }
>;

/** A Google property the signed-in account can query, offered after sign-in. */
export type GoogleLiveSourceChoice = {
    value: string;
    label: string;
    /** Shown under the label, e.g. the account or permission level. */
    description: string | null;
};

/** A Google sign-in waiting for the admin to pick what the source reads. */
export type GoogleLiveSourcePendingChoice = {
    connector: ApiConnectorType;
    name: string;
    choices: GoogleLiveSourceChoice[];
};

export const POSTHOG_REGION_ORIGINS = {
    us: 'https://us.posthog.com',
    eu: 'https://eu.posthog.com',
} as const;

/** The setup test's HogQL: one cheap read whose answer is worth showing. */
export const POSTHOG_TEST_QUERY =
    'SELECT count(DISTINCT event) FROM events WHERE timestamp > now() - INTERVAL 7 DAY';

export const META_ADS_ORIGIN = 'https://graph.facebook.com';
export const META_ADS_API_VERSION = 'v25.0';

export const getMetaAdsInsightsPath = (adAccountId: string) =>
    `/${META_ADS_API_VERSION}/act_${adAccountId}/insights`;

export const GITHUB_ORIGIN = 'https://api.github.com';
export const GITHUB_SEARCH_PATH = '/search/issues';

export const getGithubContributorsPath = (owner: string, repo: string) =>
    `/repos/${owner}/${repo}/stats/contributors`;

export const PYLON_ORIGIN = 'https://api.usepylon.com';
export const PYLON_ISSUES_SEARCH_PATH = '/issues/search';
export const PYLON_ACCOUNTS_SEARCH_PATH = '/accounts/search';
export const PYLON_CONTACTS_SEARCH_PATH = '/contacts/search';
export const PYLON_USERS_PATH = '/users';

/** Never resolves: Hydra answers in-process, so nothing is sent to it. */
export const HYDRA_ORIGIN = 'https://hydra.invalid';
export const HYDRA_REPORT_PATH = '/v1/report';
export const HYDRA_ACCOUNT_PATH = '/v1/account';
/** Set to "true" to register Hydra; it is absent everywhere otherwise. */
export const HYDRA_ENABLED_ENV = 'LIVE_SOURCES_HYDRA_ENABLED';

export const ATTIO_ORIGIN = 'https://api.attio.com';
/** Owner names; reading them needs the user_management:read scope. */
export const ATTIO_WORKSPACE_MEMBERS_PATH = '/v2/workspace_members';

export const getAttioAttributesPath = (object: string) =>
    `/v2/objects/${object}/attributes`;

export const getAttioRecordsQueryPath = (object: string) =>
    `/v2/objects/${object}/records/query`;

/** Amplitude's Dashboard REST API, by where the project's data lives. */
export const AMPLITUDE_REGION_ORIGINS = {
    us: 'https://amplitude.com',
    eu: 'https://analytics.eu.amplitude.com',
} as const;
export type AmplitudeRegion = keyof typeof AMPLITUDE_REGION_ORIGINS;

export const getAmplitudeRegion = (origin: string): AmplitudeRegion =>
    origin.replace(/\/+$/, '') === AMPLITUDE_REGION_ORIGINS.eu ? 'eu' : 'us';

/** The Dashboard REST API endpoints a source reads. */
export const AMPLITUDE_PATHS = {
    segmentation: '/api/2/events/segmentation',
    users: '/api/2/users',
    funnels: '/api/2/funnels',
    retention: '/api/2/retention',
    sessionLength: '/api/2/sessions/average',
    sessionsPerUser: '/api/2/sessions/peruser',
    eventsList: '/api/2/events/list',
} as const;

/** Amplitude signs Dashboard REST API calls in with HTTP Basic: the API key, then the secret key. */
export const AMPLITUDE_AUTH_HEADER = 'Authorization';

/** Mixpanel's Query API, by where the project's data lives. */
export const MIXPANEL_REGION_ORIGINS = {
    us: 'https://mixpanel.com',
    eu: 'https://eu.mixpanel.com',
    in: 'https://in.mixpanel.com',
} as const;
export type MixpanelRegion = keyof typeof MIXPANEL_REGION_ORIGINS;

export const getMixpanelRegion = (origin: string): MixpanelRegion => {
    const trimmed = origin.replace(/\/+$/, '');
    if (trimmed === MIXPANEL_REGION_ORIGINS.eu) return 'eu';
    if (trimmed === MIXPANEL_REGION_ORIGINS.in) return 'in';
    return 'us';
};

/** The Query API endpoints a source reads. */
export const MIXPANEL_PATHS = {
    segmentation: '/api/query/segmentation',
    funnels: '/api/query/funnels',
    funnelsList: '/api/query/funnels/list',
    retention: '/api/query/retention',
    eventNames: '/api/query/events/names',
    topEvents: '/api/query/events/top',
} as const;

/** Mixpanel signs Query API calls in with HTTP Basic: the service account's username, then its secret. */
export const MIXPANEL_AUTH_HEADER = 'Authorization';

export const HUBSPOT_ORIGIN = 'https://api.hubapi.com';

export const getHubspotPropertiesPath = (object: string) =>
    `/crm/v3/properties/${object}`;

export const getHubspotSearchPath = (object: string) =>
    `/crm/v3/objects/${object}/search`;

/** The objects whose pipelines and stages a source reads. */
export const HUBSPOT_PIPELINE_OBJECTS = ['deals', 'tickets'] as const;
export type HubspotPipelineObject = (typeof HUBSPOT_PIPELINE_OBJECTS)[number];

export const getHubspotPipelinesPath = (object: string) =>
    `/crm/v3/pipelines/${object}`;
/** Every Salesforce call goes to this REST API version, so responses keep one shape. */
export const SALESFORCE_API_VERSION = 'v62.0';

/** Production orgs sign in at login.salesforce.com, sandboxes at test.salesforce.com. */
export const SALESFORCE_ENVIRONMENTS = ['production', 'sandbox'] as const;
export type SalesforceEnvironment = (typeof SALESFORCE_ENVIRONMENTS)[number];

export const isSalesforceEnvironment = (
    value: unknown,
): value is SalesforceEnvironment =>
    SALESFORCE_ENVIRONMENTS.includes(value as SalesforceEnvironment);

/** Where people sign in to a Salesforce org. */
export const SALESFORCE_LOGIN_ORIGINS: Record<SalesforceEnvironment, string> = {
    production: 'https://login.salesforce.com',
    sandbox: 'https://test.salesforce.com',
};

export const getSalesforceTokenUrl = (environment: SalesforceEnvironment) =>
    `${SALESFORCE_LOGIN_ORIGINS[environment]}/services/oauth2/token`;

/** The environment a saved source signed in to, from its token URL; null for any other URL. */
export const getSalesforceEnvironment = (
    tokenUrl: string | null,
): SalesforceEnvironment | null =>
    SALESFORCE_ENVIRONMENTS.find(
        (environment) => getSalesforceTokenUrl(environment) === tokenUrl,
    ) ?? null;

export const SALESFORCE_QUERY_PATH = `/services/data/${SALESFORCE_API_VERSION}/query`;
export const SALESFORCE_LIMITS_PATH = `/services/data/${SALESFORCE_API_VERSION}/limits`;

export const getSalesforceDescribePath = (object: string) =>
    `/services/data/${SALESFORCE_API_VERSION}/sobjects/${object}/describe`;

/** Salesforce's shared login hosts, which never serve an org's API. */
const SALESFORCE_SHARED_LOGIN_ORIGINS = Object.values(SALESFORCE_LOGIN_ORIGINS);

/** An org's own API host, as its sign-in returns it: a My Domain such as https://acme.my.salesforce.com. */
const SALESFORCE_INSTANCE_ORIGIN =
    /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)*\.salesforce\.com$/;

export const isSalesforceInstanceOrigin = (origin: string) =>
    SALESFORCE_INSTANCE_ORIGIN.test(origin.toLowerCase()) &&
    !SALESFORCE_SHARED_LOGIN_ORIGINS.includes(origin.toLowerCase());

/** HTTP methods an admin can opt a connection into. Single source of truth for
 *  the backend validation allowlist and the frontend method pickers. */
export const EXTERNAL_CONNECTION_METHODS = [
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
] as const;
export type ExternalConnectionMethod =
    (typeof EXTERNAL_CONNECTION_METHODS)[number];
export type ApiKeyLocation = 'header' | 'query';

/** Backend-owned identity headers. Never configurable by apps or connections. */
export const EXTERNAL_CONNECTION_IDENTITY_HEADERS = {
    appId: 'X-Lightdash-App-Id',
    userEmail: 'X-Lightdash-User-Email',
    userId: 'X-Lightdash-User-Id',
    organizationId: 'X-Lightdash-Organization-Id',
    projectId: 'X-Lightdash-Project-Id',
} as const;

/** Bounds for a connection's custom request headers — shared by backend
 *  validation and the frontend form so both reject the same shapes. */
export const CUSTOM_HEADER_LIMITS = {
    maxCount: 20,
    maxNameChars: 128,
    maxValueChars: 1024,
} as const;

/** Header names custom request headers may never use: routing/framing headers
 *  the proxy owns, plus credential-shaped names — header values are plaintext
 *  config returned by the read API, so secrets belong in the encrypted secret. */
export const FORBIDDEN_CUSTOM_HEADER_NAMES = [
    'host',
    'content-length',
    'content-type',
    'connection',
    'transfer-encoding',
    'te',
    'trailer',
    'upgrade',
    'keep-alive',
    'expect',
    'authorization',
    'proxy-authorization',
    'proxy-connection',
    'cookie',
    'x-api-key',
    'api-key',
    'x-auth-token',
    'x-access-token',
    ...Object.values(EXTERNAL_CONNECTION_IDENTITY_HEADERS).map((name) =>
        name.toLowerCase(),
    ),
] as const;

/** READ shape returned by the API — NEVER includes the secret value. */
export type ExternalConnection = {
    externalConnectionUuid: string;
    projectUuid: string;
    organizationUuid: string;
    name: string;
    // Portable identity for content-as-code: generated from the name at
    // create, unique per project among live connections, stable across renames.
    slug: string;
    type: ExternalConnectionAuthType;
    origin: string;
    /** Optional for compatibility with older servers during rolling upgrades. */
    allowBrowserImages?: boolean;
    /** Optional for compatibility with older servers during rolling upgrades. */
    allowDataAppBuilderLinking?: boolean;
    /** Send available viewer identity as backend-set headers. Defaults to false.
     * Optional for compatibility with older servers during rolling upgrades. */
    forwardUserIdentity?: boolean;
    instructions: string | null;
    allowedPathPrefixes: string[];
    allowedMethods: ExternalConnectionMethod[];
    allowedContentTypes: string[];
    responseMaxBytes: number;
    requestMaxBytes: number;
    timeoutMs: number;
    rateLimitPerMinute: number | null;
    apiKeyName: string | null;
    apiKeyLocation: ApiKeyLocation | null;
    // OAuth scopes for Google service accounts and OAuth client credentials.
    oauthScopes: string[] | null;
    /** Optional for compatibility with older servers during rolling upgrades. */
    oauthTokenUrl?: string | null;
    /** Optional for compatibility with older servers during rolling upgrades. */
    oauthClientId?: string | null;
    /** Optional for compatibility with older servers during rolling upgrades. */
    oauthClientAuthMethod?: OAuthClientAuthMethod | null;
    // Static non-secret headers sent on every proxied request, applied before
    // auth so the injected credential always wins (e.g. anthropic-version).
    customHeaders: Record<string, string> | null;
    /** Optional for compatibility with older servers during rolling upgrades. */
    kind?: ExternalConnectionKind;
    /** Optional for compatibility with older servers during rolling upgrades. */
    apiSource?: ExternalConnectionApiSource | null;
    /**
     * Prefix of a live source's explore names, such as `posthog`. Set once on
     * its first build and never changed, because saved charts reference it.
     * Optional for compatibility with older servers during rolling upgrades.
     */
    liveSourceName?: string | null;
    /** What an admin says this live source is for. Reaches the AI agent. */
    aiHint?: string | null;
    /** The name the connection picker showed for the source's target. */
    targetLabel?: string | null;
    /** Live sources: the admin's freshness window; null uses the integration's default. */
    cacheTtlSeconds?: number | null;
    /** Live sources: results fetched before this are never reused. */
    cachePurgedAt?: Date | null;
    /** Live sources: the lower rate limits an admin set; null when none are set. */
    adminRateLimits?: LiveSourceRateLimitSettings | null;
    hasSecret: boolean;
    createdByUserUuid: string | null;
    updatedByUserUuid: string | null;
    createdAt: Date;
    updatedAt: Date;
};

export type ExternalConnectionListItem = ExternalConnection & {
    linkedDataAppCount: number;
    // Custom chart types linking this connection, counted apart from data
    // apps so the two products' usage stays distinguishable.
    linkedChartTypeCount: number;
};

export type ExternalConnectionLinkedApp = {
    appUuid: string;
    name: string;
    slug: string;
    kind: 'data_app' | 'project_chart_type';
    spaceUuid: string | null;
    spaceName: string | null;
    aliases: string[];
};

/** Kept as an object so pagination can be added later without changing the
 *  endpoint's top-level response shape. */
export type ExternalConnectionLinkedApps = {
    items: ExternalConnectionLinkedApp[];
    total: number;
};

export type ApiListExternalConnectionLinkedAppsResponse = {
    status: 'ok';
    results: ExternalConnectionLinkedApps;
};

/** WRITE shape — includes the secret. */
export type CreateExternalConnection = {
    name: string;
    type: ExternalConnectionAuthType;
    origin: string;
    allowBrowserImages?: boolean;
    allowDataAppBuilderLinking?: boolean;
    /** Send available viewer identity as backend-set headers. Defaults to false. */
    forwardUserIdentity?: boolean;
    instructions?: string | null;
    allowedPathPrefixes: string[];
    allowedMethods: ExternalConnectionMethod[];
    allowedContentTypes: string[];
    responseMaxBytes?: number; // server default 1048576
    requestMaxBytes?: number; // server default 262144
    timeoutMs?: number; // server default 10000
    rateLimitPerMinute?: number | null;
    apiKeyName?: string | null;
    apiKeyLocation?: ApiKeyLocation | null;
    oauthScopes?: string[] | null;
    oauthTokenUrl?: string | null;
    oauthClientId?: string | null;
    oauthClientAuthMethod?: OAuthClientAuthMethod | null;
    customHeaders?: Record<string, string> | null; // static non-secret headers sent on every request
    apiSource?: ExternalConnectionApiSource | null;
    /**
     * Prefix of a new live source's explore names. Defaults to one derived
     * from the name. It is set once and can't be changed afterwards.
     */
    explorePrefix?: string;
    secret?: string | null; // bearer token, api key, client secret, or service-account keyfile JSON; null for type 'none'
};

/** Omitted/blank `secret` means the stored secret is left unchanged. */
export const LIVE_SOURCE_AI_HINT_MAX_LENGTH = 500;

export type UpdateExternalConnection = Partial<
    Omit<CreateExternalConnection, 'explorePrefix'>
> & {
    /** Live sources only. Empty or null clears it. */
    aiHint?: string | null;
};

/** Whether a new live source can use an explore prefix. */
export type ExplorePrefixCheck = {
    prefix: string;
    /** The explore names the prefix gives; empty when its format is invalid. */
    exploreNames: string[];
    error: string | null;
    /** A free prefix close to the one asked for, when it's taken. */
    suggestion: string | null;
    suggestionExploreNames: string[];
};

export type ApiExplorePrefixCheckResponse = {
    status: 'ok';
    results: ExplorePrefixCheck;
};

/** A deleted live source whose explore prefix a new source can take over. */
export type ReattachableLiveSource = {
    externalConnectionUuid: string;
    name: string;
    explorePrefix: string;
    exploreNames: string[];
    apiSource: ExternalConnectionApiSource;
    deletedAt: Date;
    usedByChartCount: number;
    /** Reads the same target as the source being reattached. */
    isSameTarget: boolean;
};

export type ApiReattachableLiveSourcesResponse = {
    status: 'ok';
    results: ReattachableLiveSource[];
};

export type ApiReattachLiveSourceRequest = {
    deletedConnectionUuid: string;
};

export type AppExternalConnectionLink = {
    externalConnectionUuid: string;
    alias: string;
};

/** A link as the app's connection list returns it: alias plus the
 *  connection itself, not the uuid/alias pair the link request takes. */
export type AppExternalConnectionLinked = {
    alias: string;
    connection: ExternalConnection;
};

/** Server-applied defaults for the optional numeric limits. */
export const EXTERNAL_CONNECTION_DEFAULTS = {
    responseMaxBytes: 1048576,
    requestMaxBytes: 262144,
    timeoutMs: 10000,
} as const;

/** A saved chart (optionally at a specific version) rendering a chart type. */
export type ExternalFetchSavedChartContext = {
    savedChartUuid: UUID;
    chartVersionUuid?: UUID;
    /** Authorize against the requester's own unpublished draft of the chart. */
    includeUnpublishedDraft?: boolean;
};

/** A chart of a specific Document version rendering a chart type. */
export type ExternalFetchDocumentContext = {
    documentUuid: UUID;
    documentVersionUuid: UUID;
    chartId: string;
};

export const isExternalFetchDocumentContext = (
    context: ExternalFetchRequest['chartContext'],
): context is ExternalFetchDocumentContext =>
    !!context && 'documentUuid' in context;

/** A composer chart rendering a chart type; it pins one version. */
export type ExternalFetchComposerChartContext = {
    composerChartUuid: UUID;
};

export const isExternalFetchComposerChartContext = (
    context: ExternalFetchRequest['chartContext'],
): context is ExternalFetchComposerChartContext =>
    !!context && 'composerChartUuid' in context;

export type ExternalFetchRequest = {
    connectionAlias: string;
    method?: ExternalConnectionMethod;
    path: string;
    query?: Record<string, string>;
    body?: unknown;
    /** Host-supplied identity of what is rendering a custom chart type. */
    chartContext?:
        | ExternalFetchSavedChartContext
        | ExternalFetchDocumentContext
        | ExternalFetchComposerChartContext;
};

export type ExternalFetchResponse = {
    status: number;
    contentType: string;
    /** Safe upstream response headers, normalized to lowercase names. */
    headers: Record<string, string>;
    body: unknown;
    truncated: boolean;
};

export type ApiTestExternalConnectionRequest = {
    method?: ExternalConnectionMethod;
    path: string;
    query?: Record<string, string>;
    body?: unknown;
    /** Optional unsaved edit values to test against the stored connection.
     *  Blank/omitted secret keeps the stored credential when it is still valid. */
    config?: UpdateExternalConnection;
};

/** Test an unsaved connection config (incl. plaintext secret) before creating
 *  it. Runs through the same SSRF-guarded proxy core, persisting nothing.
 *  Deliberately a flat object, NOT `ApiTestExternalConnectionRequest & {...}`:
 *  TSOA validates intersection bodies in remove-extras mode, which empties
 *  Record<string, string> fields (query, config.customHeaders). */
export type ApiTestExternalConnectionConfigRequest = {
    method?: ExternalConnectionMethod;
    path: string;
    query?: Record<string, string>;
    body?: unknown;
    config: CreateExternalConnection;
};

/** One thing a live data source test found, as in "Pull requests: 1,204". */
export type LiveSourceTestFact = {
    label: string;
    value: string;
};

/** A live data source test result in words an admin reads, not raw JSON. */
export type LiveSourceTestCheck = {
    ok: boolean;
    /** One line, as in "Connected to lightdash/lightdash". */
    summary: string;
    /** On failure, why and what to change; null on success. */
    detail: string | null;
    facts: LiveSourceTestFact[];
};

export type ExternalConnectionTestResponse = ExternalFetchResponse & {
    /** Set when the tested config is a live data source. */
    liveCheck?: LiveSourceTestCheck;
};

export type ApiTestExternalConnectionResponse = {
    status: 'ok';
    results: ExternalConnectionTestResponse;
};

export type ApiProposeExternalConnectionConfigRequest = {
    description: string;
};

/** AI-proposed connection config, shaped to prefill the create wizard. Never
 *  carries a secret — the user pastes the credential themselves on the Auth
 *  step. Kept flat for the same TSOA reason as
 *  ApiTestExternalConnectionConfigRequest. */
export type ExternalConnectionConfigProposal = {
    name: string;
    origin: string;
    type: ExternalConnectionAuthType;
    allowBrowserImages: boolean;
    apiKeyName: string | null;
    apiKeyLocation: ApiKeyLocation | null;
    oauthScopes: string[] | null;
    oauthTokenUrl?: string | null;
    oauthClientId?: string | null;
    oauthClientAuthMethod?: OAuthClientAuthMethod | null;
    customHeaders: Record<string, string> | null;
    allowedMethods: ExternalConnectionMethod[];
    allowedPathPrefixes: string[];
    instructions: string | null;
    /** Markdown steps for obtaining the credential; null when type is 'none'. */
    credentialGuide: string | null;
    docsUrl: string | null;
    /** Caveats the user should double-check before saving. */
    notes: string | null;
};

export type ApiProposeExternalConnectionConfigResponse = {
    status: 'ok';
    results: ExternalConnectionConfigProposal;
};

/** The request that produced a sample (stored alongside the response). */
export type ExternalConnectionSampleRequest = {
    method: ExternalConnectionMethod;
    path: string;
    query?: Record<string, string>;
    body?: unknown;
};

/** READ shape for a persisted sample row. */
export type ExternalConnectionSample = {
    sampleUuid: string;
    externalConnectionUuid: string;
    label: string | null;
    request: ExternalConnectionSampleRequest;
    response: unknown;
    createdAt: Date;
};

export type ApiSaveExternalConnectionSampleRequest = {
    label?: string | null;
    request: ExternalConnectionSampleRequest;
    response: unknown;
};

export type ApiSaveExternalConnectionSampleResponse = {
    status: 'ok';
    results: ExternalConnectionSample;
};

export type ApiListExternalConnectionSamplesResponse = {
    status: 'ok';
    results: ExternalConnectionSample[];
};

/** What a live source has sent its integration across the logged queries in the usage window. */
export type ExternalConnectionApiUsage = {
    externalConnectionUuid: string;
    /** How many days back the usage goes: the query history retention window. */
    windowDays: number;
    apiCalls: number;
    /** Queries a stored result answered without calling the integration. */
    cacheHits: number;
    responseBytes: number;
    /** Median time to fetch from the integration; null until it has been called. */
    medianDurationMs: number | null;
};

export type ApiExternalConnectionApiUsageResponse = {
    status: 'ok';
    results: ExternalConnectionApiUsage[];
};

/** One limit on calls in a time window, with Lightdash's calls in its current window. */
export type ExternalConnectionRateLimitBucket = {
    id: string;
    /** As declared, such as "per hour". */
    label: string;
    windowMs: number;
    /** The limit in force: the integration's, or an admin's lower one. */
    capacity: number;
    /** The integration's own limit; null for a daily limit only an admin set. */
    defaultCapacity: number | null;
    /** Calls in the current window; 0 when no window is open. */
    used: number;
    /** When the current window ends, ISO; null when no window is open. */
    resetsAt: string | null;
};

/**
 * A live data source's rate limits, with Lightdash's own calls against them as
 * of `checkedAt`. Other apps on the same vendor account aren't counted.
 */
export type ExternalConnectionRateLimitUsage = {
    /** The integration's name, such as HubSpot. */
    integrationLabel: string;
    checkedAt: string;
    /** Shortest window first. */
    buckets: ExternalConnectionRateLimitBucket[];
    /** When the vendor's pause ends, ISO; null when it hasn't paused the integration. */
    limitedUntil: string | null;
    /** What an admin set, as saved; null when nothing is set. */
    adminRateLimits: LiveSourceRateLimitSettings | null;
    /** The integration's own limit; null when it has no per-second limit. */
    defaultCallsPerSecond: number | null;
    /** The integration's own limit on calls in flight at once. */
    defaultConcurrentCalls: number;
    /** Calls in flight, never above the concurrency limit now in force. */
    runningCalls: number;
    /** What admins are told alongside the limits they can lower. */
    note: string | null;
};

export type ApiExternalConnectionRateLimitUsageResponse = {
    status: 'ok';
    results: ExternalConnectionRateLimitUsage;
};

export type ApiSourceSchemaEvent = {
    name: string;
    count: number;
};

/** What a live source's schema scan found, kept so onboarding and the AI agent know its data up front. */
export type ApiSourceSchemaScan =
    | { status: 'pending'; requestedAt: Date }
    | {
          status: 'ready';
          scannedAt: Date;
          windowDays: number;
          /** Busiest first; capped, see eventsTruncated. */
          events: ApiSourceSchemaEvent[];
          eventsTruncated: boolean;
          /** Null when the property scan failed. */
          propertyKeys: string[] | null;
      }
    | { status: 'failed'; scannedAt: Date; error: string };

export type ApiExternalConnectionSchemaResponse = {
    status: 'ok';
    /** Null when the connection was never scanned. */
    results: ApiSourceSchemaScan | null;
};
