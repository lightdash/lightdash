import { Ability } from '@casl/ability';
import {
    BigqueryAuthenticationType,
    DatabricksAuthenticationType,
    ProjectType,
    WarehouseTypes,
    type PossibleAbilities,
} from '@lightdash/common';
import { exchangeDatabricksOAuthCredentials } from '@lightdash/warehouses';
import { type Request } from 'express';
import { buildAccount } from '../../auth/account/account.mock';
import {
    athenaSecrets,
    athenaVerification,
    snowflakeSecrets,
    snowflakeVerification,
} from '../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel.mock';
import { AiServiceAccountService } from '../../services/AiServiceAccountService/AiServiceAccountService';
import { type ServiceRepository } from '../../services/ServiceRepository';
import { AiServiceAccountController } from './AiServiceAccountController';

vi.mock('@lightdash/warehouses', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@lightdash/warehouses')>()),
    exchangeDatabricksOAuthCredentials: vi.fn(),
}));

const input = {
    type: WarehouseTypes.BIGQUERY,
    authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
    keyfileContents: {
        type: 'service_account',
        private_key: 'key',
        client_email: 'agent@example.com',
    },
} as const;
const setup = (enabled: boolean) => {
    const account = buildAccount();
    account.user.ability = new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'Project' },
    ]);
    const model = {
        getSlot: vi.fn().mockResolvedValue(null),
        getSecrets: vi.fn().mockResolvedValue({
            slot: { uuid: 'slot', identityUuid: 'generation' },
            secrets: input,
        }),
        getReplaceableSecrets: vi.fn().mockResolvedValue(input),
        upsert: vi.fn().mockResolvedValue({ uuid: 'slot' }),
        delete: vi.fn(),
        getVerification: vi.fn().mockResolvedValue(null),
        updateVerification: vi.fn(),
    };
    const load = vi.fn().mockResolvedValue({
        ...input,
        account: 'host',
        database: 'db',
        schema: 'schema',
        warehouse: 'compute',
    });
    const getSummary = vi.fn().mockResolvedValue({
        organizationUuid: account.organization.organizationUuid,
    });
    const service = new AiServiceAccountService({
        featureFlagModel: { get: vi.fn().mockResolvedValue({ enabled }) },
        projectModel: {
            getSummary,
            getWarehouseCredentialsForBinding: load,
        },
        aiServiceAccountCredentialsModel: model,
        warehouseConnectionModel: {
            getProject: vi.fn().mockResolvedValue({ projectUuid: 'project' }),
            list: vi.fn().mockResolvedValue([]),
        },
        projectService: {
            warehouseClientFactory: {
                withWarehouseClient: vi
                    .fn()
                    .mockResolvedValue({ rows: [{ principal: 'agent' }] }),
            },
        },
    } as unknown as ConstructorParameters<typeof AiServiceAccountService>[0]);
    return {
        controller: new AiServiceAccountController({
            getAiServiceAccountService: () => service,
        } as unknown as ServiceRepository),
        req: { account } as Request,
        model,
        load,
        getSummary,
    };
};

describe.each(['get', 'upsert', 'delete', 'test'] as const)(
    '%s slot route',
    (route) => {
        const call = ({ controller, req }: ReturnType<typeof setup>) => {
            if (route === 'upsert')
                return controller.upsert('project', req, input);
            if (route === 'test')
                return controller.test('project', req, { credentials: null });
            return controller[route]('project', req);
        };
        it('returns a typed 403 while disabled', async () => {
            const f = setup(false);
            await expect(call(f)).rejects.toMatchObject({
                statusCode: 403,
                data: { code: 'feature_not_enabled' },
            });
            expect(f.load).not.toHaveBeenCalled();
            Object.values(f.model).forEach((mock) =>
                expect(mock).not.toHaveBeenCalled(),
            );
        });
        it('rejects unsupported connections', async () => {
            const f = setup(true);
            f.load.mockResolvedValue({ type: WarehouseTypes.POSTGRES });
            await expect(call(f)).rejects.toMatchObject({
                name: 'ParameterError',
            });
            Object.values(f.model).forEach((mock) =>
                expect(mock).not.toHaveBeenCalled(),
            );
        });
        it('returns an API envelope while enabled', async () => {
            await expect(call(setup(true))).resolves.toMatchObject({
                status: 'ok',
            });
        });
    },
);

it('keeps the own slot as results and returns an explicit parent field', async () => {
    const f = setup(true);
    expect(await f.controller.get('project', f.req)).toEqual({
        status: 'ok',
        results: null,
        credentialsReadable: false,
        parent: null,
    });
});

it.each([true, false])(
    'returns a successful status with an unreadable parent and own slot=%s',
    async (hasOwnSlot) => {
        const f = setup(true);
        const ownSlot = hasOwnSlot ? { uuid: 'slot' } : null;
        f.getSummary.mockImplementation(async (uuid: string) => ({
            organizationUuid: f.req.account!.organization.organizationUuid,
            type:
                uuid === 'project' ? ProjectType.PREVIEW : ProjectType.DEFAULT,
            upstreamProjectUuid: uuid === 'project' ? 'parent' : null,
            name: 'Parent project',
        }));
        f.model.getSlot.mockImplementation(async (uuid: string) =>
            uuid === 'parent'
                ? { uuid: 'parent-slot', identityUuid: 'parent-generation' }
                : ownSlot,
        );
        f.model.getSecrets.mockRejectedValue(new Error('unreadable key'));
        await expect(f.controller.get('project', f.req)).resolves.toEqual({
            status: 'ok',
            results: ownSlot,
            credentialsReadable: ownSlot !== null,
            parent: {
                credentialsReadable: false,
                projectUuid: 'parent',
                projectName: 'Parent project',
                identityUuid: 'parent-generation',
                principal: null,
            },
        });
    },
);

const databricksInput = {
    type: WarehouseTypes.DATABRICKS,
    authenticationType: DatabricksAuthenticationType.OAUTH_M2M,
    oauthClientId: 'id',
    oauthClientSecret: 'secret',
} as const;
test.each(['get', 'upsert', 'delete', 'test'] as const)(
    'gates the Databricks %s endpoint before reading or exchanging secrets',
    async (route) => {
        const f = setup(false);
        vi.mocked(exchangeDatabricksOAuthCredentials).mockClear();
        f.load.mockResolvedValue({
            ...databricksInput,
            database: 'schema',
            serverHostName: 'workspace.example.com',
            httpPath: '/sql/warehouse',
        });
        let result;
        if (route === 'upsert')
            result = f.controller.upsert('project', f.req, databricksInput);
        else if (route === 'test')
            result = f.controller.test('project', f.req, {
                credentials: databricksInput,
            });
        else result = f.controller[route]('project', f.req);
        await expect(result).rejects.toMatchObject({ statusCode: 403 });
        expect(f.load).not.toHaveBeenCalled();
        for (const mock of Object.values(f.model))
            expect(mock).not.toHaveBeenCalled();
        expect(exchangeDatabricksOAuthCredentials).not.toHaveBeenCalled();
    },
);
test('returns Databricks save verification beside metadata without credentials', async () => {
    const f = setup(true);
    f.load.mockResolvedValue({
        ...databricksInput,
        database: 'schema',
        serverHostName: 'workspace.example.com',
        httpPath: '/sql/warehouse',
    });
    vi.mocked(exchangeDatabricksOAuthCredentials).mockResolvedValue({
        accessToken: 'minted-token',
    });
    const response = await f.controller.upsert(
        'project',
        f.req,
        databricksInput,
    );
    expect(response).toEqual({
        status: 'ok',
        results: { uuid: 'slot' },
        verification: {
            ok: true,
            principal: 'agent',
            observed: { currentUser: 'agent' },
            message: 'AI service account connection checked.',
            checkedAt: expect.any(Date),
        },
    });
    expect(JSON.stringify(response)).not.toMatch(
        /oauthClient|secret|minted-token/,
    );
});

it.each([undefined, 'extra-connection'])(
    'returns Snowflake save observations and routes connection %s',
    async (connection) => {
        const upsert = vi.fn().mockResolvedValue({
            results: { uuid: 'slot' },
            verification: snowflakeVerification,
        });
        const getStatus = vi.fn().mockResolvedValue({
            results: { uuid: 'slot' },
            parent: null,
            verification: snowflakeVerification,
        });
        const controller = new AiServiceAccountController({
            getAiServiceAccountService: () => ({ upsert, getStatus }),
        } as unknown as ServiceRepository);
        const req = { account: buildAccount() } as Request;
        expect(
            await controller.upsert(
                'project',
                req,
                snowflakeSecrets,
                connection,
            ),
        ).toEqual({
            status: 'ok',
            results: { uuid: 'slot' },
            verification: snowflakeVerification,
        });
        expect(upsert).toHaveBeenCalledExactlyOnceWith(
            req.account,
            'project',
            connection ?? null,
            snowflakeSecrets,
        );
        expect(await controller.get('project', req, connection)).toEqual({
            status: 'ok',
            results: { uuid: 'slot' },
            parent: null,
            verification: snowflakeVerification,
        });
        expect(getStatus).toHaveBeenCalledExactlyOnceWith(
            req.account,
            'project',
            connection ?? null,
        );
    },
);

it.each([undefined, 'extra-connection'])(
    'returns Athena save observations and routes connection %s',
    async (connection) => {
        const upsert = vi.fn().mockResolvedValue({
            results: { uuid: 'slot' },
            verification: athenaVerification,
        });
        const getStatus = vi.fn().mockResolvedValue({
            results: { uuid: 'slot' },
            parent: null,
            verification: athenaVerification,
        });
        const controller = new AiServiceAccountController({
            getAiServiceAccountService: () => ({ upsert, getStatus }),
        } as unknown as ServiceRepository);
        const req = { account: buildAccount() } as Request;
        expect(
            await controller.upsert('project', req, athenaSecrets, connection),
        ).toEqual({
            status: 'ok',
            results: { uuid: 'slot' },
            verification: athenaVerification,
        });
        expect(upsert).toHaveBeenCalledExactlyOnceWith(
            req.account,
            'project',
            connection ?? null,
            athenaSecrets,
        );
        expect(await controller.get('project', req, connection)).toEqual({
            status: 'ok',
            results: { uuid: 'slot' },
            parent: null,
            verification: athenaVerification,
        });
        expect(getStatus).toHaveBeenCalledExactlyOnceWith(
            req.account,
            'project',
            connection ?? null,
        );
    },
);
