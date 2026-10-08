import { Ability } from '@casl/ability';
import {
    BigqueryAuthenticationType,
    FeatureFlags,
    FeatureNotEnabledError,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    WarehouseTypes,
    type AiServiceAccountCredentialInput,
    type PossibleAbilities,
} from '@lightdash/common';
import { buildAccount } from '../../auth/account/account.mock';
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
        getSlot: vi.fn().mockResolvedValue({ uuid: 'slot' }),
        getSecrets: vi.fn().mockResolvedValue(secrets),
        getReplaceableSecrets: vi.fn().mockResolvedValue(secrets),
        upsert: vi.fn().mockResolvedValue({ uuid: 'slot' }),
        delete: vi.fn().mockResolvedValue(undefined),
    };
    const flag = vi.fn().mockResolvedValue({ enabled: true });
    const load = vi.fn().mockResolvedValue(connection);
    const getConnection = vi.fn().mockResolvedValue({ isOriginal: false });
    const getExtra = vi.fn().mockResolvedValue(connection);
    const runQuery = vi
        .fn()
        .mockResolvedValue({ rows: [{ principal: 'agent@example.com' }] });
    const withWarehouseClient = vi.fn(async (_ref, _context, callback) =>
        callback({ warehouseClient: { runQuery } }),
    );
    const service = new AiServiceAccountService({
        aiServiceAccountCredentialsModel: model,
        featureFlagModel: { get: flag },
        projectModel: {
            getSummary: vi.fn().mockResolvedValue({
                organizationUuid: account.organization.organizationUuid,
            }),
            getWarehouseCredentialsForBinding: load,
        },
        warehouseConnectionModel: {
            getProject: vi.fn().mockResolvedValue({ projectUuid: 'project' }),
            get: getConnection,
            getCredentials: getExtra,
        },
        projectService: { warehouseClientFactory: { withWarehouseClient } },
    } as unknown as ConstructorParameters<typeof AiServiceAccountService>[0]);
    return {
        account,
        model,
        flag,
        load,
        getConnection,
        getExtra,
        runQuery,
        withWarehouseClient,
        service,
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
    });
    it('refuses a non-manager', async () => {
        const f = setup();
        f.account.user.ability = new Ability<PossibleAbilities>([]);
        await expect(
            f.service[operation](f.account, 'project', null, input),
        ).rejects.toBeInstanceOf(ForbiddenError);
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
