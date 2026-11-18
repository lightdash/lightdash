import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';

const configs = 'model_materialization_configs';
const generations = 'model_materialization_generations';

export type MaterializationBuildIntent = {
    configUuid: string;
    revisionUuid: string;
    policyEpoch: number;
};

export type MaterializationAttempt = MaterializationBuildIntent & {
    generationUuid: string;
    attemptToken: string;
    objectKey: string;
    projectUuid: string;
    modelName: string;
    content: string;
    maxRows: number;
};

type BuildClaim =
    | { status: 'claimed'; attempt: MaterializationAttempt }
    | { status: 'busy' | 'obsolete' | 'ready' };

type BuildConfig = {
    documentUuid: string;
    revisionUuid: string;
    buildFingerprint: string;
    compatibilityFingerprint: string;
    maxRows: number;
    cron: string | null;
    onChange: boolean;
    timezone: string;
};

type ConfigRow = {
    config_uuid: string;
    document_uuid: string;
    desired_revision_uuid: string;
    active_generation_uuid: string | null;
    policy_epoch: number;
    max_rows: number;
    compatibility_fingerprint: string;
    build_fingerprint: string;
};

type VerifiedCopy = {
    nativeSchema: ReadonlyArray<{
        name: string;
        dataTypeID: number;
        dataTypeModifier: number;
        duckdbType: string;
    }>;
    rowCount: number;
    byteCount: number;
    sourceReadAt: Date;
};

export class ModelMaterializationModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    static async recordIntent(
        trx: Knex.Transaction,
        config: BuildConfig,
    ): Promise<MaterializationBuildIntent | null> {
        const desired = {
            desired_revision_uuid: config.revisionUuid,
            build_fingerprint: config.buildFingerprint,
            compatibility_fingerprint: config.compatibilityFingerprint,
            max_rows: config.maxRows,
            refresh_cron: config.cron,
            refresh_on_change: config.onChange,
            scheduler_timezone: config.timezone,
        };
        const [row] = await trx<ConfigRow>(configs)
            .insert({ document_uuid: config.documentUuid, ...desired })
            .onConflict('document_uuid')
            .merge(desired)
            .returning([
                'config_uuid',
                'policy_epoch',
                'active_generation_uuid',
            ]);
        await trx(generations)
            .where({ config_uuid: row.config_uuid, status: 'building' })
            .whereNot('revision_uuid', config.revisionUuid)
            .update({ status: 'superseded' });
        if (row.active_generation_uuid !== null) return null;
        return {
            configUuid: row.config_uuid,
            revisionUuid: config.revisionUuid,
            policyEpoch: row.policy_epoch,
        };
    }

    static async removeIntent(trx: Knex.Transaction, documentUuid: string) {
        await trx(configs).where('document_uuid', documentUuid).delete();
    }

    private static currentConfig(
        trx: Knex.Transaction,
        intent: MaterializationBuildIntent,
    ) {
        return trx<ConfigRow>(configs)
            .where({
                config_uuid: intent.configUuid,
                desired_revision_uuid: intent.revisionUuid,
                policy_epoch: intent.policyEpoch,
            })
            .forUpdate()
            .first();
    }

    async claim(intent: MaterializationBuildIntent): Promise<BuildClaim> {
        return this.database.transaction(async (trx): Promise<BuildClaim> => {
            const config = await ModelMaterializationModel.currentConfig(
                trx,
                intent,
            );
            if (!config) return { status: 'obsolete' };
            if (config.active_generation_uuid !== null)
                return { status: 'ready' };

            const building = trx(generations).where({
                config_uuid: intent.configUuid,
                revision_uuid: intent.revisionUuid,
                policy_epoch: intent.policyEpoch,
                status: 'building',
            });
            const leased = await building
                .clone()
                .where('lease_expires_at', '>', trx.fn.now())
                .first('generation_uuid');
            if (leased) return { status: 'busy' };
            await building.update({ status: 'superseded' });

            const doc = await trx('project_model_documents')
                .where('project_model_document_uuid', config.document_uuid)
                .first();
            const revision =
                doc &&
                (await trx('project_model_revisions')
                    .join(
                        'project_model_change_sets',
                        'project_model_change_sets.project_model_change_set_uuid',
                        'project_model_revisions.project_model_change_set_uuid',
                    )
                    .where(
                        'project_model_change_sets.project_uuid',
                        doc.project_uuid,
                    )
                    .where('project_model_revision_uuid', intent.revisionUuid)
                    .first('content_after', 'name', 'document_version'));
            if (
                !doc ||
                !revision?.content_after ||
                revision.name !== doc.name ||
                revision.document_version !== doc.document_version
            ) {
                return { status: 'obsolete' };
            }
            const generationUuid = randomUUID();
            const attemptToken = randomUUID();
            const objectKey = `model-materializations/${intent.configUuid}/${generationUuid}.parquet`;
            await trx(generations).insert({
                generation_uuid: generationUuid,
                config_uuid: intent.configUuid,
                revision_uuid: intent.revisionUuid,
                policy_epoch: intent.policyEpoch,
                build_fingerprint: config.build_fingerprint,
                compatibility_fingerprint: config.compatibility_fingerprint,
                trigger: 'publish',
                status: 'building',
                attempt_token: attemptToken,
                lease_expires_at: trx.raw(
                    "CURRENT_TIMESTAMP + INTERVAL '1 hour'",
                ),
                object_key: objectKey,
            });
            return {
                status: 'claimed',
                attempt: {
                    ...intent,
                    generationUuid,
                    attemptToken,
                    objectKey,
                    projectUuid: doc.project_uuid,
                    modelName: doc.name,
                    content: revision.content_after,
                    maxRows: config.max_rows,
                },
            };
        });
    }

    private static ownedAttempt(db: Knex, attempt: MaterializationAttempt) {
        return db(generations).where({
            config_uuid: attempt.configUuid,
            generation_uuid: attempt.generationUuid,
            revision_uuid: attempt.revisionUuid,
            policy_epoch: attempt.policyEpoch,
            attempt_token: attempt.attemptToken,
            object_key: attempt.objectKey,
            status: 'building',
        });
    }

    async promote(
        attempt: MaterializationAttempt,
        verified: VerifiedCopy,
    ): Promise<boolean> {
        return this.database.transaction(async (trx) => {
            const config = await ModelMaterializationModel.currentConfig(
                trx,
                attempt,
            );
            if (!config || config.active_generation_uuid !== null) return false;
            const updated = await ModelMaterializationModel.ownedAttempt(
                trx,
                attempt,
            )
                .where('lease_expires_at', '>', trx.fn.now())
                .update({
                    status: 'ready',
                    native_schema: JSON.stringify(verified.nativeSchema),
                    row_count: verified.rowCount,
                    byte_count: verified.byteCount,
                    source_read_at: verified.sourceReadAt,
                    ready_at: trx.fn.now(),
                });
            if (!updated) return false;
            await trx(configs)
                .where('config_uuid', attempt.configUuid)
                .update({ active_generation_uuid: attempt.generationUuid });
            return true;
        });
    }

    async fail(
        attempt: MaterializationAttempt,
        reason: 'build_failed' | 'row_limit' | 'unsupported_type',
    ): Promise<void> {
        await ModelMaterializationModel.ownedAttempt(
            this.database,
            attempt,
        ).update({ status: 'failed', failure_reason: reason });
    }
}
