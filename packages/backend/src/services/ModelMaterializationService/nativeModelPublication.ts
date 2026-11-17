import {
    getNativeMaterializationDocument,
    isExploreError,
    ParameterError,
    parseModelDocument,
    type Explore,
    type ExploreError,
    type NativeMaterializationDocument,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { ModelMaterializationModel } from '../../models/ModelMaterializationModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';

type PublishContext = {
    projectUuid: string;
    userUuid: string;
    full: boolean;
    studio: boolean;
    documents: Map<string, string | null>;
    publishedNames: Set<string>;
    validate: (docs: NativeMaterializationDocument[]) => Promise<void>;
};

export const nativeModelPublication = new AsyncLocalStorage<PublishContext>();

export function captureNativeModel(explore: Explore | ExploreError) {
    const context = nativeModelPublication.getStore();
    if (!context) return;
    context.publishedNames.add(
        isExploreError(explore)
            ? explore.name
            : (explore.tables[explore.baseTable]?.originalName ??
                  explore.baseTable),
    );
    const doc = getNativeMaterializationDocument(explore);
    if (!doc) return;
    if (
        context.documents.has(doc.name) &&
        context.documents.get(doc.name) !== doc.content
    )
        throw new Error(
            'Conflicting published definitions for a materialized model.',
        );
    context.documents.set(doc.name, doc.content);
}

export async function validateNativePublication() {
    const context = nativeModelPublication.getStore();
    if (!context?.documents.size || context.studio) return;
    await context.validate(
        [...context.documents].map(([name, content]) => ({ name, content })),
    );
}

async function publishedRevision(
    trx: Knex.Transaction,
    context: PublishContext,
    name: string,
    content: string,
) {
    const { projectUuid, userUuid, studio } = context;
    const doc = await trx('project_model_documents')
        .where({ project_uuid: projectUuid, name })
        .first();
    const last = await trx('project_model_revisions')
        .join(
            'project_model_change_sets',
            'project_model_revisions.project_model_change_set_uuid',
            'project_model_change_sets.project_model_change_set_uuid',
        )
        .where({ project_uuid: projectUuid, name })
        .orderBy('document_version', 'desc')
        .first(
            'project_model_revision_uuid',
            'document_version',
            'content_after',
        );
    if (
        doc &&
        last &&
        last.document_version === doc.document_version &&
        last.content_after === doc.content &&
        (studio || doc.content === content)
    ) {
        return {
            documentUuid: doc.project_model_document_uuid,
            revisionUuid: last.project_model_revision_uuid,
            content: doc.content,
        };
    }
    if (studio)
        throw new Error('Published native model revision was not found.');
    const version = (last?.document_version ?? 0) + 1;
    const [mirror] = await trx('project_model_documents')
        .insert({
            project_uuid: projectUuid,
            name,
            content,
            document_version: version,
        })
        .onConflict(['project_uuid', 'name'])
        .merge(['content', 'document_version'])
        .returning('project_model_document_uuid');
    const [set] = await trx('project_model_change_sets')
        .insert({
            project_uuid: projectUuid,
            created_by_user_uuid: userUuid,
            kind: 'draft',
            prompt_uuid: null,
            created_at: trx.fn.now(),
        })
        .returning('project_model_change_set_uuid');
    const [revision] = await trx('project_model_revisions')
        .insert({
            name,
            document_version: version,
            content_before: doc?.content ?? null,
            content_after: content,
            project_model_change_set_uuid: set.project_model_change_set_uuid,
        })
        .returning('project_model_revision_uuid');
    return {
        documentUuid: mirror.project_model_document_uuid,
        revisionUuid: revision.project_model_revision_uuid,
        content,
    };
}

export async function finalizeNativePublication(
    trx: Knex.Transaction,
    projectUuid: string,
) {
    const context = nativeModelPublication.getStore();
    if (!context || projectUuid !== context.projectUuid) return;
    const prior = await trx('model_materialization_configs')
        .join(
            'project_model_documents',
            'document_uuid',
            'project_model_document_uuid',
        )
        .where('project_uuid', projectUuid)
        .select<{ document_uuid: string; name: string }[]>(
            'document_uuid',
            'name',
        );
    const removed = prior.flatMap(({ name, document_uuid: documentUuid }) => {
        if (context.documents.has(name))
            return context.documents.get(name) === null ? [documentUuid] : [];
        if (context.publishedNames.has(name)) {
            if (context.studio) return [];
            throw new ParameterError(
                `Deploy the native model definition for "${name}" to update its materialized copy.`,
            );
        }
        return context.full ? [documentUuid] : [];
    });
    if (removed.length)
        await trx('model_materialization_configs')
            .whereIn('document_uuid', removed)
            .delete();
    const optedIn = [...context.documents].flatMap(([name, content]) =>
        content === null ? [] : [{ name, content }],
    );
    if (!optedIn.length) return;
    const project = await trx('projects')
        .join(
            'organizations',
            'organizations.organization_id',
            'projects.organization_id',
        )
        .where('project_uuid', projectUuid)
        .first('organization_uuid', 'scheduler_timezone');
    if (!project) throw new Error('Project no longer exists.');
    await optedIn.reduce(async (previous, { name, content }) => {
        await previous;
        const revision = await publishedRevision(trx, context, name, content);
        const model = parseModelDocument(
            revision.content,
            `models/${name}.yml`,
        );
        if (!model.materialize || model.name !== name)
            throw new Error(
                'Published native model does not match the materialization configuration.',
            );
        const policy = model.materialize;
        const intent = await ModelMaterializationModel.recordIntent(trx, {
            ...revision,
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
                userUuid: context.userUuid,
                organizationUuid: project.organization_uuid,
            });
    }, Promise.resolve());
}
