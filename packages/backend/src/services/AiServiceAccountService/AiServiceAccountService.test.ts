import { Ability } from '@casl/ability';
import {
    BigqueryAuthenticationType,
    FeatureFlags,
    FeatureNotEnabledError,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    ProjectType,
    WarehouseTypes,
    type AiServiceAccountCredentialInput,
    type PossibleAbilities,
} from '@lightdash/common';
import { type LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { buildAccount } from '../../auth/account/account.mock';
import * as auditLogger from '../../logging/winston';
import { AiServiceAccountService } from './AiServiceAccountService';

const secrets = {
    type: WarehouseTypes.BIGQUERY,
    authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
    keyfileContents: {
        type: 'service_account',
        private_key: 'saved-key',
        client_email: 'agent@example.com',
    },
} as const;
const input = {
    type: WarehouseTypes.BIGQUERY,
    authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
} as const;
const connection = {
    ...secrets,
    project: 'warehouse-project',
    dataset: 'dataset',
    keyfileContents: {
        type: 'authorized_user',
        refresh_token: 'personal-refresh',
    },
    requireUserCredentials: true,
    allowUserCredentials: true,
};

const setup = () => {
    const account = buildAccount();
    account.user.ability = new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'Project' },
    ]);
    const model = {
        getSlot: vi.fn().mockResolvedValue({
            uuid: 'slot',
            identityUuid: 'generation-before',
        }),
        getSecrets: vi.fn().mockResolvedValue({
            slot: { uuid: 'slot', identityUuid: 'generation-before' },
            secrets,
        }),
        getReplaceableSecrets: vi.fn().mockResolvedValue(secrets),
        upsert: vi.fn().mockResolvedValue({
            uuid: 'slot',
            identityUuid: 'generation-after',
        }),
        delete: vi.fn().mockResolvedValue(undefined),
    };
    const flag = vi.fn().mockResolvedValue({ enabled: true });
    const load = vi.fn().mockResolvedValue(connection);
    const getConnection = vi
        .fn()
        .mockResolvedValue({ isOriginal: false, name: 'Extra warehouse' });
    const listConnections = vi.fn().mockResolvedValue([]);
    const getProject = vi.fn().mockResolvedValue({ projectUuid: 'project' });
    const getExtra = vi.fn().mockResolvedValue(connection);
    const runQuery = vi
        .fn()
        .mockResolvedValue({ rows: [{ principal: 'agent@example.com' }] });
    const withWarehouseClient = vi.fn(async (_ref, _context, callback) =>
        callback({ warehouseClient: { runQuery } }),
    );
    const analytics = { track: vi.fn<LightdashAnalytics['track']>() };
    const getSummary = vi.fn().mockResolvedValue({
        organizationUuid: account.organization.organizationUuid,
        name: 'Original warehouse',
    });
    const service = new AiServiceAccountService({
        analytics,
        aiServiceAccountCredentialsModel: model,
        featureFlagModel: { get: flag },
        projectModel: {
            getSummary,
            getWarehouseCredentialsForBinding: load,
        },
        warehouseConnectionModel: {
            getProject,
            get: getConnection,
            list: listConnections,
            getCredentials: getExtra,
        },
        projectService: { warehouseClientFactory: { withWarehouseClient } },
    } as unknown as ConstructorParameters<typeof AiServiceAccountService>[0]);
    return {
        analytics,
        account,
        model,
        flag,
        load,
        getConnection,
        getProject,
        listConnections,
        getExtra,
        runQuery,
        withWarehouseClient,
        service,
        getSummary,
    };
};

const operations = ['get', 'upsert', 'delete', 'test'] as const;
describe.each(operations)('%s boundaries', (operation) => {
    it('checks the feature before loading credentials or accessing the slot', async () => {
        const f = setup();
        f.flag.mockResolvedValue({ enabled: false });
        await expect(
            f.service[operation](f.account, 'project', null, input),
        ).rejects.toBeInstanceOf(FeatureNotEnabledError);
        expect(f.flag).toHaveBeenCalledWith({
            user: {
                userUuid: f.account.user.id,
                organizationUuid: f.account.organization.organizationUuid,
            },
            featureFlagId: FeatureFlags.AgentIdentity,
        });
        expect(f.load).not.toHaveBeenCalled();
        Object.values(f.model).forEach((mock) =>
            expect(mock).not.toHaveBeenCalled(),
        );
        expect(f.withWarehouseClient).not.toHaveBeenCalled();
        expect(f.analytics.track).not.toHaveBeenCalled();
    });
    it('refuses a non-manager', async () => {
        const f = setup();
        f.account.user.ability = new Ability<PossibleAbilities>([]);
        await expect(
            f.service[operation](f.account, 'project', null, input),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(f.analytics.track).not.toHaveBeenCalled();
        expect(f.flag).not.toHaveBeenCalled();
        expect(f.load).not.toHaveBeenCalled();
    });
    it('rejects a connection outside the project', async () => {
        const f = setup();
        f.getConnection.mockRejectedValue(
            new NotFoundError('Connection not found'),
        );
        await expect(
            f.service[operation](f.account, 'project', 'other', input),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(f.getConnection).toHaveBeenCalledWith(
            { projectUuid: 'project' },
            'other',
        );
        expect(f.model.getSecrets).not.toHaveBeenCalled();
        expect(f.getExtra).not.toHaveBeenCalled();
        expect(f.analytics.track).not.toHaveBeenCalled();
    });
    it.each(
        Object.values(WarehouseTypes).filter(
            (type) => type !== WarehouseTypes.BIGQUERY,
        ),
    )('rejects %s slot access', async (type) => {
        const f = setup();
        f.load.mockResolvedValue({ type });
        await expect(
            f.service[operation](f.account, 'project', null, input),
        ).rejects.toBeInstanceOf(ParameterError);
        Object.values(f.model).forEach((mock) =>
            expect(mock).not.toHaveBeenCalled(),
        );
        expect(f.withWarehouseClient).not.toHaveBeenCalled();
        expect(f.analytics.track).not.toHaveBeenCalled();
    });
});

it('keeps the saved key file on a partial update', async () => {
    const f = setup();
    await f.service.upsert(f.account, 'project', null, input);
    expect(f.model.upsert).toHaveBeenCalledWith(
        'project',
        null,
        secrets,
        f.account.user.id,
    );
});
it('requires a complete key file for a new or unreadable slot', async () => {
    const f = setup();
    f.model.getReplaceableSecrets.mockResolvedValue(null);
    await expect(
        f.service.upsert(f.account, 'project', null, input),
    ).rejects.toBeInstanceOf(ParameterError);
    expect(f.model.upsert).not.toHaveBeenCalled();
});
it('rejects an unsupported method change without borrowing saved secrets', async () => {
    const f = setup();
    const changed = {
        type: WarehouseTypes.BIGQUERY,
        authenticationType: BigqueryAuthenticationType.SSO,
    } as unknown as AiServiceAccountCredentialInput;
    await expect(
        f.service.upsert(f.account, 'project', null, changed),
    ).rejects.toBeInstanceOf(ParameterError);
    expect(f.model.upsert).not.toHaveBeenCalled();
});
it('rejects a different input warehouse before decrypting', async () => {
    const f = setup();
    await expect(
        f.service.upsert(f.account, 'project', null, {
            ...input,
            type: WarehouseTypes.POSTGRES,
        } as unknown as AiServiceAccountCredentialInput),
    ).rejects.toBeInstanceOf(ParameterError);
    expect(f.model.getSecrets).not.toHaveBeenCalled();
    expect(f.model.getReplaceableSecrets).not.toHaveBeenCalled();
});
it('normalizes the original connection UUID to the original slot', async () => {
    const f = setup();
    f.getConnection.mockResolvedValue({ isOriginal: true });
    await f.service.get(f.account, 'project', 'original');
    expect(f.model.getSlot).toHaveBeenCalledWith('project', null);
    expect(f.getExtra).not.toHaveBeenCalled();
    expect(f.model.getSecrets).not.toHaveBeenCalled();
});
it('scopes an extra slot to its connection', async () => {
    const f = setup();
    await f.service.delete(f.account, 'project', 'extra');
    expect(f.model.delete).toHaveBeenCalledWith('project', 'extra');
    expect(f.getExtra).toHaveBeenCalledWith(
        { projectUuid: 'project' },
        'extra',
    );
});
it.each([null, input])(
    'tests saved or submitted credentials through the bypass factory without writes',
    async (credentials) => {
        const f = setup();
        const result = await f.service.test(
            f.account,
            'project',
            null,
            credentials,
        );
        expect(result).toMatchObject({
            ok: true,
            principal: 'agent@example.com',
            observed: { principal: 'agent@example.com' },
            checkedAt: expect.any(Date),
        });
        expect(f.withWarehouseClient.mock.calls[0][0]).toEqual({
            kind: 'bypass',
            mode: 'connection_test',
            agentSession: true,
            projectUuid: 'project',
            credentials: {
                ...secrets,
                project: 'warehouse-project',
                dataset: 'dataset',
                requireUserCredentials: false,
                allowUserCredentials: false,
            },
        });
        expect(f.runQuery).toHaveBeenCalledWith(
            'SELECT SESSION_USER() AS principal',
            {},
        );
        expect(f.model.upsert).not.toHaveBeenCalled();
        expect(f.model.delete).not.toHaveBeenCalled();
    },
);
it('tests a new submitted key without saving it', async () => {
    const f = setup();
    f.model.getSecrets.mockResolvedValue(null);
    await expect(
        f.service.test(f.account, 'project', null, secrets),
    ).resolves.toMatchObject({ ok: true });
    expect(f.model.upsert).not.toHaveBeenCalled();
    expect(f.model.delete).not.toHaveBeenCalled();
});
it('returns a sanitized failure', async () => {
    const f = setup();
    f.runQuery.mockRejectedValue(
        new Error('saved-key personal-refresh slot-key'),
    );
    const result = await f.service.test(f.account, 'project', null, null);
    expect(result).toMatchObject({
        ok: false,
        principal: null,
        observed: {},
        checkedAt: expect.any(Date),
    });
    expect(JSON.stringify(result)).not.toMatch(
        /saved-key|personal-refresh|slot-key/,
    );
    expect(f.model.upsert).not.toHaveBeenCalled();
    expect(f.model.delete).not.toHaveBeenCalled();
});
it('returns a sanitized connection acquisition failure', async () => {
    const f = setup();
    f.withWarehouseClient.mockRejectedValue(new Error('saved-key'));
    await expect(
        f.service.test(f.account, 'project', null, null),
    ).resolves.toMatchObject({ ok: false, principal: null });
});
it('does not invent an unobserved principal', async () => {
    const f = setup();
    f.runQuery.mockResolvedValue({ rows: [] });
    await expect(
        f.service.test(f.account, 'project', null, null),
    ).resolves.toMatchObject({
        ok: true,
        principal: null,
        observed: { principal: null },
        message: 'Connection checked; principal not observed.',
    });
});
it('refuses to test an absent slot without submitted secrets', async () => {
    const f = setup();
    f.model.getSecrets.mockResolvedValue(null);
    await expect(
        f.service.test(f.account, 'project', null, null),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(f.withWarehouseClient).not.toHaveBeenCalled();
});

describe('AI service account analytics', () => {
    const properties = (f: ReturnType<typeof setup>) => ({
        organizationId: f.account.organization.organizationUuid,
        projectId: 'project',
        userId: f.account.user.id,
        warehouseType: WarehouseTypes.BIGQUERY,
    });
    const expectNoSecrets = (f: ReturnType<typeof setup>) => {
        const calls = JSON.stringify(f.analytics.track.mock.calls);
        for (const secret of [
            secrets.keyfileContents.private_key,
            secrets.keyfileContents.client_email,
            connection.keyfileContents.refresh_token,
            'SELECT SESSION_USER()',
            'principal',
            'keyfileContents',
            'private_key',
        ]) {
            expect(calls).not.toContain(secret);
        }
    };

    it.each(['created', 'updated'] as const)(
        'tracks a %s slot after saving',
        async (operation) => {
            const f = setup();
            f.model.getSlot.mockResolvedValue(
                operation === 'created' ? null : { uuid: 'slot' },
            );
            f.model.upsert.mockImplementation(async () => {
                expect(f.analytics.track).not.toHaveBeenCalled();
                return { uuid: 'slot' };
            });
            await f.service.upsert(f.account, 'project', null, secrets);
            expect(f.analytics.track).toHaveBeenCalledTimes(1);
            expect(f.analytics.track).toHaveBeenCalledWith({
                event: 'agent_identity.service_account_saved',
                userId: f.account.user.id,
                properties: { ...properties(f), operation },
            });
            expectNoSecrets(f);
        },
    );

    it('counts replacing an unreadable slot as an update', async () => {
        const f = setup();
        f.model.getReplaceableSecrets.mockResolvedValue(null);
        await f.service.upsert(f.account, 'project', null, secrets);
        expect(f.analytics.track).toHaveBeenCalledTimes(1);
        expect(f.analytics.track).toHaveBeenCalledWith({
            event: 'agent_identity.service_account_saved',
            userId: f.account.user.id,
            properties: { ...properties(f), operation: 'updated' },
        });
        expectNoSecrets(f);
    });

    it('tracks a deleted slot after deletion succeeds', async () => {
        const f = setup();
        f.model.delete.mockImplementation(async () => {
            expect(f.analytics.track).not.toHaveBeenCalled();
        });
        await f.service.delete(f.account, 'project', null);
        expect(f.analytics.track).toHaveBeenCalledTimes(1);
        expect(f.analytics.track).toHaveBeenCalledWith({
            event: 'agent_identity.service_account_deleted',
            userId: f.account.user.id,
            properties: properties(f),
        });
        expectNoSecrets(f);
    });

    it.each(['submitted', 'saved'] as const)(
        'tracks a successful %s credential test',
        async (credentialSource) => {
            const f = setup();
            await f.service.test(
                f.account,
                'project',
                null,
                credentialSource === 'submitted' ? secrets : null,
            );
            expect(f.analytics.track).toHaveBeenCalledTimes(1);
            expect(f.analytics.track).toHaveBeenCalledWith({
                event: 'agent_identity.service_account_tested',
                userId: f.account.user.id,
                properties: {
                    ...properties(f),
                    result: 'success',
                    failureReason: null,
                    credentialSource,
                    inheritedFromProjectUuid: null,
                },
            });
            expectNoSecrets(f);
        },
    );

    it.each(['connection_failed', 'query_failed'] as const)(
        'tracks a %s probe result without its error text',
        async (failureReason) => {
            const f = setup();
            const error = new Error(
                'saved-key agent@example.com personal-refresh SELECT SESSION_USER()',
            );
            if (failureReason === 'connection_failed')
                f.withWarehouseClient.mockRejectedValue(error);
            else f.runQuery.mockRejectedValue(error);
            await expect(
                f.service.test(f.account, 'project', null, null),
            ).resolves.toMatchObject({ ok: false });
            expect(f.analytics.track).toHaveBeenCalledTimes(1);
            expect(f.analytics.track).toHaveBeenCalledWith({
                event: 'agent_identity.service_account_tested',
                userId: f.account.user.id,
                properties: {
                    ...properties(f),
                    result: 'failure',
                    failureReason,
                    credentialSource: 'saved',
                    inheritedFromProjectUuid: null,
                },
            });
            expectNoSecrets(f);
        },
    );

    it.each(['upsert', 'delete'] as const)(
        'does not track a failed %s',
        async (operation) => {
            const f = setup();
            f.model[operation].mockRejectedValue(new Error('write failed'));
            await expect(
                f.service[operation](f.account, 'project', null, secrets),
            ).rejects.toThrow('write failed');
            expect(f.analytics.track).not.toHaveBeenCalled();
        },
    );

    it.each(['upsert', 'test'] as const)(
        'does not track %s with invalid submitted credentials',
        async (operation) => {
            const f = setup();
            await expect(
                f.service[operation](f.account, 'project', null, {
                    ...secrets,
                    keyfileContents: {
                        ...secrets.keyfileContents,
                        type: 'authorized_user',
                    },
                }),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(f.withWarehouseClient).not.toHaveBeenCalled();
            expect(f.analytics.track).not.toHaveBeenCalled();
        },
    );

    it('does not track a test rejected for a missing slot', async () => {
        const f = setup();
        f.model.getSecrets.mockResolvedValue(null);
        await expect(
            f.service.test(f.account, 'project', null, null),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(f.analytics.track).not.toHaveBeenCalled();
    });
});

describe('testAccess boundaries', () => {
    const request = {
        credentials: null,
        entryPoint: 'project_agent_identity_page',
    } as const;
    it('checks the flag before any credential or client work', async () => {
        const f = setup();
        f.flag.mockResolvedValue({ enabled: false });
        await expect(
            f.service.testAccess(f.account, 'project', null, request),
        ).rejects.toBeInstanceOf(FeatureNotEnabledError);
        expect(f.load).not.toHaveBeenCalled();
        expect(f.model.getSecrets).not.toHaveBeenCalled();
        expect(f.withWarehouseClient).not.toHaveBeenCalled();
    });
    it('refuses a non-manager before credentials or flag evaluation', async () => {
        const f = setup();
        f.account.user.ability = new Ability<PossibleAbilities>([]);
        await expect(
            f.service.testAccess(f.account, 'project', null, request),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(f.flag).not.toHaveBeenCalled();
        expect(f.load).not.toHaveBeenCalled();
        expect(f.withWarehouseClient).not.toHaveBeenCalled();
    });
    it('normalises an original connection UUID before loading the saved key', async () => {
        const f = setup();
        f.getConnection.mockResolvedValue({ isOriginal: true });
        await f.service.testAccess(
            f.account,
            'project',
            'original-uuid',
            request,
        );
        expect(f.model.getSecrets).toHaveBeenCalledWith('project', null, true);
    });
    it('rejects an unrelated connection before secrets or clients', async () => {
        const f = setup();
        f.getConnection.mockRejectedValue(
            new NotFoundError('Connection not found'),
        );
        await expect(
            f.service.testAccess(f.account, 'project', 'other', request),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(f.model.getSecrets).not.toHaveBeenCalled();
        expect(f.withWarehouseClient).not.toHaveBeenCalled();
    });
});

describe('service account audit logging', () => {
    const prepare = () => {
        const f = setup();
        const logger = { warn: vi.fn(), debug: vi.fn(), info: vi.fn() };
        Object.assign(f.service, { logger });
        const audit = vi
            .spyOn(auditLogger, 'logAuditEvent')
            .mockImplementation(() => {});
        return { ...f, logger, audit };
    };
    const assertSafe = (f: ReturnType<typeof prepare>) => {
        const payload = JSON.stringify([
            f.audit.mock.calls,
            ...Object.values(f.logger).map((mock) => mock.mock.calls),
        ]);
        for (const secret of [
            JSON.stringify(secrets),
            'saved-key',
            'agent@example.com',
            'personal-refresh',
            'SELECT SESSION_USER() AS principal',
        ]) {
            expect(payload).not.toContain(secret);
        }
    };
    afterEach(() => vi.restoreAllMocks());

    test.each([
        {
            operation: 'save',
            action: 'create',
            event: 'saved',
            generation: 'generation-after',
        },
        {
            operation: 'replace',
            action: 'update',
            event: 'saved',
            generation: 'generation-after',
        },
        {
            operation: 'delete',
            action: 'delete',
            event: 'deleted',
            generation: null,
        },
        {
            operation: 'test success',
            action: 'test',
            event: 'tested',
            generation: 'generation-before',
        },
        {
            operation: 'test failure',
            action: 'test',
            event: 'tested',
            generation: 'generation-before',
        },
    ] as const)(
        'audits $operation with generations and no credentials',
        async ({ operation, action, event: eventName, generation }) => {
            const f = prepare();
            if (operation === 'save') f.model.getSlot.mockResolvedValue(null);
            if (operation === 'test failure')
                f.runQuery.mockRejectedValue(
                    new Error(
                        `invalid_grant ${JSON.stringify(secrets)} SELECT SESSION_USER() AS principal`,
                    ),
                );
            if (operation === 'save' || operation === 'replace')
                await f.service.upsert(f.account, 'project', 'extra', input);
            else if (operation === 'delete')
                await f.service.delete(f.account, 'project', 'extra');
            else await f.service.test(f.account, 'project', 'extra', input);
            const event = f.audit.mock.calls.find(
                ([entry]) => entry.resource.type === 'AiServiceAccount',
            )?.[0];
            expect(event).toMatchObject({
                actor: { uuid: f.account.user.id },
                action,
                status: 'allowed',
                context: {},
                resource: {
                    type: 'AiServiceAccount',
                    organizationUuid: f.account.organization.organizationUuid,
                    projectUuid: 'project',
                    metadata: {
                        event: `agent_identity.service_account_${eventName}`,
                        warehouseConnectionUuid: 'extra',
                        connectionName: 'Extra warehouse',
                        previousGeneration:
                            operation === 'save' ? null : 'generation-before',
                        generation,
                        ...(operation.startsWith('test')
                            ? {
                                  result:
                                      operation === 'test success'
                                          ? 'success'
                                          : 'failure',
                              }
                            : {}),
                    },
                },
            });
            if (operation === 'test failure')
                expect(f.logger.warn).toHaveBeenCalledWith(
                    'AI service account test failed',
                    {
                        userUuid: f.account.user.id,
                        organizationUuid:
                            f.account.organization.organizationUuid,
                        projectUuid: 'project',
                        warehouseConnectionUuid: 'extra',
                        reason: 'query_failed',
                        errorClass: 'Error',
                        errorCode: null,
                        errorCategory: 'invalid_grant',
                        errorMessage: '[REDACTED]',
                    },
                );
            assertSafe(f);
        },
    );

    test.each(['upsert', 'delete'] as const)(
        'does not audit a failed %s',
        async (operation) => {
            const f = prepare();
            f.model[operation].mockRejectedValue(new Error('write failed'));
            await expect(
                f.service[operation](f.account, 'project', null, input),
            ).rejects.toThrow('write failed');
            expect(
                f.audit.mock.calls.filter(
                    ([entry]) => entry.resource.type === 'AiServiceAccount',
                ),
            ).toEqual([]);
        },
    );

    test('audit failure does not fail the saved key and logs only redacted details', async () => {
        const f = prepare();
        f.audit.mockImplementation((entry) => {
            if (entry.resource.type === 'AiServiceAccount')
                throw new Error(`audit unavailable ${JSON.stringify(secrets)}`);
        });
        await expect(
            f.service.upsert(f.account, 'project', null, input),
        ).resolves.toMatchObject({ identityUuid: 'generation-after' });
        expect(f.logger.warn).toHaveBeenCalledWith(
            'Failed to write the AI service account audit event',
            {
                errorClass: 'Error',
                errorCode: null,
                errorCategory: null,
                errorMessage: 'audit unavailable [REDACTED]',
            },
        );
        assertSafe(f);
    });
});

describe.each(['upsert', 'delete', 'test'] as const)(
    'original connection audit name for %s',
    (operation) => {
        afterEach(() => vi.restoreAllMocks());
        test.each([null, 'original'])(
            'uses the stored name for route %s',
            async (connectionUuid) => {
                const f = setup();
                const original = { isOriginal: true, name: 'Named connection' };
                f.getConnection.mockResolvedValue(original);
                f.listConnections.mockResolvedValue([original]);
                const audit = vi
                    .spyOn(auditLogger, 'logAuditEvent')
                    .mockImplementation(() => {});
                await f.service[operation](
                    f.account,
                    'project',
                    connectionUuid,
                    input,
                );
                expect(audit).toHaveBeenCalledWith(
                    expect.objectContaining({
                        resource: expect.objectContaining({
                            metadata: expect.objectContaining({
                                warehouseConnectionUuid: null,
                                connectionName: 'Named connection',
                            }),
                        }),
                    }),
                );
            },
        );
        test('falls back to the project name for a legacy connection', async () => {
            const f = setup();
            const audit = vi
                .spyOn(auditLogger, 'logAuditEvent')
                .mockImplementation(() => {});
            await f.service[operation](f.account, 'project', null, input);
            expect(audit).toHaveBeenCalledWith(
                expect.objectContaining({
                    resource: expect.objectContaining({
                        metadata: expect.objectContaining({
                            warehouseConnectionUuid: null,
                            connectionName: 'Original warehouse',
                        }),
                    }),
                }),
            );
        });
    },
);

it('gets the original slot without resolving its audit name', async () => {
    const f = setup();
    await f.service.get(f.account, 'project', null);
    expect(f.model.getSlot).toHaveBeenCalledWith('project', null);
    expect(f.getProject).not.toHaveBeenCalled();
    expect(f.listConnections).not.toHaveBeenCalled();
});

const previewFixture = () => {
    const f = setup();
    f.getSummary.mockImplementation(async (uuid: string) => ({
        projectUuid: uuid,
        organizationUuid: f.account.organization.organizationUuid,
        type: uuid === 'project' ? ProjectType.PREVIEW : ProjectType.DEFAULT,
        upstreamProjectUuid: uuid === 'project' ? 'parent' : undefined,
        name: uuid === 'parent' ? 'Parent project' : 'Preview',
    }));
    f.model.getSecrets.mockImplementation(async (uuid: string) =>
        uuid === 'parent'
            ? {
                  slot: {
                      uuid: 'parent-slot',
                      identityUuid: 'parent-generation',
                  },
                  secrets,
              }
            : null,
    );
    return f;
};
it.each([true, false])(
    'returns parent principal with parent view=%s without exposing secrets',
    async (canView) => {
        const f = previewFixture();
        f.account.user.ability = new Ability<PossibleAbilities>([
            {
                action: 'manage',
                subject: 'Project',
                conditions: { projectUuid: 'project' },
            },
            ...(canView
                ? [
                      {
                          action: 'view' as const,
                          subject: 'Project' as const,
                          conditions: { projectUuid: 'parent' },
                      },
                  ]
                : []),
        ]);
        expect(await f.service.getStatus(f.account, 'project', null)).toEqual({
            results: { uuid: 'slot', identityUuid: 'generation-before' },
            parent: {
                projectUuid: 'parent',
                projectName: canView ? 'Parent project' : null,
                principal: 'agent@example.com',
            },
        });
    },
);
it('returns no parent on a non-preview status response', async () => {
    const f = setup();
    expect(await f.service.getStatus(f.account, 'project', null)).toEqual({
        results: { uuid: 'slot', identityUuid: 'generation-before' },
        parent: null,
    });
});
it('deletes only the preview slot when a parent key exists', async () => {
    const f = previewFixture();
    await f.service.delete(f.account, 'project', null);
    expect(f.model.delete).toHaveBeenCalledExactlyOnceWith('project', null);
    expect(f.model.getSecrets).not.toHaveBeenCalled();
});
it('tests inherited secrets against preview connection settings', async () => {
    const f = previewFixture();
    expect(
        await f.service.test(f.account, 'project', null, null),
    ).toMatchObject({ ok: true });
    expect(f.withWarehouseClient.mock.calls[0][0]).toMatchObject({
        projectUuid: 'project',
        credentials: {
            project: connection.project,
            dataset: connection.dataset,
            keyfileContents: secrets.keyfileContents,
        },
    });
    expect(f.analytics.track).toHaveBeenCalledWith(
        expect.objectContaining({
            properties: expect.objectContaining({
                inheritedFromProjectUuid: 'parent',
            }),
        }),
    );
});
it('never merges submitted credentials with a parent key', async () => {
    const f = previewFixture();
    f.model.getReplaceableSecrets.mockResolvedValue(null);
    await expect(
        f.service.test(f.account, 'project', null, input),
    ).rejects.toBeInstanceOf(ParameterError);
    expect(f.model.getSecrets).not.toHaveBeenCalled();
});

it('records the parent generation when Test uses an inherited key', async () => {
    const f = previewFixture();
    f.model.getSlot.mockResolvedValue(null);
    const audit = vi
        .spyOn(auditLogger, 'logAuditEvent')
        .mockImplementation(() => {});
    await expect(
        f.service.test(f.account, 'project', null, null),
    ).resolves.toMatchObject({ ok: true });
    expect(
        audit.mock.calls.find(
            ([entry]) => entry.resource.type === 'AiServiceAccount',
        )?.[0],
    ).toMatchObject({
        action: 'test',
        resource: {
            type: 'AiServiceAccount',
            projectUuid: 'project',
            metadata: {
                event: 'agent_identity.service_account_tested',
                previousGeneration: 'parent-generation',
                generation: 'parent-generation',
                inheritedFromProjectUuid: 'parent',
                result: 'success',
            },
        },
    });
    audit.mockRestore();
});
