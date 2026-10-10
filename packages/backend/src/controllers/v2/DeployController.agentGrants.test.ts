import { AgentCapability } from '@lightdash/common';
import { type Request } from 'express';
import { fromOauth } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { grantFixture } from '../../auth/agentConnectionGrants/grant.mock';
import { type ServiceRepository } from '../../services/ServiceRepository';
import { DeployController } from './DeployController';

const setup = () => {
    const grant = grantFixture();
    const account = fromOauth(
        defaultSessionUser,
        { accessToken: 'token', client: { id: 'client' } },
        null,
        { ...grant, revision: 1 },
    );
    const dispatch = vi.fn().mockResolvedValue({});
    const controller = new DeployController({
        getProjectService: () => ({ setExplores: dispatch }),
        getDeployService: () => ({
            startDeploySession: dispatch,
            addDeployBatch: dispatch,
            finalizeDeploy: dispatch,
        }),
    } as unknown as ServiceRepository);
    const req = { account, header: vi.fn() } as unknown as Request;
    const body = {
        explores: [],
        complete: true,
        dbtModelNames: [],
        batchNumber: 1,
    };
    const call = (
        operation: string,
        project = grant.approvedProjectUuids[0],
        overrides = {},
    ) => {
        if (operation === 'deployExplores')
            return controller.deployExplores(req, project, {
                ...body,
                ...overrides,
            });
        if (operation === 'startDeploySession')
            return controller.startDeploySession(req, project);
        if (operation === 'addDeployBatch')
            return controller.addDeployBatch(req, project, 'session', {
                ...body,
                ...overrides,
            });
        return controller.finalizeDeploySession(req, project, 'session', {
            ...body,
            ...overrides,
        });
    };
    return { call, grant, account, dispatch };
};
it.each([
    'deployExplores',
    'startDeploySession',
    'addDeployBatch',
    'finalizeDeploySession',
])(
    '%s requires deploy capability and an approved project',
    async (operation) => {
        const { call, account, dispatch } = setup();
        await expect(call(operation)).rejects.toThrow('Deploy');
        account.authentication.agentConnectionGrant!.approvedCapabilities = [
            AgentCapability.DeployUpload,
        ];
        await expect(call(operation, 'other')).rejects.toThrow('project');
        expect(dispatch).not.toHaveBeenCalled();
        await expect(call(operation)).resolves.toMatchObject({ status: 'ok' });
        expect(dispatch).toHaveBeenCalledOnce();
    },
);
it.each(['deployExplores', 'addDeployBatch', 'finalizeDeploySession'])(
    '%s denies source and target overrides',
    async (operation) => {
        const { call, account, dispatch } = setup();
        account.authentication.agentConnectionGrant!.approvedCapabilities = [
            AgentCapability.DeployUpload,
        ];
        await Promise.all(
            [
                { sourceUuid: 'source' },
                { target: { database: 'database' } },
                { target: {} },
            ].map((overrides) =>
                expect(call(operation, undefined, overrides)).rejects.toThrow(
                    'override',
                ),
            ),
        );
        expect(dispatch).not.toHaveBeenCalled();
    },
);
it('keeps unbound deploy behavior', async () => {
    const { call, account, dispatch } = setup();
    account.authentication.agentConnectionGrant = null;
    await expect(
        call('deployExplores', 'other', {
            sourceUuid: 'source',
            target: { database: 'database' },
        }),
    ).resolves.toMatchObject({ status: 'ok' });
    expect(dispatch).toHaveBeenCalledOnce();
});
