import { AgentCapability, DeploySessionStatus } from '@lightdash/common';
import { type Request } from 'express';
import { fromOauth } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { AgentConnectionGrantResourceResolver } from '../../auth/agentConnectionGrants/AgentConnectionGrantResourceResolver';
import { AgentConnectionGrantService } from '../../auth/agentConnectionGrants/AgentConnectionGrantService';
import { grantFixture } from '../../auth/agentConnectionGrants/grant.mock';
import { DeployService } from '../../services/DeployService';
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
        getAgentConnectionGrantService: () => ({
            assertRestOperation: vi.fn().mockResolvedValue([]),
        }),
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

it.each(
    ['addDeployBatch', 'finalizeDeploySession'].flatMap((operation) =>
        ['project', 'owner'].map((mismatch) => ({ operation, mismatch })),
    ),
)(
    '$operation refuses a mismatched $mismatch before any row mutation',
    async ({ operation, mismatch }) => {
        const grant = grantFixture();
        const account = fromOauth(
            defaultSessionUser,
            { accessToken: 'token', client: { id: grant.clientId } },
            null,
            {
                ...grant,
                revision: 1,
                approvedCapabilities: [AgentCapability.DeployUpload],
            },
        );
        const session = {
            projectUuid:
                mismatch === 'project'
                    ? 'other'
                    : grant.approvedProjectUuids[0],
            userUuid: mismatch === 'owner' ? 'other' : account.user.id,
            status: DeploySessionStatus.UPLOADING,
        };
        const original = { ...session };
        const model = {
            getSession: vi.fn().mockResolvedValue(session),
            updateStatus: vi.fn(async (_uuid, status) => {
                session.status = status;
            }),
            addBatch: vi.fn(),
        };
        const resolver = new AgentConnectionGrantResourceResolver({
            deploySessionModel: model,
            projectModel: {
                getUuidBySlug: vi
                    .fn()
                    .mockResolvedValue(grant.approvedProjectUuids[0]),
                getSummary: vi.fn().mockResolvedValue({
                    organizationUuid: account.organization.organizationUuid,
                }),
            },
            savedSqlModel: {} as never,
            savedChartModel: {} as never,
            dashboardModel: {} as never,
            schedulerModel: {} as never,
            queryHistoryModel: {} as never,
        });
        const guard = new AgentConnectionGrantService({
            model: {} as never,
            featureFlags: {} as never,
            resourceResolver: resolver,
        });
        const deploy = new DeployService({
            deploySessionModel: model as never,
            projectModel: {} as never,
            projectService: {} as never,
            schedulerClient: {} as never,
        });
        const add = vi.spyOn(deploy, 'addDeployBatch');
        const finalize = vi.spyOn(deploy, 'finalizeDeploy');
        const controller = new DeployController({
            getDeployService: () => deploy,
            getAgentConnectionGrantService: () => guard,
        } as unknown as ServiceRepository);
        const req = {
            account,
            query: {},
            method: 'POST',
            params: {
                projectUuid: grant.approvedProjectUuids[0],
                sessionUuid: 'session',
            },
            body: {},
            header: vi.fn(),
        } as unknown as Request;
        await expect(
            operation === 'addDeployBatch'
                ? controller.addDeployBatch(
                      req,
                      grant.approvedProjectUuids[0],
                      'session',
                      { explores: [], batchNumber: 1 },
                  )
                : controller.finalizeDeploySession(
                      req,
                      grant.approvedProjectUuids[0],
                      'session',
                      {},
                  ),
        ).rejects.toThrow(/deploy session/i);
        expect(session).toEqual(original);
        expect(model.updateStatus).not.toHaveBeenCalled();
        expect(model.addBatch).not.toHaveBeenCalled();
        expect(add).not.toHaveBeenCalled();
        expect(finalize).not.toHaveBeenCalled();
    },
);
