import {
    ApiConnectorType,
    ExternalSourceScope,
    ExternalSourceStatus,
    ExternalSourceType,
} from '@lightdash/common';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import OnboardingTools from '../../pages/OnboardingTools';
import {
    minutesAgo,
    OnboardingStory,
    ORG_UUID,
    PROJECT_UUID,
    USER_UUID,
    type StubRoutes,
} from './storyApi';

const meta: Meta = {
    title: 'Onboarding/05 Connect tools',
    parameters: { layout: 'fullscreen' },
};
export default meta;

const connectionsBase = `/ee/projects/${PROJECT_UUID}/external-connections`;
const sourcesBase = `/ee/projects/${PROJECT_UUID}/external-sources`;

const postHogConnection = {
    externalConnectionUuid: '3c5e7a9b-1d2f-4a6c-8e0b-2d4f6a8c0e13',
    projectUuid: PROJECT_UUID,
    organizationUuid: ORG_UUID,
    name: 'PostHog',
    slug: 'posthog',
    type: 'oauth_authorization_code',
    origin: 'https://us.posthog.com',
    instructions: null,
    allowedPathPrefixes: ['/api/projects/48213/'],
    allowedMethods: ['GET', 'POST'],
    allowedContentTypes: ['application/json'],
    responseMaxBytes: 5_000_000,
    requestMaxBytes: 100_000,
    timeoutMs: 30_000,
    rateLimitPerMinute: 60,
    apiKeyName: null,
    apiKeyLocation: null,
    oauthScopes: null,
    customHeaders: null,
    kind: 'live_source',
    apiSource: { connector: ApiConnectorType.POSTHOG, projectId: '48213' },
    hasSecret: true,
    createdByUserUuid: USER_UUID,
    updatedByUserUuid: USER_UUID,
    createdAt: minutesAgo(6),
    updatedAt: minutesAgo(6),
    linkedDataAppCount: 0,
    linkedChartTypeCount: 0,
};

const csvSource = {
    sourceUuid: '7d9f1b3c-5e7a-4c2e-9a1b-3c5e7f9a1b24',
    projectUuid: PROJECT_UUID,
    type: ExternalSourceType.CSV,
    scope: ExternalSourceScope.CATALOG,
    name: 'wholesale_accounts',
    connection: {
        type: ExternalSourceType.CSV,
        originalFilename: 'wholesale_accounts.csv',
    },
    status: ExternalSourceStatus.READY,
    errorMessage: null,
    createdByUserUuid: USER_UUID,
    lastRefreshedAt: minutesAgo(3),
    tables: [],
};

const toolsStory = (routes: StubRoutes, play?: StoryObj['play']) => ({
    play,
    render: () => (
        <OnboardingStory
            path="/onboarding/tools/:projectUuid"
            url={`/onboarding/tools/${PROJECT_UUID}`}
            element={<OnboardingTools />}
            routes={routes}
        />
    ),
});

export const NothingConnected: StoryObj = {
    name: 'Nothing connected',
    ...toolsStory({
        [`GET ${connectionsBase}`]: [],
        [`GET ${sourcesBase}`]: [],
    }),
};

export const PostHogExpanded: StoryObj = {
    name: 'PostHog row expanded',
    ...toolsStory(
        {
            [`GET ${connectionsBase}`]: [],
            [`GET ${sourcesBase}`]: [],
        },
        async ({ canvasElement }) => {
            const canvas = within(canvasElement);
            const [postHogConnect] = await canvas.findAllByRole(
                'button',
                { name: 'Connect' },
                { timeout: 5000 },
            );
            await userEvent.click(postHogConnect);
        },
    ),
};

export const PostHogAndCsvConnected: StoryObj = {
    name: 'PostHog + CSV connected',
    ...toolsStory({
        [`GET ${connectionsBase}`]: [postHogConnection],
        [`GET ${sourcesBase}`]: [csvSource],
    }),
};
