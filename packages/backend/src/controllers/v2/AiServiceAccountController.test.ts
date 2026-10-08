import { Ability } from '@casl/ability';
import {
    BigqueryAuthenticationType,
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
        getSecrets: vi.fn().mockResolvedValue(input),
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
    const service = new AiServiceAccountService({
        featureFlagModel: { get: vi.fn().mockResolvedValue({ enabled }) },
        projectModel: {
            getSummary: vi.fn().mockResolvedValue({
                organizationUuid: account.organization.organizationUuid,
            }),
            getWarehouseCredentialsForBinding: load,
        },
        aiServiceAccountCredentialsModel: model,
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
