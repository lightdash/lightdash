import {
    ApiConnectorType,
    ParameterError,
    type ExternalConnectionApiSource,
    type MetricQuery,
} from '@lightdash/common';
import type { LiveHttpResponse } from './connector';
import { buildLiveExplores, compileLiveMetricQuery } from './explores/build';
import { getInitialLiveSourceFieldEdits } from './explores/fields';
import { getLiveIntegration } from './registry';

/**
 * Checks every integration in the registry keeps the contract the rest of
 * the backend relies on. A new integration only adds its sample settings.
 */
const SAMPLE_SETTINGS: {
    [C in ApiConnectorType]: Extract<
        ExternalConnectionApiSource,
        { connector: C }
    >;
} = {
    [ApiConnectorType.GA4]: {
        connector: ApiConnectorType.GA4,
        propertyId: '123',
    },
    [ApiConnectorType.SEARCH_CONSOLE]: {
        connector: ApiConnectorType.SEARCH_CONSOLE,
        siteUrl: 'sc-domain:example.com',
    },
    [ApiConnectorType.YOUTUBE_ANALYTICS]: {
        connector: ApiConnectorType.YOUTUBE_ANALYTICS,
        channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa',
    },
    [ApiConnectorType.LINKEDIN_ADS]: {
        connector: ApiConnectorType.LINKEDIN_ADS,
        adAccountId: '507404993',
    },
    [ApiConnectorType.POSTHOG]: {
        connector: ApiConnectorType.POSTHOG,
        projectId: '42',
    },
    [ApiConnectorType.META_ADS]: {
        connector: ApiConnectorType.META_ADS,
        adAccountId: '123',
    },
    [ApiConnectorType.GOOGLE_ADS]: {
        connector: ApiConnectorType.GOOGLE_ADS,
        customerId: '1234567890',
        loginCustomerId: null,
    },
};

const SERVER_ERROR: LiveHttpResponse = {
    status: 500,
    headers: {},
    body: { error: { message: 'boom' } },
};

const connect = (settings: ExternalConnectionApiSource) => {
    const send = vi.fn().mockResolvedValue(SERVER_ERROR);
    const { connector } = getLiveIntegration(
        settings.connector,
    ).createConnector(settings, send);
    return { send, connector };
};

describe.each(Object.values(SAMPLE_SETTINGS))(
    'live integration $connector',
    (settings) => {
        const integration = getLiveIntegration(settings.connector);

        test('stores its settings as they are', () => {
            expect(integration.settingsSchema.parse(settings)).toEqual(
                settings,
            );
        });

        test('refuses a limit that is not a positive number before calling', async () => {
            const { send, connector } = connect(settings);
            await expect(
                connector.execute({
                    payload: { kind: 'query', query: '' },
                    limit: 0,
                }),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(send).not.toHaveBeenCalled();
        });

        test('refuses an empty request before calling', async () => {
            const { send, connector } = connect(settings);
            await expect(
                connector.execute({
                    payload: { kind: 'query', query: '' },
                    limit: 10,
                }),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(send).not.toHaveBeenCalled();
        });

        test('runs what it compiles, and explains a failed call', async () => {
            const [explore] = buildLiveExplores({
                connectionUuid: '03386598-7a51-45b2-b1f9-5ef55bd09016',
                sourceName: settings.connector,
                name: 'Source',
                apiSource: settings,
                scannedFields: [],
                edits: getInitialLiveSourceFieldEdits({
                    scannedFields: [],
                    isExistingSource: true,
                }),
            });
            const [metric] = integration.baseLayer.definitions[0].metrics;
            const metricQuery: MetricQuery = {
                exploreName: explore.name,
                dimensions: [],
                metrics: [`${explore.name}_${metric.name}`],
                filters: {},
                sorts: [],
                limit: 10,
                tableCalculations: [],
            };
            const compiled = compileLiveMetricQuery({
                explore,
                metricQuery,
                timezone: 'UTC',
                now: new Date('2026-11-06T12:00:00Z'),
            });

            const { send, connector } = connect(settings);
            const run = connector.execute({
                payload: { kind: 'query', query: compiled.query },
                limit: compiled.requestLimit,
            });

            await expect(run).rejects.toThrow();
            await expect(run).rejects.not.toBeInstanceOf(ParameterError);
            expect(send).toHaveBeenCalled();
        });
    },
);
