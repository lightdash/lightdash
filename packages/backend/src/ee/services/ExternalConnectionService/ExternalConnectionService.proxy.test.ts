import {
    ForbiddenError,
    ParameterError,
    type ExternalConnection,
    type SessionUser,
} from '@lightdash/common';
import { SecureFetchError } from '../../../utils/secureFetch/secureFetch';
import * as secureFetchModule from '../../../utils/secureFetch/secureFetch';
import { ExternalConnectionService } from './ExternalConnectionService';

jest.mock('../../../utils/secureFetch/secureFetch');

const mockSecureFetch = jest.mocked(secureFetchModule.secureFetch);

const baseConnection = (
    overrides: Partial<ExternalConnection> = {},
): ExternalConnection => ({
    externalConnectionUuid: 'conn-1',
    projectUuid: 'proj-1',
    organizationUuid: 'org-1',
    name: 'Weather API',
    type: 'none',
    origin: 'https://api.example.com',
    allowedPathPrefixes: ['/v1/'],
    allowedMethods: ['GET', 'POST'],
    allowedContentTypes: ['application/json'],
    responseMaxBytes: 1_000_000,
    requestMaxBytes: 10_000,
    timeoutMs: 5_000,
    rateLimitPerMinute: null,
    apiKeyName: null,
    apiKeyLocation: null,
    hasSecret: false,
    createdByUserUuid: 'user-1',
    updatedByUserUuid: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
});

const baseApp = () => ({
    app_id: 'app-1',
    project_uuid: 'proj-1',
    space_uuid: null,
    created_by_user_uuid: 'user-1',
    organization_uuid: 'org-1',
});

const user = {
    userUuid: 'user-1',
    organizationUuid: 'org-1',
    ability: { can: () => true },
} as unknown as SessionUser;

function buildService(opts: {
    connection?: ExternalConnection | undefined;
    secret?: string | null;
    canView?: boolean;
    rateCount?: number;
}) {
    const externalConnectionModel = {
        resolveAppAlias: jest.fn().mockResolvedValue(opts.connection),
        getDecryptedSecret: jest.fn().mockResolvedValue(opts.secret ?? null),
        incrementRateCounter: jest.fn().mockResolvedValue(opts.rateCount ?? 1),
    };
    const appModel = {
        getApp: jest.fn().mockResolvedValue(baseApp()),
    };
    const projectModel = {
        getSummary: jest.fn().mockResolvedValue({ organizationUuid: 'org-1' }),
    };
    const spacePermissionService = {
        getSpaceAccessContext: jest.fn().mockResolvedValue({}),
    };
    const analytics = { track: jest.fn() };

    const service = new ExternalConnectionService({
        externalConnectionModel,
        appModel,
        projectModel,
        spacePermissionService,
        analytics,
    } as never);

    // Force the CASL view decision deterministically.
    jest.spyOn(
        service as unknown as { createAuditedAbility: () => unknown },
        'createAuditedAbility',
    ).mockReturnValue({
        can: () => opts.canView ?? true,
        cannot: () => !(opts.canView ?? true),
    });

    return { service, externalConnectionModel, appModel, analytics };
}

beforeEach(() => {
    mockSecureFetch.mockReset();
    mockSecureFetch.mockResolvedValue({
        status: 200,
        contentType: 'application/json',
        bodyText: '{"ok":true}',
        truncated: false,
    });
});

describe('ExternalConnectionService.proxyFetch', () => {
    it('rejects when the alias is not linked to the app', async () => {
        const { service } = buildService({ connection: undefined });
        await expect(
            service.proxyFetch(user, 'proj-1', 'app-1', {
                connectionAlias: 'weather',
                path: '/v1/x',
            }),
        ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('throws ForbiddenError when the user cannot view the app', async () => {
        const { service } = buildService({
            connection: baseConnection(),
            canView: false,
        });
        await expect(
            service.proxyFetch(user, 'proj-1', 'app-1', {
                connectionAlias: 'weather',
                path: '/v1/x',
            }),
        ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('rejects a method not in the connection allowlist', async () => {
        const { service } = buildService({
            connection: baseConnection({ allowedMethods: ['GET'] }),
        });
        await expect(
            service.proxyFetch(user, 'proj-1', 'app-1', {
                connectionAlias: 'weather',
                method: 'POST',
                path: '/v1/x',
            }),
        ).rejects.toBeInstanceOf(ParameterError);
    });

    it('rejects an absolute URL in path', async () => {
        const { service } = buildService({ connection: baseConnection() });
        await expect(
            service.proxyFetch(user, 'proj-1', 'app-1', {
                connectionAlias: 'weather',
                path: 'https://evil.com/v1/x',
            }),
        ).rejects.toBeInstanceOf(ParameterError);
    });

    it('rejects .. traversal in path', async () => {
        const { service } = buildService({ connection: baseConnection() });
        await expect(
            service.proxyFetch(user, 'proj-1', 'app-1', {
                connectionAlias: 'weather',
                path: '/v1/../admin',
            }),
        ).rejects.toBeInstanceOf(ParameterError);
    });

    it('rejects encoded-host //evil.com', async () => {
        const { service } = buildService({ connection: baseConnection() });
        await expect(
            service.proxyFetch(user, 'proj-1', 'app-1', {
                connectionAlias: 'weather',
                path: '//evil.com/v1/x',
            }),
        ).rejects.toBeInstanceOf(ParameterError);
    });

    it('rejects a path matching no allowed prefix', async () => {
        const { service } = buildService({
            connection: baseConnection({ allowedPathPrefixes: ['/v1/'] }),
        });
        await expect(
            service.proxyFetch(user, 'proj-1', 'app-1', {
                connectionAlias: 'weather',
                path: '/admin/secrets',
            }),
        ).rejects.toBeInstanceOf(ParameterError);
    });

    it('happy GET: calls secureFetch with the server-built URL and no body', async () => {
        const { service } = buildService({ connection: baseConnection() });
        const res = await service.proxyFetch(user, 'proj-1', 'app-1', {
            connectionAlias: 'weather',
            path: '/v1/today',
            query: { city: 'oslo' },
        });
        expect(mockSecureFetch).toHaveBeenCalledTimes(1);
        const [url, opts] = mockSecureFetch.mock.calls[0];
        expect(url).toBe('https://api.example.com/v1/today?city=oslo');
        expect(opts.method).toBe('GET');
        expect(opts.body).toBeUndefined();
        expect(opts.timeoutMs).toBe(5_000);
        expect(opts.maxResponseBytes).toBe(1_000_000);
        expect(opts.allowedContentTypes).toEqual(['application/json']);
        expect(res).toEqual({
            status: 200,
            contentType: 'application/json',
            body: { ok: true },
            truncated: false,
        });
    });

    it('GET is never rate-limited even when a limit is set', async () => {
        const { service, externalConnectionModel } = buildService({
            connection: baseConnection({ rateLimitPerMinute: 1 }),
            rateCount: 99,
        });
        await service.proxyFetch(user, 'proj-1', 'app-1', {
            connectionAlias: 'weather',
            path: '/v1/x',
        });
        expect(
            externalConnectionModel.incrementRateCounter,
        ).not.toHaveBeenCalled();
    });

    it('happy POST: server sets Content-Type and serializes the body', async () => {
        const { service } = buildService({ connection: baseConnection() });
        await service.proxyFetch(user, 'proj-1', 'app-1', {
            connectionAlias: 'weather',
            method: 'POST',
            path: '/v1/echo',
            body: { hello: 'world' },
        });
        const [, opts] = mockSecureFetch.mock.calls[0];
        expect(opts.method).toBe('POST');
        expect(opts.body).toBe('{"hello":"world"}');
        expect(opts.headers!['Content-Type']).toBe('application/json');
    });

    it('POST over requestMaxBytes is rejected', async () => {
        const { service } = buildService({
            connection: baseConnection({ requestMaxBytes: 5 }),
        });
        await expect(
            service.proxyFetch(user, 'proj-1', 'app-1', {
                connectionAlias: 'weather',
                method: 'POST',
                path: '/v1/echo',
                body: { hello: 'world' },
            }),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(mockSecureFetch).not.toHaveBeenCalled();
    });

    it('injects a bearer token into the Authorization header', async () => {
        const { service } = buildService({
            connection: baseConnection({ type: 'bearer_token' }),
            secret: 'tok_abc',
        });
        await service.proxyFetch(user, 'proj-1', 'app-1', {
            connectionAlias: 'weather',
            path: '/v1/x',
        });
        const [, opts] = mockSecureFetch.mock.calls[0];
        expect(opts.headers!.Authorization).toBe('Bearer tok_abc');
    });

    it('injects an api_key into a header', async () => {
        const { service } = buildService({
            connection: baseConnection({
                type: 'api_key',
                apiKeyName: 'X-Api-Key',
                apiKeyLocation: 'header',
            }),
            secret: 'sec_123',
        });
        await service.proxyFetch(user, 'proj-1', 'app-1', {
            connectionAlias: 'weather',
            path: '/v1/x',
        });
        const [url, opts] = mockSecureFetch.mock.calls[0];
        expect(opts.headers!['X-Api-Key']).toBe('sec_123');
        expect(url).not.toContain('sec_123');
    });

    it('injects an api_key into the query string', async () => {
        const { service } = buildService({
            connection: baseConnection({
                type: 'api_key',
                apiKeyName: 'apikey',
                apiKeyLocation: 'query',
            }),
            secret: 'sec_q',
        });
        await service.proxyFetch(user, 'proj-1', 'app-1', {
            connectionAlias: 'weather',
            path: '/v1/x',
            query: { a: '1' },
        });
        const [url, opts] = mockSecureFetch.mock.calls[0];
        expect(new URL(url).searchParams.get('apikey')).toBe('sec_q');
        expect(opts.headers!.Authorization).toBeUndefined();
    });

    it.each([['blocked_ip'], ['redirect'], ['too_large'], ['timeout']])(
        'maps SecureFetchError(%s) to a ParameterError with no raw detail',
        async (reason) => {
            const { service } = buildService({ connection: baseConnection() });
            mockSecureFetch.mockRejectedValueOnce(
                new SecureFetchError(
                    reason as never,
                    `internal: connect to 10.0.0.1`,
                ),
            );
            const promise = service.proxyFetch(user, 'proj-1', 'app-1', {
                connectionAlias: 'weather',
                path: '/v1/x',
            });
            await expect(promise).rejects.toBeInstanceOf(ParameterError);
            const err = await promise.catch((e) => e);
            expect(err.message).not.toMatch(/10\.0\.0\.1/);
        },
    );

    it('rate-limits the 2nd POST over the limit with a 429-class error', async () => {
        const { service } = buildService({
            connection: baseConnection({ rateLimitPerMinute: 1 }),
            rateCount: 2,
        });
        const promise = service.proxyFetch(user, 'proj-1', 'app-1', {
            connectionAlias: 'weather',
            method: 'POST',
            path: '/v1/x',
            body: {},
        });
        await expect(promise).rejects.toMatchObject({ statusCode: 429 });
        expect(mockSecureFetch).not.toHaveBeenCalled();
    });

    it('uses DEFAULT 60/min when rateLimitPerMinute is null', async () => {
        const { service } = buildService({
            connection: baseConnection({ rateLimitPerMinute: null }),
            rateCount: 61,
        });
        await expect(
            service.proxyFetch(user, 'proj-1', 'app-1', {
                connectionAlias: 'weather',
                method: 'POST',
                path: '/v1/x',
                body: {},
            }),
        ).rejects.toMatchObject({ statusCode: 429 });
    });

    it('parses non-JSON content type as a raw string', async () => {
        mockSecureFetch.mockResolvedValueOnce({
            status: 200,
            contentType: 'text/plain',
            bodyText: 'plain text',
            truncated: false,
        });
        const { service } = buildService({
            connection: baseConnection({
                allowedContentTypes: ['text/plain'],
            }),
        });
        const res = await service.proxyFetch(user, 'proj-1', 'app-1', {
            connectionAlias: 'weather',
            path: '/v1/x',
        });
        expect(res.body).toBe('plain text');
    });

    it('falls back to raw string when JSON content fails to parse', async () => {
        mockSecureFetch.mockResolvedValueOnce({
            status: 200,
            contentType: 'application/json',
            bodyText: 'not json{',
            truncated: false,
        });
        const { service } = buildService({ connection: baseConnection() });
        const res = await service.proxyFetch(user, 'proj-1', 'app-1', {
            connectionAlias: 'weather',
            path: '/v1/x',
        });
        expect(res.body).toBe('not json{');
    });

    it('rejects a GET when the serialized query string exceeds requestMaxBytes', async () => {
        const { service } = buildService({
            connection: baseConnection({ requestMaxBytes: 10 }),
        });
        // A query string longer than 10 bytes should be rejected before secureFetch.
        await expect(
            service.proxyFetch(user, 'proj-1', 'app-1', {
                connectionAlias: 'weather',
                method: 'GET',
                path: '/v1/today',
                query: { city: 'this-is-a-very-long-city-name' },
            }),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(mockSecureFetch).not.toHaveBeenCalled();
    });

    it('maps a malformed connection origin to a generic ParameterError (no stack exposed)', async () => {
        const { service } = buildService({
            connection: baseConnection({ origin: 'not-a-valid-url' }),
        });
        const promise = service.proxyFetch(user, 'proj-1', 'app-1', {
            connectionAlias: 'weather',
            path: '/v1/x',
        });
        await expect(promise).rejects.toBeInstanceOf(ParameterError);
        // The raw TypeError from new URL() must not reach the client.
        const err = await promise.catch((e) => e);
        expect(err.message).not.toMatch(/Invalid URL/i);
    });

    it('emits an audit event without bodies or secrets', async () => {
        const { service, analytics } = buildService({
            connection: baseConnection({ type: 'bearer_token' }),
            secret: 'tok_secret',
        });
        await service.proxyFetch(user, 'proj-1', 'app-1', {
            connectionAlias: 'weather',
            method: 'POST',
            path: '/v1/x',
            body: { secret_payload: 'do-not-log' },
        });
        expect(analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'external_connection.fetch',
                properties: expect.objectContaining({
                    method: 'POST',
                    path: '/v1/x',
                    status: 200,
                    outcome: 'ok',
                }),
            }),
        );
        const tracked = JSON.stringify(analytics.track.mock.calls);
        expect(tracked).not.toContain('tok_secret');
        expect(tracked).not.toContain('do-not-log');
    });
});
