import {
    MultipleConnectionsError,
    NotFoundError,
    WarehouseTypes,
} from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { ConnectionModel } from './ConnectionModel';

const projectUuid = 'project-uuid';
const connectionUuid = 'connection-uuid';
const credentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'localhost',
    user: 'postgres',
    password: 'password',
    port: 5432,
    dbname: 'analytics',
    schema: 'public',
};
const encryptedCredentials = Buffer.from(JSON.stringify(credentials));
const connectionRow = {
    warehouse_credentials_uuid: connectionUuid,
    name: 'Postgres',
    warehouse_type: WarehouseTypes.POSTGRES,
    organization_warehouse_credentials_uuid: null,
    list_all_databases: false,
    additional_databases: ['finance'],
    created_at: new Date('2026-09-17T12:00:00Z'),
    encrypted_credentials: encryptedCredentials,
    project_id: 1,
    organization_uuid: 'organization-uuid',
};
const connectionQuery = ({ sql }: { sql: string }) =>
    sql.includes('from "warehouse_credentials"');

describe('ConnectionModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const encryptionUtil = {
        encrypt: vi.fn((value: string) => Buffer.from(value)),
        decrypt: vi.fn((value: Buffer) => value.toString()),
    } as unknown as EncryptionUtil;
    const model = new ConnectionModel({ database, encryptionUtil });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
        vi.clearAllMocks();
    });

    test('lists live connections without credentials', async () => {
        tracker.on.select(connectionQuery).response([connectionRow]);

        await expect(model.listByProject(projectUuid)).resolves.toEqual([
            {
                connectionUuid,
                name: 'Postgres',
                warehouseType: WarehouseTypes.POSTGRES,
                organizationWarehouseCredentialsUuid: null,
                listAllDatabases: false,
                additionalDatabases: ['finance'],
                createdAt: connectionRow.created_at,
            },
        ]);
        expect(tracker.history.select[0].sql).toContain(
            '"warehouse_credentials"."superseded_at" is null',
        );
    });

    test('does not return a connection from another project', async () => {
        tracker.on.select(connectionQuery).response([]);

        await expect(
            model.getByUuid(projectUuid, connectionUuid),
        ).rejects.toBeInstanceOf(NotFoundError);
    });

    test('decrypts project-owned credentials and merges listing fields', async () => {
        tracker.on.select(connectionQuery).response([connectionRow]);

        await expect(
            model.getCredentials(projectUuid, connectionUuid),
        ).resolves.toEqual({
            ...credentials,
            listAllDatabases: false,
            additionalDatabases: ['finance'],
        });
    });

    test('loads organization credentials from the project organization', async () => {
        tracker.on.select(connectionQuery).response([
            {
                ...connectionRow,
                encrypted_credentials: null,
                organization_warehouse_credentials_uuid:
                    'organization-credentials-uuid',
                list_all_databases: true,
            },
        ]);
        tracker.on
            .select(/organization_warehouse_credentials/)
            .response([{ warehouse_connection: encryptedCredentials }]);

        await expect(
            model.getCredentials(projectUuid, connectionUuid),
        ).resolves.toEqual({
            ...credentials,
            listAllDatabases: true,
            additionalDatabases: ['finance'],
        });
        expect(tracker.history.select[1].bindings).toEqual(
            expect.arrayContaining([
                'organization-credentials-uuid',
                'organization-uuid',
            ]),
        );
    });

    test('resolves one live connection', async () => {
        tracker.on.select(connectionQuery).response([connectionRow]);

        await expect(model.resolveSole(projectUuid)).resolves.toMatchObject({
            connectionUuid,
        });
    });

    test('refuses a project without connections', async () => {
        tracker.on.select(connectionQuery).response([]);

        await expect(model.resolveSole(projectUuid)).rejects.toEqual(
            new NotFoundError(
                'Cannot find any warehouse credentials for project.',
            ),
        );
    });

    test('refuses an ambiguous project', async () => {
        tracker.on
            .select(connectionQuery)
            .response([
                connectionRow,
                { ...connectionRow, warehouse_credentials_uuid: 'second' },
            ]);

        await expect(model.resolveSole(projectUuid)).rejects.toBeInstanceOf(
            MultipleConnectionsError,
        );
    });
});
