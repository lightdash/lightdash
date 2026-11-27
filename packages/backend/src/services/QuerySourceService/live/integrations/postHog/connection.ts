import {
    ApiConnectorType,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
    POSTHOG_REGION_ORIGINS,
} from '@lightdash/common';
import { z } from 'zod';
import {
    formatTestCount,
    readRule,
    type LiveConnection,
    type LiveTestSummary,
} from '../../sdk';
import {
    getPostHogOAuthEndpoints,
    getPostHogPropertyDefinitionsPrefix,
    getPostHogQueryPath,
} from './api';

// Answer to POSTHOG_TEST_QUERY: one row, one count
const testResponseSchema = z.object({
    results: z.tuple([z.tuple([z.number()])]),
});

export const summarizePostHogTest = (
    body: unknown,
    { projectId }: { projectId: string },
): LiveTestSummary | null => {
    const parsed = testResponseSchema.safeParse(body);
    if (!parsed.success) return null;
    const [[eventTypes]] = parsed.data.results;
    return {
        summary: `Connected to PostHog project ${projectId}`,
        facts: [
            {
                label: 'Event types in the last 7 days',
                value: formatTestCount(eventTypes),
            },
        ],
    };
};

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.POSTHOG];
const POSTHOG_PROJECT_ID = /^\d{1,12}$/;

export const postHogConnection: LiveConnection<ApiConnectorType.POSTHOG> = {
    settings: CATALOG.settings,
    origins: [POSTHOG_REGION_ORIGINS.us, POSTHOG_REGION_ORIGINS.eu],
    access: ({ projectId }) => ({
        rules: [
            readRule('POST', getPostHogQueryPath(projectId)),
            readRule('GET', getPostHogPropertyDefinitionsPrefix(projectId)),
        ],
    }),
    checkAuth: ({ type, origin, oauthTokenUrl }) => {
        if (type === 'oauth_authorization_code') {
            if (oauthTokenUrl !== getPostHogOAuthEndpoints(origin).tokenUrl) {
                throw new ParameterError(
                    "PostHog sign-in must use the region's token endpoint",
                );
            }
            return;
        }
        if (type !== 'bearer_token') {
            throw new ParameterError(
                'PostHog connections authenticate with a personal API key or by signing in to PostHog',
            );
        }
    },
    validate: ({ projectId }) => {
        if (!POSTHOG_PROJECT_ID.test(projectId)) {
            throw new ParameterError('The PostHog project ID must be a number');
        }
    },
    describeTarget: ({ settings: { projectId }, origin, targetLabel }) => {
        const region = Object.entries(POSTHOG_REGION_ORIGINS).find(
            ([, regionOrigin]) => regionOrigin === origin,
        )?.[0];
        const project = targetLabel
            ? `"${targetLabel}" (ID ${projectId})`
            : projectId;
        return `PostHog project ${project}${region ? `, ${region.toUpperCase()} region` : ''}`;
    },
    summarizeTest: summarizePostHogTest,
};
