import {
    ApiConnectorType,
    getLiveIntegrationCatalogEntry,
    getLiveSourceTarget,
    REQUESTABLE_LIVE_INTEGRATIONS,
    type LiveIntegrationCatalogEntry,
} from '@lightdash/common';
import { ATTIO_TOKEN_FORM } from './attioConnection';
import { GITHUB_TOKEN_FORM } from './githubConnection';
import { HUBSPOT_TOKEN_FORM } from './hubspotConnection';
import { HYDRA_TOKEN_FORM } from './hydraConnection';
import amplitudeIcon from './icons/amplitude.svg';
import attioIcon from './icons/attio.svg';
import githubIcon from './icons/github.svg';
import googleAdsIcon from './icons/google-ads.svg';
import googleAnalyticsIcon from './icons/google-analytics.svg';
import googlePlayIcon from './icons/google-play.svg';
import googleSearchConsoleIcon from './icons/google-search-console.svg';
import hubspotIcon from './icons/hubspot.svg';
import hydraIcon from './icons/hydra.svg';
import jiraIcon from './icons/jira.svg';
import linkedinAdsIcon from './icons/linkedin-ads.svg';
import metaAdsIcon from './icons/meta-ads.svg';
import mixpanelIcon from './icons/mixpanel.svg';
import posthogIcon from './icons/posthog.svg';
import pylonIcon from './icons/pylon.svg';
import salesforceIcon from './icons/salesforce.svg';
import shopifyIcon from './icons/shopify.svg';
import stripeIcon from './icons/stripe.svg';
import youtubeAnalyticsIcon from './icons/youtube-analytics.svg';
import iconClasses from './LiveSourceIcon.module.css';
import { META_ADS_TOKEN_FORM } from './metaAdsConnection';
import { PYLON_TOKEN_FORM } from './pylonConnection';
import { type TokenLiveSourceForm } from './tokenLiveSource';

/** How an admin connects a source, which decides the dialog it opens. */
export type LiveSourceSetup =
    | { kind: 'google' }
    | { kind: 'posthog' }
    | { kind: 'token'; form: TokenLiveSourceForm }
    | { kind: 'linkedin_ads' }
    | { kind: 'salesforce' }
    | { kind: 'amplitude' }
    | { kind: 'google_play' };

export type AvailableLiveSource = Omit<LiveIntegrationCatalogEntry, 'setup'> & {
    status: 'available';
    /** Brand mark in its brand color, square viewBox. */
    icon: string;
    setup: LiveSourceSetup;
};

export type RequestableLiveSource = {
    status: 'requestable';
    /** Stable id, sent with analytics events. */
    id: string;
    label: string;
    description: string;
    icon: string;
};

export type LiveSourceCatalogEntry =
    | AvailableLiveSource
    | RequestableLiveSource;

const ICONS: Record<string, string> = {
    [ApiConnectorType.POSTHOG]: posthogIcon,
    [ApiConnectorType.GA4]: googleAnalyticsIcon,
    [ApiConnectorType.SEARCH_CONSOLE]: googleSearchConsoleIcon,
    [ApiConnectorType.META_ADS]: metaAdsIcon,
    [ApiConnectorType.GOOGLE_ADS]: googleAdsIcon,
    [ApiConnectorType.LINKEDIN_ADS]: linkedinAdsIcon,
    [ApiConnectorType.YOUTUBE_ANALYTICS]: youtubeAnalyticsIcon,
    [ApiConnectorType.GOOGLE_PLAY]: googlePlayIcon,
    [ApiConnectorType.GITHUB]: githubIcon,
    [ApiConnectorType.PYLON]: pylonIcon,
    [ApiConnectorType.ATTIO]: attioIcon,
    [ApiConnectorType.HUBSPOT]: hubspotIcon,
    [ApiConnectorType.SALESFORCE]: salesforceIcon,
    [ApiConnectorType.AMPLITUDE]: amplitudeIcon,
    [ApiConnectorType.HYDRA]: hydraIcon,
    shopify: shopifyIcon,
    stripe: stripeIcon,
    mixpanel: mixpanelIcon,
    jira: jiraIcon,
};

/** One-colour marks, such as GitHub's, drawn dark and lightened in dark mode. */
const MONO_ICONS = new Set([githubIcon, attioIcon]);

/** Coloured marks too dark for a dark background, drawn white there, as the vendor does. */
const WHITE_ON_DARK_ICONS = new Set([pylonIcon]);

export const getLiveSourceIconClass = (icon: string) => {
    if (MONO_ICONS.has(icon)) return iconClasses.mono;
    if (WHITE_ON_DARK_ICONS.has(icon)) return iconClasses.whiteOnDark;
    return undefined;
};

/** The order sources are offered in; every connector appears once. */
const DISPLAY_ORDER = [
    ApiConnectorType.POSTHOG,
    ApiConnectorType.GA4,
    ApiConnectorType.SEARCH_CONSOLE,
    ApiConnectorType.META_ADS,
    ApiConnectorType.GOOGLE_ADS,
    ApiConnectorType.LINKEDIN_ADS,
    ApiConnectorType.YOUTUBE_ANALYTICS,
    ApiConnectorType.GOOGLE_PLAY,
    ApiConnectorType.GITHUB,
    ApiConnectorType.PYLON,
    ApiConnectorType.ATTIO,
    ApiConnectorType.HUBSPOT,
    ApiConnectorType.SALESFORCE,
    ApiConnectorType.AMPLITUDE,
    ApiConnectorType.HYDRA,
] as const satisfies readonly ApiConnectorType[];

/** The form of each integration connected with an account id and a token. */
const TOKEN_FORMS: Partial<Record<ApiConnectorType, TokenLiveSourceForm>> = {
    [ApiConnectorType.META_ADS]: META_ADS_TOKEN_FORM,
    [ApiConnectorType.GITHUB]: GITHUB_TOKEN_FORM,
    [ApiConnectorType.PYLON]: PYLON_TOKEN_FORM,
    [ApiConnectorType.ATTIO]: ATTIO_TOKEN_FORM,
    [ApiConnectorType.HUBSPOT]: HUBSPOT_TOKEN_FORM,
    [ApiConnectorType.HYDRA]: HYDRA_TOKEN_FORM,
};

const toSetup = (entry: LiveIntegrationCatalogEntry): LiveSourceSetup => {
    if (entry.setup !== 'token') {
        return { kind: entry.setup };
    }
    const form = TOKEN_FORMS[entry.connector];
    if (!form) throw new Error(`No token form for ${entry.connector}`);
    return { kind: 'token', form };
};

/**
 * Every integration shown when adding a live data source: the shared
 * catalog with the app's icons and forms, then the requestable ones.
 */
export const LIVE_SOURCE_CATALOG: LiveSourceCatalogEntry[] = [
    ...DISPLAY_ORDER.map((connector): AvailableLiveSource => {
        const entry = getLiveIntegrationCatalogEntry(connector);
        return {
            ...entry,
            status: 'available',
            icon: ICONS[connector],
            setup: toSetup(entry),
        };
    }),
    ...REQUESTABLE_LIVE_INTEGRATIONS.map(
        (entry): RequestableLiveSource => ({
            ...entry,
            status: 'requestable',
            icon: ICONS[entry.id],
        }),
    ),
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

export const formatChartCount = (count: number) =>
    `${count.toLocaleString()} ${count === 1 ? 'chart' : 'charts'}`;

/** What a source reads: a PostHog project, a Search Console site, a GA4 property and so on. */
export const getApiSourceTarget = getLiveSourceTarget;
