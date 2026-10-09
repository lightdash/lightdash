import { Ability } from '@casl/ability';
import {
    BigqueryAuthenticationType,
    ProjectType,
    WarehouseTypes,
    type PossibleAbilities,
} from '@lightdash/common';
import { type Request } from 'express';
import { buildAccount } from '../../auth/account/account.mock';
import { AiServiceAccountService } from '../../services/AiServiceAccountService/AiServiceAccountService';
import { type ServiceRepository } from '../../services/ServiceRepository';
import { AiServiceAccountController } from './AiServiceAccountController';

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
        it('rejects Snowflake connections', async () => {
            const f = setup(true);
            f.load.mockResolvedValue({ type: WarehouseTypes.SNOWFLAKE });
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

describe('testAccess route', () => {
    it('returns FeatureNotEnabledError before any credential work', async () => {
        const f = setup(false);
        await expect(
            f.controller.testAccess('project', f.req, {
                credentials: null,
                entryPoint: 'project_agent_identity_page',
            }),
        ).rejects.toMatchObject({
            statusCode: 403,
            data: { code: 'feature_not_enabled' },
        });
        expect(f.load).not.toHaveBeenCalled();
        expect(f.model.getSecrets).not.toHaveBeenCalled();
    });
    it('refuses a caller without project management permission', async () => {
        const f = setup(true);
        f.req.account!.user.ability = new Ability<PossibleAbilities>([]);
        await expect(
            f.controller.testAccess('project', f.req, {
                credentials: null,
                entryPoint: 'project_agent_identity_page',
            }),
        ).rejects.toMatchObject({ name: 'ForbiddenError' });
        expect(f.load).not.toHaveBeenCalled();
    });
    it('normalises an omitted connection and forwards the typed request', async () => {
        const testAccess = vi.fn().mockResolvedValue({ status: 'complete' });
        const controller = new AiServiceAccountController({
            getAiServiceAccountService: () => ({ testAccess }),
        } as unknown as ServiceRepository);
        const req = { account: buildAccount() } as Request;
        const request = {
            credentials: null,
            entryPoint: 'project_agent_identity_page',
        } as const;
        await expect(
            controller.testAccess('project', req, request),
        ).resolves.toEqual({ status: 'ok', results: { status: 'complete' } });
        expect(testAccess).toHaveBeenCalledWith(
            req.account,
            'project',
            null,
            request,
        );
    });
});

it('keeps the own slot as results and returns an explicit parent field', async () => {
    const f = setup(true);
    expect(await f.controller.get('project', f.req)).toEqual({
        status: 'ok',
        results: null,
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
            parent: {
                projectUuid: 'parent',
                projectName: 'Parent project',
                identityUuid: 'parent-generation',
                principal: null,
            },
        });
    },
);
