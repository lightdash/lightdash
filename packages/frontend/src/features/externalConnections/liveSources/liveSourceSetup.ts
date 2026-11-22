import { ApiConnectorType, HUBSPOT_OBJECTS } from '@lightdash/common';

/**
 * What to do in the integration before adding it, shown first in the add
 * dialog so every other row can stay a label and a field.
 */
export type LiveSourceSetup = {
    steps: string[];
    /** Exact scope or permission names, each one copyable. */
    scopes?: string[];
    /** The integration's page for the first step. */
    link?: { label: string; href: string };
};

const googleSetup = (target: string): LiveSourceSetup => ({
    steps: [`Sign in with a Google account that can read the ${target}`],
});

export const LIVE_SOURCE_SETUP: Record<ApiConnectorType, LiveSourceSetup> = {
    [ApiConnectorType.GITHUB]: {
        steps: [
            'Create a fine-grained personal access token for the repository',
            'Give it read access to these permissions',
        ],
        scopes: ['Metadata', 'Issues', 'Pull requests'],
        link: {
            label: 'Create a token on GitHub',
            href: 'https://github.com/settings/personal-access-tokens/new',
        },
    },
    [ApiConnectorType.HUBSPOT]: {
        steps: [
            'Create a private app in HubSpot',
            'Give it these scopes',
            'Copy its access token',
        ],
        scopes: HUBSPOT_OBJECTS.flatMap((object) => [
            `crm.objects.${object}.read`,
            `crm.schemas.${object}.read`,
        ]),
    },
    [ApiConnectorType.ATTIO]: {
        steps: [
            'In Attio, open Settings, Developers and create an access token',
            'Give it read access to records, objects and users',
        ],
    },
    [ApiConnectorType.META_ADS]: {
        steps: [
            'Create a system user in Meta Business settings',
            'Give it access to the ad account',
            'Generate a token with this permission',
        ],
        scopes: ['ads_read'],
        link: {
            label: 'Open Business settings',
            href: 'https://business.facebook.com/settings/system-users',
        },
    },
    [ApiConnectorType.PYLON]: {
        steps: [
            'Ask a Pylon admin to create an API token in Settings, API Tokens',
        ],
    },
    [ApiConnectorType.POSTHOG]: {
        steps: [
            'Create a personal API key in PostHog',
            'Give it the Query Read scope',
        ],
    },
    [ApiConnectorType.GA4]: googleSetup('property'),
    [ApiConnectorType.SEARCH_CONSOLE]: googleSetup('site'),
    [ApiConnectorType.GOOGLE_ADS]: googleSetup('ad account'),
    [ApiConnectorType.YOUTUBE_ANALYTICS]: googleSetup('channel'),
    [ApiConnectorType.LINKEDIN_ADS]: {
        steps: [
            'Sign in with a LinkedIn account that can view the ad account in Campaign Manager',
        ],
    },
    [ApiConnectorType.SALESFORCE]: {
        steps: ['Sign in as a Salesforce user with the API Enabled permission'],
    },
};
