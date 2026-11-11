import {
    AlreadyExistsError,
    ApiConnectorType,
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    QueryExecutionContext,
    TimeoutError,
    type CreateExternalConnection,
    type ExternalConnection,
} from '@lightdash/common';
import { buildAccount } from '../../../auth/account/account.mock';
import { getApiSourceDefinitionHashes } from '../../../services/QuerySourceService/api/apiSourceExplores';
import {
    type LiveSourceFieldEdits,
    type LiveSourceFieldState,
} from '../../../services/QuerySourceService/api/liveSourceFields';
import { SecureFetchError } from '../../../utils/secureFetch/secureFetch';
import * as secureFetchModule from '../../../utils/secureFetch/secureFetch';
import { type DeletedLiveSource } from '../../models/ExternalConnectionModel';
import { ExternalConnectionService } from './ExternalConnectionService';

vi.mock('../../../utils/secureFetch/secureFetch', async (importOriginal) => {
    const actual =
        await importOriginal<
            typeof import('../../../utils/secureFetch/secureFetch')
        >();
    return { ...actual, secureFetch: vi.fn() };
});

const mockSecureFetch = vi.mocked(secureFetchModule.secureFetch);

const posthogConnection = (
    overrides: Partial<ExternalConnection> = {},
): ExternalConnection => ({
    externalConnectionUuid: 'conn-1',
    projectUuid: 'proj-1',
    organizationUuid: 'org-1',
    name: 'Product analytics',
    slug: 'product-analytics',
    type: 'bearer_token',
    origin: 'https://eu.posthog.com',
    instructions: null,
    allowedPathPrefixes: ['/api/projects/303731/query/'],
    allowedMethods: ['POST'],
    allowedContentTypes: ['application/json'],
    responseMaxBytes: 25 * 1024 * 1024,
    requestMaxBytes: 262_144,
    timeoutMs: 45_000,
    rateLimitPerMinute: null,
    apiKeyName: null,
    apiKeyLocation: null,
    oauthScopes: null,
    customHeaders: null,
    kind: 'live_source',
    apiSource: { connector: ApiConnectorType.POSTHOG, projectId: '303731' },
    hasSecret: true,
    createdByUserUuid: 'user-1',
    updatedByUserUuid: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
});

const account = buildAccount();

const buildService = ({
    connections = [posthogConnection()],
    canView = true,
    canManage = canView,
    liveSourcesEnabled = true,
    newOnboardingEnabled = true,
    deletedSources = [],
    takenExploreNames = [],
    namesHeldAtClaim = [],
    hasExplores = false,
    chartCount = 0,
}: {
    connections?: ExternalConnection[];
    canView?: boolean;
    canManage?: boolean;
    liveSourcesEnabled?: boolean;
    newOnboardingEnabled?: boolean;
    deletedSources?: DeletedLiveSource[];
    takenExploreNames?: string[];
    /** Names other sources store between the list and the claim. */
    namesHeldAtClaim?: string[];
    hasExplores?: boolean;
    chartCount?: number;
} = {}) => {
    let fieldState: LiveSourceFieldState = {
        lastScan: null,
        fields: null,
        aiHint: null,
        targetLabel: null,
    };
    const externalConnectionModel = {
        findByUuid: vi
            .fn()
            .mockImplementation(async (uuid: string) =>
                connections.find(
                    (connection) => connection.externalConnectionUuid === uuid,
                ),
            ),
        list: vi.fn().mockResolvedValue(connections),
        getProjectOrganizationUuid: vi.fn().mockResolvedValue('org-1'),
        getDecryptedSecret: vi.fn().mockResolvedValue('phx_secret'),
        create: vi.fn().mockResolvedValue(connections[0]),
        update: vi.fn().mockResolvedValue(connections[0]),
        softDelete: vi.fn().mockResolvedValue(undefined),
        tryAcquireApiSourceCallLease: vi.fn().mockResolvedValue(true),
        tryCountApiSourceCall: vi.fn().mockResolvedValue(true),
        releaseApiSourceCallLease: vi.fn().mockResolvedValue(undefined),
        insertApiSourceCall: vi.fn().mockResolvedValue(undefined),
        getApiSourceUsage: vi.fn().mockResolvedValue([]),
        setApiSourceSchema: vi.fn().mockResolvedValue(undefined),
        getApiSourceSchemas: vi.fn().mockResolvedValue(new Map()),
        listDeletedLiveSources: vi.fn().mockResolvedValue(deletedSources),
        listHeldLiveSourceNames: vi
            .fn()
            .mockImplementation(
                async (_project: string, exceptUuid: string | null) =>
                    new Set([
                        ...deletedSources.flatMap(({ sourceName }) =>
                            sourceName ? [sourceName] : [],
                        ),
                        ...connections.flatMap((connection) =>
                            connection.externalConnectionUuid !== exceptUuid &&
                            connection.liveSourceName
                                ? [connection.liveSourceName]
                                : [],
                        ),
                    ]),
            ),
        reattachLiveSourceName: vi
            .fn()
            .mockImplementation(
                async (
                    _project: string,
                    _uuid: string,
                    _name: string,
                    fields: LiveSourceFieldEdits,
                ) => {
                    fieldState = { ...fieldState, fields };
                    return true;
                },
            ),
        claimLiveSourceName: vi
            .fn()
            .mockImplementation(
                async (
                    _project: string,
                    uuid: string,
                    candidates: string[],
                ) => {
                    const held = new Set([
                        ...namesHeldAtClaim,
                        ...connections.flatMap((connection) =>
                            connection.externalConnectionUuid !== uuid &&
                            connection.liveSourceName
                                ? [connection.liveSourceName]
                                : [],
                        ),
                    ]);
                    return (
                        candidates.find((candidate) => !held.has(candidate)) ??
                        null
                    );
                },
            ),
        restoreLiveSourceDetails: vi.fn().mockResolvedValue(undefined),
        saveLiveSourceTargetLabel: vi.fn().mockResolvedValue(undefined),
        withLiveSourceBuildLock: vi.fn(
            async (_uuid: string, rebuild: () => Promise<unknown>) => rebuild(),
        ),
        listLiveSourceRefs: vi.fn().mockResolvedValue([]),
        getLiveSourceFieldState: vi
            .fn()
            .mockImplementation(async () => fieldState),
        saveLiveSourceScan: vi
            .fn()
            .mockImplementation(async (_uuid: string, lastScan) => {
                fieldState = { ...fieldState, lastScan };
            }),
        initLiveSourceFieldEdits: vi
            .fn()
            .mockImplementation(async (_uuid: string, fields) => {
                fieldState = {
                    ...fieldState,
                    fields: fieldState.fields ?? fields,
                };
            }),
        updateLiveSourceFieldEdits: vi
            .fn()
            .mockImplementation(
                async (
                    _uuid: string,
                    update: (
                        current: LiveSourceFieldEdits,
                    ) => LiveSourceFieldEdits,
                ) => {
                    fieldState = {
                        ...fieldState,
                        fields: update(fieldState.fields ?? {}),
                    };
                },
            ),
    };
    const savedChartModel = {
        getChartCountPerField: vi.fn().mockResolvedValue([]),
        getChartCountForExplores: vi.fn().mockResolvedValue(chartCount),
    };
    const analytics = { track: vi.fn() };
    const schedulerClient = {
        scanApiSourceSchema: vi.fn().mockResolvedValue({ jobId: 'job-1' }),
    };
    const projectModel = {
        replaceApiSourceExplores: vi.fn().mockResolvedValue(undefined),
        deleteApiSourceExplores: vi.fn().mockResolvedValue(undefined),
        findExploreNamesTakenByOthers: vi
            .fn()
            .mockImplementation(
                async (_project, _connection, names: string[]) =>
                    names.filter((name) => takenExploreNames.includes(name)),
            ),
        hasApiSourceExplores: vi.fn().mockResolvedValue(hasExplores),
        listApiSourceExploreHashes: vi.fn().mockResolvedValue([]),
        getApiSourceFieldIds: vi.fn().mockResolvedValue([]),
    };
    const service = new ExternalConnectionService({
        projectModel,
        savedChartModel,
        allowedPrivateHostCidrs: {},
        externalConnectionModel,
        analytics,
        schedulerClient,
        featureFlagModel: {
            get: vi.fn(async ({ featureFlagId }) => ({
                enabled:
                    featureFlagId === FeatureFlags.NewOnboarding
                        ? newOnboardingEnabled
                        : liveSourcesEnabled,
            })),
        },
    } as never);
    vi.spyOn(
        service as unknown as { createAuditedAbility: () => unknown },
        'createAuditedAbility',
    ).mockReturnValue({
        can: (action: string) => (action === 'view' ? canView : canManage),
        cannot: (action: string) => !(action === 'view' ? canView : canManage),
    });
    return {
        service,
        externalConnectionModel,
        analytics,
        schedulerClient,
        projectModel,
        savedChartModel,
    };
};

const postHogQueryResponse = (
    columns: [string, string][],
    results: unknown[][],
) => ({
    status: 200,
    contentType: 'application/json',
    headers: {},
    bodyText: JSON.stringify({
        columns: columns.map(([name]) => name),
        types: columns,
        results,
        error: null,
    }),
    truncated: false,
});

beforeEach(() => {
    mockSecureFetch.mockReset();
    mockSecureFetch.mockResolvedValue({
        status: 200,
        contentType: 'application/json',
        headers: {},
        bodyText: JSON.stringify({
            columns: ['week', 'wau'],
            types: [
                ['week', 'Date'],
                ['wau', 'UInt64'],
            ],
            results: [['2026-10-19', 31]],
            error: null,
        }),
        truncated: false,
    });
});

describe('ExternalConnectionService api sources', () => {
    it('runs a PostHog query through the guarded fetch with the stored key', async () => {
        const { service } = buildService();
        const connector = await service.getApiConnector(
            account,
            'proj-1',
            'conn-1',
        );

        const result = await connector.execute({
            payload: { kind: 'query', query: 'SELECT 1 AS a' },
            limit: 10,
        });

        expect(result.rows).toEqual([{ week: '2026-10-19', wau: 31 }]);
        const [url, init] = mockSecureFetch.mock.calls[0];
        expect(url).toBe('https://eu.posthog.com/api/projects/303731/query/');
        expect(init.method).toBe('POST');
        expect(init.headers?.Authorization).toBe('Bearer phx_secret');
        expect(init.timeoutMs).toBe(45_000);
    });

    it('refuses a connection that is not a live data source', async () => {
        const { service } = buildService({
            connections: [posthogConnection({ apiSource: null })],
        });
        await expect(
            service.getApiConnector(account, 'proj-1', 'conn-1'),
        ).rejects.toThrow(ParameterError);
    });

    it('refuses a data app connection', async () => {
        const { service } = buildService({
            connections: [posthogConnection({ kind: 'data_app' })],
        });
        await expect(
            service.getApiConnector(account, 'proj-1', 'conn-1'),
        ).rejects.toThrow(ParameterError);
    });

    it('refuses an account that cannot view the connection', async () => {
        const { service } = buildService({ canView: false });
        await expect(
            service.getApiConnector(account, 'proj-1', 'conn-1'),
        ).rejects.toThrow(ForbiddenError);
    });

    it('reports a timeout as a timeout', async () => {
        mockSecureFetch.mockRejectedValue(
            new SecureFetchError('timeout', 'timed out'),
        );
        const { service } = buildService();
        const connector = await service.getApiConnector(
            account,
            'proj-1',
            'conn-1',
        );
        await expect(
            connector.execute({
                payload: { kind: 'query', query: 'SELECT 1 AS a' },
                limit: 10,
            }),
        ).rejects.toThrow(TimeoutError);
    });

    it('logs a finished query with what its calls cost', async () => {
        const { service, externalConnectionModel } = buildService();
        const connector = await service.getApiConnector(
            account,
            'proj-1',
            'conn-1',
        );
        await connector.execute({
            payload: { kind: 'query', query: 'SELECT 1 AS a' },
            limit: 10,
        });
        const { bodyText } = await mockSecureFetch.mock.results[0].value;

        await connector.logCall({
            queryUuid: 'query-1',
            context: QueryExecutionContext.AI,
            query: 'SELECT 1 AS a',
            rowLimit: 10,
            outcome: 'ok',
            errorMessage: null,
            durationMs: 120,
            rowCount: 1,
            columnCount: 2,
            truncated: false,
        });

        expect(
            externalConnectionModel.insertApiSourceCall,
        ).toHaveBeenCalledExactlyOnceWith({
            external_connection_uuid: 'conn-1',
            project_uuid: 'proj-1',
            user_uuid: account.user.id,
            context: QueryExecutionContext.AI,
            query_uuid: 'query-1',
            query: 'SELECT 1 AS a',
            row_limit: 10,
            outcome: 'ok',
            error_message: null,
            provider_status: 200,
            api_calls: 1,
            duration_ms: 120,
            row_count: 1,
            column_count: 2,
            truncated: false,
            response_bytes: Buffer.byteLength(bodyText, 'utf8'),
        });
    });

    it('counts a call that never got a response, and never fails on logging', async () => {
        mockSecureFetch.mockRejectedValue(
            new SecureFetchError('timeout', 'timed out'),
        );
        const { service, externalConnectionModel } = buildService();
        externalConnectionModel.insertApiSourceCall.mockRejectedValue(
            new Error('database is down'),
        );
        const connector = await service.getApiConnector(
            account,
            'proj-1',
            'conn-1',
        );
        await expect(
            connector.execute({
                payload: { kind: 'query', query: 'SELECT 1 AS a' },
                limit: 10,
            }),
        ).rejects.toThrow(TimeoutError);

        expect(connector.usage()).toEqual({
            apiCalls: 1,
            responseBytes: 0,
            providerStatus: null,
        });
        await expect(
            connector.logCall({
                queryUuid: 'query-1',
                context: QueryExecutionContext.AI,
                query: 'SELECT 1 AS a',
                rowLimit: 10,
                outcome: 'timeout',
                errorMessage: 'timed out',
                durationMs: 45_000,
                rowCount: null,
                columnCount: null,
                truncated: null,
            }),
        ).resolves.toBeUndefined();
    });

    it('shows usage only to accounts that manage connections', async () => {
        const { service } = buildService({ canView: false });
        await expect(
            service.getApiSourceUsage(account, 'proj-1'),
        ).rejects.toThrow(ForbiddenError);
    });

    it('lists only api source connections', async () => {
        const { service, externalConnectionModel } = buildService({
            connections: [
                posthogConnection(),
                posthogConnection({
                    externalConnectionUuid: 'conn-2',
                    apiSource: null,
                }),
            ],
        });
        const connections = await service.listApiSourceConnections(
            account,
            'proj-1',
        );
        expect(connections.map((c) => c.externalConnectionUuid)).toEqual([
            'conn-1',
        ]);
        expect(externalConnectionModel.list).toHaveBeenCalledWith(
            'proj-1',
            'org-1',
            { kind: 'live_source' },
        );
    });
});

describe('ExternalConnectionService api source schema scans', () => {
    it('scans events and property keys in two calls and stores the result', async () => {
        mockSecureFetch
            .mockResolvedValueOnce(
                postHogQueryResponse(
                    [
                        ['event_name', 'String'],
                        ['event_count', 'UInt64'],
                    ],
                    [
                        ['$pageview', 1200],
                        ['signed_up', 40],
                    ],
                ),
            )
            .mockResolvedValueOnce(
                postHogQueryResponse(
                    [
                        ['property_key', 'String'],
                        ['occurrences', 'UInt64'],
                    ],
                    [['$browser', 900]],
                ),
            );
        const { service, externalConnectionModel } = buildService();

        const scan = await service.scanApiSourceSchema(
            account,
            'proj-1',
            'conn-1',
        );

        expect(scan).toMatchObject({
            status: 'ready',
            events: [
                { name: '$pageview', count: 1200 },
                { name: 'signed_up', count: 40 },
            ],
            eventsTruncated: false,
            propertyKeys: ['$browser'],
        });
        expect(mockSecureFetch).toHaveBeenCalledTimes(2);
        expect(
            externalConnectionModel.tryCountApiSourceCall,
        ).toHaveBeenCalled();
        expect(externalConnectionModel.setApiSourceSchema).toHaveBeenCalledWith(
            'conn-1',
            scan,
        );
    });

    it('stores a failed scan when PostHog refuses the key', async () => {
        mockSecureFetch.mockResolvedValueOnce({
            status: 401,
            contentType: 'application/json',
            headers: {},
            bodyText: JSON.stringify({ detail: 'Invalid key' }),
            truncated: false,
        });
        const { service, externalConnectionModel } = buildService();

        const scan = await service.scanApiSourceSchema(
            account,
            'proj-1',
            'conn-1',
        );

        expect(scan).toMatchObject({ status: 'failed' });
        expect(externalConnectionModel.setApiSourceSchema).toHaveBeenCalledWith(
            'conn-1',
            scan,
        );
    });

    it('lists ready scans as schema tables', async () => {
        const { service, externalConnectionModel } = buildService({
            connections: [
                posthogConnection(),
                posthogConnection({ externalConnectionUuid: 'conn-2' }),
            ],
        });
        externalConnectionModel.getApiSourceSchemas.mockResolvedValue(
            new Map([
                [
                    'conn-1',
                    {
                        status: 'ready',
                        scannedAt: new Date(),
                        windowDays: 30,
                        events: [{ name: '$pageview', count: 3 }],
                        eventsTruncated: false,
                        propertyKeys: null,
                    },
                ],
                ['conn-2', { status: 'pending', requestedAt: new Date() }],
            ]),
        );

        const tables = await service.listApiSourceSchemaTables(
            account,
            'proj-1',
        );

        expect(tables.map(({ reference }) => reference)).toEqual(['conn-1']);
    });

    it('lists no schema tables while new onboarding is off', async () => {
        const { service, externalConnectionModel } = buildService({
            newOnboardingEnabled: false,
        });

        await expect(
            service.listApiSourceSchemaTables(account, 'proj-1'),
        ).resolves.toEqual([]);
        expect(
            externalConnectionModel.getApiSourceSchemas,
        ).not.toHaveBeenCalled();
    });

    it('refuses the schema while live sources are off', async () => {
        const { service } = buildService({ liveSourcesEnabled: false });
        await expect(
            service.getApiSourceSchema(account, 'proj-1', 'conn-1'),
        ).rejects.toThrow(ForbiddenError);
    });
});

describe('ExternalConnectionService live source writes', () => {
    const postHogCreate: CreateExternalConnection = {
        name: 'PostHog',
        type: 'bearer_token',
        origin: 'https://eu.posthog.com',
        secret: 'phx_secret',
        allowedPathPrefixes: ['/api/projects/303731/query/'],
        allowedMethods: ['POST'],
        allowedContentTypes: ['application/json'],
        apiSource: {
            connector: ApiConnectorType.POSTHOG,
            projectId: '303731',
        },
    };

    it('queues a schema scan when a PostHog source is created', async () => {
        const { service, externalConnectionModel, schedulerClient } =
            buildService();
        await service.create(account, 'proj-1', postHogCreate);

        expect(externalConnectionModel.setApiSourceSchema).toHaveBeenCalledWith(
            'conn-1',
            expect.objectContaining({ status: 'pending' }),
        );
        expect(schedulerClient.scanApiSourceSchema).toHaveBeenCalledWith({
            organizationUuid: 'org-1',
            projectUuid: 'proj-1',
            userUuid: account.user.id,
            externalConnectionUuid: 'conn-1',
        });
    });

    it('does not queue a schema scan while new onboarding is off', async () => {
        const { service, externalConnectionModel, schedulerClient } =
            buildService({ newOnboardingEnabled: false });
        await service.create(account, 'proj-1', postHogCreate);

        expect(
            externalConnectionModel.setApiSourceSchema,
        ).not.toHaveBeenCalled();
        expect(schedulerClient.scanApiSourceSchema).not.toHaveBeenCalled();
    });

    it('marks the scan failed when it cannot be queued', async () => {
        const { service, externalConnectionModel, schedulerClient } =
            buildService();
        schedulerClient.scanApiSourceSchema.mockRejectedValueOnce(
            new Error('queue down'),
        );
        await service.create(account, 'proj-1', postHogCreate);

        expect(
            externalConnectionModel.setApiSourceSchema,
        ).toHaveBeenLastCalledWith(
            'conn-1',
            expect.objectContaining({ status: 'failed' }),
        );
    });

    it('tracks a live source by kind and connector', async () => {
        const { service, analytics } = buildService();
        await service.create(account, 'proj-1', postHogCreate);
        await service.delete(account, 'proj-1', 'conn-1');

        const tracked = analytics.track.mock.calls.map(([event]) => event);
        expect(tracked).toEqual([
            expect.objectContaining({
                event: 'external_connection.created',
                properties: expect.objectContaining({
                    connectionKind: 'live_source',
                    connector: ApiConnectorType.POSTHOG,
                }),
            }),
            expect.objectContaining({
                event: 'external_connection.deleted',
                properties: expect.objectContaining({
                    connectionKind: 'live_source',
                    connector: ApiConnectorType.POSTHOG,
                }),
            }),
        ]);
    });

    it('refuses to create a live source while live sources are off', async () => {
        const { service } = buildService({ liveSourcesEnabled: false });
        await expect(
            service.create(account, 'proj-1', postHogCreate),
        ).rejects.toThrow(ForbiddenError);
    });

    it('refuses to test a live source while live sources are off', async () => {
        const { service } = buildService({ liveSourcesEnabled: false });
        await expect(
            service.testConfig(account, 'proj-1', postHogCreate, {
                method: 'POST',
                path: '/api/projects/303731/query/',
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(mockSecureFetch).not.toHaveBeenCalled();
    });

    it('refuses to edit a live source while live sources are off', async () => {
        const { service } = buildService({ liveSourcesEnabled: false });
        await expect(
            service.update(account, 'proj-1', 'conn-1', { name: 'Renamed' }),
        ).rejects.toThrow(ForbiddenError);
    });

    it('refuses to turn a data app connection into a live source', async () => {
        const { service } = buildService({
            connections: [
                posthogConnection({ kind: 'data_app', apiSource: null }),
            ],
        });
        await expect(
            service.update(account, 'proj-1', 'conn-1', {
                apiSource: {
                    connector: ApiConnectorType.POSTHOG,
                    projectId: '303731',
                },
            }),
        ).rejects.toThrow(ParameterError);
    });

    it('refuses to drop the connector settings of a live source', async () => {
        const { service } = buildService();
        await expect(
            service.update(account, 'proj-1', 'conn-1', { apiSource: null }),
        ).rejects.toThrow(ParameterError);
    });
});

describe('ExternalConnectionService live source explores', () => {
    const PROPERTY_DEFINITIONS = '/api/projects/303731/property_definitions/';
    const postHogSource: CreateExternalConnection = {
        name: 'Product analytics',
        type: 'bearer_token',
        origin: 'https://eu.posthog.com',
        secret: 'phx_secret',
        allowedPathPrefixes: ['/api/projects/303731/query/'],
        allowedMethods: ['POST'],
        allowedContentTypes: ['application/json'],
        apiSource: { connector: ApiConnectorType.POSTHOG, projectId: '303731' },
    };

    const respondToScan = (scan: 'ok' | 'fail') => {
        mockSecureFetch.mockImplementation(async (url) => {
            if (!String(url).includes(PROPERTY_DEFINITIONS)) {
                throw new Error(`unexpected call to ${url}`);
            }
            if (scan === 'fail') {
                throw new SecureFetchError('timeout', 'timed out');
            }
            return {
                status: 200,
                contentType: 'application/json',
                headers: {},
                bodyText: JSON.stringify({
                    results: [{ name: 'plan', property_type: 'String' }],
                }),
                truncated: false,
            };
        });
    };

    const savedFieldIds = (
        projectModel: ReturnType<typeof buildService>['projectModel'],
    ) => {
        const [[projectUuid, connectionUuid, explores]] =
            projectModel.replaceApiSourceExplores.mock.calls;
        expect({ projectUuid, connectionUuid }).toEqual({
            projectUuid: 'proj-1',
            connectionUuid: 'conn-1',
        });
        return Object.keys(explores[0].apiSource.fields);
    };

    it('offers scanned properties as available, not in use, when a source is created', async () => {
        respondToScan('ok');
        const { service, projectModel } = buildService();
        await service.create(account, 'proj-1', postHogSource);

        const fieldIds = savedFieldIds(projectModel);
        expect(fieldIds).toContain('product_analytics_events_event');
        expect(fieldIds).not.toContain(
            'product_analytics_events_property_plan',
        );
        expect(mockSecureFetch.mock.calls.map(([url]) => url)).toEqual([
            `https://eu.posthog.com${PROPERTY_DEFINITIONS}?type=event&limit=500`,
            `https://eu.posthog.com${PROPERTY_DEFINITIONS}?type=person&limit=500`,
        ]);
        const { fields } = await service.getLiveSourceFields(
            account,
            'proj-1',
            'conn-1',
        );
        expect(
            fields.find((field) => field.name === 'property_plan'),
        ).toMatchObject({ inUse: false, isBuiltIn: false });
    });

    it('keeps every scanned property in use on a source built before fields could be curated', async () => {
        respondToScan('ok');
        const { service, projectModel } = buildService({ hasExplores: true });
        await service.refreshApiSourceExplores(account, 'proj-1', 'conn-1');

        expect(savedFieldIds(projectModel)).toContain(
            'posthog_conn1_events_property_plan',
        );
    });

    it('saves the base layer alone when a new source cannot be scanned', async () => {
        respondToScan('fail');
        const { service, projectModel } = buildService();
        await service.create(account, 'proj-1', postHogSource);

        const fieldIds = savedFieldIds(projectModel);
        expect(fieldIds).toContain('product_analytics_events_event');
        expect(fieldIds).not.toContain(
            'product_analytics_events_property_plan',
        );
    });

    it('keeps the current explores, and the edit, when a source that was never scanned cannot be scanned', async () => {
        respondToScan('fail');
        const { service, projectModel } = buildService();
        await expect(
            service.update(account, 'proj-1', 'conn-1', { name: 'Renamed' }),
        ).resolves.toMatchObject({ externalConnectionUuid: 'conn-1' });
        expect(projectModel.replaceApiSourceExplores).not.toHaveBeenCalled();
    });

    it('shows a rename from the last scan when the integration cannot be scanned', async () => {
        respondToScan('ok');
        const { service, projectModel, externalConnectionModel } =
            buildService();
        await service.create(account, 'proj-1', postHogSource);
        respondToScan('fail');
        externalConnectionModel.update.mockResolvedValue(
            posthogConnection({
                name: 'Renamed',
                liveSourceName: 'product_analytics',
            }),
        );
        projectModel.replaceApiSourceExplores.mockClear();

        await service.update(account, 'proj-1', 'conn-1', { name: 'Renamed' });

        const [explore] =
            projectModel.replaceApiSourceExplores.mock.calls[0][2];
        expect(explore.name).toBe('product_analytics_events');
        expect(explore.label).toContain('Renamed');
    });

    it("doesn't build a changed target from the old target's last scan", async () => {
        respondToScan('ok');
        const { service, projectModel, externalConnectionModel } =
            buildService();
        await service.create(account, 'proj-1', postHogSource);
        respondToScan('fail');
        externalConnectionModel.update.mockResolvedValue(
            posthogConnection({
                apiSource: {
                    connector: ApiConnectorType.POSTHOG,
                    projectId: '999',
                },
            }),
        );
        projectModel.replaceApiSourceExplores.mockClear();

        await service.update(account, 'proj-1', 'conn-1', {
            apiSource: {
                connector: ApiConnectorType.POSTHOG,
                projectId: '999',
            },
        });

        expect(projectModel.replaceApiSourceExplores).not.toHaveBeenCalled();
    });

    describe('AI hint', () => {
        it('rebuilds from the stored scan, without calling the integration', async () => {
            const { service, projectModel, externalConnectionModel } =
                buildService();
            externalConnectionModel.getLiveSourceFieldState.mockResolvedValue({
                lastScan: null,
                fields: {},
                aiHint: 'EU project',
                targetLabel: null,
            });
            await service.update(account, 'proj-1', 'conn-1', {
                aiHint: '  EU project  ',
            });

            expect(externalConnectionModel.update).toHaveBeenCalledWith(
                'conn-1',
                expect.anything(),
                expect.objectContaining({ aiHint: 'EU project' }),
            );
            expect(mockSecureFetch).not.toHaveBeenCalled();
            const [explore] =
                projectModel.replaceApiSourceExplores.mock.calls[0][2];
            expect(explore.aiHint).toEqual([
                'PostHog project 303731, EU region',
                'EU project',
            ]);
        });

        it('clears an empty hint and keeps the target', async () => {
            const { service, externalConnectionModel } = buildService();
            await service.update(account, 'proj-1', 'conn-1', { aiHint: '  ' });
            expect(externalConnectionModel.update).toHaveBeenCalledWith(
                'conn-1',
                expect.anything(),
                expect.objectContaining({ aiHint: null }),
            );
        });

        it('rejects a hint over the limit', async () => {
            const { service, externalConnectionModel } = buildService();
            await expect(
                service.update(account, 'proj-1', 'conn-1', {
                    aiHint: 'x'.repeat(501),
                }),
            ).rejects.toThrow('at most 500');
            expect(externalConnectionModel.update).not.toHaveBeenCalled();
        });
    });

    describe('rebuilding after a code change', () => {
        const refs = [
            {
                externalConnectionUuid: 'conn-1',
                projectUuid: 'proj-1',
                connector: ApiConnectorType.POSTHOG,
            },
        ];
        const currentHashes = Object.values(
            getApiSourceDefinitionHashes(ApiConnectorType.POSTHOG),
        ).map((definitionHash) => ({
            connectionUuid: 'conn-1',
            definitionHash,
        }));
        const setUp = (
            stored: { connectionUuid: string; definitionHash: string | null }[],
        ) => {
            const built = buildService();
            built.externalConnectionModel.listLiveSourceRefs.mockResolvedValue(
                refs,
            );
            built.projectModel.listApiSourceExploreHashes.mockResolvedValue(
                stored,
            );
            return built;
        };

        it('rebuilds a source with no hash, without calling the integration', async () => {
            const { service, projectModel } = setUp([
                { connectionUuid: 'conn-1', definitionHash: null },
            ]);
            await expect(
                service.rebuildOutdatedApiSourceExplores(),
            ).resolves.toEqual({ rebuilt: 1, failed: 0 });
            expect(projectModel.replaceApiSourceExplores).toHaveBeenCalledTimes(
                1,
            );
            expect(mockSecureFetch).not.toHaveBeenCalled();
        });

        it('leaves a source whose hash matches', async () => {
            const { service, projectModel } = setUp(currentHashes);
            await expect(
                service.rebuildOutdatedApiSourceExplores(),
            ).resolves.toEqual({ rebuilt: 0, failed: 0 });
            expect(
                projectModel.replaceApiSourceExplores,
            ).not.toHaveBeenCalled();
        });

        it('leaves a source that was never built', async () => {
            const { service, projectModel } = setUp([]);
            await service.rebuildOutdatedApiSourceExplores();
            expect(
                projectModel.replaceApiSourceExplores,
            ).not.toHaveBeenCalled();
        });

        it('keeps a source whose rebuild would lose a field, and carries on', async () => {
            const { service, projectModel } = setUp([
                { connectionUuid: 'conn-1', definitionHash: 'old' },
            ]);
            projectModel.getApiSourceFieldIds.mockResolvedValue([
                'posthog_conn1_events_property_gone',
            ]);
            await expect(
                service.rebuildOutdatedApiSourceExplores(),
            ).resolves.toEqual({ rebuilt: 0, failed: 1 });
            expect(
                projectModel.replaceApiSourceExplores,
            ).not.toHaveBeenCalled();
        });

        it('counts a failed save for that source only', async () => {
            const { service, projectModel } = setUp([
                { connectionUuid: 'conn-1', definitionHash: 'old' },
            ]);
            projectModel.replaceApiSourceExplores.mockRejectedValueOnce(
                new Error('clash'),
            );
            await expect(
                service.rebuildOutdatedApiSourceExplores(),
            ).resolves.toEqual({ rebuilt: 0, failed: 1 });
        });
    });

    describe('field curation', () => {
        const lastSavedFields = (
            projectModel: ReturnType<typeof buildService>['projectModel'],
        ) => {
            const explores =
                projectModel.replaceApiSourceExplores.mock.calls.at(-1)?.[2];
            return explores?.[0].apiSource.fields ?? {};
        };

        const createScanned = async (options = {}) => {
            respondToScan('ok');
            const built = buildService(options);
            await built.service.create(account, 'proj-1', postHogSource);
            return built;
        };

        it('puts a field in use with its edits and rebuilds the explore', async () => {
            const { service, projectModel } = await createScanned();
            const { fields } = await service.updateLiveSourceFields(
                account,
                'proj-1',
                'conn-1',
                [
                    {
                        name: 'property_plan',
                        inUse: true,
                        label: '  Plan  ',
                        aiHint: 'Billing plan at event time',
                    },
                ],
            );

            expect(
                fields.find((field) => field.name === 'property_plan'),
            ).toMatchObject({
                inUse: true,
                label: 'Plan',
                aiHint: 'Billing plan at event time',
                lastEdit: { userUuid: expect.any(String) },
            });
            expect(
                lastSavedFields(projectModel)
                    .product_analytics_events_property_plan,
            ).toBeDefined();
        });

        it('stops using a field so charts and agents no longer see it', async () => {
            const { service, projectModel } = await createScanned();
            await service.updateLiveSourceFields(account, 'proj-1', 'conn-1', [
                { name: 'event', inUse: false },
            ]);

            expect(Object.keys(lastSavedFields(projectModel))).not.toContain(
                'product_analytics_events_event',
            );
        });

        it('refuses to stop using the date every query filters by', async () => {
            const { service } = await createScanned();
            await expect(
                service.updateLiveSourceFields(account, 'proj-1', 'conn-1', [
                    { name: 'date', inUse: false },
                ]),
            ).rejects.toThrow(ParameterError);
        });

        it('refuses a field the source does not have', async () => {
            const { service } = await createScanned();
            await expect(
                service.updateLiveSourceFields(account, 'proj-1', 'conn-1', [
                    { name: 'property_missing', inUse: true },
                ]),
            ).rejects.toThrow(ParameterError);
        });

        it('refuses a group longer than the text limit', async () => {
            const { service } = await createScanned();
            await expect(
                service.updateLiveSourceFields(account, 'proj-1', 'conn-1', [
                    { name: 'property_plan', group: 'g'.repeat(2001) },
                ]),
            ).rejects.toThrow('over 2000 characters');
        });

        it('lets only people who manage the source edit its fields', async () => {
            const { service } = buildService({ canView: false });
            await expect(
                service.updateLiveSourceFields(account, 'proj-1', 'conn-1', [
                    { name: 'property_plan', inUse: true },
                ]),
            ).rejects.toThrow(ForbiddenError);
        });

        it('shows the field list only to people who manage the source', async () => {
            const { service } = buildService({ canManage: false });
            await expect(
                service.getLiveSourceFields(account, 'proj-1', 'conn-1'),
            ).rejects.toThrow(ForbiddenError);
        });

        it('counts the charts using each field', async () => {
            const { service, savedChartModel } = await createScanned();
            savedChartModel.getChartCountPerField.mockResolvedValue([
                { fieldId: 'product_analytics_events_event', count: 3 },
            ]);
            const { fields, exploreName } = await service.getLiveSourceFields(
                account,
                'proj-1',
                'conn-1',
            );

            expect(exploreName).toBe('product_analytics_events');
            expect(
                fields.find((field) => field.name === 'event')
                    ?.usedByChartCount,
            ).toBe(3);
        });
    });

    const savedExploreName = (
        projectModel: ReturnType<typeof buildService>['projectModel'],
    ) => projectModel.replaceApiSourceExplores.mock.calls[0][2][0].name;

    it('stores the name a new source gets, so later builds reuse it', async () => {
        respondToScan('ok');
        const { service, externalConnectionModel } = buildService();
        await service.create(account, 'proj-1', postHogSource);

        const [[projectUuid, uuid, candidates]] =
            externalConnectionModel.claimLiveSourceName.mock.calls;
        expect({ projectUuid, uuid, first: candidates[0] }).toEqual({
            projectUuid: 'proj-1',
            uuid: 'conn-1',
            first: 'product_analytics',
        });
    });

    const deletedSource = (
        overrides: Partial<DeletedLiveSource> = {},
    ): DeletedLiveSource => ({
        externalConnectionUuid: 'old-conn',
        name: 'Old PostHog',
        deletedAt: new Date('2026-11-01'),
        origin: 'https://eu.posthog.com',
        apiSource: { connector: ApiConnectorType.POSTHOG, projectId: '303731' },
        sourceName: 'posthog',
        fieldEdits: null,
        aiHint: null,
        targetLabel: null,
        ...overrides,
    });

    it('uses the id-based name when another source claims the same one first', async () => {
        respondToScan('ok');
        const { service, projectModel } = buildService({
            namesHeldAtClaim: ['product_analytics'],
        });
        await service.refreshApiSourceExplores(account, 'proj-1', 'conn-1');

        expect(savedExploreName(projectModel)).toBe('posthog_conn1_events');
    });

    it("doesn't give an unbuilt source the prefix of a deleted one", async () => {
        respondToScan('ok');
        const { service, projectModel } = buildService({
            connections: [posthogConnection({ name: 'PostHog' })],
            deletedSources: [deletedSource()],
        });
        await service.refreshApiSourceExplores(account, 'proj-1', 'conn-1');

        expect(savedExploreName(projectModel)).toBe('posthog_conn1_events');
    });

    it('creates a source with the explore prefix the admin typed', async () => {
        respondToScan('ok');
        const { service, externalConnectionModel } = buildService();
        await service.create(account, 'proj-1', {
            ...postHogSource,
            explorePrefix: 'web_events',
        });

        expect(
            externalConnectionModel.claimLiveSourceName.mock.calls[0][2],
        ).toEqual(['web_events']);
    });

    it("refuses a deleted source's prefix and suggests a free one", async () => {
        const { service, externalConnectionModel } = buildService({
            deletedSources: [deletedSource()],
        });
        await expect(
            service.create(account, 'proj-1', {
                ...postHogSource,
                explorePrefix: 'posthog',
            }),
        ).rejects.toThrow(
            new AlreadyExistsError(
                '"posthog" is already used by another source or explore in this project. Try "posthog_2".',
            ),
        );
        expect(externalConnectionModel.create).not.toHaveBeenCalled();
    });

    it('takes the next free prefix when no form asked the admin for one', async () => {
        respondToScan('ok');
        const { service, externalConnectionModel } = buildService({
            connections: [
                posthogConnection({ liveSourceName: 'product_analytics' }),
            ],
        });
        await service.create(account, 'proj-1', postHogSource);

        expect(
            externalConnectionModel.claimLiveSourceName.mock.calls[0][2],
        ).toEqual(['product_analytics_2']);
    });

    it('undoes a create that loses its prefix to one started at the same time', async () => {
        const { service, externalConnectionModel } = buildService({
            namesHeldAtClaim: ['web_events'],
        });
        await expect(
            service.create(account, 'proj-1', {
                ...postHogSource,
                explorePrefix: 'web_events',
            }),
        ).rejects.toThrow(AlreadyExistsError);
        expect(externalConnectionModel.softDelete).toHaveBeenCalledWith(
            'conn-1',
        );
    });

    it('refuses a prefix whose planned model name another explore has', async () => {
        const { service } = buildService({
            takenExploreNames: ['web_persons'],
        });
        await expect(
            service.create(account, 'proj-1', {
                ...postHogSource,
                explorePrefix: 'web',
            }),
        ).rejects.toThrow(AlreadyExistsError);
    });

    it('refuses a badly formatted prefix', async () => {
        const { service } = buildService();
        await expect(
            service.create(account, 'proj-1', {
                ...postHogSource,
                explorePrefix: 'Web Events',
            }),
        ).rejects.toThrow(ParameterError);
    });

    it('reports a taken prefix with the explore names it would give', async () => {
        const { service } = buildService({
            deletedSources: [deletedSource()],
            takenExploreNames: ['posthog_2_sessions'],
        });

        await expect(
            service.checkExplorePrefix(
                account,
                'proj-1',
                ApiConnectorType.POSTHOG,
                'posthog',
            ),
        ).resolves.toMatchObject({
            error: expect.stringContaining('already used'),
            suggestion: 'posthog_3',
        });
        await expect(
            service.checkExplorePrefix(
                account,
                'proj-1',
                ApiConnectorType.POSTHOG,
                'free_name',
            ),
        ).resolves.toMatchObject({
            error: null,
            suggestion: null,
            exploreNames: expect.arrayContaining(['free_name_events']),
        });
    });

    it('lists deleted sources of the integration, the same target first', async () => {
        const { service } = buildService({
            connections: [
                posthogConnection(),
                posthogConnection({
                    externalConnectionUuid: 'conn-2',
                    liveSourceName: 'active',
                }),
            ],
            deletedSources: [
                deletedSource({
                    externalConnectionUuid: 'other-target',
                    sourceName: 'other',
                    apiSource: {
                        connector: ApiConnectorType.POSTHOG,
                        projectId: '999',
                    },
                }),
                deletedSource(),
                deletedSource({
                    externalConnectionUuid: 'older-copy',
                }),
                deletedSource({
                    externalConnectionUuid: 'held-again',
                    sourceName: 'active',
                }),
                deletedSource({
                    externalConnectionUuid: 'google',
                    sourceName: 'google',
                    apiSource: {
                        connector: ApiConnectorType.SEARCH_CONSOLE,
                        siteUrl: 'https://example.com/',
                    },
                }),
            ],
            chartCount: 12,
        });

        const sources = await service.listReattachableLiveSources(
            account,
            'proj-1',
            'conn-1',
        );

        expect(
            sources.map(
                ({
                    externalConnectionUuid,
                    isSameTarget,
                    usedByChartCount,
                }) => [externalConnectionUuid, isSameTarget, usedByChartCount],
            ),
        ).toEqual([
            ['old-conn', true, 12],
            ['other-target', false, 12],
        ]);
    });

    it('hides a deleted source that was never named and has no charts', async () => {
        const { service } = buildService({
            deletedSources: [deletedSource({ sourceName: null })],
        });

        await expect(
            service.listReattachableLiveSources(account, 'proj-1', 'conn-1'),
        ).resolves.toEqual([]);
    });

    it('shortens a long prefix so a suggestion still fits', async () => {
        const longPrefix = 'a'.repeat(40);
        const { service } = buildService({
            deletedSources: [deletedSource({ sourceName: longPrefix })],
        });

        await expect(
            service.checkExplorePrefix(
                account,
                'proj-1',
                ApiConnectorType.POSTHOG,
                longPrefix,
            ),
        ).resolves.toMatchObject({ suggestion: `${'a'.repeat(38)}_2` });
    });

    it("reattaches a deleted source's prefix and field edits, then rebuilds", async () => {
        respondToScan('ok');
        const fieldEdits = {
            property_plan: { inUse: true, label: 'Plan', lastEdit: null },
        };
        const { service, projectModel, externalConnectionModel } = buildService(
            { deletedSources: [deletedSource({ fieldEdits })] },
        );

        const reattached = await service.reattachLiveSource(
            account,
            'proj-1',
            'conn-1',
            'old-conn',
        );

        expect(reattached.liveSourceName).toBe('posthog');
        expect(
            externalConnectionModel.reattachLiveSourceName,
        ).toHaveBeenCalledWith('proj-1', 'conn-1', 'posthog', fieldEdits);
        expect(savedExploreName(projectModel)).toBe('posthog_events');
    });

    it("keeps a deleted source's hint and target label when reattaching", async () => {
        respondToScan('ok');
        const { service, projectModel, externalConnectionModel } = buildService(
            {
                deletedSources: [
                    deletedSource({
                        aiHint: 'EU project',
                        targetLabel: 'Default project',
                    }),
                ],
            },
        );
        externalConnectionModel.restoreLiveSourceDetails.mockImplementation(
            async () => {
                externalConnectionModel.getLiveSourceFieldState.mockResolvedValue(
                    {
                        lastScan: null,
                        fields: {},
                        aiHint: 'EU project',
                        targetLabel: 'Default project',
                    },
                );
            },
        );

        await service.reattachLiveSource(
            account,
            'proj-1',
            'conn-1',
            'old-conn',
        );

        expect(
            externalConnectionModel.restoreLiveSourceDetails,
        ).toHaveBeenCalledWith(
            'conn-1',
            expect.objectContaining({
                aiHint: 'EU project',
                targetLabel: 'Default project',
            }),
        );
        const [explore] =
            projectModel.replaceApiSourceExplores.mock.calls[0][2];
        expect(explore.aiHint).toEqual([
            expect.stringContaining('Default project'),
            'EU project',
        ]);
    });

    it('reattaches the id-based prefix of a source from before prefixes were stored', async () => {
        respondToScan('ok');
        const { service, projectModel } = buildService({
            deletedSources: [
                deletedSource({
                    externalConnectionUuid:
                        'd85fea83-0000-0000-0000-000000000000',
                    sourceName: null,
                }),
            ],
        });

        await service.reattachLiveSource(
            account,
            'proj-1',
            'conn-1',
            'd85fea83-0000-0000-0000-000000000000',
        );

        expect(savedExploreName(projectModel)).toBe('posthog_d85fea83_events');
    });

    it('refuses to reattach a source that already has saved charts', async () => {
        const { service, externalConnectionModel } = buildService({
            connections: [posthogConnection({ liveSourceName: 'current' })],
            deletedSources: [deletedSource()],
            chartCount: 1,
        });

        await expect(
            service.reattachLiveSource(account, 'proj-1', 'conn-1', 'old-conn'),
        ).rejects.toThrow(ParameterError);
        expect(
            externalConnectionModel.reattachLiveSourceName,
        ).not.toHaveBeenCalled();
    });

    it('brings field edits back when reattaching', async () => {
        respondToScan('ok');
        const { service, projectModel } = buildService({
            deletedSources: [
                deletedSource({
                    fieldEdits: {
                        property_plan: {
                            inUse: true,
                            label: 'Plan',
                            lastEdit: null,
                        },
                    },
                }),
            ],
        });
        await service.create(account, 'proj-1', postHogSource);
        projectModel.replaceApiSourceExplores.mockClear();

        await service.reattachLiveSource(
            account,
            'proj-1',
            'conn-1',
            'old-conn',
        );

        expect(savedFieldIds(projectModel)).toContain(
            'posthog_events_property_plan',
        );
    });

    it('keeps every field in use when reattaching a source deleted before fields were curated', async () => {
        respondToScan('ok');
        const { service, projectModel } = buildService({
            deletedSources: [deletedSource()],
        });
        await service.create(account, 'proj-1', postHogSource);
        projectModel.replaceApiSourceExplores.mockClear();

        await service.reattachLiveSource(
            account,
            'proj-1',
            'conn-1',
            'old-conn',
        );

        expect(savedFieldIds(projectModel)).toContain(
            'posthog_events_property_plan',
        );
    });

    it("counts the new source's own charts when refusing a reattach", async () => {
        const { service, savedChartModel } = buildService({
            connections: [posthogConnection({ liveSourceName: 'current' })],
            deletedSources: [deletedSource()],
            chartCount: 1,
        });

        await expect(
            service.reattachLiveSource(account, 'proj-1', 'conn-1', 'old-conn'),
        ).rejects.toThrow(ParameterError);
        expect(savedChartModel.getChartCountForExplores).toHaveBeenCalledWith(
            'proj-1',
            expect.arrayContaining(['current_events']),
        );
    });

    it("refuses a reattach when an explore already has the deleted source's name", async () => {
        const { service, externalConnectionModel } = buildService({
            deletedSources: [deletedSource()],
            takenExploreNames: ['posthog_events'],
        });

        await expect(
            service.reattachLiveSource(account, 'proj-1', 'conn-1', 'old-conn'),
        ).rejects.toThrow(AlreadyExistsError);
        expect(
            externalConnectionModel.reattachLiveSourceName,
        ).not.toHaveBeenCalled();
    });

    it('refuses a reattach when another source takes the prefix first', async () => {
        const { service, externalConnectionModel, projectModel } = buildService(
            { deletedSources: [deletedSource()] },
        );
        externalConnectionModel.reattachLiveSourceName.mockResolvedValue(false);

        await expect(
            service.reattachLiveSource(account, 'proj-1', 'conn-1', 'old-conn'),
        ).rejects.toThrow(AlreadyExistsError);
        expect(projectModel.replaceApiSourceExplores).not.toHaveBeenCalled();
    });

    it.each([
        ['without manage access', { canManage: false }, ForbiddenError],
        [
            'with live data sources off',
            { liveSourcesEnabled: false },
            ForbiddenError,
        ],
    ])('refuses reattach routes %s', async (_name, options, error) => {
        const { service } = buildService({
            deletedSources: [deletedSource()],
            ...options,
        });

        await expect(
            service.checkExplorePrefix(
                account,
                'proj-1',
                ApiConnectorType.POSTHOG,
                'free_name',
            ),
        ).rejects.toThrow(error);
        await expect(
            service.listReattachableLiveSources(account, 'proj-1', 'conn-1'),
        ).rejects.toThrow(error);
        await expect(
            service.reattachLiveSource(account, 'proj-1', 'conn-1', 'old-conn'),
        ).rejects.toThrow(error);
    });

    it('refuses to reattach something that is not a deleted source of the integration', async () => {
        const { service } = buildService({ deletedSources: [] });

        await expect(
            service.reattachLiveSource(account, 'proj-1', 'conn-1', 'unknown'),
        ).rejects.toThrow(NotFoundError);
    });

    it('keeps the stored name of a source', async () => {
        respondToScan('ok');
        const { service, projectModel } = buildService({
            connections: [posthogConnection({ liveSourceName: 'analytics' })],
        });
        await service.refreshApiSourceExplores(account, 'proj-1', 'conn-1');

        expect(savedExploreName(projectModel)).toBe('analytics_events');
    });

    it('keeps the id-based name of a source built before names were stored', async () => {
        respondToScan('ok');
        const { service, projectModel } = buildService({ hasExplores: true });
        await service.refreshApiSourceExplores(account, 'proj-1', 'conn-1');

        expect(savedExploreName(projectModel)).toBe('posthog_conn1_events');
    });

    it.each([
        [
            'a stored name',
            {
                connections: [
                    posthogConnection({ liveSourceName: 'analytics' }),
                ],
                takenExploreNames: ['analytics_persons'],
            },
            'analytics_events',
        ],
        [
            'an id-based name',
            {
                hasExplores: true,
                takenExploreNames: ['posthog_conn1_sessions'],
            },
            'posthog_conn1_events',
        ],
    ])(
        'keeps building an existing source with %s when a dbt explore has its planned model name',
        async (_name, options, exploreName) => {
            respondToScan('ok');
            const { service, projectModel } = buildService(options);
            await service.refreshApiSourceExplores(account, 'proj-1', 'conn-1');

            expect(savedExploreName(projectModel)).toBe(exploreName);
        },
    );

    it('reports a failed scan when an admin refreshes the explores', async () => {
        respondToScan('fail');
        const { service, projectModel } = buildService();
        await expect(
            service.refreshApiSourceExplores(account, 'proj-1', 'conn-1'),
        ).rejects.toThrow(TimeoutError);
        expect(projectModel.replaceApiSourceExplores).not.toHaveBeenCalled();
    });

    it('removes the explores of a deleted source', async () => {
        const { service, projectModel } = buildService();
        await service.delete(account, 'proj-1', 'conn-1');
        expect(
            projectModel.deleteApiSourceExplores,
        ).toHaveBeenCalledExactlyOnceWith('proj-1', 'conn-1');
    });

    it('answers explore queries for accounts that cannot view the connection', async () => {
        const { service } = buildService({ canView: false });
        const connector = await service.getApiSourceConnector(
            account,
            'proj-1',
            'conn-1',
        );
        expect(connector.describe().connector).toBe(ApiConnectorType.POSTHOG);
    });
});
