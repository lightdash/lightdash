import {
    WarehouseTypes,
    type CreatePostgresCredentials,
} from '@lightdash/common';
import { fetchMiddlewares } from '@tsoa/runtime';
import express from 'express';
import { buildAccount } from '../services/ProjectService/ProjectService.mock';
import { type ServiceRepository } from '../services/ServiceRepository';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { ConnectionController } from './connectionController';

const projectUuid = 'project-uuid';
const connectionUuid = 'connection-uuid';
const connection = {
    connectionUuid,
    name: 'Analytics',
    warehouseType: WarehouseTypes.POSTGRES,
    organizationWarehouseCredentialsUuid: null,
    listAllDatabases: false,
    additionalDatabases: [],
    createdAt: new Date('2026-09-17T12:00:00Z'),
};
const warehouseConnection: CreatePostgresCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'localhost',
    user: 'postgres',
    password: 'password',
    port: 5432,
    dbname: 'analytics',
    schema: 'public',
};

const buildController = () => {
    const service = {
        listWithCapabilities: vi.fn().mockResolvedValue({
            connections: [connection],
            capabilities: { canAddConnection: true },
        }),
        get: vi.fn().mockResolvedValue({
            ...connection,
            warehouseConnection: {
                ...warehouseConnection,
                password: undefined,
            },
        }),
        create: vi.fn().mockResolvedValue(connection),
        update: vi.fn().mockResolvedValue(connection),
        rename: vi.fn().mockResolvedValue(connection),
        delete: vi.fn().mockResolvedValue(undefined),
    };
    const controller = new ConnectionController({
        getConnectionService: () => service,
    } as unknown as ServiceRepository);
    controller.setStatus = vi.fn();
    return { controller, service };
};

const request = {
    account: buildAccount(),
} as unknown as express.Request;

describe('ConnectionController', () => {
    test.each([
        'listConnections',
        'getConnection',
        'createConnection',
        'updateConnection',
        'renameConnection',
        'deleteConnection',
    ] as const)('%s requires session or API key authentication', (method) => {
        expect(
            fetchMiddlewares(ConnectionController.prototype[method]),
        ).toEqual([[allowApiKeyAuthentication, isAuthenticated]]);
    });

    test('returns list results and capabilities', async () => {
        const { controller, service } = buildController();

        await expect(
            controller.listConnections(projectUuid, request),
        ).resolves.toEqual({
            status: 'ok',
            results: {
                connections: [connection],
                capabilities: { canAddConnection: true },
            },
        });
        expect(service.listWithCapabilities).toHaveBeenCalledWith(
            request.account,
            projectUuid,
        );
    });

    test('forwards every mutation to the connection service', async () => {
        const { controller, service } = buildController();
        const createBody = { name: 'Analytics', warehouseConnection };
        const updateBody = { warehouseConnection };

        await controller.createConnection(projectUuid, createBody, request);
        await controller.updateConnection(
            projectUuid,
            connectionUuid,
            updateBody,
            request,
        );
        await controller.renameConnection(
            projectUuid,
            connectionUuid,
            { name: 'Renamed' },
            request,
        );
        await controller.deleteConnection(projectUuid, connectionUuid, request);

        expect(service.create).toHaveBeenCalledWith(
            request.account,
            projectUuid,
            createBody,
        );
        expect(service.update).toHaveBeenCalledWith(
            request.account,
            projectUuid,
            connectionUuid,
            updateBody,
        );
        expect(service.rename).toHaveBeenCalledWith(
            request.account,
            projectUuid,
            connectionUuid,
            'Renamed',
        );
        expect(service.delete).toHaveBeenCalledWith(
            request.account,
            projectUuid,
            connectionUuid,
        );
    });
});
