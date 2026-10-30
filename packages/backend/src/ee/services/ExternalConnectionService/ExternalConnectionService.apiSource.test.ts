import {
    ApiConnectorType,
    ForbiddenError,
    ParameterError,
    QueryExecutionContext,
    TimeoutError,
    type CreateExternalConnection,
    type ExternalConnection,
} from '@lightdash/common';
import { buildAccount } from '../../../auth/account/account.mock';
import { SecureFetchError } from '../../../utils/secureFetch/secureFetch';
import * as secureFetchModule from '../../../utils/secureFetch/secureFetch';
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
    liveSourcesEnabled = true,
}: {
    connections?: ExternalConnection[];
    canView?: boolean;
    liveSourcesEnabled?: boolean;
} = {}) => {
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
        softDelete: vi.fn().mockResolvedValue(undefined),
        tryAcquireApiSourceCallLease: vi.fn().mockResolvedValue(true),
        tryCountApiSourceCall: vi.fn().mockResolvedValue(true),
        releaseApiSourceCallLease: vi.fn().mockResolvedValue(undefined),
        insertApiSourceCall: vi.fn().mockResolvedValue(undefined),
        getApiSourceUsage: vi.fn().mockResolvedValue([]),
    };
    const analytics = { track: vi.fn() };
    const service = new ExternalConnectionService({
        allowedPrivateHostCidrs: {},
        externalConnectionModel,
        analytics,
        featureFlagModel: {
            get: vi.fn().mockResolvedValue({ enabled: liveSourcesEnabled }),
        },
    } as never);
    vi.spyOn(
        service as unknown as { createAuditedAbility: () => unknown },
        'createAuditedAbility',
    ).mockReturnValue({ can: () => canView, cannot: () => !canView });
    return { service, externalConnectionModel, analytics };
};

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
