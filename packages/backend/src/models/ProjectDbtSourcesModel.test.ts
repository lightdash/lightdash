import { DbtProjectType } from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import {
    ProjectDbtSourcesTableName,
    type DbProjectDbtSource,
} from '../database/entities/projectDbtSources';
import { WarehouseCredentialTableName } from '../database/entities/warehouseCredentials';
import { type EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';
import { ProjectDbtSourcesModel } from './ProjectDbtSourcesModel';

describe('ProjectDbtSourcesModel', () => {
    const upstreamProjectUuid = '11111111-1111-4111-8111-111111111111';
    const previewProjectUuid = '22222222-2222-4222-8222-222222222222';
    const githubCiphertext = Buffer.from('github-source-ciphertext');
    const gitlabCiphertext = Buffer.from('gitlab-source-ciphertext');
    const createdAt = new Date('2026-08-01T10:00:00.000Z');
    const updatedAt = new Date('2026-08-02T11:00:00.000Z');
    const sources: DbProjectDbtSource[] = [
        {
            project_dbt_source_uuid: '33333333-3333-4333-8333-333333333333',
            project_uuid: upstreamProjectUuid,
            connection_uuid: '55555555-5555-4555-8555-555555555555',
            namespace_prefix: 'finance',
            name: 'finance_models',
            is_primary: false,
            precedence: 2,
            dbt_connection_type: DbtProjectType.GITHUB,
            dbt_connection: githubCiphertext,
            warehouse_database: 'finance_database',
            warehouse_schema: null,
            created_at: createdAt,
            updated_at: updatedAt,
        },
        {
            project_dbt_source_uuid: '44444444-4444-4444-8444-444444444444',
            project_uuid: upstreamProjectUuid,
            connection_uuid: '66666666-6666-4666-8666-666666666666',
            namespace_prefix: 'marketing',
            name: 'marketing_models',
            is_primary: false,
            precedence: 5,
            dbt_connection_type: DbtProjectType.GITLAB,
            dbt_connection: gitlabCiphertext,
            warehouse_database: null,
            warehouse_schema: 'marketing_schema',
            created_at: createdAt,
            updated_at: updatedAt,
        },
    ];
    const database = knex({ client: MockClient, dialect: 'pg' });
    const encryptionUtil = {
        encrypt: vi.fn(),
        decrypt: vi.fn(),
    } as unknown as EncryptionUtil;
    const model = new ProjectDbtSourcesModel({
        database: database as unknown as Knex,
        encryptionUtil,
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
        vi.clearAllMocks();
    });

    it('copies raw source configuration with new identities', async () => {
        tracker.on.select(ProjectDbtSourcesTableName).responseOnce(sources);
        tracker.on.insert(ProjectDbtSourcesTableName).responseOnce([]);

        await model.copySources(
            upstreamProjectUuid,
            previewProjectUuid,
            new Map([
                [
                    '55555555-5555-4555-8555-555555555555',
                    '99999999-9999-4999-8999-999999999991',
                ],
                [
                    '66666666-6666-4666-8666-666666666666',
                    '99999999-9999-4999-8999-999999999992',
                ],
            ]),
        );

        expect(tracker.history.select[0].bindings).toEqual([
            upstreamProjectUuid,
        ]);
        expect(tracker.history.insert[0].bindings).toEqual([
            '99999999-9999-4999-8999-999999999991',
            githubCiphertext,
            DbtProjectType.GITHUB,
            false,
            'finance_models',
            'finance',
            2,
            previewProjectUuid,
            'finance_database',
            null,
            '99999999-9999-4999-8999-999999999992',
            gitlabCiphertext,
            DbtProjectType.GITLAB,
            false,
            'marketing_models',
            'marketing',
            5,
            previewProjectUuid,
            null,
            'marketing_schema',
        ]);
        expect(tracker.history.insert[0].sql).not.toMatch(
            /project_dbt_source_uuid|created_at|updated_at/,
        );
        expect(encryptionUtil.decrypt).not.toHaveBeenCalled();
        expect(encryptionUtil.encrypt).not.toHaveBeenCalled();
    });

    it('refuses to bind a copied source to a connection outside the preview', async () => {
        tracker.on.select(ProjectDbtSourcesTableName).responseOnce(sources);
        tracker.on.insert(ProjectDbtSourcesTableName).responseOnce([]);

        await expect(
            model.copySources(
                upstreamProjectUuid,
                previewProjectUuid,
                new Map([
                    [
                        '55555555-5555-4555-8555-555555555555',
                        '99999999-9999-4999-8999-999999999991',
                    ],
                ]),
            ),
        ).rejects.toThrow(
            'The preview has no connection for dbt source "marketing_models"',
        );
        expect(tracker.history.insert).toHaveLength(0);
    });

    it('creates the primary source on the project dbt source identity', async () => {
        const primaryRow: DbProjectDbtSource = {
            ...sources[0],
            project_dbt_source_uuid: '77777777-7777-4777-8777-777777777777',
            project_uuid: previewProjectUuid,
            connection_uuid: '88888888-8888-4888-8888-888888888888',
            namespace_prefix: '',
            name: 'dbt_project',
            is_primary: true,
            precedence: 0,
            warehouse_database: null,
            warehouse_schema: null,
        };
        tracker.on
            .insert(ProjectDbtSourcesTableName)
            .responseOnce([primaryRow]);

        const created = await model.createPrimarySource(previewProjectUuid, {
            projectDbtSourceUuid: '77777777-7777-4777-8777-777777777777',
            connectionUuid: '88888888-8888-4888-8888-888888888888',
            name: 'dbt_project',
            dbtConnection: null,
        });

        expect(created.isPrimary).toBe(true);
        expect(created.precedence).toBe(0);
        expect(created.namespacePrefix).toBe('');
        const [insert] = tracker.history.insert;
        // The row carries the project's own dbt source uuid, as the binding
        // migration did for projects that predate it.
        expect(insert.sql).toMatch(/project_dbt_source_uuid/);
        expect(insert.bindings).toEqual(
            expect.arrayContaining([
                '77777777-7777-4777-8777-777777777777',
                '88888888-8888-4888-8888-888888888888',
                'dbt_project',
                true,
                0,
                '',
            ]),
        );
        // A repeated create must not raise: the project keeps the one it has.
        expect(insert.sql).toMatch(/on conflict .* do nothing/i);
        // No warehouse location on the primary; it follows the connection.
        expect(insert.bindings).toEqual(expect.arrayContaining([null]));
    it('binds copied sources to the preview connection identities', async () => {
        tracker.on.select(ProjectDbtSourcesTableName).responseOnce(sources);
        tracker.on.insert(ProjectDbtSourcesTableName).responseOnce([]);

        await model.copySources(
            upstreamProjectUuid,
            previewProjectUuid,
            new Map([
                [sources[0].connection_uuid, 'preview-finance-connection'],
                [sources[1].connection_uuid, 'preview-marketing-connection'],
            ]),
        );

        expect(tracker.history.insert[0].bindings).toContain(
            'preview-finance-connection',
        );
        expect(tracker.history.insert[0].bindings).toContain(
            'preview-marketing-connection',
        );
        expect(tracker.history.insert[0].bindings).not.toContain(
            sources[0].connection_uuid,
        );
    });

    it('checks that a live connection belongs to the project', async () => {
        tracker.on
            .select(WarehouseCredentialTableName)
            .responseOnce([
                { warehouse_credentials_uuid: sources[0].connection_uuid },
            ]);

        await expect(
            model.connectionBelongsToProject(
                upstreamProjectUuid,
                sources[0].connection_uuid,
            ),
        ).resolves.toBe(true);
        expect(tracker.history.select[0].bindings).toEqual([
            upstreamProjectUuid,
            sources[0].connection_uuid,
            1,
        ]);
    });
});
