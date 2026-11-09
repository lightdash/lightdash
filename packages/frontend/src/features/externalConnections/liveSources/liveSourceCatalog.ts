import {
    ApiConnectorType,
    type ApiSourceOf,
    type ExternalConnectionApiSource,
} from '@lightdash/common';
import googleAdsIcon from './icons/google-ads.svg';
import googleAnalyticsIcon from './icons/google-analytics.svg';
import googleSearchConsoleIcon from './icons/google-search-console.svg';
import jiraIcon from './icons/jira.svg';
import linkedinAdsIcon from './icons/linkedin-ads.svg';
import metaAdsIcon from './icons/meta-ads.svg';
import mixpanelIcon from './icons/mixpanel.svg';
import posthogIcon from './icons/posthog.svg';
import salesforceIcon from './icons/salesforce.svg';
import shopifyIcon from './icons/shopify.svg';
import stripeIcon from './icons/stripe.svg';
import youtubeAnalyticsIcon from './icons/youtube-analytics.svg';
import { META_ADS_TOKEN_FORM } from './metaAdsConnection';
import { type TokenLiveSourceForm } from './tokenLiveSource';

type LiveSourceCatalogBase = {
    /** Stable id, sent with analytics events. */
    id: string;
    label: string;
    description: string;
    /** Brand mark in its brand color, square viewBox. */
    icon: string;
};

/** How an admin connects a source, which decides the dialog it opens. */
export type LiveSourceSetup =
    | { kind: 'google' }
    | { kind: 'posthog' }
    | { kind: 'token'; form: TokenLiveSourceForm };

type AvailableLiveSourceFields<C extends ApiConnectorType> = {
    connector: C;
    /** What one source reads, shown wherever it is listed. */
    getTarget: (apiSource: ApiSourceOf<C>) => string;
    setup: LiveSourceSetup;
    /** Offered by the onboarding tools step. Most sources are added later. */
    inOnboarding?: true;
};

export type AvailableLiveSource = LiveSourceCatalogBase & {
    status: 'available';
    connector: ApiConnectorType;
    getTarget: (apiSource: ExternalConnectionApiSource) => string;
    setup: LiveSourceSetup;
    inOnboarding?: true;
};

const available = <C extends ApiConnectorType>(
    entry: LiveSourceCatalogBase & AvailableLiveSourceFields<C>,
): AvailableLiveSource => ({
    ...entry,
    status: 'available',
    // Only ever called with the source its own connector found
    getTarget: entry.getTarget as AvailableLiveSource['getTarget'],
});

export type RequestableLiveSource = LiveSourceCatalogBase & {
    status: 'requestable';
};

export type LiveSourceCatalogEntry =
    | AvailableLiveSource
    | RequestableLiveSource;

/**
 * Every integration shown when adding a live data source. Requestable ones
 * are APIs that answer reports or their own query language, so they can be
 * queried live; users ask for them and we count the requests.
 */
export const LIVE_SOURCE_CATALOG: LiveSourceCatalogEntry[] = [
    available({
        id: 'posthog',
        connector: ApiConnectorType.POSTHOG,
        label: 'PostHog',
        description: 'Product events, persons and sessions with HogQL',
        icon: posthogIcon,
        getTarget: ({ projectId }) => `Project ${projectId}`,
        setup: { kind: 'posthog' },
        inOnboarding: true,
    }),
    available({
        id: 'google_analytics',
        connector: ApiConnectorType.GA4,
        label: 'Google Analytics 4',
        description: 'Users, sessions, events and revenue for a property',
        icon: googleAnalyticsIcon,
        getTarget: ({ propertyId }) => `Property ${propertyId}`,
        setup: { kind: 'google' },
        inOnboarding: true,
    }),
    available({
        id: 'google_search_console',
        connector: ApiConnectorType.SEARCH_CONSOLE,
        label: 'Google Search Console',
        description: 'Search clicks, impressions, CTR and position',
        icon: googleSearchConsoleIcon,
        getTarget: ({ siteUrl }) => siteUrl,
        setup: { kind: 'google' },
        inOnboarding: true,
    }),
    available({
        id: 'meta_ads',
        connector: ApiConnectorType.META_ADS,
        label: 'Meta Ads',
        description: 'Facebook and Instagram ad performance',
        icon: metaAdsIcon,
        getTarget: ({ adAccountId }) => `Ad account ${adAccountId}`,
        setup: { kind: 'token', form: META_ADS_TOKEN_FORM },
    }),
    {
        id: 'google_ads',
        status: 'requestable',
        label: 'Google Ads',
        description: 'Campaign spend, clicks and conversions',
        icon: googleAdsIcon,
    },
    {
        id: 'linkedin_ads',
        status: 'requestable',
        label: 'LinkedIn Ads',
        description: 'Campaign reach, clicks and leads',
        icon: linkedinAdsIcon,
    },
    {
        id: 'youtube_analytics',
        status: 'requestable',
        label: 'YouTube Analytics',
        description: 'Channel views, watch time and subscribers',
        icon: youtubeAnalyticsIcon,
    },
    {
        id: 'shopify',
        status: 'requestable',
        label: 'Shopify',
        description: 'Orders, products and sales with ShopifyQL',
        icon: shopifyIcon,
    },
    {
        id: 'stripe',
        status: 'requestable',
        label: 'Stripe',
        description: 'Payments, subscriptions and revenue',
        icon: stripeIcon,
    },
    {
        id: 'salesforce',
        status: 'requestable',
        label: 'Salesforce',
        description: 'Accounts, opportunities and pipeline with SOQL',
        icon: salesforceIcon,
    },
    {
        id: 'mixpanel',
        status: 'requestable',
        label: 'Mixpanel',
        description: 'Product events, funnels and retention',
        icon: mixpanelIcon,
    },
    {
        id: 'jira',
        status: 'requestable',
        label: 'Jira',
        description: 'Issues, sprints and cycle time with JQL',
        icon: jiraIcon,
    },
];

export const isAvailableLiveSource = (
    entry: LiveSourceCatalogEntry,
): entry is AvailableLiveSource => entry.status === 'available';

export const getLiveSource = (
    connector: ApiConnectorType,
): AvailableLiveSource => {
    const entry = LIVE_SOURCE_CATALOG.filter(isAvailableLiveSource).find(
        (candidate) => candidate.connector === connector,
    );
    if (!entry) throw new Error(`No catalog entry for connector ${connector}`);
    return entry;
};

/** What a source reads: a PostHog project, a Search Console site, a GA4 property and so on. */
export const getApiSourceTarget = (apiSource: ExternalConnectionApiSource) =>
    getLiveSource(apiSource.connector).getTarget(apiSource);
