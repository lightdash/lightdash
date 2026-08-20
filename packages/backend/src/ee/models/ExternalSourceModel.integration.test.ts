import {
    DbtProjectType,
    DimensionType,
    ExternalSourceStatus,
    ExternalSourceType,
    ProjectType,
    SupportedDbtVersions,
} from '@lightdash/common';
import { type Knex } from 'knex';
import {
    ExternalSourceIngestAttemptsTableName,
    ExternalSourceObjectsTableName,
    ExternalSourcesTableName,
} from '../../database/entities/externalSources';
import { getTestContext } from '../../vitest.setup.integration';
import { ExternalSourceModel } from './ExternalSourceModel';

describe('ExternalSourceModel lifecycle integration', () => {
    let transaction: Knex.Transaction;
    let model: ExternalSourceModel;
    let organizationUuid: string;
    let projectUuid: string;
    let userUuid: string;

    beforeEach(async () => {
        transaction = await getTestContext().db.transaction();
        const [organization] = await transaction('organizations')
            .insert({ organization_name: 'External lifecycle test' })
            .returning(['organization_id', 'organization_uuid']);
        const [user] = await transaction('users')
            .insert({
                first_name: 'External',
                last_name: 'Lifecycle',
                is_marketing_opted_in: false,
                is_tracking_anonymized: false,
                is_setup_complete: true,
                is_active: true,
            })
            .returning('user_uuid');
        const [project] = await transaction('projects')
            .insert({
                name: 'External lifecycle test',
                organization_id: organization.organization_id,
                project_type: ProjectType.DEFAULT,
                dbt_connection_type: DbtProjectType.DBT,
                dbt_connection: null,
                copied_from_project_uuid: null,
                organization_warehouse_credentials_uuid: null,
                dbt_version: SupportedDbtVersions.V1_7,
                created_by_user_uuid: user.user_uuid,
            })
            .returning('project_uuid');
        organizationUuid = organization.organization_uuid;
        projectUuid = project.project_uuid;
        userUuid = user.user_uuid;
        model = new ExternalSourceModel({
            database: transaction,
            encryptionUtil: {
                encrypt: (value: string) => Buffer.from(value),
                decrypt: (value: Buffer) => value.toString(),
            } as never,
        });
    });

    afterEach(async () => transaction.rollback());

    const createSourceAndTable = async (suffix: string) => {
        const source = await model.createSource({
            projectUuid,
            type: ExternalSourceType.CSV,
            name: `lifecycle_${suffix}`,
            status: ExternalSourceStatus.STAGED,
            connection: {
                type: ExternalSourceType.CSV,
                originalFilename: 'input.csv',
            },
            createdByUserUuid: userUuid,
        });
        const table = await model.createTable({
            sourceUuid: source.sourceUuid,
            projectUuid,
            name: `lifecycle_${suffix}`,
            label: 'Lifecycle test',
        });
        return { source, table };
    };

    test('retries with a new lease token and publishes one generation atomically', async () => {
        const { source, table } = await createSourceAndTable(
            crypto.randomUUID(),
        );
        const attempt = await model.requestIngest({
            organizationUuid,
            projectUuid,
            sourceUuid: source.sourceUuid,
            tableUuid: table.tableUuid,
            requestedByUserUuid: userUuid,
            targetVersion: 1,
        });
        expect(
            (await model.getSource(projectUuid, source.sourceUuid)).status,
        ).toBe(ExternalSourceStatus.SYNCING);

        const firstLease = await model.claimIngestAttempt({
            attemptUuid: attempt.external_source_ingest_attempt_uuid,
            leaseMs: 60_000,
            maxConcurrentPerOrganization: 1,
        });
        expect(firstLease?.execution_uuid).toBeTruthy();
        await model.failIngestAttempt(
            attempt.external_source_ingest_attempt_uuid,
            'retry me',
        );
        const secondLease = await model.claimIngestAttempt({
            attemptUuid: attempt.external_source_ingest_attempt_uuid,
            leaseMs: 60_000,
            maxConcurrentPerOrganization: 1,
        });
        expect(secondLease?.execution_uuid).not.toBe(
            firstLease?.execution_uuid,
        );

        const recorded = await model.recordIngestOutput({
            attemptUuid: attempt.external_source_ingest_attempt_uuid,
            executionUuid: secondLease!.execution_uuid!,
            columns: {
                id: { reference: 'id', type: DimensionType.NUMBER },
            },
            locator: {
                storage: 's3',
                format: 'parquet',
                uri: 's3://bucket/external-sources/test.parquet',
            },
            rowCount: 2,
            totalBytes: 128,
        });
        expect(recorded).toBe(true);
        expect(
            await model.publishIngestAttempt({
                attemptUuid: attempt.external_source_ingest_attempt_uuid,
                executionUuid: secondLease!.execution_uuid!,
            }),
        ).toBe(true);

        const published = await model.getSource(projectUuid, source.sourceUuid);
        expect(published.status).toBe(ExternalSourceStatus.READY);
        expect(published.tables[0].version).toBe(1);
        expect(published.tables[0].rowCount).toBe(2);
    });

    test('enforces organization concurrency and retains manifests after deletion', async () => {
        const first = await createSourceAndTable(crypto.randomUUID());
        const second = await createSourceAndTable(crypto.randomUUID());
        const request = (sourceUuid: string, tableUuid: string) =>
            model.requestIngest({
                organizationUuid,
                projectUuid,
                sourceUuid,
                tableUuid,
                requestedByUserUuid: userUuid,
                targetVersion: 1,
            });
        const [firstAttempt, secondAttempt] = await Promise.all([
            request(first.source.sourceUuid, first.table.tableUuid),
            request(second.source.sourceUuid, second.table.tableUuid),
        ]);
        const firstLease = await model.claimIngestAttempt({
            attemptUuid: firstAttempt.external_source_ingest_attempt_uuid,
            leaseMs: 60_000,
            maxConcurrentPerOrganization: 1,
        });
        expect(firstLease).not.toBeNull();
        await model.failIngestAttempt(
            firstAttempt.external_source_ingest_attempt_uuid,
            'worker timed out',
            true,
        );
        expect(
            await model.claimIngestAttempt({
                attemptUuid: firstAttempt.external_source_ingest_attempt_uuid,
                leaseMs: 60_000,
                maxConcurrentPerOrganization: 1,
            }),
        ).toBeNull();
        expect(
            await model.claimIngestAttempt({
                attemptUuid: secondAttempt.external_source_ingest_attempt_uuid,
                leaseMs: 60_000,
                maxConcurrentPerOrganization: 1,
            }),
        ).toBeNull();

        const object = await model.registerObject({
            organizationUuid,
            projectUuid,
            sourceUuid: first.source.sourceUuid,
            attemptUuid: firstAttempt.external_source_ingest_attempt_uuid,
            key: `external-sources/${first.source.sourceUuid}/raw.csv`,
            purpose: 'raw',
            expectedBytes: 10,
            maxOrganizationBytes: 100,
        });
        await model.deleteSource(projectUuid, first.source.sourceUuid);

        const manifest = await transaction(ExternalSourceObjectsTableName)
            .where(
                'external_source_object_uuid',
                object.external_source_object_uuid,
            )
            .first();
        if (!manifest) throw new Error('Manifest was deleted');
        expect(manifest.status).toBe('pending_delete');
        expect(manifest.external_source_ingest_attempt_uuid).toBeNull();
        expect(
            await transaction(ExternalSourceIngestAttemptsTableName)
                .where(
                    'external_source_ingest_attempt_uuid',
                    firstAttempt.external_source_ingest_attempt_uuid,
                )
                .first(),
        ).toBeUndefined();

        const orphan = await model.registerObject({
            organizationUuid,
            projectUuid,
            sourceUuid: second.source.sourceUuid,
            attemptUuid: secondAttempt.external_source_ingest_attempt_uuid,
            key: `external-sources/${second.source.sourceUuid}/raw.csv`,
            purpose: 'raw',
            expectedBytes: 10,
            maxOrganizationBytes: 100,
        });
        await transaction(ExternalSourcesTableName)
            .where('external_source_uuid', second.source.sourceUuid)
            .delete();
        await model.prepareGarbageCollection({
            stagedBefore: new Date(0),
            uploadingBefore: new Date(0),
            limit: 10,
        });
        expect(
            await transaction(ExternalSourceObjectsTableName)
                .where(
                    'external_source_object_uuid',
                    orphan.external_source_object_uuid,
                )
                .first('status'),
        ).toEqual({ status: 'pending_delete' });
    });
});
