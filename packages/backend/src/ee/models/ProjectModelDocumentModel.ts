import {
    NotFoundError,
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
import { UserTableName } from '../../database/entities/users';
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
    /** The version each model was at when the change was made; null when that was not recorded. */
    baseVersions: Record<string, number | null> | null;
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
    ): Promise<Omit<SemanticLayerModelChange, 'replaced'>[]> {
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
            .leftJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${ProjectModelChangeSetsTableName}.created_by_user_uuid`,
            )
            .select({
                changeSetUuid,
                firstName: `${UserTableName}.first_name`,
                lastName: `${UserTableName}.last_name`,
                byUserUuid: `${UserTableName}.user_uuid`,
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
        return rows.map(({ revertedBy, firstName, lastName, ...row }) => ({
            ...row,
            by:
                typeof firstName === 'string'
                    ? `${firstName} ${lastName ?? ''}`.trim()
                    : null,
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
                baseVersions: `${ProjectModelDraftChangesTableName}.base_versions`,
            })
            .orderBy(`${ProjectModelDraftChangesTableName}.created_at`, 'asc');
    }

    /**
     * Swaps the place of two of a person's draft changes. A draft has no order of
     * its own beyond when each change was made, so the two trade times.
     */
    async swapDraftChanges(
        owner: DraftOwner,
        [first, second]: [string, string],
    ): Promise<void> {
        const table = ProjectModelDraftChangesTableName;
        await this.database.transaction(async (trx) => {
            const timeOf = (uuid: string) =>
                trx(table)
                    .select('created_at')
                    .where('project_model_draft_change_uuid', uuid);
            // One statement, so each side reads the other's time as it was, at the precision the database keeps.
            const swapped = await ProjectModelDocumentModel.openDraftChanges(
                trx,
                owner,
            )
                .whereIn('project_model_draft_change_uuid', [first, second])
                .update({
                    created_at: trx.raw(
                        'coalesce(case project_model_draft_change_uuid when ? then (?) else (?) end, created_at)',
                        [first, timeOf(second), timeOf(first)],
                    ),
                });
            // Rolls back a swap that found only one of the two.
            if (swapped !== 2) {
                throw new NotFoundError('Nothing in the draft matches');
            }
        });
    }

    /** Runs one publish at a time for a person on a project, on whichever server it lands; a second one waits its turn. */
    async withPublishLock<T>(
        { projectUuid, userUuid }: DraftOwner,
        publish: () => Promise<T>,
    ): Promise<T> {
        // ponytail: holds one pooled connection per concurrent publish; move to a lock row with a timestamp if publishes pile up.
        return this.database.transaction(async (trx) => {
            await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [
                `semantic-studio-publish:${projectUuid}:${userUuid}`,
            ]);
            return publish();
        });
    }

    /** What decides how a person's draft reads, without any of its content: every model's live version and every open change on the project. */
    async findDraftState(projectUuid: string): Promise<{
        versions: { name: string; version: number }[];
        changes: {
            uuid: string;
            userUuid: string;
            at: Date;
            baseVersions: Record<string, number | null> | null;
        }[];
    }> {
        // ponytail: a repository-backed project has no versions, so a change there moves nothing here.
        const [versions, changes] = await Promise.all([
            this.database(ProjectModelDocumentsTableName)
                .select({ name: 'name', version: 'document_version' })
                .where('project_uuid', projectUuid)
                .orderBy('name'),
            this.database(ProjectModelDraftChangesTableName)
                .select({
                    uuid: 'project_model_draft_change_uuid',
                    userUuid: 'created_by_user_uuid',
                    at: 'created_at',
                    baseVersions: 'base_versions',
                })
                .where('project_uuid', projectUuid)
                .where('status', 'draft')
                .orderBy('created_at', 'asc'),
        ]);
        return { versions, changes };
    }

    /** Bases a person's draft of one model on the given version, once they have seen what was published and kept their own; false, and nothing written, when live is no longer at that version. */
    async rebaseDraftChanges(
        owner: DraftOwner,
        model: string,
        version: number | null,
    ): Promise<boolean> {
        return this.database.transaction(async (trx) => {
            // Held until this commits, so a publish to the model lands wholly before or wholly after.
            const live = await trx(ProjectModelDocumentsTableName)
                .select('document_version')
                .where('project_uuid', owner.projectUuid)
                .where('name', model)
                .forUpdate()
                .first();
            if ((live?.document_version ?? null) !== version) return false;
            await ProjectModelDocumentModel.openDraftChanges(trx, owner)
                .whereRaw('models @> ?::jsonb', [
                    JSON.stringify([{ name: model }]),
                ])
                .update({
                    base_versions: trx.raw(
                        "jsonb_set(coalesce(base_versions, '{}'::jsonb), ?::text[], ?::jsonb)",
                        [[model], JSON.stringify(version)],
                    ),
                });
            return true;
        });
    }

    /** What each of these models held at a given version, by model name; a version that was never written is left out. */
    async findDocumentsAt(
        projectUuid: string,
        versions: Map<string, number>,
    ): Promise<Map<string, string | null>> {
        if (versions.size === 0) return new Map();
        const rows = await this.database(ProjectModelRevisionsTableName)
            .innerJoin(
                ProjectModelChangeSetsTableName,
                `${ProjectModelChangeSetsTableName}.project_model_change_set_uuid`,
                `${ProjectModelRevisionsTableName}.project_model_change_set_uuid`,
            )
            .select<
                { name: string; version: number; content: string | null }[]
            >({
                name: `${ProjectModelRevisionsTableName}.name`,
                version: `${ProjectModelRevisionsTableName}.document_version`,
                content: `${ProjectModelRevisionsTableName}.content_after`,
            })
            .where(
                `${ProjectModelChangeSetsTableName}.project_uuid`,
                projectUuid,
            )
            .whereIn(`${ProjectModelRevisionsTableName}.name`, [
                ...versions.keys(),
            ])
            // Narrowed here so no other version's YAML is read; the exact pairing is checked below.
            .whereIn(`${ProjectModelRevisionsTableName}.document_version`, [
                ...new Set(versions.values()),
            ])
            .orderBy(`${ProjectModelChangeSetsTableName}.created_at`, 'asc');
        return new Map(
            rows
                .filter(({ name, version }) => versions.get(name) === version)
                .map(({ name, content }) => [name, content]),
        );
    }

    /** The models other people have unpublished changes to, with who; never what the changes are. */
    async findOtherDrafters(
        projectUuid: string,
        userUuid: string,
    ): Promise<
        {
            name: string;
            models: string[];
            /** Their draft, oldest change first. */
            changes: SemanticLayerDraftModelInput[][];
        }[]
    > {
        const rows = await this.database(ProjectModelDraftChangesTableName)
            .innerJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${ProjectModelDraftChangesTableName}.created_by_user_uuid`,
            )
            .select<
                {
                    userUuid: string;
                    firstName: string;
                    lastName: string;
                    models: SemanticLayerDraftModelInput[];
                }[]
            >({
                userUuid: `${UserTableName}.user_uuid`,
                firstName: `${UserTableName}.first_name`,
                lastName: `${UserTableName}.last_name`,
                models: `${ProjectModelDraftChangesTableName}.models`,
            })
            .where(
                `${ProjectModelDraftChangesTableName}.project_uuid`,
                projectUuid,
            )
            .where(`${ProjectModelDraftChangesTableName}.status`, 'draft')
            .whereNot(
                `${ProjectModelDraftChangesTableName}.created_by_user_uuid`,
                userUuid,
            )
            .orderBy(`${ProjectModelDraftChangesTableName}.created_at`, 'asc');
        return Object.values(groupBy(rows, (row) => row.userUuid)).map(
            (changes) => ({
                name: `${changes[0].firstName} ${changes[0].lastName}`.trim(),
                models: [
                    ...new Set(
                        changes.flatMap(({ models }) =>
                            models.map(({ name }) => name),
                        ),
                    ),
                ],
                changes: changes.map(({ models }) => models),
            }),
        );
    }

    /** The latest change anyone else published to each of these models after the given time. */
    async findPublishedSince(
        projectUuid: string,
        userUuid: string,
        since: Map<string, Date>,
    ): Promise<Map<string, { by: string | null; at: Date }>> {
        if (since.size === 0) return new Map();
        const rows = await this.database(ProjectModelRevisionsTableName)
            .innerJoin(
                ProjectModelChangeSetsTableName,
                `${ProjectModelChangeSetsTableName}.project_model_change_set_uuid`,
                `${ProjectModelRevisionsTableName}.project_model_change_set_uuid`,
            )
            .leftJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${ProjectModelChangeSetsTableName}.created_by_user_uuid`,
            )
            .select<
                {
                    model: string;
                    firstName: string | null;
                    lastName: string | null;
                    at: Date;
                }[]
            >({
                model: `${ProjectModelRevisionsTableName}.name`,
                firstName: `${UserTableName}.first_name`,
                lastName: `${UserTableName}.last_name`,
                at: `${ProjectModelChangeSetsTableName}.created_at`,
            })
            .where(
                `${ProjectModelChangeSetsTableName}.project_uuid`,
                projectUuid,
            )
            .whereIn(`${ProjectModelRevisionsTableName}.name`, [
                ...since.keys(),
            ])
            // Nothing older than the oldest start can count; each model's own start is checked below.
            .where(
                `${ProjectModelChangeSetsTableName}.created_at`,
                '>',
                new Date(
                    Math.min(...[...since.values()].map((at) => at.getTime())),
                ),
            )
            .where((builder) =>
                builder
                    .whereNull(
                        `${ProjectModelChangeSetsTableName}.created_by_user_uuid`,
                    )
                    .orWhereNot(
                        `${ProjectModelChangeSetsTableName}.created_by_user_uuid`,
                        userUuid,
                    ),
            )
            .orderBy(`${ProjectModelChangeSetsTableName}.created_at`, 'asc');
        // Oldest first, so the last one kept for a model is its latest.
        return new Map(
            rows.flatMap(({ model, firstName, lastName, at }) => {
                const started = since.get(model);
                return started && at > started
                    ? [
                          [
                              model,
                              {
                                  by:
                                      firstName === null
                                          ? null
                                          : `${firstName} ${lastName ?? ''}`.trim(),
                                  at,
                              },
                          ],
                      ]
                    : [];
            }),
        );
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
                    pullRequestUrl: string | null;
                    revertedBy: string | null;
                }[]
            >({
                draftChangeUuid: `${ProjectModelDraftChangesTableName}.project_model_draft_change_uuid`,
                status: `${ProjectModelDraftChangesTableName}.status`,
                pullRequestUrl: `${ProjectModelDraftChangesTableName}.applied_pull_request_url`,
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
        return rows.map(
            ({ draftChangeUuid, status, pullRequestUrl, revertedBy }) => ({
                draftChangeUuid,
                status: revertedBy ? 'undone' : status,
                pullRequestUrl,
            }),
        );
    }

    async createDraftChange({
        projectUuid,
        userUuid,
        promptUuid,
        models,
        baseVersions,
    }: DraftOwner & {
        promptUuid: string | null;
        models: SemanticLayerDraftModelInput[];
        baseVersions: Record<string, number | null> | null;
    }): Promise<string> {
        const [{ project_model_draft_change_uuid: draftChangeUuid }] =
            await this.database(ProjectModelDraftChangesTableName)
                .insert({
                    project_uuid: projectUuid,
                    created_by_user_uuid: userUuid,
                    prompt_uuid: promptUuid,
                    models: JSON.stringify(models),
                    base_versions:
                        baseVersions === null
                            ? null
                            : JSON.stringify(baseVersions),
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
                'base_versions',
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
                // The oldest base recorded for this model among them.
                base_versions: JSON.stringify(
                    Object.fromEntries(
                        mixed
                            .flatMap(({ base_versions: bases }) =>
                                bases && model in bases ? [bases[model]] : [],
                            )
                            .sort((a, b) => (a ?? -1) - (b ?? -1))
                            .slice(0, 1)
                            .map((version) => [model, version]),
                    ),
                ),
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
            applied_pull_request_url: string | null;
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
        pullRequestUrl,
        ...owner
    }: DraftOwner & {
        drafts: DraftSelection;
        status: SettledDraftChangeStatus;
        /** The pull request an applied draft was sent as; null for anything else. */
        pullRequestUrl: string | null;
    }): Promise<number> {
        return this.database.transaction((trx) =>
            ProjectModelDocumentModel.updateSelectedDraftChanges(
                trx,
                owner,
                drafts,
                {
                    status,
                    applied_change_set_uuid: null,
                    applied_pull_request_url: pullRequestUrl,
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
            const added = documents
                .map(({ name }) => name)
                .filter((name) => !before.has(name));
            // A model made again keeps counting from its last version, so an old base never reads as live.
            const lastVersions = new Map(
                added.length === 0
                    ? []
                    : (
                          await trx(ProjectModelRevisionsTableName)
                              .innerJoin(
                                  ProjectModelChangeSetsTableName,
                                  `${ProjectModelChangeSetsTableName}.project_model_change_set_uuid`,
                                  `${ProjectModelRevisionsTableName}.project_model_change_set_uuid`,
                              )
                              .where(
                                  `${ProjectModelChangeSetsTableName}.project_uuid`,
                                  projectUuid,
                              )
                              .whereIn(
                                  `${ProjectModelRevisionsTableName}.name`,
                                  added,
                              )
                              .groupBy(`${ProjectModelRevisionsTableName}.name`)
                              .select({
                                  name: `${ProjectModelRevisionsTableName}.name`,
                              })
                              .max({
                                  version: `${ProjectModelRevisionsTableName}.document_version`,
                              })
                      ).map(({ name, version }): [string, number] => [
                          name,
                          Number(version),
                      ]),
            );
            await Promise.all(
                documents.map(async ({ name, content }) => {
                    const current = before.get(name);
                    const version =
                        (current?.document_version ??
                            lastVersions.get(name) ??
                            0) + 1;
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
                        applied_pull_request_url: null,
                    },
                );
            }

            // Deploy inside the lock so two writers never deploy out of order.
            return { changeSetUuid, deployed: await deploy() };
        });
    }
}
