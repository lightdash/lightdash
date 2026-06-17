import {
    ForbiddenError,
    NotFoundError,
    type ExternalConnection,
    type ExternalFetchResponse,
    type RegisteredAccount,
} from '@lightdash/common';
import { ExternalConnectionService } from './ExternalConnectionService';

// -------------------------------------------------------------------
// Shared fixtures
// -------------------------------------------------------------------
const projectUuid = 'project-uuid-1';
const connectionUuid = 'conn-uuid-1';
const orgUuid = 'org-uuid-1';

const connection: ExternalConnection = {
    externalConnectionUuid: connectionUuid,
    projectUuid,
    organizationUuid: orgUuid,
    name: 'Test API',
    type: 'bearer_token',
    origin: 'https://api.example.com',
    allowedPathPrefixes: ['/v1/'],
    allowedMethods: ['GET', 'POST'],
    allowedContentTypes: ['application/json'],
    responseMaxBytes: 1_000_000,
    requestMaxBytes: 262_144,
    timeoutMs: 10_000,
    rateLimitPerMinute: null,
    apiKeyName: null,
    apiKeyLocation: null,
    hasSecret: true,
    createdByUserUuid: 'user-1',
    updatedByUserUuid: 'user-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    lastTestedAt: null,
};

const fetchResponse: ExternalFetchResponse = {
    status: 200,
    contentType: 'application/json',
    body: { temp: 21 },
    truncated: false,
};

// A minimal RegisteredAccount with admin abilities
const makeAccount = (canManage: boolean): RegisteredAccount => {
    const account = {
        user: { id: 'user-1', userUuid: 'user-1' },
        organization: { organizationUuid: orgUuid },
    } as unknown as RegisteredAccount;
    return account;
};

function buildService(opts: {
    connection?: ExternalConnection | null;
    secret?: string | null;
    saveSampleFn?: jest.Mock;
}) {
    const model = {
        findByUuid: jest
            .fn()
            .mockResolvedValue(
                opts.connection !== undefined ? opts.connection : connection,
            ),
        getDecryptedSecret: jest
            .fn()
            .mockResolvedValue(opts.secret ?? 's3cr3t'),
        saveSample: opts.saveSampleFn ?? jest.fn().mockResolvedValue(undefined),
    };
    const service = new ExternalConnectionService({
        externalConnectionModel: model as never,
        appModel: {} as never,
        spacePermissionService: {} as never,
        analytics: { track: jest.fn() } as never,
    });
    return { service, model };
}

// Spy on createAuditedAbility to control the CASL decision
function mockAbility(
    service: ExternalConnectionService,
    canManage: boolean,
): void {
    jest.spyOn(
        service as unknown as { createAuditedAbility: () => unknown },
        'createAuditedAbility',
    ).mockReturnValue({
        can: () => canManage,
        cannot: () => !canManage,
    });
}

const adminAccount = makeAccount(true);
const viewerAccount = makeAccount(false);

// -------------------------------------------------------------------
// testConnection
// -------------------------------------------------------------------
describe('ExternalConnectionService.testConnection', () => {
    let executeSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('rejects a non-admin account with ForbiddenError', async () => {
        const { service } = buildService({});
        mockAbility(service, false);

        await expect(
            service.testConnection(viewerAccount, projectUuid, connectionUuid, {
                method: 'GET',
                path: '/v1/current',
            }),
        ).rejects.toThrow(ForbiddenError);
    });

    it('reuses executeExternalFetch with the decrypted secret and the request', async () => {
        const { service, model } = buildService({});
        mockAbility(service, true);

        executeSpy = jest
            .spyOn(
                service as unknown as {
                    executeExternalFetch: (...a: unknown[]) => Promise<unknown>;
                },
                'executeExternalFetch',
            )
            .mockResolvedValue({
                response: fetchResponse,
                requestBytes: 0,
                responseBytes: 0,
            });

        const result = await service.testConnection(
            adminAccount,
            projectUuid,
            connectionUuid,
            { method: 'GET', path: '/v1/current', query: { city: 'Berlin' } },
        );

        expect(model.getDecryptedSecret).toHaveBeenCalledWith(connectionUuid);
        expect(executeSpy).toHaveBeenCalledWith(connection, 's3cr3t', {
            method: 'GET',
            path: '/v1/current',
            query: { city: 'Berlin' },
            body: undefined,
        });
        expect(result).toEqual(fetchResponse);
    });

    it('defaults method to GET when omitted', async () => {
        const { service } = buildService({});
        mockAbility(service, true);

        executeSpy = jest
            .spyOn(
                service as unknown as {
                    executeExternalFetch: (...a: unknown[]) => Promise<unknown>;
                },
                'executeExternalFetch',
            )
            .mockResolvedValue({
                response: fetchResponse,
                requestBytes: 0,
                responseBytes: 0,
            });

        await service.testConnection(
            adminAccount,
            projectUuid,
            connectionUuid,
            {
                path: '/v1/current',
            },
        );

        expect(executeSpy).toHaveBeenCalledWith(
            connection,
            's3cr3t',
            expect.objectContaining({ method: 'GET', path: '/v1/current' }),
        );
    });

    it('throws NotFoundError for a connection in a different project', async () => {
        const { service } = buildService({
            connection: { ...connection, projectUuid: 'other-project' },
        });
        mockAbility(service, true);

        await expect(
            service.testConnection(adminAccount, projectUuid, connectionUuid, {
                method: 'GET',
                path: '/v1/current',
            }),
        ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when the connection does not exist', async () => {
        const { service } = buildService({ connection: null });
        mockAbility(service, true);

        await expect(
            service.testConnection(adminAccount, projectUuid, connectionUuid, {
                method: 'GET',
                path: '/v1/current',
            }),
        ).rejects.toThrow(NotFoundError);
    });
});

// -------------------------------------------------------------------
// saveSample
// -------------------------------------------------------------------
describe('ExternalConnectionService.saveSample', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('rejects a non-admin account with ForbiddenError', async () => {
        const saveSampleFn = jest.fn();
        const { service } = buildService({ saveSampleFn });
        mockAbility(service, false);

        await expect(
            service.saveSample(viewerAccount, projectUuid, connectionUuid, {
                temp: 21,
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(saveSampleFn).not.toHaveBeenCalled();
    });

    it('throws NotFoundError for a cross-project connection', async () => {
        const saveSampleFn = jest.fn();
        const { service } = buildService({
            connection: { ...connection, projectUuid: 'other-project' },
            saveSampleFn,
        });
        mockAbility(service, true);

        await expect(
            service.saveSample(adminAccount, projectUuid, connectionUuid, {}),
        ).rejects.toThrow(NotFoundError);
        expect(saveSampleFn).not.toHaveBeenCalled();
    });

    it('persists the sanitized sample for an admin', async () => {
        const saveSampleFn = jest.fn().mockResolvedValue(undefined);
        const { service } = buildService({ saveSampleFn });
        mockAbility(service, true);

        await service.saveSample(adminAccount, projectUuid, connectionUuid, {
            temp: 21,
            city: 'Berlin',
        });

        expect(saveSampleFn).toHaveBeenCalledWith(connectionUuid, {
            temp: 21,
            city: 'Berlin',
        });
    });

    it('truncates a sample larger than the byte cap before persisting', async () => {
        const saveSampleFn = jest.fn().mockResolvedValue(undefined);
        const { service } = buildService({ saveSampleFn });
        mockAbility(service, true);

        const huge = { blob: 'x'.repeat(200 * 1024) }; // ~200 KB
        await service.saveSample(
            adminAccount,
            projectUuid,
            connectionUuid,
            huge,
        );

        const [, persisted] = saveSampleFn.mock.calls[0];
        const persistedBytes = Buffer.byteLength(JSON.stringify(persisted));
        expect(persistedBytes).toBeLessThanOrEqual(
            ExternalConnectionService.MAX_SAMPLE_BYTES,
        );
    });

    it('truncates a long array of rows to the row cap', async () => {
        const saveSampleFn = jest.fn().mockResolvedValue(undefined);
        const { service } = buildService({ saveSampleFn });
        mockAbility(service, true);

        const rows = Array.from({ length: 500 }, (_, i) => ({ id: i }));
        await service.saveSample(
            adminAccount,
            projectUuid,
            connectionUuid,
            rows,
        );

        const [, persisted] = saveSampleFn.mock.calls[0];
        expect(Array.isArray(persisted)).toBe(true);
        expect((persisted as unknown[]).length).toBeLessThanOrEqual(
            ExternalConnectionService.MAX_SAMPLE_ROWS,
        );
    });

    it('never persists known secret keys even if the sample echoes them', async () => {
        const saveSampleFn = jest.fn().mockResolvedValue(undefined);
        const { service } = buildService({ saveSampleFn });
        mockAbility(service, true);

        await service.saveSample(adminAccount, projectUuid, connectionUuid, {
            note: 'token is my-secret-value embedded here',
            authorization: 'Bearer my-secret-value',
        });

        const persistedJson = JSON.stringify(saveSampleFn.mock.calls[0][1]);
        // The key 'authorization' is in the redact list; value must be replaced
        expect(persistedJson).not.toContain('Bearer my-secret-value');
        expect(persistedJson).toContain('[redacted]');
    });

    it('does not call getDecryptedSecret — saveSample never reads the connection secret', async () => {
        const saveSampleFn = jest.fn().mockResolvedValue(undefined);
        const { service, model } = buildService({ saveSampleFn });
        mockAbility(service, true);

        await service.saveSample(adminAccount, projectUuid, connectionUuid, {
            ok: true,
        });

        expect(model.getDecryptedSecret).not.toHaveBeenCalled();
    });
});
