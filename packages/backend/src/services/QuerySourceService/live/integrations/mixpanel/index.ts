import {
    ApiConnectorType,
    getMixpanelRegion,
    LIVE_INTEGRATION_CATALOG,
    MIXPANEL_PATHS,
    MIXPANEL_REGION_ORIGINS,
    ParameterError,
    TimeFrames,
} from '@lightdash/common';
import {
    ALL_PUSHDOWN_REFUSED,
    defineLiveIntegration,
    getIsoDateInTimeZone,
    readRule,
} from '../../sdk';
import { compileMixpanelQuery } from './compile';
import { toMixpanelError } from './errors';
import { MIXPANEL_EXPLORES } from './explores';
import {
    MIXPANEL_DATE_FILTERS,
    MIXPANEL_NUMBER_FILTERS,
    MIXPANEL_PROPERTY_FILTERS,
} from './filters';
import {
    MIXPANEL_CALLS_PER_QUERY,
    MIXPANEL_MAX_QUERY_ROWS,
    mixpanelRequestSchema,
    runMixpanelQuery,
} from './run';
import { summarizeMixpanelTest } from './testSummary';
import { mixpanelUseCases } from './useCases';

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.MIXPANEL];
const LABEL = CATALOG.messageLabel;

const PROJECT_ID = /^\d{1,20}$/;

export const mixpanelIntegration = defineLiveIntegration({
    connector: ApiConnectorType.MIXPANEL,
    label: LABEL,
    kind: 'reports',
    connection: {
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
    },
    model: {
        explores: MIXPANEL_EXPLORES,
        plannedNames: ['profiles', 'insights', 'property_sums'],
    },
    query: {
        request: mixpanelRequestSchema,
        compile: ({ explore, metricQuery, timezone, now }) =>
            compileMixpanelQuery({
                explore,
                metricQuery,
                today: getIsoDateInTimeZone(now, timezone),
            }),
        run: runMixpanelQuery,
        toError: (response) => toMixpanelError(response),
        // Reports take one date range in the project's time zone, by day or month
        // (retention by day, week or month), and `where` filters of `==` and `!=`
        // on event properties, ANDed.
        capabilities: {
            filters: {
                operators: {
                    string: MIXPANEL_PROPERTY_FILTERS,
                    number: MIXPANEL_NUMBER_FILTERS,
                    date: MIXPANEL_DATE_FILTERS,
                },
                multipleValues: true,
                or: false,
                nestedGroups: false,
            },
            metricFilters: false,
            dates: {
                rangeRequired: true,
                operators: MIXPANEL_DATE_FILTERS,
                grains: [TimeFrames.DAY, TimeFrames.WEEK, TimeFrames.MONTH],
                timezone: 'fixed',
            },
            pushdown: ALL_PUSHDOWN_REFUSED,
        },
        limits: {
            callsPerQuery: MIXPANEL_CALLS_PER_QUERY,
            timeoutMs: 60_000,
            maxRows: MIXPANEL_MAX_QUERY_ROWS,
            // Mixpanel allows 60 Query API calls an hour and 5 at once per project,
            // shared with every other client. One call at a time and 40 an hour leave
            // room for them.
            concurrentCalls: 1,
            callsPerSecond: null,
            buckets: [
                {
                    id: 'hour',
                    label: 'per hour',
                    windowMs: 3_600_000,
                    capacity: 40,
                },
            ],
            note: 'Mixpanel allows 60 queries an hour and 5 at once per project, shared with every other client; Lightdash keeps to 40 an hour.',
        },
    },
    spec: {
        auth: {
            description:
                'A service account (username and secret over HTTP Basic) added to the project; no vendor review. The Query API needs a Growth or Enterprise plan.',
            testWith: 'paid_account',
            needs: ['gmail', 'card'],
            token: true,
            oauth: 'none',
        },
        useCases: mixpanelUseCases,
    },
});
