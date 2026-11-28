import { z } from 'zod';
import {
    getHubspotReadScopes,
    HUBSPOT_OBJECTS,
    isSentrySlug,
    SENTRY_MAX_PROJECTS,
    type ApiSourceOf,
    type ExternalConnectionApiSource,
} from '../ee/externalConnections/types';
import { FeatureFlags } from '../types/featureFlags';
import { ApiConnectorType } from '../types/querySources';
import { HYDRA_SETTINGS_SCHEMA } from './hydraLiveSource';

/** How an admin connects a source, which decides the dialog it opens. */
export type LiveSourceSetupKind =
    | 'google'
    | 'posthog'
    | 'token'
    | 'linkedin_ads'
    | 'salesforce'
    | 'amplitude'
    | 'mixpanel'
    | 'supabase';

type LiveIntegrationCatalogFields<C extends ApiConnectorType> = {
    /** Stable id, sent with analytics events. */
    id: string;
    /** The name people see when adding and listing sources. */
    label: string;
    /** What a new source is called until someone renames it. */
    defaultName: string;
    /** The name refusals and API errors use. */
    messageLabel: string;
    /** The name AI agents read and repeat. */
    agentLabel: string;
    description: string;
    setup: LiveSourceSetupKind;
    /** Exact scope or permission names a key needs, for sources added with one. */
    scopes?: readonly string[];
    /** The settings a source stores; checked against the API type. */
    settings: z.ZodType<ApiSourceOf<C>>;
    /** What one source reads, shown wherever it is listed. */
    getTarget: (apiSource: ApiSourceOf<C>) => string;
    /** Offered by the onboarding tools step. Most sources are added later. */
    inOnboarding?: true;
    /**
     * The feature flag that turns this integration on or off. On while the
     * flag has no stored value; otherwise the organization's override, else
     * the flag's default, decides. Without one the integration is always on.
     *
     * To gate an integration, add `LiveSource<Integration> = 'live-source-<connector>'`
     * to `FeatureFlags` and set it here; nothing else is needed. Off hides it
     * everywhere and refuses its actions. See docs/feature-flags.md#live-data-source-integrations.
     */
    featureFlag?: FeatureFlags;
};

/**
 * Everything the backend, the app and AI agents share about each live
 * integration. One entry per connector; a missing one fails typecheck.
 */
export const LIVE_INTEGRATION_CATALOG: {
    [C in ApiConnectorType]: LiveIntegrationCatalogFields<C>;
} = {
    [ApiConnectorType.POSTHOG]: {
        id: 'posthog',
        label: 'PostHog',
        defaultName: 'PostHog',
        messageLabel: 'PostHog',
        agentLabel: 'PostHog',
        description: 'Events, persons and sessions',
        setup: 'posthog',
        scopes: ['query:read'],
        settings: z.object({
            connector: z.literal(ApiConnectorType.POSTHOG),
            projectId: z.string(),
        }),
        getTarget: ({ projectId }) => `Project ${projectId}`,
        inOnboarding: true,
    },
    [ApiConnectorType.SEARCH_CONSOLE]: {
        id: 'google_search_console',
        label: 'Google Search Console',
        defaultName: 'Search Console',
        messageLabel: 'Search Console',
        agentLabel: 'Search Console',
        description: 'Search clicks, impressions, CTR and position',
        setup: 'google',
        settings: z.object({
            connector: z.literal(ApiConnectorType.SEARCH_CONSOLE),
            siteUrl: z.string(),
        }),
        getTarget: ({ siteUrl }) => siteUrl,
        inOnboarding: true,
    },
    [ApiConnectorType.GA4]: {
        id: 'google_analytics',
        label: 'Google Analytics 4',
        defaultName: 'Google Analytics',
        messageLabel: 'Google Analytics',
        agentLabel: 'Google Analytics 4',
        description: 'Users, sessions, events and revenue',
        setup: 'google',
        settings: z.object({
            connector: z.literal(ApiConnectorType.GA4),
            propertyId: z.string(),
        }),
        getTarget: ({ propertyId }) => `Property ${propertyId}`,
        inOnboarding: true,
    },
    [ApiConnectorType.META_ADS]: {
        id: 'meta_ads',
        label: 'Meta Ads',
        defaultName: 'Meta Ads',
        messageLabel: 'Meta Ads',
        agentLabel: 'Meta Ads',
        description: 'Facebook and Instagram ad performance',
        setup: 'token',
        scopes: ['ads_read'],
        settings: z.object({
            connector: z.literal(ApiConnectorType.META_ADS),
            adAccountId: z.string(),
        }),
        getTarget: ({ adAccountId }) => `Ad account ${adAccountId}`,
    },
    [ApiConnectorType.GOOGLE_ADS]: {
        id: 'google_ads',
        label: 'Google Ads',
        defaultName: 'Google Ads',
        messageLabel: 'Google Ads',
        agentLabel: 'Google Ads',
        description: 'Campaign spend, clicks and conversions',
        setup: 'google',
        settings: z.object({
            connector: z.literal(ApiConnectorType.GOOGLE_ADS),
            customerId: z.string(),
            loginCustomerId: z.string().nullable(),
        }),
        getTarget: ({ customerId }) => `Account ${customerId}`,
    },
    [ApiConnectorType.YOUTUBE_ANALYTICS]: {
        id: 'youtube_analytics',
        label: 'YouTube Analytics',
        defaultName: 'YouTube Analytics',
        messageLabel: 'YouTube Analytics',
        agentLabel: 'YouTube Analytics',
        description: 'Channel views, watch time and subscribers',
        setup: 'google',
        settings: z.object({
            connector: z.literal(ApiConnectorType.YOUTUBE_ANALYTICS),
            channelId: z.string(),
        }),
        getTarget: ({ channelId }) => `Channel ${channelId}`,
    },
    [ApiConnectorType.LINKEDIN_ADS]: {
        id: 'linkedin_ads',
        label: 'LinkedIn Ads',
        defaultName: 'LinkedIn Ads',
        messageLabel: 'LinkedIn Ads',
        agentLabel: 'LinkedIn Ads',
        description: 'Campaign reach, clicks and leads',
        setup: 'linkedin_ads',
        settings: z.object({
            connector: z.literal(ApiConnectorType.LINKEDIN_ADS),
            adAccountId: z.string(),
        }),
        getTarget: ({ adAccountId }) => `Ad account ${adAccountId}`,
    },
    [ApiConnectorType.GITHUB]: {
        id: 'github',
        label: 'GitHub',
        defaultName: 'GitHub',
        messageLabel: 'GitHub',
        agentLabel: 'GitHub',
        description: 'Pull requests, issues and contributors',
        setup: 'token',
        scopes: ['Metadata', 'Issues', 'Pull requests'],
        settings: z.object({
            connector: z.literal(ApiConnectorType.GITHUB),
            owner: z.string(),
            repo: z.string(),
        }),
        getTarget: ({ owner, repo }) => `${owner}/${repo}`,
    },
    [ApiConnectorType.PYLON]: {
        id: 'pylon',
        label: 'Pylon',
        defaultName: 'Pylon',
        messageLabel: 'Pylon',
        agentLabel: 'Pylon',
        description: 'Support issues, accounts and contacts',
        setup: 'token',
        settings: z.object({
            connector: z.literal(ApiConnectorType.PYLON),
        }),
        getTarget: () => 'Pylon workspace',
    },
    [ApiConnectorType.ATTIO]: {
        id: 'attio',
        label: 'Attio',
        defaultName: 'Attio',
        messageLabel: 'Attio',
        agentLabel: 'Attio',
        description: 'Companies, people, deals and workspaces',
        setup: 'token',
        settings: z.object({
            connector: z.literal(ApiConnectorType.ATTIO),
        }),
        getTarget: () => 'Attio workspace',
    },
    [ApiConnectorType.HUBSPOT]: {
        id: 'hubspot',
        label: 'HubSpot',
        defaultName: 'HubSpot',
        messageLabel: 'HubSpot',
        agentLabel: 'HubSpot',
        description:
            'Deals, contacts, companies, tickets and leads from your CRM',
        setup: 'token',
        scopes: HUBSPOT_OBJECTS.flatMap(getHubspotReadScopes),
        settings: z.object({
            connector: z.literal(ApiConnectorType.HUBSPOT),
        }),
        getTarget: () => 'HubSpot account',
    },
    [ApiConnectorType.SALESFORCE]: {
        id: 'salesforce',
        label: 'Salesforce',
        defaultName: 'Salesforce',
        messageLabel: 'Salesforce',
        agentLabel: 'Salesforce',
        description: 'Opportunities, accounts, leads and contacts',
        setup: 'salesforce',
        settings: z.object({
            connector: z.literal(ApiConnectorType.SALESFORCE),
        }),
        getTarget: () => 'Salesforce org',
    },
    [ApiConnectorType.AMPLITUDE]: {
        id: 'amplitude',
        label: 'Amplitude',
        defaultName: 'Amplitude',
        messageLabel: 'Amplitude',
        agentLabel: 'Amplitude',
        description: 'Events, active users, funnels, retention and sessions',
        setup: 'amplitude',
        settings: z.object({
            connector: z.literal(ApiConnectorType.AMPLITUDE),
        }),
        getTarget: () => 'Amplitude project',
    },
    [ApiConnectorType.MIXPANEL]: {
        id: 'mixpanel',
        label: 'Mixpanel',
        defaultName: 'Mixpanel',
        messageLabel: 'Mixpanel',
        agentLabel: 'Mixpanel',
        description: 'Events, saved funnels and retention',
        setup: 'mixpanel',
        settings: z.object({
            connector: z.literal(ApiConnectorType.MIXPANEL),
            projectId: z.string(),
        }),
        getTarget: ({ projectId }) => `Project ${projectId}`,
    },
    [ApiConnectorType.SUPABASE]: {
        id: 'supabase',
        label: 'Supabase',
        defaultName: 'Supabase',
        messageLabel: 'Supabase',
        agentLabel: 'Supabase',
        description: 'Rows of the tables in a Supabase project',
        setup: 'supabase',
        settings: z.object({
            connector: z.literal(ApiConnectorType.SUPABASE),
        }),
        getTarget: () => 'Every table and view',
    },
    [ApiConnectorType.SENTRY]: {
        id: 'sentry',
        label: 'Sentry',
        defaultName: 'Sentry',
        messageLabel: 'Sentry',
        agentLabel: 'Sentry',
        description: 'Errors, issues and release health',
        setup: 'token',
        scopes: ['org:read', 'project:read', 'event:read'],
        settings: z.object({
            connector: z.literal(ApiConnectorType.SENTRY),
            organizationSlug: z.string().refine(isSentrySlug, {
                message: 'Use the organization slug, like acme',
            }),
            projectSlugs: z
                .array(
                    z.string().refine(isSentrySlug, {
                        message: 'Use project slugs, like mobile-ios',
                    }),
                )
                .min(1, 'Name at least one project')
                .max(SENTRY_MAX_PROJECTS)
                // A project named two times would be read two times
                .transform((slugs) => [...new Set(slugs)]),
        }),
        getTarget: ({ organizationSlug, projectSlugs }) =>
            `${organizationSlug}: ${projectSlugs.join(', ')}`,
    },
    [ApiConnectorType.HYDRA]: {
        id: 'hydra',
        label: 'Hydra',
        defaultName: 'Hydra',
        messageLabel: 'Hydra',
        agentLabel: 'Hydra',
        description: 'Test integration with seeded events and users',
        setup: 'token',
        featureFlag: FeatureFlags.LiveSourceHydra,
        settings: HYDRA_SETTINGS_SCHEMA,
        getTarget: () => 'Hydra test data',
    },
};

/** One integration's catalog entry, for a source of any connector. */
export type LiveIntegrationCatalogEntry = Omit<
    LiveIntegrationCatalogFields<ApiConnectorType>,
    'getTarget' | 'settings'
> & {
    connector: ApiConnectorType;
    getTarget: (apiSource: ExternalConnectionApiSource) => string;
};

export const getLiveIntegrationCatalogEntry = (
    connector: ApiConnectorType,
): LiveIntegrationCatalogEntry => {
    const { settings, ...entry } = LIVE_INTEGRATION_CATALOG[connector];
    return {
        ...entry,
        connector,
        // Only ever called with a source of this connector
        getTarget: entry.getTarget as LiveIntegrationCatalogEntry['getTarget'],
    };
};

/** The integration's feature flag, if it has one. */
export const getLiveSourceFeatureFlag = (connector: ApiConnectorType) =>
    LIVE_INTEGRATION_CATALOG[connector].featureFlag;

/** Every feature flag an integration declares. */
export const LIVE_SOURCE_FEATURE_FLAGS: ReadonlySet<string> = new Set<string>(
    Object.values(LIVE_INTEGRATION_CATALOG).flatMap(({ featureFlag }) =>
        featureFlag ? [featureFlag] : [],
    ),
);

/** What a source reads: a PostHog project, a Search Console site, a GA4 property and so on. */
export const getLiveSourceTarget = (apiSource: ExternalConnectionApiSource) =>
    getLiveIntegrationCatalogEntry(apiSource.connector).getTarget(apiSource);

/**
 * APIs that answer reports or their own query language, so they could be
 * queried live; users ask for them and we count the requests.
 */
export const REQUESTABLE_LIVE_INTEGRATIONS = [
    {
        id: 'shopify',
        label: 'Shopify',
        description: 'Orders, products and sales',
    },
    {
        id: 'stripe',
        label: 'Stripe',
        description: 'Payments, subscriptions and revenue',
    },
    {
        id: 'jira',
        label: 'Jira',
        description: 'Issues, sprints and cycle time',
    },
] as const;
