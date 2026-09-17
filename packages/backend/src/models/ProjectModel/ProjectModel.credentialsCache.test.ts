import {
    WarehouseTypes,
    type Connection,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import knex from 'knex';
import { MockClient } from 'knex-mock-client';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { ProjectModel } from './ProjectModel';

vi.hoisted(() => {
    vi.stubEnv('EXPERIMENTAL_CACHE', 'true');
});

type CredentialConnectionModel = {
    getByUuid: (
        projectUuid: string,
        connectionUuid: string,
    ) => Promise<Connection>;
    getCredentialsRevision: (
        projectUuid: string,
        connectionUuid: string,
    ) => Promise<string>;
    getCredentials: (
        projectUuid: string,
        connectionUuid: string,
    ) => Promise<CreateWarehouseCredentials>;
};

const connection = (connectionUuid: string): Connection => ({
    connectionUuid,
    name: connectionUuid,
    warehouseType: WarehouseTypes.POSTGRES,
    organizationWarehouseCredentialsUuid: null,
    listAllDatabases: false,
    additionalDatabases: [],
    createdAt: new Date('2026-09-17T12:00:00Z'),
});

const credentials = (database: string): CreateWarehouseCredentials => ({
    type: WarehouseTypes.POSTGRES,
    host: 'localhost',
    user: 'postgres',
    password: 'password',
    port: 5432,
    dbname: database,
    schema: 'public',
});

describe('ProjectModel warehouse credential cache', () => {
    afterAll(() => {
        vi.unstubAllEnvs();
    });

    const createModel = () => {
        const model = new ProjectModel({
            database: knex({ client: MockClient, dialect: 'pg' }),
            lightdashConfig: lightdashConfigMock,
            encryptionUtil: {} as EncryptionUtil,
        });
        const { connectionModel } = model as unknown as {
            connectionModel: CredentialConnectionModel;
        };
        return { model, connectionModel };
    };

    test('partitions cached credential objects by project and connection', async () => {
        const { model, connectionModel } = createModel();
        vi.spyOn(connectionModel, 'getByUuid').mockImplementation(
            async (_projectUuid, connectionUuid) => connection(connectionUuid),
        );
        vi.spyOn(connectionModel, 'getCredentialsRevision').mockImplementation(
            async (projectUuid, connectionUuid) =>
                `revision:${projectUuid}:${connectionUuid}`,
        );
        const getCredentials = vi
            .spyOn(connectionModel, 'getCredentials')
            .mockImplementation(async (projectUuid, connectionUuid) =>
                credentials(`${projectUuid}:${connectionUuid}`),
            );

        await expect(
            model.getWarehouseCredentialsForProject(
                'project-a',
                'connection-a',
            ),
        ).resolves.toMatchObject({ dbname: 'project-a:connection-a' });
        await expect(
            model.getWarehouseCredentialsForProject(
                'project-a',
                'connection-b',
            ),
        ).resolves.toMatchObject({ dbname: 'project-a:connection-b' });
        await expect(
            model.getWarehouseCredentialsForProject(
                'project-c',
                'connection-a',
            ),
        ).resolves.toMatchObject({ dbname: 'project-c:connection-a' });
        await model.getWarehouseCredentialsForProject(
            'project-a',
            'connection-a',
        );

        expect(getCredentials).toHaveBeenCalledTimes(3);
    });

    test('refreshes one cached object when its encrypted revision changes', async () => {
        const { model, connectionModel } = createModel();
        vi.spyOn(connectionModel, 'getByUuid').mockResolvedValue(
            connection('connection-c'),
        );
        vi.spyOn(connectionModel, 'getCredentialsRevision')
            .mockResolvedValueOnce('revision-1')
            .mockResolvedValueOnce('revision-2');
        const getCredentials = vi
            .spyOn(connectionModel, 'getCredentials')
            .mockResolvedValueOnce(credentials('before-change'))
            .mockResolvedValueOnce(credentials('after-change'));

        await expect(
            model.getWarehouseCredentialsForProject(
                'project-b',
                'connection-c',
            ),
        ).resolves.toMatchObject({ dbname: 'before-change' });
        await expect(
            model.getWarehouseCredentialsForProject(
                'project-b',
                'connection-c',
            ),
        ).resolves.toMatchObject({ dbname: 'after-change' });

        expect(getCredentials).toHaveBeenCalledTimes(2);
    });
});
