import { z } from 'zod';
import {
    type ApiSourceOf,
    type ExternalConnectionApiSource,
} from '../ee/externalConnections/types';
import { ApiConnectorType } from '../types/querySources';

/** How an admin connects a source, which decides the dialog it opens. */
export type LiveSourceSetupKind =
    | 'google'
    | 'posthog'
    | 'token'
    | 'linkedin_ads';

type LiveIntegrationCatalogFields<C extends ApiConnectorType> = {
    /** Stable id, sent with analytics events. */
    id: string;
    /** The name people see when adding and listing sources. */
    label: string;
    /** The name refusals and API errors use. */
    messageLabel: string;
    /** The name AI agents read and repeat. */
    agentLabel: string;
    description: string;
    setup: LiveSourceSetupKind;
    /** The settings a source stores; checked against the API type. */
    settings: z.ZodType<ApiSourceOf<C>>;
    /** What one source reads, shown wherever it is listed. */
    getTarget: (apiSource: ApiSourceOf<C>) => string;
    /** Offered by the onboarding tools step. Most sources are added later. */
    inOnboarding?: true;
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
        messageLabel: 'PostHog',
        agentLabel: 'PostHog',
        description: 'Product events, persons and sessions with HogQL',
        setup: 'posthog',
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
        messageLabel: 'Google Analytics',
        agentLabel: 'Google Analytics 4',
        description: 'Users, sessions, events and revenue for a property',
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
        messageLabel: 'Meta Ads',
        agentLabel: 'Meta Ads',
        description: 'Facebook and Instagram ad performance',
        setup: 'token',
        settings: z.object({
            connector: z.literal(ApiConnectorType.META_ADS),
            adAccountId: z.string(),
        }),
        getTarget: ({ adAccountId }) => `Ad account ${adAccountId}`,
    },
    [ApiConnectorType.GOOGLE_ADS]: {
        id: 'google_ads',
        label: 'Google Ads',
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
        messageLabel: 'GitHub',
        agentLabel: 'GitHub',
        description: 'Pull requests, issues and contributors of a repository',
        setup: 'token',
        settings: z.object({
            connector: z.literal(ApiConnectorType.GITHUB),
            owner: z.string(),
            repo: z.string(),
        }),
        getTarget: ({ owner, repo }) => `${owner}/${repo}`,
        agentQueryGuide:
            'one JSON object of one of two kinds. A search: {"kind": "search", "type": "pr" or "issue", "q": GitHub search qualifiers such as is:open, is:merged, author:octocat, label:"bug", created:2026-10-01..2026-10-31 or NOT "word" in:title,body, "columns": fields to list from number, title, url, state, author, assignee, labels, draft, comments, created_at, updated_at, closed_at, merged_at and state_reason, or ["total_count"] alone for a count, and optionally "sort" (created, updated or comments) and "order" (asc or desc)}. The repository and the type are added for you, so never put repo:, org:, user: or is:pr in q. Search matches whole words and reads at most 1,000 results, so count with total_count rather than listing. Contributors: {"kind": "contributors", "columns": from author, week, commits, additions and deletions, and optionally "since" and "until" (YYYY-MM-DD), "authors" and "excludeAuthors"}. It reads default-branch commits per author and week, summed over the weeks when week is not a column; additions and deletions are 0 on repositories with 10,000 commits or more.',
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
