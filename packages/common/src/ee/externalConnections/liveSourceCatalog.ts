import { ApiConnectorType } from '../../types/querySources';
import { type ApiSourceOf, type ExternalConnectionApiSource } from './types';

/** How an admin connects a source, which decides the dialog it opens. */
export type LiveSourceSetupKind =
    | 'google'
    | 'posthog'
    | 'token'
    | 'linkedin_ads';

type LiveIntegrationCatalogFields<C extends ApiConnectorType> = {
    /** Stable id, sent with analytics events. */
    id: string;
    label: string;
    description: string;
    setup: LiveSourceSetupKind;
    /** What one source reads, shown wherever it is listed. */
    getTarget: (apiSource: ApiSourceOf<C>) => string;
    /** Offered by the onboarding tools step. Most sources are added later. */
    inOnboarding?: true;
};

/**
 * What users see of each live integration, shared by the backend and the
 * app. One entry per connector; a missing one fails typecheck.
 */
export const LIVE_INTEGRATION_CATALOG: {
    [C in ApiConnectorType]: LiveIntegrationCatalogFields<C>;
} = {
    [ApiConnectorType.POSTHOG]: {
        id: 'posthog',
        label: 'PostHog',
        description: 'Product events, persons and sessions with HogQL',
        setup: 'posthog',
        getTarget: ({ projectId }) => `Project ${projectId}`,
        inOnboarding: true,
    },
    [ApiConnectorType.GA4]: {
        id: 'google_analytics',
        label: 'Google Analytics 4',
        description: 'Users, sessions, events and revenue for a property',
        setup: 'google',
        getTarget: ({ propertyId }) => `Property ${propertyId}`,
        inOnboarding: true,
    },
    [ApiConnectorType.SEARCH_CONSOLE]: {
        id: 'google_search_console',
        label: 'Google Search Console',
        description: 'Search clicks, impressions, CTR and position',
        setup: 'google',
        getTarget: ({ siteUrl }) => siteUrl,
        inOnboarding: true,
    },
    [ApiConnectorType.META_ADS]: {
        id: 'meta_ads',
        label: 'Meta Ads',
        description: 'Facebook and Instagram ad performance',
        setup: 'token',
        getTarget: ({ adAccountId }) => `Ad account ${adAccountId}`,
    },
    [ApiConnectorType.GOOGLE_ADS]: {
        id: 'google_ads',
        label: 'Google Ads',
        description: 'Campaign spend, clicks and conversions',
        setup: 'google',
        getTarget: ({ customerId }) => `Account ${customerId}`,
    },
    [ApiConnectorType.LINKEDIN_ADS]: {
        id: 'linkedin_ads',
        label: 'LinkedIn Ads',
        description: 'Campaign reach, clicks and leads',
        setup: 'linkedin_ads',
        getTarget: ({ adAccountId }) => `Ad account ${adAccountId}`,
    },
    [ApiConnectorType.YOUTUBE_ANALYTICS]: {
        id: 'youtube_analytics',
        label: 'YouTube Analytics',
        description: 'Channel views, watch time and subscribers',
        setup: 'google',
        getTarget: ({ channelId }) => `Channel ${channelId}`,
    },
};

/** One integration's catalog entry, for a source of any connector. */
export type LiveIntegrationCatalogEntry = Omit<
    LiveIntegrationCatalogFields<ApiConnectorType>,
    'getTarget'
> & {
    connector: ApiConnectorType;
    getTarget: (apiSource: ExternalConnectionApiSource) => string;
};

export const getLiveIntegrationCatalogEntry = (
    connector: ApiConnectorType,
): LiveIntegrationCatalogEntry => ({
    ...LIVE_INTEGRATION_CATALOG[connector],
    connector,
    // Only ever called with a source of this connector
    getTarget: LIVE_INTEGRATION_CATALOG[connector]
        .getTarget as LiveIntegrationCatalogEntry['getTarget'],
});

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
        description: 'Orders, products and sales with ShopifyQL',
    },
    {
        id: 'stripe',
        label: 'Stripe',
        description: 'Payments, subscriptions and revenue',
    },
    {
        id: 'salesforce',
        label: 'Salesforce',
        description: 'Accounts, opportunities and pipeline with SOQL',
    },
    {
        id: 'mixpanel',
        label: 'Mixpanel',
        description: 'Product events, funnels and retention',
    },
    {
        id: 'jira',
        label: 'Jira',
        description: 'Issues, sprints and cycle time with JQL',
    },
] as const;
