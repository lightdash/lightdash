import {
    ApiConnectorType,
    HYDRA_DEFAULT_SOURCE,
    HYDRA_ENABLED_ENV,
    ParameterError,
    type ExternalConnectionApiSource,
    type MetricQuery,
} from '@lightdash/common';
import { buildLiveExplores, compileLiveMetricQuery } from './explores/build';
import { getInitialLiveSourceFieldEdits } from './explores/fields';
import { connectLiveSource } from './liveSource.mock';
import {
    getLiveIntegration,
    isLiveIntegrationRegistered,
    parseStoredApiSource,
} from './registry';
import { type LiveHttpResponse } from './types';

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
    [ApiConnectorType.GITHUB]: {
        connector: ApiConnectorType.GITHUB,
        owner: 'lightdash',
        repo: 'lightdash',
    },
    [ApiConnectorType.PYLON]: {
        connector: ApiConnectorType.PYLON,
    },
    [ApiConnectorType.ATTIO]: { connector: ApiConnectorType.ATTIO },
    [ApiConnectorType.HUBSPOT]: { connector: ApiConnectorType.HUBSPOT },
    [ApiConnectorType.SALESFORCE]: { connector: ApiConnectorType.SALESFORCE },
    [ApiConnectorType.HYDRA]: HYDRA_DEFAULT_SOURCE,
};

const SERVER_ERROR: LiveHttpResponse = {
    status: 500,
    headers: {},
    body: { error: { message: 'boom' } },
};

const connect = (settings: ExternalConnectionApiSource) => {
    const send = vi.fn().mockResolvedValue(SERVER_ERROR);
    const source = connectLiveSource(
        getLiveIntegration(settings.connector),
        settings,
        send,
    );
    return { send, source };
};

describe.each(Object.values(SAMPLE_SETTINGS))(
    'live integration $connector',
    (settings) => {
        const integration = getLiveIntegration(settings.connector);

        test('stores its settings as they are', () => {
            expect(integration.settings.parse(settings)).toEqual(settings);
        });

        test('scans only explores it has, besides its first', () => {
            const [first, ...others] = integration.explores.map(
                ({ name }) => name,
            );
            (integration.scan?.models ?? []).forEach((model) => {
                expect(others).toContain(model);
                expect(model).not.toBe(first);
            });
        });

        test('refuses a limit that is not a positive number before calling', async () => {
            const { send, source } = connect(settings);
            await expect(
                source.run({
                    query: '',
                    limit: 0,
                }),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(send).not.toHaveBeenCalled();
        });

        test('refuses an empty request before calling', async () => {
            const { send, source } = connect(settings);
            await expect(
                source.run({
                    query: '',
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
            // A metric where the explore has one, else a dimension
            const [definition] = integration.explores;
            const [metric] = definition.metrics;
            const [dimension] = definition.dimensions;
            const metricQuery: MetricQuery = {
                exploreName: explore.name,
                dimensions: metric ? [] : [`${explore.name}_${dimension.name}`],
                metrics: metric ? [`${explore.name}_${metric.name}`] : [],
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

            const { send, source } = connect(settings);
            const run = source.run({
                query: compiled.query,
                limit: compiled.requestLimit,
            });

            await expect(run).rejects.toThrow();
            await expect(run).rejects.not.toBeInstanceOf(ParameterError);
            expect(send).toHaveBeenCalled();
        });
    },
);

describe('Hydra, the test integration', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    test('is absent from the registry unless turned on', () => {
        vi.stubEnv(HYDRA_ENABLED_ENV, '');
        expect(isLiveIntegrationRegistered(ApiConnectorType.HYDRA)).toBe(false);
        expect(() => getLiveIntegration(ApiConnectorType.HYDRA)).toThrow(
            ParameterError,
        );
        // A source saved while it was on reads as no live source
        expect(parseStoredApiSource(HYDRA_DEFAULT_SOURCE)).toBeNull();
        expect(isLiveIntegrationRegistered(ApiConnectorType.PYLON)).toBe(true);

        vi.stubEnv(HYDRA_ENABLED_ENV, 'true');
        expect(isLiveIntegrationRegistered(ApiConnectorType.HYDRA)).toBe(true);
        expect(parseStoredApiSource(HYDRA_DEFAULT_SOURCE)).toEqual(
            HYDRA_DEFAULT_SOURCE,
        );
    });
});
