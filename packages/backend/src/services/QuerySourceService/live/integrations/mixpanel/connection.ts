import {
    ApiConnectorType,
    getMixpanelRegion,
    LIVE_INTEGRATION_CATALOG,
    MIXPANEL_PATHS,
    MIXPANEL_REGION_ORIGINS,
    ParameterError,
} from '@lightdash/common';
import { z } from 'zod';
import {
    formatTestCount,
    readRule,
    summarizeTestWith,
    type LiveConnection,
} from '../../sdk';

// The setup test lists the project's most common events of the last 31 days
const testResponseSchema = z.array(z.string());

export const summarizeMixpanelTest = summarizeTestWith(
    testResponseSchema,
    (events) => ({
        summary: 'Connected to your Mixpanel project',
        facts: [
            {
                label: 'Events in the last 31 days',
                value: formatTestCount(events.length),
            },
        ],
    }),
);

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.MIXPANEL];

const PROJECT_ID = /^\d{1,20}$/;

export const mixpanelConnection: LiveConnection<ApiConnectorType.MIXPANEL> = {
    settings: CATALOG.settings,
    origins: [
        MIXPANEL_REGION_ORIGINS.us,
        MIXPANEL_REGION_ORIGINS.eu,
        MIXPANEL_REGION_ORIGINS.in,
    ],
    access: () => ({
        rules: Object.values(MIXPANEL_PATHS).map((path) =>
            readRule('GET', path),
        ),
    }),
    checkAuth: ({ type }) => {
        if (type !== 'api_key') {
            throw new ParameterError(
                'Mixpanel live data sources sign in with a service account username and secret',
            );
        }
    },
    validate: ({ projectId }) => {
        if (!PROJECT_ID.test(projectId)) {
            throw new ParameterError(
                'Mixpanel project IDs are numbers: the one after /project/ in the project URL',
            );
        }
    },
    describeTarget: ({ origin, settings, targetLabel }) => {
        const region = getMixpanelRegion(origin).toUpperCase();
        return `Mixpanel project ${settings.projectId}${targetLabel ? ` "${targetLabel}"` : ''}, ${region} data region`;
    },
    summarizeTest: summarizeMixpanelTest,
};
