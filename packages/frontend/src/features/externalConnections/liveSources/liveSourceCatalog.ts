import { ApiConnectorType } from '@lightdash/common';
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

type LiveSourceCatalogBase = {
    /** Stable id, sent with analytics events. */
    id: string;
    label: string;
    description: string;
    /** Brand mark in its brand color, square viewBox. */
    icon: string;
};

export type AvailableLiveSource = LiveSourceCatalogBase & {
    status: 'available';
    connector: ApiConnectorType;
};

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
    {
        id: 'posthog',
        status: 'available',
        connector: ApiConnectorType.POSTHOG,
        label: 'PostHog',
        description: 'Product events, persons and sessions with HogQL',
        icon: posthogIcon,
    },
    {
        id: 'google_analytics',
        status: 'available',
        connector: ApiConnectorType.GA4,
        label: 'Google Analytics 4',
        description: 'Users, sessions, events and revenue for a property',
        icon: googleAnalyticsIcon,
    },
    {
        id: 'google_search_console',
        status: 'available',
        connector: ApiConnectorType.SEARCH_CONSOLE,
        label: 'Google Search Console',
        description: 'Search clicks, impressions, CTR and position',
        icon: googleSearchConsoleIcon,
    },
    {
        id: 'google_ads',
        status: 'requestable',
        label: 'Google Ads',
        description: 'Campaign spend, clicks and conversions',
        icon: googleAdsIcon,
    },
    {
        id: 'meta_ads',
        status: 'requestable',
        label: 'Meta Ads',
        description: 'Facebook and Instagram ad performance',
        icon: metaAdsIcon,
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
