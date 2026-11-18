import { parseModelDocument } from '@lightdash/common';
import { type Knex } from 'knex';
import { createHash } from 'node:crypto';
import { ModelMaterializationModel } from '../../../models/ModelMaterializationModel';
import { SchedulerClient } from '../../../scheduler/SchedulerClient';
import { toModelPath } from './draftFold';

export async function saveMaterializationPolicies(
    trx: Knex.Transaction,
    projectUuid: string,
    changeSetUuid: string,
    userUuid: string,
) {
    const project = await trx('projects')
        .join(
            'organizations',
            'organizations.organization_id',
            'projects.organization_id',
        )
        .where('project_uuid', projectUuid)
        .first('scheduler_timezone', 'organization_uuid');
    if (!project) throw new Error('Project no longer exists');
    const revisions = await trx('project_model_revisions').where(
        'project_model_change_set_uuid',
        changeSetUuid,
    );
    await Promise.all(
        revisions.map(async (revision) => {
            if (revision.content_after === null) return;
            const doc = await trx('project_model_documents')
                .where({ project_uuid: projectUuid, name: revision.name })
                .first('project_model_document_uuid');
            if (!doc) throw new Error('Published document no longer exists');
            const model = parseModelDocument(
                revision.content_after,
                toModelPath(revision.name),
            );
            const policy = model.materialize;
            if (!policy) {
                await ModelMaterializationModel.removeIntent(
                    trx,
                    doc.project_model_document_uuid,
                );
                return;
            }
            const intent = await ModelMaterializationModel.recordIntent(trx, {
                documentUuid: doc.project_model_document_uuid,
                revisionUuid: revision.project_model_revision_uuid,
                buildFingerprint: createHash('sha256')
                    .update(JSON.stringify([model.sql_from, policy.max_rows]))
                    .digest('hex'),
                compatibilityFingerprint: createHash('sha256')
                    .update(JSON.stringify(model))
                    .digest('hex'),
                maxRows: policy.max_rows,
                cron: policy.refresh?.cron ?? null,
                onChange: policy.refresh?.on_change ?? true,
                timezone: project.scheduler_timezone,
            });
            if (intent)
                await SchedulerClient.enqueueModelMaterialization(trx, {
                    ...intent,
                    projectUuid,
                    userUuid,
                    organizationUuid: project.organization_uuid,
                });
        }),
    );
}
