import { WarehouseTypes, type CliDeployMetadata } from '@lightdash/common';
import { type Request } from 'express';
import { fromSession } from '../../auth/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { type ServiceRepository } from '../../services/ServiceRepository';
import { DeployController } from './DeployController';

const metadata: CliDeployMetadata = {
    cliCapabilities: { dbtProjectIdentity: 1, dbtTargetLocation: 1 },
    dbtProjectName: 'example_project',
    dbtTarget: {
        type: WarehouseTypes.POSTGRES,
        database: 'example_database',
    },
};

const setup = () => {
    const setExplores = vi.fn();
    const finalizeDeploy = vi.fn();
    const addDeployBatch = vi.fn();
    const startDeploySession = vi.fn();
    const controller = new DeployController({
        getProjectService: () => ({ setExplores }),
        getDeployService: () => ({
            finalizeDeploy,
            addDeployBatch,
            startDeploySession,
        }),
    } as unknown as ServiceRepository);
    const req = {
        account: fromSession(defaultSessionUser),
        header: vi.fn().mockReturnValue('cli-1'),
    } as unknown as Request;
    return {
        controller,
        req,
        setExplores,
        finalizeDeploy,
        addDeployBatch,
        startDeploySession,
    };
};

it('passes identity for direct deploys without an inventory or a target override', async () => {
    const { controller, req, setExplores } = setup();
    await controller.deployExplores(req, 'project', {
        explores: [],
        complete: true,
        ...metadata,
    });
    expect(setExplores).toHaveBeenCalledWith(
        expect.anything(),
        'project',
        [],
        'cli-1',
        true,
        undefined,
        { ...metadata, sourceUuid: null, target: null },
    );
});

it('passes identity through staged start, batch, and finalization', async () => {
    const {
        controller,
        req,
        startDeploySession,
        addDeployBatch,
        finalizeDeploy,
    } = setup();
    await controller.startDeploySession(req, 'project', metadata);
    expect(startDeploySession).toHaveBeenCalledWith(
        req.account,
        'project',
        metadata,
    );
    await controller.addDeployBatch(req, 'project', 'session', {
        explores: [],
        batchNumber: 1,
        complete: true,
        ...metadata,
    });
    expect(addDeployBatch).toHaveBeenCalledWith(
        expect.anything(),
        'project',
        'session',
        [],
        1,
        true,
        metadata,
    );
    await controller.finalizeDeploySession(req, 'project', 'session', {
        ...metadata,
        dbtModelNames: ['orders'],
    });
    expect(finalizeDeploy).toHaveBeenCalledWith(
        expect.anything(),
        'project',
        'session',
        'cli-1',
        ['orders'],
        { ...metadata, sourceUuid: null, target: null },
    );
});

it.each(['direct', 'start', 'batch', 'finalize'])(
    'rejects invalid identity before dispatching %s',
    async (operation) => {
        const {
            controller,
            req,
            setExplores,
            startDeploySession,
            addDeployBatch,
            finalizeDeploy,
        } = setup();
        const body = {
            dbtProjectName: 'invalid-name',
            explores: [],
            complete: true,
            batchNumber: 1,
        };
        const run = () => {
            if (operation === 'direct')
                return controller.deployExplores(req, 'project', body);
            if (operation === 'start')
                return controller.startDeploySession(req, 'project', body);
            if (operation === 'batch')
                return controller.addDeployBatch(
                    req,
                    'project',
                    'session',
                    body,
                );
            return controller.finalizeDeploySession(
                req,
                'project',
                'session',
                body,
            );
        };
        await expect(run()).rejects.toThrow(
            'Invalid CLI deploy identity metadata',
        );
        for (const dispatch of [
            setExplores,
            startDeploySession,
            addDeployBatch,
            finalizeDeploy,
        ]) {
            expect(dispatch).not.toHaveBeenCalled();
        }
    },
);
