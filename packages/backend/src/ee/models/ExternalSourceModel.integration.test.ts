import {
    DbtProjectType,
    DimensionType,
    ExternalSourceScope,
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
import {
    AiPromptContextTableName,
    AiPromptTableName,
    AiThreadTableName,
} from '../database/entities/ai';
import {
    ExternalSourceModel,
    type ClaimExternalSourceIngestAttemptResult,
} from './ExternalSourceModel';

const getClaimedAttempt = (result: ClaimExternalSourceIngestAttemptResult) => {
    if (result.state !== 'claimed') {
        throw new Error(`Expected a claimed attempt, got ${result.state}`);
    }
    return result.attempt;
};

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

    const createSourceAndTable = async (
        suffix: string,
        scope = ExternalSourceScope.CATALOG,
    ) => {
        const source = await model.createSource({
            projectUuid,
            type: ExternalSourceType.CSV,
            scope,
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

        const firstLease = getClaimedAttempt(
            await model.claimIngestAttempt({
                attemptUuid: attempt.external_source_ingest_attempt_uuid,
                leaseMs: 60_000,
                maxConcurrentPerOrganization: 1,
            }),
        );
        expect(firstLease.execution_uuid).toBeTruthy();
        await model.failIngestAttempt(
            attempt.external_source_ingest_attempt_uuid,
            'retry me',
        );
        const secondLease = getClaimedAttempt(
            await model.claimIngestAttempt({
                attemptUuid: attempt.external_source_ingest_attempt_uuid,
                leaseMs: 60_000,
                maxConcurrentPerOrganization: 1,
            }),
        );
        expect(secondLease.execution_uuid).not.toBe(firstLease.execution_uuid);

        const recorded = await model.recordIngestOutput({
            attemptUuid: attempt.external_source_ingest_attempt_uuid,
            executionUuid: secondLease.execution_uuid!,
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

    test('lists catalog sources without hiding directly addressable attachments', async () => {
        const catalog = await createSourceAndTable(crypto.randomUUID());
        const attachment = await model.createSource({
            projectUuid,
            type: ExternalSourceType.CSV,
            scope: ExternalSourceScope.ATTACHMENT,
            name: `attachment_${crypto.randomUUID()}`,
            status: ExternalSourceStatus.STAGED,
            connection: {
                type: ExternalSourceType.CSV,
                originalFilename: 'attachment.csv',
            },
            createdByUserUuid: userUuid,
        });

        expect(
            await model.listSources(projectUuid, ExternalSourceScope.CATALOG),
        ).toEqual([
            expect.objectContaining({ sourceUuid: catalog.source.sourceUuid }),
        ]);
        expect(
            await model.getSource(projectUuid, attachment.sourceUuid),
        ).toEqual(
            expect.objectContaining({
                sourceUuid: attachment.sourceUuid,
                scope: ExternalSourceScope.ATTACHMENT,
            }),
        );
    });

    test('keeps attachment attempts invisible to legacy scheduler recovery', async () => {
        const { source, table } = await createSourceAndTable(
            crypto.randomUUID(),
            ExternalSourceScope.ATTACHMENT,
        );
        const attempt = await model.requestIngest({
            organizationUuid,
            projectUuid,
            sourceUuid: source.sourceUuid,
            tableUuid: table.tableUuid,
            requestedByUserUuid: userUuid,
            targetVersion: 1,
        });

        const legacyRecoveryLookup = () =>
            transaction(ExternalSourceIngestAttemptsTableName)
                .where(
                    'external_source_ingest_attempt_uuid',
                    attempt.external_source_ingest_attempt_uuid,
                )
                .whereIn('status', [
                    'queued',
                    'running',
                    'publishing',
                    'failed',
                ])
                .first();

        expect(attempt.status).toBe('attachment_queued');
        expect(await legacyRecoveryLookup()).toBeUndefined();
        expect(await model.listRecoverableAttempts(10)).toContainEqual(
            expect.objectContaining({
                external_source_ingest_attempt_uuid:
                    attempt.external_source_ingest_attempt_uuid,
            }),
        );

        const claimed = getClaimedAttempt(
            await model.claimIngestAttempt({
                attemptUuid: attempt.external_source_ingest_attempt_uuid,
                leaseMs: 60_000,
                maxConcurrentPerOrganization: 1,
            }),
        );
        expect(claimed.status).toBe('attachment_running');
        expect(await legacyRecoveryLookup()).toBeUndefined();

        await model.failIngestAttempt(
            attempt.external_source_ingest_attempt_uuid,
            'retry safely',
        );
        expect(
            (
                await model.getAttempt(
                    attempt.external_source_ingest_attempt_uuid,
                )
            )?.status,
        ).toBe('attachment_failed');
        expect(await legacyRecoveryLookup()).toBeUndefined();

        const retry = getClaimedAttempt(
            await model.claimIngestAttempt({
                attemptUuid: attempt.external_source_ingest_attempt_uuid,
                leaseMs: 60_000,
                maxConcurrentPerOrganization: 1,
            }),
        );
        expect(retry.status).toBe('attachment_running');
        expect(
            await model.recordIngestOutput({
                attemptUuid: attempt.external_source_ingest_attempt_uuid,
                executionUuid: retry.execution_uuid!,
                columns: {
                    id: { reference: 'id', type: DimensionType.NUMBER },
                },
                locator: {
                    storage: 's3',
                    format: 'parquet',
                    uri: 's3://bucket/external-sources/attachment.parquet',
                },
                rowCount: 1,
                totalBytes: 64,
            }),
        ).toBe(true);
        expect(
            (
                await model.getAttempt(
                    attempt.external_source_ingest_attempt_uuid,
                )
            )?.status,
        ).toBe('attachment_publishing');
        expect(
            await model.publishIngestAttempt({
                attemptUuid: attempt.external_source_ingest_attempt_uuid,
                executionUuid: retry!.execution_uuid!,
            }),
        ).toBe(true);
        expect(
            (
                await model.getAttempt(
                    attempt.external_source_ingest_attempt_uuid,
                )
            )?.status,
        ).toBe('attachment_succeeded');
        expect(await legacyRecoveryLookup()).toBeUndefined();
    });

    test('preserves attachments referenced by a prompt during cleanup', async () => {
        const unreferencedAttachment = await createSourceAndTable(
            crypto.randomUUID(),
            ExternalSourceScope.ATTACHMENT,
        );
        const referencedAttachment = await createSourceAndTable(
            crypto.randomUUID(),
            ExternalSourceScope.ATTACHMENT,
        );
        await createSourceAndTable(crypto.randomUUID());
        const [thread] = await transaction(AiThreadTableName)
            .insert({
                agent_uuid: null,
                organization_uuid: organizationUuid,
                project_uuid: projectUuid,
                created_from: 'web_app',
            })
            .returning('ai_thread_uuid');
        const [prompt] = await transaction(AiPromptTableName)
            .insert({
                ai_thread_uuid: thread.ai_thread_uuid,
                created_by_user_uuid: userUuid,
                prompt: 'Analyze this attachment',
            })
            .returning('ai_prompt_uuid');
        await transaction(AiPromptContextTableName).insert({
            ai_prompt_uuid: prompt.ai_prompt_uuid,
            entity_type: 'external_source',
            entity_uuid: referencedAttachment.source.sourceUuid,
        });

        expect(
            await model.listExpiredUnreferencedAttachments(
                new Date(Date.now() + 1_000),
                10,
            ),
        ).toEqual([
            {
                project_uuid: projectUuid,
                external_source_uuid: unreferencedAttachment.source.sourceUuid,
            },
        ]);
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
        expect(firstLease.state).toBe('claimed');
        await model.failIngestAttempt(
            firstAttempt.external_source_ingest_attempt_uuid,
            'worker timed out',
            true,
        );
        expect(
            (
                await model.claimIngestAttempt({
                    attemptUuid:
                        firstAttempt.external_source_ingest_attempt_uuid,
                    leaseMs: 60_000,
                    maxConcurrentPerOrganization: 1,
                })
            ).state,
        ).toBe('unavailable');
        expect(
            await model.claimIngestAttempt({
                attemptUuid: secondAttempt.external_source_ingest_attempt_uuid,
                leaseMs: 60_000,
                maxConcurrentPerOrganization: 1,
            }),
        ).toEqual({ state: 'capacity', attachment: false });

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
