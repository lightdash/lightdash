import {
    MultipleConnectionsError,
    NotFoundError,
    WarehouseTypes,
    type CreatePostgresCredentials,
} from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { ConnectionModel } from './ConnectionModel';

const projectUuid = 'project-uuid';
const connectionUuid = 'connection-uuid';
const credentials: CreatePostgresCredentials = {
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

    test('reports the connection contract as applied when project uniqueness is absent', async () => {
        tracker.on.select('pg_constraint').response([]);

        await expect(model.contractApplied()).resolves.toBe(true);
    });

    test('reports the connection contract as pending while project uniqueness remains', async () => {
        tracker.on
            .select('pg_constraint')
            .response([{ conname: 'warehouse_credentials_project_id_unique' }]);

        await expect(model.contractApplied()).resolves.toBe(false);
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

    test('clears project ciphertext when an organization credential is attached', async () => {
        tracker.on.select(connectionQuery).response([connectionRow]);
        tracker.on
            .select(/organization_warehouse_credentials/)
            .response([{ warehouse_connection: encryptedCredentials }]);
        tracker.on.update(/warehouse_credentials/).response(1);

        await model.update(projectUuid, connectionUuid, {
            warehouseConnection: credentials,
            organizationWarehouseCredentialsUuid:
                'organization-credentials-uuid',
        });

        expect(tracker.history.update[0].sql).toContain(
            '"encrypted_credentials" = $5',
        );
        expect(tracker.history.update[0].bindings).toContain(null);
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

    test('takes the project advisory lock on the internal project id', async () => {
        tracker.on
            .select(/from "projects"/)
            .response([
                { project_id: 42, organization_uuid: 'organization-uuid' },
            ]);
        tracker.on.any(/pg_advisory_xact_lock/).response([]);

        await expect(model.lockProject(projectUuid)).resolves.toEqual({
            organizationUuid: 'organization-uuid',
        });

        const lock = tracker.history.all.find(({ sql }) =>
            sql.includes('pg_advisory_xact_lock'),
        );
        expect(lock?.bindings).toEqual([42]);
    });

    test('detects when the multi-connection contract is applied', async () => {
        tracker.on.select('pg_constraint').response([]);

        await expect(model.contractApplied()).resolves.toBe(true);
    });

    test('counts bound content and only includes in-flight queries', async () => {
        tracker.on.any(/information_schema/).response(undefined);
        tracker.on.select('cached_explore').response([{ count: '2' }]);
        tracker.on.select('saved_sql_versions').response([{ count: '1' }]);
        tracker.on.select('query_history').response([{ count: '4' }]);

        await expect(model.hasBoundContent(connectionUuid)).resolves.toEqual({
            cached_explore: 2,
            saved_sql_versions: 1,
            project_dbt_sources: 0,
            query_history: 4,
        });

        expect(
            tracker.history.all.some(({ sql }) =>
                sql.includes('from "project_dbt_sources"'),
            ),
        ).toBe(false);
        const queryHistory = tracker.history.all.find(({ sql }) =>
            sql.includes('from "query_history"'),
        );
        expect(queryHistory?.bindings).toEqual([
            connectionUuid,
            'pending',
            'queued',
            'executing',
            1,
        ]);
    });

    test('counts dbt sources when their connection column exists', async () => {
        tracker.on
            .any(/information_schema/)
            .response([{ column_name: 'connection_uuid' }]);
        tracker.on.select('cached_explore').response([{ count: '0' }]);
        tracker.on.select('saved_sql_versions').response([{ count: '0' }]);
        tracker.on.select('project_dbt_sources').response([{ count: '3' }]);
        tracker.on.select('query_history').response([{ count: '0' }]);

        await expect(
            model.hasBoundContent(connectionUuid),
        ).resolves.toMatchObject({
            project_dbt_sources: 3,
        });
    });
});
