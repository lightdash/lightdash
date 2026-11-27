import {
    ApiConnectorType,
    getSentryPaths,
    isSentrySlug,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
    SENTRY_ORIGIN,
    SENTRY_REGION_ORIGINS,
} from '@lightdash/common';
import { z } from 'zod';
import {
    formatTestCount,
    readRule,
    type LiveConnection,
    type LiveHttpRequest,
    type LiveTestSummary,
} from '../../sdk';
import { toRawQuery } from './api';

type SentrySettings = { organizationSlug: string; projectSlugs: string[] };

const TEST_FIELD = 'count()';

/**
 * The setup test: a count of the error events of the source's projects over
 * a day. It names each project, so Sentry refuses one the token can't read,
 * and its answer holds a number and nothing of another project.
 */
export const getSentryTestRequest = ({
    organizationSlug,
    projectSlugs,
}: SentrySettings): LiveHttpRequest => ({
    method: 'GET',
    path: getSentryPaths(organizationSlug).events,
    rawQuery: toRawQuery([
        ['dataset', 'errors'],
        ['field', TEST_FIELD],
        ['statsPeriod', '24h'],
        ...projectSlugs.map((slug): [string, string] => ['project', slug]),
    ]),
    body: undefined,
});

const testResponseSchema = z.object({
    data: z.array(z.record(z.string(), z.unknown())),
});

export const summarizeSentryTest = (
    body: unknown,
    { organizationSlug, projectSlugs }: SentrySettings,
): LiveTestSummary | null => {
    const parsed = testResponseSchema.safeParse(body);
    if (!parsed.success) return null;
    const count = Number(parsed.data.data[0]?.[TEST_FIELD] ?? 0);
    return {
        summary: `The token reaches the Sentry organization ${organizationSlug}.`,
        facts: [
            { label: 'Projects', value: projectSlugs.join(', ') },
            {
                label: 'Error events in the last 24 hours',
                value: formatTestCount(Number.isFinite(count) ? count : 0),
            },
        ],
    };
};

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.SENTRY];

export const sentryConnection: LiveConnection<ApiConnectorType.SENTRY> = {
    settings: CATALOG.settings,
    origins: [
        SENTRY_ORIGIN,
        SENTRY_REGION_ORIGINS.us,
        SENTRY_REGION_ORIGINS.eu,
    ],
    // Reads only, and only of this organization. The token reads every
    // project of it, so each call names the source's projects; see
    // getProjects. No path lists the organization's projects. No request
    // names an event or an issue, so the paths under these that return one
    // are never called.
    access: ({ organizationSlug }) => {
        const paths = getSentryPaths(organizationSlug);
        return {
            rules: [
                readRule('GET', paths.events),
                readRule('GET', paths.issues),
                readRule('GET', paths.sessions),
            ],
        };
    },
    checkAuth: ({ type }) => {
        if (type !== 'bearer_token') {
            throw new ParameterError(
                'A Sentry live data source signs in with an auth token.',
            );
        }
    },
    validate: ({ organizationSlug, projectSlugs }) => {
        if (!isSentrySlug(organizationSlug)) {
            throw new ParameterError(
                'Give the Sentry organization as its slug, for example acme.',
            );
        }
        if (projectSlugs.length === 0 || !projectSlugs.every(isSentrySlug)) {
            throw new ParameterError(
                'Give each Sentry project as its slug, for example mobile-ios. Sentry reads a slug of digits only as an ID.',
            );
        }
    },
    describeTarget: ({ settings: { organizationSlug, projectSlugs } }) =>
        `The Sentry organization ${organizationSlug}, with the errors, issues and release health of ${projectSlugs.join(', ')}`,
    summarizeTest: summarizeSentryTest,
    testRequest: getSentryTestRequest,
};
