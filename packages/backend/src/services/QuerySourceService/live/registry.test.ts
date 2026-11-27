import {
    ApiConnectorType,
    HYDRA_DEFAULT_SOURCE,
    HYDRA_ENABLED_ENV,
    ParameterError,
    type ExternalConnectionApiSource,
    type MetricQuery,
} from '@lightdash/common';
import {
    buildLiveExplores,
    compileLiveMetricQuery,
    toScannedLiveSourceFields,
} from './explores/build';
import { getInitialLiveSourceFieldEdits } from './explores/fields';
import { describeLiveExplores, findAccessRule } from './integration';
import { connectLiveSource } from './liveSource.mock';
import {
    getLiveIntegration,
    isLiveIntegrationRegistered,
    parseStoredApiSource,
} from './registry';
import { type LiveCatalog, type LiveHttpResponse } from './types';

/** A scan for integrations whose explore has no fields until scanned. */
const SAMPLE_SCANS: Partial<Record<ApiConnectorType, LiveCatalog>> = {
    [ApiConnectorType.SUPABASE]: {
        supabaseTable: {
            properties: { id: { type: 'integer', format: 'bigint' } },
        },
    },
};

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
    [ApiConnectorType.AMPLITUDE]: {
        connector: ApiConnectorType.AMPLITUDE,
    },
    [ApiConnectorType.MIXPANEL]: {
        connector: ApiConnectorType.MIXPANEL,
        projectId: '12345',
    },
    [ApiConnectorType.SUPABASE]: {
        connector: ApiConnectorType.SUPABASE,
        table: 'orders',
    },
    [ApiConnectorType.SENTRY]: {
        connector: ApiConnectorType.SENTRY,
        organizationSlug: 'acme',
        projectSlugs: ['mobile-ios'],
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
            expect(integration.connection.settings.parse(settings)).toEqual(
                settings,
            );
        });

        test('reads a stored source that carries the engine keys too', () => {
            vi.stubEnv(HYDRA_ENABLED_ENV, 'true');
            expect(
                parseStoredApiSource({
                    ...settings,
                    sourceName: 'source',
                    fields: {},
                    lastScan: { fields: [], scannedAt: '2026-11-23' },
                }),
            ).toEqual(settings);
            vi.unstubAllEnvs();
        });

        test('discovers fields only for explores it has, besides its first', () => {
            const [first, ...others] = integration.model.explores.map(
                ({ name }) => name,
            );
            (integration.model.discovery?.models ?? []).forEach((model) => {
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
            const scan = SAMPLE_SCANS[settings.connector];
            const scannedFields = scan
                ? toScannedLiveSourceFields(settings.connector, scan)
                : [];
            const [explore] = buildLiveExplores({
                connectionUuid: '03386598-7a51-45b2-b1f9-5ef55bd09016',
                sourceName: settings.connector,
                name: 'Source',
                apiSource: settings,
                scannedFields,
                edits: getInitialLiveSourceFieldEdits({
                    scannedFields,
                    isExistingSource: true,
                }),
            });
            // A metric where the explore has one, else a dimension
            const [builtIn] = integration.model.explores;
            const definition = scan
                ? (describeLiveExplores(integration.model, scan).find(
                      ({ name }) => name === builtIn.name,
                  ) ?? builtIn)
                : builtIn;
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
            // Every call it makes is one its access rules allow
            const { rules } = integration.connection.access(settings);
            send.mock.calls.forEach(([request]) => {
                expect(findAccessRule(rules, request)).toBeDefined();
            });
        });

        test('states its access as read rules', () => {
            const { rules } = integration.connection.access(settings);
            expect(rules.length).toBeGreaterThan(0);
            rules.forEach((rule) => {
                expect(rule.effect).toBe('read');
                expect(rule.path).toMatch(/^\//);
            });
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
