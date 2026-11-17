import {
    NotFoundError,
    ParameterError,
    parseModelDocument,
    type ModelMaterializationPin,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { SchedulerClient } from '../scheduler/SchedulerClient';

const configs = 'model_materialization_configs';
const generations = 'model_materialization_generations';

export type MaterializationBuildIntent = {
    manualRequestUuid?: string;
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

type ServingCopy =
    | { status: 'pending' }
    | {
          status: 'ready';
          content: string;
          objectKey: string;
          pin: ModelMaterializationPin;
      };

export class ModelMaterializationModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async getServingCopy(
        projectUuid: string,
        modelName: string,
    ): Promise<ServingCopy | null> {
        const {
            rows: [copy],
        } = await this.database.raw<{
            rows: {
                config_uuid: string;
                generation_uuid: string | null;
                policy_epoch: number;
                content: string;
                object_key: string | null;
                revision_matches: boolean;
                generation_matches: boolean | null;
            }[];
        }>(
            `
            SELECT c.config_uuid, c.active_generation_uuid AS generation_uuid, c.policy_epoch,
                   d.content, g.object_key,
                   (r.name = d.name AND s.project_uuid = d.project_uuid AND
                    r.document_version = d.document_version AND r.content_after IS NOT DISTINCT FROM d.content) AS revision_matches,
                   (g.status = 'ready' AND
                    g.build_fingerprint = c.build_fingerprint AND g.compatibility_fingerprint = c.compatibility_fingerprint AND
                    g.policy_epoch = c.policy_epoch) AS generation_matches
            FROM project_model_documents d
            JOIN model_materialization_configs c ON c.document_uuid = d.project_model_document_uuid
            JOIN project_model_revisions r ON r.project_model_revision_uuid = c.desired_revision_uuid
            JOIN project_model_change_sets s ON s.project_model_change_set_uuid = r.project_model_change_set_uuid
            LEFT JOIN model_materialization_generations g ON g.config_uuid = c.config_uuid AND g.generation_uuid = c.active_generation_uuid
            WHERE d.project_uuid = ? AND d.name = ?`,
            [projectUuid, modelName],
        );
        if (!copy) return null;
        if (!copy.revision_matches)
            throw new ParameterError(
                'Published materialization revision has changed.',
            );
        if (copy.generation_uuid === null) return { status: 'pending' };
        if (!copy.generation_matches || !copy.object_key)
            throw new ParameterError(
                'The active materialization is incompatible with the published model.',
            );
        return {
            status: 'ready',
            content: copy.content,
            objectKey: copy.object_key,
            pin: {
                configUuid: copy.config_uuid,
                generationUuid: copy.generation_uuid,
                policyEpoch: copy.policy_epoch,
            },
        };
    }

    async getPinnedObjectKey(
        projectUuid: string,
        exploreName: string,
        pin: ModelMaterializationPin,
    ): Promise<string> {
        const {
            rows: [copy],
        } = await this.database.raw<{
            rows: { name: string; content_after: string; object_key: string }[];
        }>(
            `
            SELECT r.name, r.content_after, g.object_key
            FROM model_materialization_generations g
            JOIN model_materialization_configs c ON c.config_uuid = g.config_uuid AND c.policy_epoch = g.policy_epoch
            JOIN project_model_documents d ON d.project_model_document_uuid = c.document_uuid
            JOIN project_model_revisions r ON r.project_model_revision_uuid = g.revision_uuid AND r.name = d.name
            JOIN project_model_change_sets s ON s.project_model_change_set_uuid = r.project_model_change_set_uuid AND s.project_uuid = d.project_uuid
            WHERE d.project_uuid = ? AND g.config_uuid = ? AND g.generation_uuid = ? AND g.policy_epoch = ?
              AND g.status = 'ready' AND r.content_after IS NOT NULL`,
            [projectUuid, pin.configUuid, pin.generationUuid, pin.policyEpoch],
        );
        if (copy) {
            const model = parseModelDocument(
                copy.content_after,
                `models/${copy.name}.yml`,
            );
            if (
                model.materialize &&
                model.name === copy.name &&
                ((model.name === exploreName && !model.hidden) ||
                    Object.hasOwn(model.explores ?? {}, exploreName))
            )
                return copy.object_key;
        }
        throw new NotFoundError('Pinned model materialization is unavailable.');
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
            .merge({
                ...desired,
                active_generation_uuid:
                    trx.raw(`CASE WHEN model_materialization_configs.build_fingerprint = excluded.build_fingerprint
                    AND model_materialization_configs.compatibility_fingerprint = excluded.compatibility_fingerprint
                    THEN model_materialization_configs.active_generation_uuid ELSE NULL END`),
            })
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

    async manualRefresh(
        projectUuid: string,
        modelName: string,
        userUuid: string,
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            const config = await trx(configs)
                .join(
                    'project_model_documents',
                    'project_model_document_uuid',
                    'document_uuid',
                )
                .join(
                    'projects',
                    'projects.project_uuid',
                    'project_model_documents.project_uuid',
                )
                .join(
                    'organizations',
                    'organizations.organization_id',
                    'projects.organization_id',
                )
                .where({
                    'project_model_documents.project_uuid': projectUuid,
                    'project_model_documents.name': modelName,
                })
                .forUpdate(configs)
                .first<ConfigRow & { organization_uuid: string }>(
                    'config_uuid',
                    'desired_revision_uuid',
                    'policy_epoch',
                    'organization_uuid',
                );
            if (!config)
                throw new NotFoundError('Model materialization was not found.');
            await SchedulerClient.enqueueModelMaterialization(trx, {
                projectUuid,
                userUuid,
                organizationUuid: config.organization_uuid,
                configUuid: config.config_uuid,
                revisionUuid: config.desired_revision_uuid,
                policyEpoch: config.policy_epoch,
                manualRequestUuid: randomUUID(),
            });
        });
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
            if (intent.manualRequestUuid) {
                const completed = await trx(generations)
                    .where({
                        config_uuid: intent.configUuid,
                        manual_request_uuid: intent.manualRequestUuid,
                        status: 'ready',
                    })
                    .first('generation_uuid');
                if (completed) return { status: 'ready' };
            } else if (config.active_generation_uuid !== null)
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
                trigger: intent.manualRequestUuid ? 'manual' : 'publish',
                manual_request_uuid: intent.manualRequestUuid ?? null,
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
            if (
                !config ||
                (!attempt.manualRequestUuid &&
                    config.active_generation_uuid !== null)
            )
                return false;
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
