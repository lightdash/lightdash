import { Ability } from '@casl/ability';
import {
    BigqueryAuthenticationType,
    DatabricksAuthenticationType,
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
import { exchangeDatabricksOAuthCredentials } from '@lightdash/warehouses';
import { type LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { buildAccount } from '../../auth/account/account.mock';
import * as auditLogger from '../../logging/winston';
import {
    snowflakeSecrets,
    snowflakeVerification,
} from '../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel.mock';
import { aiServiceAccountCredentialResolvers } from '../WarehouseClientFactory/aiServiceAccountCredentialResolvers';
import {
    credentialResolution,
    type MaterializedCredentials,
} from '../WarehouseClientFactory/CredentialResolver';
import { AiServiceAccountService } from './AiServiceAccountService';

vi.mock('@lightdash/warehouses', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@lightdash/warehouses')>()),
    exchangeDatabricksOAuthCredentials: vi.fn(),
}));

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
        getCredentialsReadable: vi.fn().mockResolvedValue(true),
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
        getVerification: vi.fn().mockResolvedValue(null),
        updateVerification: vi.fn().mockResolvedValue(undefined),
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
            (type) =>
                type !== WarehouseTypes.BIGQUERY &&
                type !== WarehouseTypes.DATABRICKS &&
                type !== WarehouseTypes.SNOWFLAKE,
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
        ).resolves.toMatchObject({
            results: { identityUuid: 'generation-after' },
        });
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
            credentialsReadable: true,
            parent: {
                credentialsReadable: true,
                projectUuid: 'parent',
                projectName: canView ? 'Parent project' : null,
                identityUuid: 'parent-generation',
                principal: 'agent@example.com',
            },
        });
    },
);
it.each([true, false])(
    'returns status with an unreadable parent key and own slot=%s',
    async (hasOwnSlot) => {
        const f = previewFixture();
        const ownSlot = hasOwnSlot ? { uuid: 'slot' } : null;
        f.model.getSlot.mockImplementation(async (uuid: string) =>
            uuid === 'parent'
                ? { uuid: 'parent-slot', identityUuid: 'parent-generation' }
                : ownSlot,
        );
        f.model.getSecrets.mockRejectedValue(new Error('unreadable key'));
        await expect(
            f.service.getStatus(f.account, 'project', null),
        ).resolves.toEqual({
            results: ownSlot,
            credentialsReadable: ownSlot !== null,
            parent: {
                projectUuid: 'parent',
                projectName: 'Parent project',
                identityUuid: 'parent-generation',
                principal: null,
                credentialsReadable: false,
            },
        });
        expect(f.model.getSlot).toHaveBeenLastCalledWith('parent', null);
    },
);
it('propagates unexpected errors while loading parent status', async () => {
    const f = previewFixture();
    const error = new Error('project lookup failed');
    f.getSummary
        .mockResolvedValueOnce({
            organizationUuid: f.account.organization.organizationUuid,
        })
        .mockRejectedValueOnce(error);
    await expect(f.service.getStatus(f.account, 'project', null)).rejects.toBe(
        error,
    );
});
it('returns no parent on a non-preview status response', async () => {
    const f = setup();
    expect(await f.service.getStatus(f.account, 'project', null)).toEqual({
        results: { uuid: 'slot', identityUuid: 'generation-before' },
        credentialsReadable: true,
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

it('validates the merged slot through the registry before saving', async () => {
    const f = setup();
    const validation = vi
        .spyOn(aiServiceAccountCredentialResolvers, 'validateOnSave')
        .mockRejectedValueOnce(new ParameterError('invalid slot'));
    try {
        await expect(
            f.service.upsert(f.account, 'project', null, input),
        ).rejects.toThrow('invalid slot');
        expect(validation).toHaveBeenCalledWith(
            expect.objectContaining({
                stored: secrets,
                intent: { kind: 'preserve' },
                owner: null,
            }),
            'ai_service_account',
        );
        expect(f.model.upsert).not.toHaveBeenCalled();
    } finally {
        validation.mockRestore();
    }
});

it.each([true, false])(
    'passes plain bypass credentials with submitted=%s',
    async (submitted) => {
        const f = setup();
        await f.service.test(
            f.account,
            'project',
            null,
            submitted ? input : null,
        );
        const tested = f.withWarehouseClient.mock.calls[0][0]
            .credentials as MaterializedCredentials;
        expect(Object.getOwnPropertySymbols(tested)).not.toContain(
            credentialResolution,
        );
    },
);

const databricksSecrets = {
    type: WarehouseTypes.DATABRICKS,
    authenticationType: DatabricksAuthenticationType.OAUTH_M2M,
    oauthClientId: 'slot-client',
    oauthClientSecret: 'slot-secret',
} as const;
const databricksConnection = {
    ...databricksSecrets,
    serverHostName: 'workspace.example.com',
    httpPath: '/sql/preview',
    catalog: 'catalog',
    database: 'schema',
    oauthClientId: 'project-client',
    oauthClientSecret: 'project-secret',
    token: 'project-token',
    refreshToken: 'personal-refresh',
    personalAccessToken: 'project-pat',
    requireUserCredentials: true,
};
const databricksFixture = (preview = false) => {
    const f = preview ? previewFixture() : setup();
    f.load.mockResolvedValue(databricksConnection);
    f.getExtra.mockResolvedValue(databricksConnection);
    f.model.getReplaceableSecrets.mockResolvedValue(databricksSecrets);
    f.model.getSecrets.mockImplementation(async (uuid: string) =>
        preview && uuid !== 'parent'
            ? null
            : {
                  slot: {
                      uuid: `${uuid}-slot`,
                      identityUuid: `${uuid}-generation`,
                  },
                  secrets: databricksSecrets,
              },
    );
    f.runQuery.mockResolvedValue({ rows: [{ PrInCiPaL: 'principal-uuid' }] });
    vi.mocked(exchangeDatabricksOAuthCredentials)
        .mockReset()
        .mockResolvedValue({ accessToken: 'slot-token' });
    return f;
};
describe('Databricks identity verification', () => {
    it('probes before saving and returns only slot metadata and the observation', async () => {
        const f = databricksFixture();
        const result = await f.service.upsert(
            f.account,
            'project',
            null,
            databricksSecrets,
        );
        expect(result).toEqual({
            results: { uuid: 'slot', identityUuid: 'generation-after' },
            verification: {
                ok: true,
                principal: 'principal-uuid',
                observed: { currentUser: 'principal-uuid' },
                message: 'AI service account connection checked.',
                checkedAt: expect.any(Date),
            },
        });
        expect(f.runQuery).toHaveBeenCalledExactlyOnceWith(
            'SELECT current_user() AS principal',
            {},
        );
        expect(f.withWarehouseClient.mock.calls[0][0]).toMatchObject({
            kind: 'bypass',
            mode: 'connection_test',
            agentSession: true,
            clientOptions: { agentJobControls: true },
            credentials: {
                ...databricksSecrets,
                token: 'slot-token',
                requireUserCredentials: false,
            },
        });
        expect(f.model.upsert).toHaveBeenCalledExactlyOnceWith(
            'project',
            null,
            databricksSecrets,
            f.account.user.id,
            result.verification,
        );
        expect(f.runQuery.mock.invocationCallOrder[0]).toBeLessThan(
            f.model.upsert.mock.invocationCallOrder[0],
        );
        for (const value of [
            'slot-secret',
            'slot-client',
            'slot-token',
            'project-token',
            'personal-refresh',
        ]) {
            expect(JSON.stringify(result)).not.toContain(value);
            expect(JSON.stringify(f.analytics.track.mock.calls)).not.toContain(
                value,
            );
        }
        expect(f.model.updateVerification).not.toHaveBeenCalled();
    });
    it.each(['exchange', 'query', 'missing principal', 'blank principal'])(
        'does not replace a slot after %s failure',
        async (failure) => {
            const f = databricksFixture();
            if (failure === 'exchange')
                vi.mocked(exchangeDatabricksOAuthCredentials).mockRejectedValue(
                    new Error('slot-secret'),
                );
            if (failure === 'query')
                f.runQuery.mockRejectedValue(new Error('slot-secret'));
            if (failure === 'missing principal')
                f.runQuery.mockResolvedValue({ rows: [{}] });
            if (failure === 'blank principal')
                f.runQuery.mockResolvedValue({ rows: [{ principal: '  ' }] });
            await expect(
                f.service.upsert(f.account, 'project', null, databricksSecrets),
            ).rejects.toThrow('Could not');
            expect(f.model.upsert).not.toHaveBeenCalled();
            expect(f.model.updateVerification).not.toHaveBeenCalled();
        },
    );
    it.each([false, true])(
        'writes saved Test to the source generation, inherited=%s',
        async (preview) => {
            const f = databricksFixture(preview);
            const result = await f.service.test(
                f.account,
                'project',
                null,
                null,
            );
            const source = preview ? 'parent' : 'project';
            expect(result).toMatchObject({
                ok: true,
                observed: { currentUser: 'principal-uuid' },
            });
            expect(f.model.updateVerification).toHaveBeenCalledExactlyOnceWith(
                source,
                null,
                `${source}-generation`,
                result,
            );
            expect(
                exchangeDatabricksOAuthCredentials,
            ).toHaveBeenCalledExactlyOnceWith(
                'workspace.example.com',
                'slot-client',
                'slot-secret',
            );
            expect(f.withWarehouseClient.mock.calls[0][0]).toMatchObject({
                projectUuid: 'project',
                credentials: { httpPath: '/sql/preview' },
            });
        },
    );
    it('does not persist an unsaved or failed Test', async () => {
        const f = databricksFixture();
        await f.service.test(f.account, 'project', null, databricksSecrets);
        f.runQuery.mockRejectedValue(new Error('slot-secret'));
        expect(
            await f.service.test(f.account, 'project', null, null),
        ).toMatchObject({ ok: false, principal: null });
        expect(f.model.updateVerification).not.toHaveBeenCalled();
    });
    it.each([null, 'original', 'extra'])(
        'allows preview writes and normalizes connection %s',
        async (connectionUuid) => {
            const f = databricksFixture(true);
            if (connectionUuid === 'original')
                f.getConnection.mockResolvedValue({
                    isOriginal: true,
                    name: 'Original',
                });
            await f.service.upsert(
                f.account,
                'project',
                connectionUuid,
                databricksSecrets,
            );
            await f.service.delete(f.account, 'project', connectionUuid);
            expect(f.model.upsert).toHaveBeenCalledWith(
                'project',
                connectionUuid === 'extra' ? 'extra' : null,
                databricksSecrets,
                f.account.user.id,
                expect.objectContaining({ ok: true }),
            );
            expect(f.model.delete).toHaveBeenCalledExactlyOnceWith(
                'project',
                connectionUuid === 'extra' ? 'extra' : null,
            );
        },
    );
    it.each(['get', 'getStatus', 'upsert', 'delete', 'test'] as const)(
        'flag off stops %s before secrets, observations, or tokens',
        async (operation) => {
            const f = databricksFixture();
            f.flag.mockResolvedValue({ enabled: false });
            await expect(
                f.service[operation](
                    f.account,
                    'project',
                    null,
                    databricksSecrets,
                ),
            ).rejects.toBeInstanceOf(FeatureNotEnabledError);
            expect(f.load).not.toHaveBeenCalled();
            for (const mock of Object.values(f.model))
                expect(mock).not.toHaveBeenCalled();
            expect(exchangeDatabricksOAuthCredentials).not.toHaveBeenCalled();
            expect(f.withWarehouseClient).not.toHaveBeenCalled();
        },
    );
    it.each([false, true])(
        'returns generation-bound status observations, parent view=%s',
        async (canView) => {
            const f = databricksFixture(true);
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
            const verification = {
                ok: true,
                principal: 'principal-uuid',
                observed: { currentUser: 'principal-uuid' },
                message: 'checked',
                checkedAt: new Date(),
            };
            f.model.getVerification.mockResolvedValue(verification);
            const status = await f.service.getStatus(
                f.account,
                'project',
                null,
            );
            expect(status).toMatchObject({
                verification,
                parent: {
                    projectUuid: 'parent',
                    projectName: canView ? 'Parent project' : null,
                    identityUuid: 'parent-generation',
                    principal: null,
                    verification,
                },
            });
            expect(f.model.getVerification).toHaveBeenNthCalledWith(
                1,
                'project',
                null,
                'generation-before',
            );
            expect(f.model.getVerification).toHaveBeenNthCalledWith(
                2,
                'parent',
                null,
                'parent-generation',
            );
            expect(JSON.stringify(status)).not.toContain('slot-secret');
            expect(exchangeDatabricksOAuthCredentials).not.toHaveBeenCalled();
        },
    );
    it('keeps BigQuery save responses unchanged and does not probe', async () => {
        const f = setup();
        expect(
            await f.service.upsert(f.account, 'project', null, input),
        ).toEqual({
            results: { uuid: 'slot', identityUuid: 'generation-after' },
        });
        expect(f.withWarehouseClient).not.toHaveBeenCalled();
        expect(f.model.getVerification).not.toHaveBeenCalled();
    });
});

describe('Snowflake slots', () => {
    const prepare = (inherited = false) => {
        const f = inherited ? previewFixture() : setup();
        f.load.mockResolvedValue({
            ...snowflakeSecrets,
            account: 'account',
            database: 'preview_db',
            schema: 'public',
            user: 'PERSON',
            role: 'PERSON_ROLE',
            warehouse: 'PERSON_WH',
        });
        f.model.getReplaceableSecrets.mockResolvedValue(snowflakeSecrets);
        f.model.getSecrets.mockImplementation(async (uuid: string) =>
            inherited && uuid !== 'parent'
                ? null
                : {
                      slot: { uuid: 'slot', identityUuid: 'tested-generation' },
                      secrets: snowflakeSecrets,
                  },
        );
        f.runQuery.mockResolvedValue({
            rows: [
                {
                    USER: 'OBSERVED_USER',
                    ROLE: 'OBSERVED_ROLE',
                },
            ],
        });
        return f;
    };
    it.each(['save', 'test_saved', 'test_submitted'] as const)(
        'requests agent job controls before the Snowflake %s probe SQL',
        async (operation) => {
            const f = prepare();
            f.runQuery.mockImplementation(async () => {
                expect(f.withWarehouseClient.mock.calls[0][0]).toMatchObject({
                    kind: 'bypass',
                    mode: 'connection_test',
                    agentSession: true,
                    clientOptions: { agentJobControls: true },
                });
                return {
                    rows: [{ USER: 'OBSERVED_USER', ROLE: 'OBSERVED_ROLE' }],
                };
            });
            if (operation === 'save') {
                await f.service.upsert(
                    f.account,
                    'project',
                    null,
                    snowflakeSecrets,
                );
            } else {
                await expect(
                    f.service.test(
                        f.account,
                        'project',
                        null,
                        operation === 'test_saved' ? null : snowflakeSecrets,
                    ),
                ).resolves.toMatchObject({ ok: true });
            }
            expect(f.runQuery).toHaveBeenCalledExactlyOnceWith(
                'SELECT CURRENT_USER() AS "user", CURRENT_ROLE() AS "role"',
                {},
            );
        },
    );
    it.each([
        { USER: 'OBSERVED_USER', ROLE: 'OBSERVED_ROLE' },
        { User: 'OBSERVED_USER', Role: 'OBSERVED_ROLE' },
    ])('probes before saving and returns observations from %j', async (row) => {
        const f = prepare();
        f.runQuery.mockImplementation(async () => {
            expect(f.model.upsert).not.toHaveBeenCalled();
            return { rows: [row] };
        });
        const result = await f.service.upsert(
            f.account,
            'project',
            null,
            snowflakeSecrets,
        );
        expect(result).toMatchObject({
            results: { uuid: 'slot' },
            verification: {
                principal: 'OBSERVED_USER',
                observed: snowflakeVerification.observed,
            },
        });
        expect(f.model.upsert).toHaveBeenCalledExactlyOnceWith(
            'project',
            null,
            snowflakeSecrets,
            f.account.user.id,
            result.verification,
        );
        expect(f.withWarehouseClient.mock.calls[0][0]).toMatchObject({
            kind: 'bypass',
            mode: 'connection_test',
            agentSession: true,
            credentials: { database: 'preview_db', ...snowflakeSecrets },
        });
        expect(f.runQuery).toHaveBeenCalledExactlyOnceWith(
            'SELECT CURRENT_USER() AS "user", CURRENT_ROLE() AS "role"',
            {},
        );
        expect(
            f.analytics.track.mock.calls.map(([event]) => event.event),
        ).toEqual([
            'agent_identity.service_account_tested',
            'agent_identity.service_account_saved',
        ]);
        expect(
            JSON.stringify([result, f.analytics.track.mock.calls]),
        ).not.toContain(snowflakeSecrets.privateKey);
    });
    it.each([
        {},
        { USER: 'USER' },
        { ROLE: 'ROLE' },
        { USER: 'USER', ROLE: ' ' },
    ])('does not save missing observations %j', async (row) => {
        const f = prepare();
        f.runQuery.mockResolvedValue({ rows: [row] });
        await expect(
            f.service.upsert(f.account, 'project', null, snowflakeSecrets),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(f.model.upsert).not.toHaveBeenCalled();
        expect(f.model.updateVerification).not.toHaveBeenCalled();
        expect(f.analytics.track).toHaveBeenCalledTimes(1);
    });
    it.each(['connection', 'query'])(
        'keeps the prior slot after %s failure and redacts the error',
        async (phase) => {
            const f = prepare();
            const error = new Error(snowflakeSecrets.privateKey);
            if (phase === 'connection')
                f.withWarehouseClient.mockRejectedValue(error);
            else f.runQuery.mockRejectedValue(error);
            await expect(
                f.service.upsert(f.account, 'project', null, snowflakeSecrets),
            ).rejects.toThrow('Could not verify');
            expect(f.model.upsert).not.toHaveBeenCalled();
            expect(f.model.updateVerification).not.toHaveBeenCalled();
            expect(f.analytics.track).toHaveBeenCalledTimes(1);
            expect(JSON.stringify(f.analytics.track.mock.calls)).not.toContain(
                snowflakeSecrets.privateKey,
            );
        },
    );
    it.each([false, true])(
        'updates only the effective saved generation, inherited=%s',
        async (inherited) => {
            const f = prepare(inherited);
            const result = await f.service.test(
                f.account,
                'project',
                null,
                null,
            );
            expect(f.model.updateVerification).toHaveBeenCalledExactlyOnceWith(
                inherited ? 'parent' : 'project',
                null,
                'tested-generation',
                result,
            );
            expect(f.model.upsert).not.toHaveBeenCalled();
        },
    );
    it('writes inherited extra-connection verification to the matching parent slot', async () => {
        const f = prepare(true);
        f.getExtra.mockResolvedValue({
            ...snowflakeSecrets,
            account: 'account',
            database: 'preview_db',
            schema: 'public',
        });
        f.getConnection.mockResolvedValue({
            isOriginal: false,
            name: 'Extra warehouse',
            warehouseType: WarehouseTypes.SNOWFLAKE,
        });
        f.listConnections.mockResolvedValue([
            {
                isOriginal: false,
                name: 'Extra warehouse',
                warehouseType: WarehouseTypes.SNOWFLAKE,
                warehouseConnectionUuid: 'parent-extra',
            },
        ]);
        const result = await f.service.test(
            f.account,
            'project',
            'extra',
            null,
        );
        expect(result.ok).toBe(true);
        expect(f.model.updateVerification).toHaveBeenCalledExactlyOnceWith(
            'parent',
            'parent-extra',
            'tested-generation',
            result,
        );
    });
    it('does not persist a submitted test', async () => {
        const f = prepare();
        await expect(
            f.service.test(f.account, 'project', null, snowflakeSecrets),
        ).resolves.toMatchObject({ ok: true });
        expect(f.model.updateVerification).not.toHaveBeenCalled();
        expect(f.model.upsert).not.toHaveBeenCalled();
    });
    it('keeps the last good observation after a failed saved test', async () => {
        const f = prepare();
        f.runQuery.mockRejectedValue(new Error('failed'));
        await expect(
            f.service.test(f.account, 'project', null, null),
        ).resolves.toMatchObject({ ok: false });
        expect(f.model.updateVerification).not.toHaveBeenCalled();
    });
    it.each([true, false])(
        'reports own Snowflake slot readability, readable=%s',
        async (readable) => {
            const f = prepare();
            f.model.getCredentialsReadable.mockResolvedValue(readable);
            const result = await f.service.getStatus(
                f.account,
                'project',
                null,
            );
            expect(result.credentialsReadable).toBe(readable);
            expect(result.verification).toBeNull();
            expect(
                f.model.getCredentialsReadable,
            ).toHaveBeenCalledExactlyOnceWith(
                'project',
                null,
                'generation-before',
            );
            expect(f.withWarehouseClient).not.toHaveBeenCalled();
            expect(JSON.stringify(result)).not.toContain(
                snowflakeSecrets.privateKey,
            );
        },
    );
    it.each([true, false])(
        'reports inherited Snowflake slot readability, readable=%s',
        async (readable) => {
            const f = prepare(true);
            f.model.getSlot.mockImplementation(async (uuid: string) =>
                uuid === 'parent'
                    ? { uuid: 'parent-slot', identityUuid: 'parent-generation' }
                    : null,
            );
            if (!readable)
                f.model.getSecrets.mockRejectedValue(
                    new Error('unreadable credentials'),
                );
            const result = await f.service.getStatus(
                f.account,
                'project',
                null,
            );
            expect(result.parent).toMatchObject({
                credentialsReadable: readable,
                verification: null,
                principal: null,
            });
            expect(f.withWarehouseClient).not.toHaveBeenCalled();
            expect(JSON.stringify(result)).not.toContain(
                snowflakeSecrets.privateKey,
            );
        },
    );
    it.each([false, true])(
        'projects verification without secrets or network calls, inherited=%s',
        async (inherited) => {
            const f = prepare(inherited);
            f.model.getVerification.mockResolvedValue(snowflakeVerification);
            const result = await f.service.getStatus(
                f.account,
                'project',
                null,
            );
            expect(result.verification).toEqual(snowflakeVerification);
            if (inherited)
                expect(result.parent).toMatchObject({
                    principal: null,
                    verification: snowflakeVerification,
                });
            expect(f.withWarehouseClient).not.toHaveBeenCalled();
            expect(JSON.stringify(result)).not.toContain(
                snowflakeSecrets.privateKey,
            );
        },
    );
});
