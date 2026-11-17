import { type Knex } from 'knex';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { ProjectModelDocumentModel } from '../../../ee/models/ProjectModelDocumentModel';
import { saveMaterializationPolicies } from '../../../ee/services/SemanticStudioService/materializationPublish';
import {
    ModelMaterializationModel,
    type MaterializationBuildIntent,
} from '../../../models/ModelMaterializationModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { validExplore } from '../../../services/ProjectService/ProjectService.mock';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import {
    up as createConfigs,
    down as dropConfigs,
} from '../20261118120000_create_model_materialization_configs';
import {
    up as createGenerations,
    down as dropGenerations,
} from '../20261118120100_create_model_materialization_generations';
import {
    createMigratedTestDatabase,
    type MigratedTestDatabase,
} from './migratedTestDatabase';

describe('Model materialization persistence', () => {
    let migrated: MigratedTestDatabase;
    let db: Knex;
    let model: ModelMaterializationModel;
    let organizationId: number;

    beforeAll(async () => {
        migrated = await createMigratedTestDatabase('materializations', {
            edition: 'community',
        });
        db = migrated.database;
        model = new ModelMaterializationModel({ database: db });
        const [organization] = await db('organizations')
            .insert({ organization_name: 'test' })
            .returning('organization_id');
        organizationId = organization.organization_id;
    });
    afterAll(async () => migrated?.destroy());

    async function fixture() {
        const {
            rows: [{ project_uuid: projectUuid }],
        } = await db.raw<{ rows: { project_uuid: string }[] }>(
            'INSERT INTO projects (name, organization_id) VALUES (?, ?) RETURNING project_uuid',
            ['test', organizationId],
        );
        const [set] = await db('project_model_change_sets')
            .insert({
                project_uuid: projectUuid,
                kind: 'draft',
                prompt_uuid: null,
                created_by_user_uuid: null,
                created_at: db.fn.now(),
            })
            .returning('project_model_change_set_uuid');
        const [doc] = await db('project_model_documents')
            .insert({
                project_uuid: projectUuid,
                name: 'orders',
                document_version: 1,
                content: 'payload',
            })
            .returning('project_model_document_uuid');
        const [revision] = await db('project_model_revisions')
            .insert({
                project_model_change_set_uuid:
                    set.project_model_change_set_uuid,
                name: 'orders',
                document_version: 1,
                content_after: 'payload',
                content_before: null,
            })
            .returning('project_model_revision_uuid');
        return {
            documentUuid: doc.project_model_document_uuid,
            revisionUuid: revision.project_model_revision_uuid,
            buildFingerprint: 'build',
            compatibilityFingerprint: 'schema',
            maxRows: 10,
            cron: null,
            onChange: true,
            timezone: 'UTC',
        };
    }

    async function publish() {
        const config = await fixture();
        const intent = await db.transaction((trx) =>
            ModelMaterializationModel.recordIntent(trx, config),
        );
        if (!intent) throw new Error('Expected an intent');
        return { config, intent };
    }
    async function claim(intent: MaterializationBuildIntent) {
        const result = await model.claim(intent);
        if (result.status !== 'claimed')
            throw new Error('Expected a new attempt');
        return result.attempt;
    }
    const verified = {
        nativeSchema: [
            {
                name: 'amount',
                dataTypeID: 20,
                dataTypeModifier: -1,
                duckdbType: 'BIGINT',
            },
        ],
        rowCount: 1,
        byteCount: 128,
        sourceReadAt: new Date(),
    };

    test('both migrations reverse and reapply', async () => {
        await db.transaction(dropGenerations);
        await db.transaction(dropConfigs);
        expect(
            await db.schema.hasTable('model_materialization_generations'),
        ).toBe(false);
        expect(await db.schema.hasTable('model_materialization_configs')).toBe(
            false,
        );
        await db.transaction(createConfigs);
        await db.transaction(createGenerations);
        expect(
            await db.schema.hasTable('model_materialization_generations'),
        ).toBe(true);
    });

    test('rollback discards intent and a replay has one config', async () => {
        const config = await fixture();
        await expect(
            db.transaction(async (trx) => {
                await ModelMaterializationModel.recordIntent(trx, config);
                throw new Error('Rollback');
            }),
        ).rejects.toThrow('Rollback');
        expect(
            await db('model_materialization_configs').where(
                'document_uuid',
                config.documentUuid,
            ),
        ).toHaveLength(0);
        const write = () =>
            db.transaction((trx) =>
                ModelMaterializationModel.recordIntent(trx, config),
            );
        expect(await write()).toEqual(await write());
        expect(
            await db('model_materialization_configs').where(
                'document_uuid',
                config.documentUuid,
            ),
        ).toHaveLength(1);
    });

    test('Publish exposes the document, explore, intent and durable job together', async () => {
        const documents = new ProjectModelDocumentModel({ database: db });
        const {
            rows: [{ project_uuid: projectUuid }],
        } = await db.raw<{ rows: { project_uuid: string }[] }>(
            'INSERT INTO projects(name,organization_id) VALUES (?,?) RETURNING project_uuid',
            ['test', organizationId],
        );
        const {
            rows: [{ user_uuid: userUuid }],
        } = await db.raw<{ rows: { user_uuid: string }[] }>(
            'INSERT INTO users(first_name,last_name) VALUES (?,?) RETURNING user_uuid',
            ['', ''],
        );
        const content =
            'type: model\nname: orders\nsql_from: raw.orders\ndimensions: []\nmaterialize: {max_rows: 10}\n';
        const visible = async () =>
            Promise.all([
                documents
                    .findDocuments(projectUuid)
                    .then((rows) => rows.length),
                db('cached_explore')
                    .where('project_uuid', projectUuid)
                    .then((rows) => rows.length),
                db('model_materialization_configs')
                    .join(
                        'project_model_documents',
                        'document_uuid',
                        'project_model_document_uuid',
                    )
                    .where('project_uuid', projectUuid)
                    .then((rows) => rows.length),
                db('graphile_worker.jobs')
                    .where('task_identifier', 'materializeModel')
                    .then((rows) => rows.length),
            ]);
        const deploy = (rollback: boolean) =>
            documents.publishWithExplores(
                {
                    projectUuid,
                    userUuid,
                    workspaceUuid: null,
                    readVersions: new Map(),
                    documents: [{ name: 'orders', content }],
                    source: { kind: 'undo', reverts: [] },
                },
                (write) =>
                    db.transaction(async (trx) => {
                        await write(trx);
                        await trx('cached_explore').insert({
                            project_uuid: projectUuid,
                            name: 'orders',
                            table_names: ['orders'],
                            explore: { name: 'orders' },
                        });
                        expect(await visible()).toEqual([0, 0, 0, 0]);
                        if (rollback) throw new Error('Deploy failed');
                    }),
                (trx, changeSetUuid) =>
                    saveMaterializationPolicies(
                        trx,
                        projectUuid,
                        changeSetUuid,
                        userUuid,
                    ),
            );
        await expect(deploy(true)).rejects.toThrow('Deploy failed');
        expect(await visible()).toEqual([0, 0, 0, 0]);
        await deploy(false);
        expect(await visible()).toEqual([1, 1, 1, 1]);
        const config = await db('model_materialization_configs')
            .join(
                'project_model_documents',
                'document_uuid',
                'project_model_document_uuid',
            )
            .where('project_uuid', projectUuid)
            .first();
        const job = await db('graphile_worker.jobs')
            .where('task_identifier', 'materializeModel')
            .first('key');
        expect(job.key).toBe(
            `model-materialization:${config.config_uuid}:${config.desired_revision_uuid}:${config.policy_epoch}`,
        );
        const attempt = await claim({
            configUuid: config.config_uuid,
            revisionUuid: config.desired_revision_uuid,
            policyEpoch: config.policy_epoch,
        });
        expect(attempt.content).toBe(content);
    });

    test.each(['replace', 'delete'])(
        'a concurrent live writer can finish before a materialized %s',
        async (operation) => {
            const { documentUuid } = await fixture();
            const { project_uuid: projectUuid } = await db(
                'project_model_documents',
            )
                .where('project_model_document_uuid', documentUuid)
                .first()
                .then((row) => {
                    if (!row) throw new Error('Missing test document');
                    return row;
                });
            const {
                rows: [{ user_uuid: userUuid }],
            } = await db.raw<{ rows: { user_uuid: string }[] }>(
                'INSERT INTO users(first_name,last_name) VALUES (?,?) RETURNING user_uuid',
                ['', ''],
            );
            const project = new ProjectModel({
                database: db,
                lightdashConfig: lightdashConfigMock,
                encryptionUtil: new EncryptionUtil({
                    lightdashConfig: lightdashConfigMock,
                }),
            });
            const documents = new ProjectModelDocumentModel({ database: db });
            const earlier = await db.transaction();
            await earlier.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [
                `semantic-layer:${projectUuid}`,
            ]);
            const {
                rows: [{ pid }],
            } = await earlier.raw<{ rows: { pid: number }[] }>(
                'SELECT pg_backend_pid() AS pid',
            );
            const content =
                operation === 'delete'
                    ? null
                    : 'type: model\nname: orders\nsql_from: raw.orders\ndimensions: []\nmaterialize: {max_rows: 10}\n';
            const publishing = documents.publishWithExplores(
                {
                    projectUuid,
                    userUuid,
                    workspaceUuid: null,
                    readVersions: new Map([['orders', 1]]),
                    documents: [{ name: 'orders', content }],
                    source: { kind: 'undo', reverts: [] },
                },
                async (write) => {
                    if (content === null)
                        await project.deleteCachedExplores(
                            projectUuid,
                            ['orders'],
                            undefined,
                            write,
                        );
                    else
                        await project.saveExploresToCache(
                            projectUuid,
                            [{ ...validExplore, name: 'orders' }],
                            false,
                            undefined,
                            undefined,
                            undefined,
                            write,
                        );
                },
                (trx, changeSetUuid) =>
                    saveMaterializationPolicies(
                        trx,
                        projectUuid,
                        changeSetUuid,
                        userUuid,
                    ),
            );
            try {
                await vi.waitFor(async () => {
                    const { rows } = await db.raw<{
                        rows: { blocked: boolean }[];
                    }>(
                        'SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ? = ANY(pg_blocking_pids(pid))) AS blocked',
                        [pid],
                    );
                    expect(rows[0].blocked).toBe(true);
                });
                await earlier.raw("SET LOCAL lock_timeout = '1s'");
                await ProjectModel.lockAndEnsureCachedExplores(
                    earlier,
                    projectUuid,
                );
                await earlier.commit();
            } finally {
                if (!earlier.isCompleted()) await earlier.rollback();
                await publishing;
            }
            expect(await documents.findDocuments(projectUuid)).toHaveLength(
                content === null ? 0 : 1,
            );
        },
    );

    test('concurrent claims register exactly one key, and promotion stores verified metadata', async () => {
        const { config, intent } = await publish();
        const results = await Promise.all([
            model.claim(intent),
            model.claim(intent),
        ]);
        expect(results.map(({ status }) => status).sort()).toEqual([
            'busy',
            'claimed',
        ]);
        const result = results.find(({ status }) => status === 'claimed');
        if (result?.status !== 'claimed') throw new Error('Missing claim');
        const { attempt } = result;
        const row = () =>
            db('model_materialization_generations')
                .where('generation_uuid', attempt.generationUuid)
                .first();
        expect(await row()).toMatchObject({
            status: 'building',
            object_key: attempt.objectKey,
            native_schema: null,
        });
        expect(await model.promote(attempt, verified)).toBe(true);
        expect(await row()).toMatchObject({
            status: 'ready',
            native_schema: verified.nativeSchema,
            row_count: 1,
            byte_count: BigInt(128),
            source_read_at: verified.sourceReadAt,
            ready_at: expect.any(Date),
        });
        expect(await model.claim(intent)).toEqual({ status: 'ready' });
        expect(
            await db.transaction((trx) =>
                ModelMaterializationModel.recordIntent(trx, config),
            ),
        ).toBeNull();
    });

    test('failed attempts retry with new keys, and expired or forged tokens cannot promote', async () => {
        const { intent } = await publish();
        const first = await claim(intent);
        await model.fail(first, 'row_limit');
        const { failure_reason: reason } = await db(
            'model_materialization_generations',
        )
            .where('generation_uuid', first.generationUuid)
            .first();
        expect(reason).toBe('row_limit');
        const second = await claim(intent);
        await db('model_materialization_generations')
            .where('generation_uuid', second.generationUuid)
            .update({ lease_expires_at: new Date(0) });
        const third = await claim(intent);
        expect(
            new Set([first.objectKey, second.objectKey, third.objectKey]).size,
        ).toBe(3);
        expect(await model.promote(second, verified)).toBe(false);
        expect(
            await model.promote(
                { ...third, attemptToken: second.attemptToken },
                verified,
            ),
        ).toBe(false);
        expect(await model.promote(third, verified)).toBe(true);
    });

    test.each(['desired_revision_uuid', 'policy_epoch'] as const)(
        'changing %s fences a running worker',
        async (column) => {
            const { intent } = await publish();
            const attempt = await claim(intent);
            const newer = await fixture();
            await db('model_materialization_configs')
                .where('config_uuid', intent.configUuid)
                .update({
                    [column]:
                        column === 'policy_epoch' ? 2 : newer.revisionUuid,
                });
            expect(await model.promote(attempt, verified)).toBe(false);
            expect(await model.claim(intent)).toEqual({ status: 'obsolete' });
            expect(
                await db('model_materialization_configs')
                    .where('config_uuid', intent.configUuid)
                    .first(),
            ).toMatchObject({ active_generation_uuid: null });
        },
    );

    test('active generation belongs to the same document and opt-out fences outstanding work', async () => {
        const first = await publish();
        const second = await publish();
        const attempt = await claim(first.intent);
        await expect(
            db('model_materialization_configs')
                .where('config_uuid', second.intent.configUuid)
                .update({ active_generation_uuid: attempt.generationUuid }),
        ).rejects.toMatchObject({ code: '23503' });
        await db.transaction((trx) =>
            ModelMaterializationModel.removeIntent(
                trx,
                first.config.documentUuid,
            ),
        );
        expect(await model.promote(attempt, verified)).toBe(false);
    });
});
