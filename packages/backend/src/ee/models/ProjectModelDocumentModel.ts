import {
    type SemanticLayerDraftModelInput,
    type SemanticLayerModelChange,
    type SemanticLayerModelCode,
    type SemanticLayerSettledDraftChange,
} from '@lightdash/common';
import { groupBy } from 'es-toolkit/compat';
import { Knex } from 'knex';
import {
    ProjectModelChangeSetsTableName,
    ProjectModelRevisionsTableName,
} from '../../database/entities/projectModelChangeSets';
import { ProjectModelDocumentsTableName } from '../../database/entities/projectModelDocuments';
import {
    ProjectModelDraftChangesTableName,
    type SettledDraftChangeStatus,
} from '../../database/entities/projectModelDraftChanges';
import {
    ProjectModelDraftImpactsTableName,
    type DraftImpactBreaks,
    type DraftImpactCheckStatus,
} from '../../database/entities/projectModelDraftImpacts';
import { AiPromptTableName } from '../database/entities/ai';

const MODEL_HISTORY_LIMIT = 50;
const SETTLED_DRAFT_CHANGES_LIMIT = 100;

export type ProjectModelDocument = Omit<SemanticLayerModelCode, 'history'>;

/** Draft changes to settle; with `model`, only that model's part of them. */
export type DraftSelection = { changeUuids: string[]; model: string | null };

/** What a change set comes from, and what it settles. */
export type ChangeSetSource =
    | { kind: 'draft'; promptUuid: string | null; drafts: DraftSelection }
    | { kind: 'undo'; reverts: string[] };

export type StoredDraftChange = {
    draftChangeUuid: string;
    promptUuid: string | null;
    question: string | null;
    createdAt: Date;
    models: SemanticLayerDraftModelInput[];
};

export type ChangeSet = {
    changeSetUuid: string;
    revertedByChangeSetUuid: string | null;
    createdAt: Date;
    revisions: {
        name: string;
        contentBefore: string | null;
        contentAfter: string | null;
    }[];
};

type DraftOwner = { projectUuid: string; userUuid: string };

export type DraftImpactCheck = {
    draftHash: string;
    status: DraftImpactCheckStatus;
    breaks: DraftImpactBreaks | null;
    startedAt: Date;
};

/** How a check ended: with what the draft breaks, or without an answer. */
export type DraftImpactOutcome =
    | { status: 'done'; breaks: DraftImpactBreaks }
    | { status: 'failed' };

/** Another write changed the project's models or draft after they were read. */
export class ModelDocumentsChangedError extends Error {
    constructor() {
        super('The semantic layer changed while this change was being made');
        this.name = 'ModelDocumentsChangedError';
    }
}

/** The native model YAML a project keeps on the server, its history, and each person's draft of changes to it. */
export class ProjectModelDocumentModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    private static openDraftChanges(
        database: Knex,
        { projectUuid, userUuid }: DraftOwner,
    ) {
        return database(ProjectModelDraftChangesTableName)
            .where(
                `${ProjectModelDraftChangesTableName}.project_uuid`,
                projectUuid,
            )
            .where(
                `${ProjectModelDraftChangesTableName}.created_by_user_uuid`,
                userUuid,
            )
            .where(`${ProjectModelDraftChangesTableName}.status`, 'draft');
    }

    async findDocuments(projectUuid: string): Promise<ProjectModelDocument[]> {
        const rows = await this.database(ProjectModelDocumentsTableName)
            .select('name', 'content', 'document_version')
            .where('project_uuid', projectUuid)
            .orderBy('name');
        return rows.map(({ name, content, document_version: version }) => ({
            name,
            content,
            version,
        }));
    }

    async findChangeSets(
        projectUuid: string,
        changeSetUuids: string[],
    ): Promise<ChangeSet[]> {
        const changeSets = await this.database(ProjectModelChangeSetsTableName)
            .select(
                'project_model_change_set_uuid',
                'reverted_by_change_set_uuid',
                'created_at',
            )
            .where('project_uuid', projectUuid)
            .whereIn('project_model_change_set_uuid', changeSetUuids);
        const revisions = groupBy(
            await this.database(ProjectModelRevisionsTableName)
                .select(
                    'project_model_change_set_uuid',
                    'name',
                    'content_before',
                    'content_after',
                )
                .whereIn(
                    'project_model_change_set_uuid',
                    changeSets.map((row) => row.project_model_change_set_uuid),
                ),
            (revision) => revision.project_model_change_set_uuid,
        );
        return changeSets.map((row) => ({
            changeSetUuid: row.project_model_change_set_uuid,
            revertedByChangeSetUuid: row.reverted_by_change_set_uuid,
            createdAt: row.created_at,
            revisions: (revisions[row.project_model_change_set_uuid] ?? []).map(
                (revision) => ({
                    name: revision.name,
                    contentBefore: revision.content_before,
                    contentAfter: revision.content_after,
                }),
            ),
        }));
    }

    /** The changes to one model, newest first, with their full content before and after. */
    async findModelHistory(
        projectUuid: string,
        name: string,
    ): Promise<SemanticLayerModelChange[]> {
        const changeSetUuid = `${ProjectModelRevisionsTableName}.project_model_change_set_uuid`;
        const rows = await this.database(ProjectModelRevisionsTableName)
            .innerJoin(
                ProjectModelChangeSetsTableName,
                `${ProjectModelChangeSetsTableName}.project_model_change_set_uuid`,
                changeSetUuid,
            )
            .leftJoin(
                AiPromptTableName,
                `${AiPromptTableName}.ai_prompt_uuid`,
                `${ProjectModelChangeSetsTableName}.prompt_uuid`,
            )
            .select({
                changeSetUuid,
                contentBefore: `${ProjectModelRevisionsTableName}.content_before`,
                contentAfter: `${ProjectModelRevisionsTableName}.content_after`,
                source: `${ProjectModelChangeSetsTableName}.kind`,
                revertedBy: `${ProjectModelChangeSetsTableName}.reverted_by_change_set_uuid`,
                createdAt: `${ProjectModelChangeSetsTableName}.created_at`,
                question: `${AiPromptTableName}.prompt`,
            })
            .where(
                `${ProjectModelChangeSetsTableName}.project_uuid`,
                projectUuid,
            )
            .where(`${ProjectModelRevisionsTableName}.name`, name)
            .orderBy(`${ProjectModelChangeSetsTableName}.created_at`, 'desc')
            .limit(MODEL_HISTORY_LIMIT);
        const others = groupBy(
            await this.database(ProjectModelRevisionsTableName)
                .select('project_model_change_set_uuid', 'name')
                .whereIn(
                    'project_model_change_set_uuid',
                    rows.map((row) => row.changeSetUuid),
                )
                .whereNot('name', name)
                .orderBy('name'),
            (other) => other.project_model_change_set_uuid,
        );
        return rows.map(({ revertedBy, ...row }) => ({
            ...row,
            reverted: revertedBy !== null,
            otherModels: (others[row.changeSetUuid] ?? []).map(
                (other) => other.name,
            ),
        }));
    }

    /** A person's draft on a project, oldest first. */
    async findDraftChanges(
        projectUuid: string,
        userUuid: string,
    ): Promise<StoredDraftChange[]> {
        return ProjectModelDocumentModel.openDraftChanges(this.database, {
            projectUuid,
            userUuid,
        })
            .leftJoin(
                AiPromptTableName,
                `${AiPromptTableName}.ai_prompt_uuid`,
                `${ProjectModelDraftChangesTableName}.prompt_uuid`,
            )
            .select({
                draftChangeUuid: `${ProjectModelDraftChangesTableName}.project_model_draft_change_uuid`,
                promptUuid: `${ProjectModelDraftChangesTableName}.prompt_uuid`,
                question: `${AiPromptTableName}.prompt`,
                createdAt: `${ProjectModelDraftChangesTableName}.created_at`,
                models: `${ProjectModelDraftChangesTableName}.models`,
            })
            .orderBy(`${ProjectModelDraftChangesTableName}.created_at`, 'asc');
    }

    /** What became of a person's recent draft changes, newest first. */
    async findSettledDraftChanges(
        projectUuid: string,
        userUuid: string,
    ): Promise<SemanticLayerSettledDraftChange[]> {
        const rows = await this.database(ProjectModelDraftChangesTableName)
            .leftJoin(
                ProjectModelChangeSetsTableName,
                `${ProjectModelChangeSetsTableName}.project_model_change_set_uuid`,
                `${ProjectModelDraftChangesTableName}.applied_change_set_uuid`,
            )
            .select<
                {
                    draftChangeUuid: string;
                    status: SettledDraftChangeStatus;
                    revertedBy: string | null;
                }[]
            >({
                draftChangeUuid: `${ProjectModelDraftChangesTableName}.project_model_draft_change_uuid`,
                status: `${ProjectModelDraftChangesTableName}.status`,
                revertedBy: `${ProjectModelChangeSetsTableName}.reverted_by_change_set_uuid`,
            })
            .where(
                `${ProjectModelDraftChangesTableName}.project_uuid`,
                projectUuid,
            )
            .where(
                `${ProjectModelDraftChangesTableName}.created_by_user_uuid`,
                userUuid,
            )
            .whereNot(`${ProjectModelDraftChangesTableName}.status`, 'draft')
            .orderBy(`${ProjectModelDraftChangesTableName}.created_at`, 'desc')
            .limit(SETTLED_DRAFT_CHANGES_LIMIT);
        return rows.map(({ draftChangeUuid, status, revertedBy }) => ({
            draftChangeUuid,
            status: revertedBy ? 'undone' : status,
        }));
    }

    async createDraftChange({
        projectUuid,
        userUuid,
        promptUuid,
        models,
    }: DraftOwner & {
        promptUuid: string | null;
        models: SemanticLayerDraftModelInput[];
    }): Promise<string> {
        const [{ project_model_draft_change_uuid: draftChangeUuid }] =
            await this.database(ProjectModelDraftChangesTableName)
                .insert({
                    project_uuid: projectUuid,
                    created_by_user_uuid: userUuid,
                    prompt_uuid: promptUuid,
                    models: JSON.stringify(models),
                })
                .returning('project_model_draft_change_uuid');
        return draftChangeUuid;
    }

    /** This person's latest check of their draft against saved content, whatever draft it was for. */
    async findDraftImpactCheck({
        projectUuid,
        userUuid,
    }: DraftOwner): Promise<DraftImpactCheck | null> {
        const row = await this.database(ProjectModelDraftImpactsTableName)
            .where({
                project_uuid: projectUuid,
                created_by_user_uuid: userUuid,
            })
            .first();
        return row
            ? {
                  draftHash: row.draft_hash,
                  status: row.status,
                  breaks: row.breaks,
                  startedAt: row.created_at,
              }
            : null;
    }

    /** Marks a check of this draft as running, replacing the person's previous one. */
    async startDraftImpactCheck({
        projectUuid,
        userUuid,
        draftHash,
    }: DraftOwner & { draftHash: string }): Promise<void> {
        await this.database(ProjectModelDraftImpactsTableName)
            .insert({
                project_uuid: projectUuid,
                created_by_user_uuid: userUuid,
                draft_hash: draftHash,
                status: 'checking',
                breaks: null,
                created_at: new Date(),
            })
            .onConflict(['project_uuid', 'created_by_user_uuid'])
            .merge();
    }

    /** Records how a check ended, unless a check of a newer draft replaced it. */
    async finishDraftImpactCheck({
        projectUuid,
        userUuid,
        draftHash,
        outcome,
    }: DraftOwner & {
        draftHash: string;
        outcome: DraftImpactOutcome;
    }): Promise<void> {
        await this.database(ProjectModelDraftImpactsTableName)
            .where({
                project_uuid: projectUuid,
                created_by_user_uuid: userUuid,
                draft_hash: draftHash,
            })
            .update({
                status: outcome.status,
                breaks:
                    outcome.status === 'done'
                        ? JSON.stringify(outcome.breaks)
                        : null,
            });
    }

    /** Moves `model` out of draft changes that also touch other models into one change of its own; returns the changes now holding only it. */
    private static async isolateDraftModel(
        trx: Knex.Transaction,
        owner: DraftOwner,
        changeUuids: string[],
        model: string,
    ): Promise<string[]> {
        const rows = await ProjectModelDocumentModel.openDraftChanges(
            trx,
            owner,
        )
            .whereIn('project_model_draft_change_uuid', changeUuids)
            .orderBy('created_at', 'asc')
            .select(
                'project_model_draft_change_uuid',
                'prompt_uuid',
                'created_at',
                'models',
            );
        const holding = rows.filter(({ models }) =>
            models.some(({ name }) => name === model),
        );
        const mixed = holding.filter(({ models }) =>
            models.some(({ name }) => name !== model),
        );
        const alone = holding
            .filter((row) => !mixed.includes(row))
            .map((row) => row.project_model_draft_change_uuid);
        if (mixed.length === 0) return alone;
        await Promise.all(
            mixed.map((row) =>
                trx(ProjectModelDraftChangesTableName)
                    .where(
                        'project_model_draft_change_uuid',
                        row.project_model_draft_change_uuid,
                    )
                    .update({
                        models: JSON.stringify(
                            row.models.filter(({ name }) => name !== model),
                        ),
                    }),
            ),
        );
        const [{ project_model_draft_change_uuid: moved }] = await trx(
            ProjectModelDraftChangesTableName,
        )
            .insert({
                project_uuid: owner.projectUuid,
                created_by_user_uuid: owner.userUuid,
                prompt_uuid: mixed[mixed.length - 1].prompt_uuid,
                // Where the first of them was, so later changes still build on it.
                created_at: mixed[0].created_at,
                models: JSON.stringify(
                    mixed.flatMap(({ models }) =>
                        models.filter(({ name }) => name === model),
                    ),
                ),
            })
            .returning('project_model_draft_change_uuid');
        return [...alone, moved];
    }

    private static async updateSelectedDraftChanges(
        trx: Knex.Transaction,
        owner: DraftOwner,
        { changeUuids, model }: DraftSelection,
        outcome: {
            status: SettledDraftChangeStatus;
            applied_change_set_uuid: string | null;
        },
    ): Promise<number> {
        const settling =
            model === null
                ? changeUuids
                : await ProjectModelDocumentModel.isolateDraftModel(
                      trx,
                      owner,
                      changeUuids,
                      model,
                  );
        return ProjectModelDocumentModel.openDraftChanges(trx, owner)
            .whereIn('project_model_draft_change_uuid', settling)
            .update(outcome);
    }

    /** Settles draft changes without writing models; returns how many it settled. */
    async updateDraftChangeStatus({
        drafts,
        status,
        ...owner
    }: DraftOwner & {
        drafts: DraftSelection;
        status: SettledDraftChangeStatus;
    }): Promise<number> {
        return this.database.transaction((trx) =>
            ProjectModelDocumentModel.updateSelectedDraftChanges(
                trx,
                owner,
                drafts,
                {
                    status,
                    applied_change_set_uuid: null,
                },
            ),
        );
    }

    /** Writes documents, revisions and a change set, then runs `deploy`, under a per-project lock; throws ModelDocumentsChangedError on a stale read. */
    async createChangeSet<T>(
        {
            source,
            readVersions,
            documents,
            ...owner
        }: DraftOwner & {
            source: ChangeSetSource;
            /** Every stored document's version as read before the change was made. */
            readVersions: Map<string, number>;
            /** Content null deletes the document. */
            documents: { name: string; content: string | null }[];
        },
        deploy: () => Promise<T>,
    ): Promise<{ changeSetUuid: string; deployed: T }> {
        const { projectUuid, userUuid } = owner;
        return this.database.transaction(async (trx) => {
            await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [
                `semantic-layer:${projectUuid}`,
            ]);
            const stored = await trx(ProjectModelDocumentsTableName)
                .select('name', 'content', 'document_version')
                .where('project_uuid', projectUuid);
            const unchanged =
                stored.length === readVersions.size &&
                stored.every(
                    (row) =>
                        readVersions.get(row.name) === row.document_version,
                );
            if (!unchanged) throw new ModelDocumentsChangedError();

            const [{ project_model_change_set_uuid: changeSetUuid }] =
                await trx(ProjectModelChangeSetsTableName)
                    .insert({
                        project_uuid: projectUuid,
                        kind: source.kind,
                        prompt_uuid:
                            source.kind === 'draft' ? source.promptUuid : null,
                        created_by_user_uuid: userUuid,
                        // Taken under the lock, so history orders the way writes landed.
                        created_at: trx.raw('clock_timestamp()'),
                    })
                    .returning('project_model_change_set_uuid');

            const before = new Map(stored.map((row) => [row.name, row]));
            await Promise.all(
                documents.map(async ({ name, content }) => {
                    const current = before.get(name);
                    const version = (current?.document_version ?? 0) + 1;
                    const document = () =>
                        trx(ProjectModelDocumentsTableName).where({
                            project_uuid: projectUuid,
                            name,
                        });
                    if (content === null) {
                        await document().delete();
                    } else if (current) {
                        await document().update({
                            content,
                            document_version: version,
                        });
                    } else {
                        await trx(ProjectModelDocumentsTableName).insert({
                            project_uuid: projectUuid,
                            name,
                            content,
                            document_version: version,
                        });
                    }
                    await trx(ProjectModelRevisionsTableName).insert({
                        project_model_change_set_uuid: changeSetUuid,
                        name,
                        document_version: version,
                        content_before: current?.content ?? null,
                        content_after: content,
                    });
                }),
            );

            if (source.kind === 'undo') {
                const reverted = await trx(ProjectModelChangeSetsTableName)
                    .update({ reverted_by_change_set_uuid: changeSetUuid })
                    .where('project_uuid', projectUuid)
                    .whereIn('project_model_change_set_uuid', source.reverts)
                    .whereNull('reverted_by_change_set_uuid');
                if (reverted !== source.reverts.length) {
                    throw new ModelDocumentsChangedError();
                }
            } else {
                const { changeUuids } = source.drafts;
                const present =
                    await ProjectModelDocumentModel.openDraftChanges(trx, owner)
                        .whereIn('project_model_draft_change_uuid', changeUuids)
                        .select('project_model_draft_change_uuid');
                if (present.length !== changeUuids.length) {
                    throw new ModelDocumentsChangedError();
                }
                await ProjectModelDocumentModel.updateSelectedDraftChanges(
                    trx,
                    owner,
                    source.drafts,
                    {
                        status: 'applied',
                        applied_change_set_uuid: changeSetUuid,
                    },
                );
            }

            // Deploy inside the lock so two writers never deploy out of order.
            return { changeSetUuid, deployed: await deploy() };
        });
    }
}
