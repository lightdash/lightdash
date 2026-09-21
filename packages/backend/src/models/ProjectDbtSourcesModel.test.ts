import { DbtProjectType } from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import {
    ProjectDbtSourcesTableName,
    type DbProjectDbtSource,
} from '../database/entities/projectDbtSources';
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
    const schemaColumns = new Set<string>();

    beforeAll(() => {
        tracker = getTracker();
    });

    beforeEach(() => {
        schemaColumns.clear();
        tracker.on
            .any(({ sql }) => sql.includes('information_schema.columns'))
            .response(({ bindings }) =>
                schemaColumns.has(`${bindings[0]}.${bindings[1]}`),
            );
    });

    afterEach(() => {
        tracker.reset();
        vi.clearAllMocks();
    });

    it('separates a materialised primary source from additional sources', async () => {
        const primarySource: DbProjectDbtSource = {
            ...sources[0],
            project_dbt_source_uuid: '55555555-5555-4555-8555-555555555555',
            name: 'dbt_project',
            is_primary: true,
            precedence: 0,
        };
        tracker.on
            .select(ProjectDbtSourcesTableName)
            .responseOnce([primarySource, ...sources]);

        const result = await model.getSourcesWithPrimary(upstreamProjectUuid);

        expect(result.primarySource).toMatchObject({
            projectDbtSourceUuid: primarySource.project_dbt_source_uuid,
            name: 'dbt_project',
            isPrimary: true,
        });
        expect(result.additionalSources.map((source) => source.name)).toEqual([
            'finance_models',
            'marketing_models',
        ]);
    });

    it('keeps additional rows additional before primary materialisation', async () => {
        tracker.on.select(ProjectDbtSourcesTableName).responseOnce(sources);

        const result = await model.getSourcesWithPrimary(upstreamProjectUuid);

        expect(result.primarySource).toBeNull();
        expect(result.additionalSources).toHaveLength(2);
    });

    it('does not count a materialised primary as an additional source', async () => {
        tracker.on.select(ProjectDbtSourcesTableName).responseOnce([]);

        await expect(model.hasSources(upstreamProjectUuid)).resolves.toBe(
            false,
        );
        expect(tracker.history.select[0].bindings).toEqual([
            upstreamProjectUuid,
            false,
            1,
        ]);
    });

    describe('connection binding', () => {
        const createdRow: DbProjectDbtSource = {
            project_dbt_source_uuid: '66666666-6666-4666-8666-666666666666',
            project_uuid: upstreamProjectUuid,
            name: 'finance_models',
            is_primary: false,
            precedence: 1,
            dbt_connection_type: DbtProjectType.GITHUB,
            dbt_connection: null,
            warehouse_database: 'finance_database',
            warehouse_schema: null,
            created_at: createdAt,
            updated_at: updatedAt,
        };
        const createData = {
            name: 'finance_models',
            isPrimary: false,
            precedence: 1,
            dbtConnection: null,
            warehouseLocation: { database: 'finance_database', schema: null },
        };

        it('binds a created source to the sole active connection once the columns exist', async () => {
            schemaColumns.add('project_dbt_sources.connection_uuid');
            schemaColumns.add('project_dbt_sources.namespace_prefix');
            schemaColumns.add('warehouse_credentials.superseded_at');
            tracker.on
                .select(({ sql }) => sql.includes('warehouse_credentials'))
                .responseOnce([{ warehouse_credentials_uuid: 'conn-1' }]);
            tracker.on
                .insert(ProjectDbtSourcesTableName)
                .responseOnce([createdRow]);

            const created = await model.createSource(
                upstreamProjectUuid,
                createData,
            );

            expect(created.projectDbtSourceUuid).toBe(
                createdRow.project_dbt_source_uuid,
            );
            expect(tracker.history.insert).toHaveLength(1);
            expect(tracker.history.insert[0].sql).toContain('connection_uuid');
            expect(tracker.history.insert[0].sql).toContain('namespace_prefix');
            expect(tracker.history.insert[0].bindings).toEqual(
                expect.arrayContaining([
                    upstreamProjectUuid,
                    'conn-1',
                    'finance_models',
                ]),
            );
            expect(tracker.history.select[0].sql).toContain(
                '"warehouse_credentials"."superseded_at" is null',
            );
        });

        it('creates a source without the binding columns before the migration', async () => {
            tracker.on
                .insert(ProjectDbtSourcesTableName)
                .responseOnce([createdRow]);

            const created = await model.createSource(
                upstreamProjectUuid,
                createData,
            );

            expect(created.name).toBe('finance_models');
            expect(tracker.history.insert).toHaveLength(1);
            expect(tracker.history.insert[0].sql).not.toContain(
                'connection_uuid',
            );
            expect(tracker.history.insert[0].sql).not.toContain(
                'namespace_prefix',
            );
            expect(tracker.history.select).toHaveLength(0);
        });

        it('refuses to create a source when the project has two active connections', async () => {
            schemaColumns.add('project_dbt_sources.connection_uuid');
            schemaColumns.add('warehouse_credentials.superseded_at');
            tracker.on
                .select(({ sql }) => sql.includes('warehouse_credentials'))
                .responseOnce([
                    { warehouse_credentials_uuid: 'conn-1' },
                    { warehouse_credentials_uuid: 'conn-2' },
                ]);

            await expect(
                model.createSource(upstreamProjectUuid, createData),
            ).rejects.toThrow('exactly one active connection');
            expect(tracker.history.insert).toHaveLength(0);
        });

        it('binds copied sources to the target connection once the columns exist', async () => {
            schemaColumns.add('project_dbt_sources.connection_uuid');
            schemaColumns.add('project_dbt_sources.namespace_prefix');
            schemaColumns.add('warehouse_credentials.superseded_at');
            tracker.on
                .select(({ sql }) => sql.includes(ProjectDbtSourcesTableName))
                .responseOnce(
                    sources.map((source) => ({
                        ...source,
                        namespace_prefix: source.name,
                    })),
                );
            tracker.on
                .select(({ sql }) => sql.includes('warehouse_credentials'))
                .responseOnce([{ warehouse_credentials_uuid: 'conn-target' }]);
            tracker.on.insert(ProjectDbtSourcesTableName).responseOnce([]);

            await model.copySources(upstreamProjectUuid, previewProjectUuid);

            expect(tracker.history.insert).toHaveLength(1);
            const insert = tracker.history.insert[0];
            expect(insert.sql).toContain('connection_uuid');
            expect(insert.sql).toContain('namespace_prefix');
            expect(
                insert.bindings.filter((binding) => binding === 'conn-target'),
            ).toHaveLength(sources.length);
            expect(insert.bindings).toEqual(
                expect.arrayContaining([
                    previewProjectUuid,
                    'finance_models',
                    'marketing_models',
                ]),
            );
        });

        it('copies raw source configuration with new identities', async () => {
            tracker.on.select(ProjectDbtSourcesTableName).responseOnce(sources);
            tracker.on.insert(ProjectDbtSourcesTableName).responseOnce([]);

            await model.copySources(upstreamProjectUuid, previewProjectUuid);

            expect(tracker.history.select[0].bindings).toEqual([
                upstreamProjectUuid,
            ]);
            expect(tracker.history.insert[0].bindings).toEqual([
                githubCiphertext,
                DbtProjectType.GITHUB,
                false,
                'finance_models',
                2,
                previewProjectUuid,
                'finance_database',
                null,
                gitlabCiphertext,
                DbtProjectType.GITLAB,
                false,
                'marketing_models',
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

        it('refuses to copy sources into a project with two active connections', async () => {
            schemaColumns.add('project_dbt_sources.connection_uuid');
            schemaColumns.add('warehouse_credentials.superseded_at');
            tracker.on
                .select(({ sql }) => sql.includes(ProjectDbtSourcesTableName))
                .responseOnce(sources);
            tracker.on
                .select(({ sql }) => sql.includes('warehouse_credentials'))
                .responseOnce([
                    { warehouse_credentials_uuid: 'conn-1' },
                    { warehouse_credentials_uuid: 'conn-2' },
                ]);

            await expect(
                model.copySources(upstreamProjectUuid, previewProjectUuid),
            ).rejects.toThrow('exactly one active connection');
            expect(tracker.history.insert).toHaveLength(0);
        });
    });
});
