import type express from 'express';
import { buildAccount } from '../services/ProjectService/ProjectService.mock';
import type { ServiceRepository } from '../services/ServiceRepository';
import { SqlRunnerController } from './sqlRunnerController';

describe('SqlRunnerController virtual views', () => {
    test('keeps the selected connection when it creates a virtual view', async () => {
        const createVirtualView = vi.fn().mockResolvedValue({
            name: 'orders_view',
        });
        const controller = new SqlRunnerController({
            getProjectService: () => ({ createVirtualView }),
        } as unknown as ServiceRepository);
        const account = buildAccount();
        const request = { account } as express.Request;
        const payload = {
            connectionUuid: 'connection-uuid',
            name: 'orders_view',
            label: 'Orders view',
            sql: 'select 1',
            columns: [],
            parameterValues: {},
        };

        await controller.createVirtualView('project-uuid', request, payload);

        expect(createVirtualView).toHaveBeenCalledWith(
            account,
            'project-uuid',
            payload,
        );
    });
});
