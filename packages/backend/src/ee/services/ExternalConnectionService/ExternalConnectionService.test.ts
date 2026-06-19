import {
    ForbiddenError,
    NotFoundError,
    ParameterError,
    type ExternalConnection,
    type ExternalConnectionSample,
    type ExternalFetchResponse,
    type RegisteredAccount,
} from '@lightdash/common';
import { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { ExternalConnectionService } from './ExternalConnectionService';

// -------------------------------------------------------------------
// Shared fixtures
// -------------------------------------------------------------------
const projectUuid = 'project-uuid-1';
const connectionUuid = 'conn-uuid-1';
const orgUuid = 'org-uuid-1';
const sampleUuid = 'sample-uuid-1';

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
};

const sampleRequest = {
    method: 'GET' as const,
    path: '/v1/weather',
    query: { city: 'Berlin' },
};

const sampleResponse = { temp: 21, city: 'Berlin' };

const fakeSample: ExternalConnectionSample = {
    sampleUuid,
    externalConnectionUuid: connectionUuid,
    label: 'Berlin weather',
    request: sampleRequest,
    response: sampleResponse,
    createdAt: new Date('2026-01-01T00:00:00Z'),
};

const fetchResponse: ExternalFetchResponse = {
    status: 200,
    contentType: 'application/json',
    body: { temp: 21 },
    truncated: false,
};

// A minimal RegisteredAccount with admin abilities
const makeAccount = (_canManage: boolean): RegisteredAccount => {
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
    countSamplesFn?: jest.Mock;
    listSamplesFn?: jest.Mock;
    deleteSampleFn?: jest.Mock;
    getSampleConnectionUuidFn?: jest.Mock;
    linkToAppFn?: jest.Mock;
    findAppFn?: jest.Mock;
    featureFlagEnabled?: boolean;
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
        saveSample:
            opts.saveSampleFn ?? jest.fn().mockResolvedValue(fakeSample),
        countSamples: opts.countSamplesFn ?? jest.fn().mockResolvedValue(0),
        listSamples:
            opts.listSamplesFn ?? jest.fn().mockResolvedValue([fakeSample]),
        deleteSample:
            opts.deleteSampleFn ?? jest.fn().mockResolvedValue(undefined),
        getSampleConnectionUuid:
            opts.getSampleConnectionUuidFn ??
            jest.fn().mockResolvedValue(connectionUuid),
        linkToApp: opts.linkToAppFn ?? jest.fn().mockResolvedValue(undefined),
        findApp:
            opts.findAppFn ??
            jest.fn().mockResolvedValue({
                app_id: 'app-1',
                project_uuid: projectUuid,
                space_uuid: null,
                created_by_user_uuid: 'user-1',
                organization_uuid: orgUuid,
            }),
    };
    const featureFlagModel = {
        get: jest.fn().mockResolvedValue({
            id: 'enable-data-app-external-access',
            enabled: opts.featureFlagEnabled ?? true,
        }),
    } as unknown as FeatureFlagModel;
    const service = new ExternalConnectionService({
        externalConnectionModel: model as never,
        featureFlagModel,
        appModel: {} as never,
        spacePermissionService: {
            getSpaceAccessContext: jest.fn().mockResolvedValue({}),
        } as never,
        analytics: { track: jest.fn() } as never,
    });
    return { service, model, featureFlagModel };
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
                request: sampleRequest,
                response: { temp: 21 },
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
            service.saveSample(adminAccount, projectUuid, connectionUuid, {
                request: sampleRequest,
                response: {},
            }),
        ).rejects.toThrow(NotFoundError);
        expect(saveSampleFn).not.toHaveBeenCalled();
    });

    it('persists the sanitized sample and returns the saved sample', async () => {
        const saveSampleFn = jest.fn().mockResolvedValue(fakeSample);
        const { service } = buildService({ saveSampleFn });
        mockAbility(service, true);

        const result = await service.saveSample(
            adminAccount,
            projectUuid,
            connectionUuid,
            {
                label: 'Berlin weather',
                request: sampleRequest,
                response: sampleResponse,
            },
        );

        expect(result).toEqual(fakeSample);
        // Model receives (connectionUuid, userUuid, { label, request, response })
        expect(saveSampleFn).toHaveBeenCalledWith(
            connectionUuid,
            'user-1',
            expect.objectContaining({
                label: 'Berlin weather',
                request: sampleRequest,
                response: sampleResponse,
            }),
        );
    });

    it('truncates a response larger than the byte cap before persisting', async () => {
        const saveSampleFn = jest.fn().mockResolvedValue(fakeSample);
        const { service } = buildService({ saveSampleFn });
        mockAbility(service, true);

        const huge = { blob: 'x'.repeat(200 * 1024) }; // ~200 KB
        await service.saveSample(adminAccount, projectUuid, connectionUuid, {
            request: sampleRequest,
            response: huge,
        });

        const persistedResponse = saveSampleFn.mock.calls[0][2].response;
        const persistedBytes = Buffer.byteLength(
            JSON.stringify(persistedResponse),
        );
        expect(persistedBytes).toBeLessThanOrEqual(
            ExternalConnectionService.MAX_SAMPLE_BYTES,
        );
    });

    it('truncates a long array of rows in the response to the row cap', async () => {
        const saveSampleFn = jest.fn().mockResolvedValue(fakeSample);
        const { service } = buildService({ saveSampleFn });
        mockAbility(service, true);

        const rows = Array.from({ length: 500 }, (_, i) => ({ id: i }));
        await service.saveSample(adminAccount, projectUuid, connectionUuid, {
            request: sampleRequest,
            response: rows,
        });

        const persistedResponse = saveSampleFn.mock.calls[0][2].response;
        expect(Array.isArray(persistedResponse)).toBe(true);
        expect((persistedResponse as unknown[]).length).toBeLessThanOrEqual(
            ExternalConnectionService.MAX_SAMPLE_ROWS,
        );
    });

    it('never persists the decrypted secret even if the response body echoes it', async () => {
        const saveSampleFn = jest.fn().mockResolvedValue(fakeSample);
        const { service, model } = buildService({
            saveSampleFn,
            secret: 'SENTINEL_SECRET_abc123',
        });
        mockAbility(service, true);

        await service.saveSample(adminAccount, projectUuid, connectionUuid, {
            request: sampleRequest,
            response: {
                note: 'some data',
                data_value: 'SENTINEL_SECRET_abc123',
                authorization: `Bearer SENTINEL_SECRET_abc123`,
            },
        });

        const persistedResponse = saveSampleFn.mock.calls[0][2].response;
        const persistedJson = JSON.stringify(persistedResponse);
        // The 'authorization' key is in the redact list; its value must be replaced.
        expect(persistedJson).not.toContain('Bearer SENTINEL_SECRET_abc123');
        expect(persistedJson).toContain('[redacted]');
        // saveSample must never call getDecryptedSecret — it never reads the secret.
        expect(model.getDecryptedSecret).not.toHaveBeenCalled();
    });

    it('does not call getDecryptedSecret — saveSample never reads the connection secret', async () => {
        const saveSampleFn = jest.fn().mockResolvedValue(fakeSample);
        const { service, model } = buildService({ saveSampleFn });
        mockAbility(service, true);

        await service.saveSample(adminAccount, projectUuid, connectionUuid, {
            request: sampleRequest,
            response: { ok: true },
        });

        expect(model.getDecryptedSecret).not.toHaveBeenCalled();
    });

    it('rejects a sample whose request method is not allowed by the connection', async () => {
        const saveSampleFn = jest.fn();
        const { service } = buildService({
            connection: { ...connection, allowedMethods: ['GET'] },
            saveSampleFn,
        });
        mockAbility(service, true);

        await expect(
            service.saveSample(adminAccount, projectUuid, connectionUuid, {
                request: { method: 'POST', path: '/v1/weather' },
                response: {},
            }),
        ).rejects.toThrow(ParameterError);
        expect(saveSampleFn).not.toHaveBeenCalled();
    });

    it('rejects a sample whose request path is outside the allowed prefixes', async () => {
        const saveSampleFn = jest.fn();
        const { service } = buildService({ saveSampleFn });
        mockAbility(service, true);

        await expect(
            service.saveSample(adminAccount, projectUuid, connectionUuid, {
                request: { method: 'GET', path: '/admin/secrets' },
                response: {},
            }),
        ).rejects.toThrow(ParameterError);
        expect(saveSampleFn).not.toHaveBeenCalled();
    });

    it('rejects saving once the connection is at the sample cap', async () => {
        const saveSampleFn = jest.fn();
        const { service } = buildService({
            saveSampleFn,
            countSamplesFn: jest
                .fn()
                .mockResolvedValue(
                    ExternalConnectionService.MAX_SAMPLES_PER_CONNECTION,
                ),
        });
        mockAbility(service, true);

        await expect(
            service.saveSample(adminAccount, projectUuid, connectionUuid, {
                request: sampleRequest,
                response: {},
            }),
        ).rejects.toThrow(ParameterError);
        expect(saveSampleFn).not.toHaveBeenCalled();
    });

    it('redacts secret-ish keys from the request query/body before persisting', async () => {
        const saveSampleFn = jest.fn().mockResolvedValue(fakeSample);
        const { service } = buildService({ saveSampleFn });
        mockAbility(service, true);

        await service.saveSample(adminAccount, projectUuid, connectionUuid, {
            request: {
                method: 'POST',
                path: '/v1/weather',
                query: { token: 'sekret', city: 'Berlin' },
                body: { password: 'hunter2', keep: 'me' },
            },
            response: {},
        });

        const persistedRequest = saveSampleFn.mock.calls[0][2].request;
        expect(persistedRequest.query.token).toBe('[redacted]');
        expect(persistedRequest.query.city).toBe('Berlin');
        expect(persistedRequest.body.password).toBe('[redacted]');
        expect(persistedRequest.body.keep).toBe('me');
    });
});

// -------------------------------------------------------------------
// listSamples
// -------------------------------------------------------------------
describe('ExternalConnectionService.listSamples', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('rejects a non-admin with ForbiddenError', async () => {
        const listSamplesFn = jest.fn();
        const { service } = buildService({ listSamplesFn });
        mockAbility(service, false);

        await expect(
            service.listSamples(viewerAccount, projectUuid, connectionUuid),
        ).rejects.toThrow(ForbiddenError);
        expect(listSamplesFn).not.toHaveBeenCalled();
    });

    it('throws NotFoundError for a cross-project connection', async () => {
        const listSamplesFn = jest.fn();
        const { service } = buildService({
            connection: { ...connection, projectUuid: 'other-project' },
            listSamplesFn,
        });
        mockAbility(service, true);

        await expect(
            service.listSamples(adminAccount, projectUuid, connectionUuid),
        ).rejects.toThrow(NotFoundError);
        expect(listSamplesFn).not.toHaveBeenCalled();
    });

    it('returns samples for an admin on the right project', async () => {
        const listSamplesFn = jest.fn().mockResolvedValue([fakeSample]);
        const { service } = buildService({ listSamplesFn });
        mockAbility(service, true);

        const result = await service.listSamples(
            adminAccount,
            projectUuid,
            connectionUuid,
        );

        expect(result).toEqual([fakeSample]);
        expect(listSamplesFn).toHaveBeenCalledWith(connectionUuid);
    });
});

// -------------------------------------------------------------------
// deleteSample
// -------------------------------------------------------------------
describe('ExternalConnectionService.deleteSample', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('rejects a non-admin with ForbiddenError', async () => {
        const deleteSampleFn = jest.fn();
        const { service } = buildService({ deleteSampleFn });
        mockAbility(service, false);

        await expect(
            service.deleteSample(
                viewerAccount,
                projectUuid,
                connectionUuid,
                sampleUuid,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(deleteSampleFn).not.toHaveBeenCalled();
    });

    it('throws NotFoundError for a cross-project connection', async () => {
        const deleteSampleFn = jest.fn();
        const { service } = buildService({
            connection: { ...connection, projectUuid: 'other-project' },
            deleteSampleFn,
        });
        mockAbility(service, true);

        await expect(
            service.deleteSample(
                adminAccount,
                projectUuid,
                connectionUuid,
                sampleUuid,
            ),
        ).rejects.toThrow(NotFoundError);
        expect(deleteSampleFn).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the sample belongs to a different connection', async () => {
        const deleteSampleFn = jest.fn();
        const { service } = buildService({
            deleteSampleFn,
            getSampleConnectionUuidFn: jest
                .fn()
                .mockResolvedValue('different-connection-uuid'),
        });
        mockAbility(service, true);

        await expect(
            service.deleteSample(
                adminAccount,
                projectUuid,
                connectionUuid,
                sampleUuid,
            ),
        ).rejects.toThrow(NotFoundError);
        expect(deleteSampleFn).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the sample does not exist', async () => {
        const deleteSampleFn = jest.fn();
        const { service } = buildService({
            deleteSampleFn,
            getSampleConnectionUuidFn: jest.fn().mockResolvedValue(undefined),
        });
        mockAbility(service, true);

        await expect(
            service.deleteSample(
                adminAccount,
                projectUuid,
                connectionUuid,
                sampleUuid,
            ),
        ).rejects.toThrow(NotFoundError);
        expect(deleteSampleFn).not.toHaveBeenCalled();
    });

    it('deletes the sample when the connection and sample UUID match', async () => {
        const deleteSampleFn = jest.fn().mockResolvedValue(undefined);
        const { service } = buildService({ deleteSampleFn });
        mockAbility(service, true);

        await expect(
            service.deleteSample(
                adminAccount,
                projectUuid,
                connectionUuid,
                sampleUuid,
            ),
        ).resolves.toBeUndefined();

        expect(deleteSampleFn).toHaveBeenCalledWith(sampleUuid);
    });
});

// -------------------------------------------------------------------
// Feature flag OFF — testConnection and saveSample are gated
// -------------------------------------------------------------------
describe('ExternalConnectionService flag gate — testConnection / saveSample / listSamples / deleteSample', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('testConnection rejects with ForbiddenError when the flag is OFF', async () => {
        const { service, model } = buildService({ featureFlagEnabled: false });
        mockAbility(service, true);

        const executeSpy = jest.spyOn(
            service as unknown as {
                executeExternalFetch: (...a: unknown[]) => Promise<unknown>;
            },
            'executeExternalFetch',
        );

        await expect(
            service.testConnection(adminAccount, projectUuid, connectionUuid, {
                method: 'GET',
                path: '/v1/current',
            }),
        ).rejects.toThrow(ForbiddenError);

        expect(executeSpy).not.toHaveBeenCalled();
        expect(model.getDecryptedSecret).not.toHaveBeenCalled();
    });

    it('saveSample rejects with ForbiddenError when the flag is OFF', async () => {
        const saveSampleFn = jest.fn();
        const { service } = buildService({
            featureFlagEnabled: false,
            saveSampleFn,
        });
        mockAbility(service, true);

        await expect(
            service.saveSample(adminAccount, projectUuid, connectionUuid, {
                request: sampleRequest,
                response: { temp: 21 },
            }),
        ).rejects.toThrow(ForbiddenError);

        expect(saveSampleFn).not.toHaveBeenCalled();
    });

    it('listSamples rejects with ForbiddenError when the flag is OFF', async () => {
        const listSamplesFn = jest.fn();
        const { service } = buildService({
            featureFlagEnabled: false,
            listSamplesFn,
        });
        mockAbility(service, true);

        await expect(
            service.listSamples(adminAccount, projectUuid, connectionUuid),
        ).rejects.toThrow(ForbiddenError);

        expect(listSamplesFn).not.toHaveBeenCalled();
    });

    it('deleteSample rejects with ForbiddenError when the flag is OFF', async () => {
        const deleteSampleFn = jest.fn();
        const { service } = buildService({
            featureFlagEnabled: false,
            deleteSampleFn,
        });
        mockAbility(service, true);

        await expect(
            service.deleteSample(
                adminAccount,
                projectUuid,
                connectionUuid,
                sampleUuid,
            ),
        ).rejects.toThrow(ForbiddenError);

        expect(deleteSampleFn).not.toHaveBeenCalled();
    });
});

// -------------------------------------------------------------------
// linkToApp — alias validation
// -------------------------------------------------------------------
describe('ExternalConnectionService.linkToApp alias validation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('rejects alias containing path-traversal characters (../prompt)', async () => {
        const linkToAppFn = jest.fn();
        const { service } = buildService({ linkToAppFn });
        mockAbility(service, true);

        await expect(
            service.linkToApp(
                adminAccount,
                projectUuid,
                'app-uuid-1',
                connectionUuid,
                '../prompt',
            ),
        ).rejects.toThrow(ParameterError);
        expect(linkToAppFn).not.toHaveBeenCalled();
    });

    it('rejects alias containing a forward slash (a/b)', async () => {
        const linkToAppFn = jest.fn();
        const { service } = buildService({ linkToAppFn });
        mockAbility(service, true);

        await expect(
            service.linkToApp(
                adminAccount,
                projectUuid,
                'app-uuid-1',
                connectionUuid,
                'a/b',
            ),
        ).rejects.toThrow(ParameterError);
        expect(linkToAppFn).not.toHaveBeenCalled();
    });

    it('rejects alias longer than 64 characters', async () => {
        const linkToAppFn = jest.fn();
        const { service } = buildService({ linkToAppFn });
        mockAbility(service, true);

        const longAlias = 'a'.repeat(65);
        await expect(
            service.linkToApp(
                adminAccount,
                projectUuid,
                'app-uuid-1',
                connectionUuid,
                longAlias,
            ),
        ).rejects.toThrow(ParameterError);
        expect(linkToAppFn).not.toHaveBeenCalled();
    });

    it('accepts a valid alias of letters, numbers, hyphens, and underscores', async () => {
        const linkToAppFn = jest.fn().mockResolvedValue(undefined);
        const { service } = buildService({ linkToAppFn });
        mockAbility(service, true);

        await expect(
            service.linkToApp(
                adminAccount,
                projectUuid,
                'app-uuid-1',
                connectionUuid,
                'my-api_v2',
            ),
        ).resolves.toBeUndefined();
        expect(linkToAppFn).toHaveBeenCalled();
    });
});
