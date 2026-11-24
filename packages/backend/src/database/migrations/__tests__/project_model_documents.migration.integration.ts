import {
    up as addWorkspace,
    down as dropWorkspace,
} from '../../../ee/database/migrations/20261117170000_add_workspace_uuid_to_project_model_draft_changes';
import { ProjectContextModel } from '../../../ee/models/ProjectContextModel';
import {
    ModelDocumentsChangedError,
    ProjectModelDocumentModel,
    type DraftSelection,
} from '../../../ee/models/ProjectModelDocumentModel';
import { SemanticStudioWorkspaceModel } from '../../../ee/models/SemanticStudioWorkspaceModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { down, up } from '../20261110100000_create_project_model_documents';
import { up as addPullRequestUrl } from '../20261111130000_add_pull_request_url_to_project_model_draft_changes';
import {
    up as addBaseVersions,
    down as dropBaseVersions,
} from '../20261111200000_add_base_versions_to_project_model_draft_changes';
import {
    up as addProjectContextEntries,
    down as dropProjectContextEntries,
} from '../20261124120000_add_project_context_entries_to_project_model_draft_changes';

describe('Project model documents on PostgreSQL', () => {
    let migrated: MigratedDatabase;
    let model: ProjectModelDocumentModel;
    let organization: { organization_id: number; organization_uuid: string };
    let userUuid: string;
    let projectUuid: string;

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        model = new ProjectModelDocumentModel({ database: migrated.database });
        [organization] = await migrated
            .database('organizations')
            .insert({ organization_name: 'Model documents test' })
            .returning(['organization_id', 'organization_uuid']);
        const [user] = await migrated
            .database('users')
            .insert({ first_name: 'Model', last_name: 'Author' } as never)
            .returning('user_uuid');
        userUuid = user.user_uuid;
    });

    beforeEach(async () => {
        const [project] = await migrated
            .database('projects')
            .insert({
                name: 'Model documents project',
                organization_id: organization.organization_id,
            } as never)
            .returning('project_uuid');
        projectUuid = project.project_uuid;
    });

    afterAll(async () => migrated?.destroy());

    const undo = (
        readVersions: Map<string, number>,
        documents: { name: string; content: string | null }[],
        reverts: string[],
    ) =>
        model.createChangeSet(
            {
                projectUuid,
                userUuid,
                workspaceUuid: null,
                source: { kind: 'undo', reverts },
                readVersions,
                documents,
            },
            async () => 'deployed',
        );

    const apply = (
        readVersions: Map<string, number>,
        documents: { name: string; content: string | null }[],
        {
            drafts = { changeUuids: [], model: null },
            promptUuid = null,
            deploy = async () => 'deployed',
        }: {
            drafts?: DraftSelection;
            promptUuid?: string | null;
            deploy?: () => Promise<string>;
        } = {},
    ) =>
        model.createChangeSet(
            {
                projectUuid,
                userUuid,
                workspaceUuid: null,
                source: { kind: 'draft', promptUuid, drafts },
                readVersions,
                documents,
            },
            deploy,
        );

    const draft = (
        models: string[],
        baseVersions: Record<string, number | null> | null = null,
    ) =>
        model.createDraftChange({
            projectUuid,
            userUuid,
            workspaceUuid: null,
            promptUuid: null,
            baseVersions,
            projectContextEntries: null,
            models: models.map((name) => ({
                name,
                yaml: 'label: Drafted\n',
                remove: [],
                removeModel: false,
            })),
        });

    const draftedModels = async () =>
        (
            await model.findDraftChanges({
                projectUuid,
                userUuid,
                workspaceUuid: null,
            })
        ).map(({ models }) => models.map(({ name }) => name));

    test('down and up remove and restore the tables', async () => {
        const { database } = migrated;
        await database.transaction(dropProjectContextEntries);
        await database.transaction(dropWorkspace);
        await database.transaction(dropBaseVersions);
        await database.transaction(down);
        expect(await database.schema.hasTable('project_model_documents')).toBe(
            false,
        );
        expect(
            await database.schema.hasTable('project_model_draft_changes'),
        ).toBe(false);
        await database.transaction(up);
        await database.transaction(addPullRequestUrl);
        await database.transaction(addBaseVersions);
        await database.transaction(addWorkspace);
        await database.transaction(addProjectContextEntries);
        expect(await database.schema.hasTable('project_model_revisions')).toBe(
            true,
        );
    });

    test('a commit writes documents and revisions, and bumps versions', async () => {
        await apply(new Map(), [{ name: 'orders', content: 'v1' }]);
        await apply(new Map([['orders', 1]]), [
            { name: 'orders', content: 'v2' },
        ]);
        expect(await model.findDocuments(projectUuid)).toEqual([
            { name: 'orders', content: 'v2', version: 2 },
        ]);
        const revisions = await migrated
            .database('project_model_revisions')
            .select('document_version', 'content_before', 'content_after')
            .where('name', 'orders')
            .whereIn(
                'project_model_change_set_uuid',
                migrated
                    .database('project_model_change_sets')
                    .select('project_model_change_set_uuid')
                    .where('project_uuid', projectUuid),
            )
            .orderBy('document_version');
        expect(revisions).toEqual([
            { document_version: 1, content_before: null, content_after: 'v1' },
            { document_version: 2, content_before: 'v1', content_after: 'v2' },
        ]);
    });

    test('a model history is newest first, with its content, question and the other models changed', async () => {
        const [thread] = await migrated
            .database('ai_thread')
            .insert({
                organization_uuid: organization.organization_uuid,
                project_uuid: projectUuid,
                created_from: 'web_app',
            } as never)
            .returning('ai_thread_uuid');
        const [{ ai_prompt_uuid: promptUuid }] = await migrated
            .database('ai_prompt')
            .insert({
                ai_thread_uuid: thread.ai_thread_uuid,
                prompt: 'Approval rate?',
            } as never)
            .returning('ai_prompt_uuid');
        const created = await apply(
            new Map(),
            [
                { name: 'orders', content: 'v1' },
                { name: 'customers', content: 'c1' },
            ],
            { promptUuid },
        );
        const versions = (orders: number) =>
            new Map([
                ['orders', orders],
                ['customers', 1],
            ]);
        const edited = await apply(versions(1), [
            { name: 'orders', content: 'v2' },
        ]);
        await undo(
            versions(2),
            [{ name: 'orders', content: 'v1' }],
            [edited.changeSetUuid],
        );

        const history = await model.findModelHistory(projectUuid, 'orders');
        expect(history.map((change) => change.contentAfter)).toEqual([
            'v1',
            'v2',
            'v1',
        ]);
        expect(history[0]).toMatchObject({ source: 'undo', reverted: false });
        expect(history[1]).toMatchObject({
            changeSetUuid: edited.changeSetUuid,
            source: 'draft',
            question: null,
            reverted: true,
            contentBefore: 'v1',
            otherModels: [],
        });
        expect(history[2]).toMatchObject({
            changeSetUuid: created.changeSetUuid,
            question: 'Approval rate?',
            reverted: false,
            contentBefore: null,
            otherModels: ['customers'],
        });
        expect(await model.findModelHistory(projectUuid, 'missing')).toEqual(
            [],
        );
    });

    test('a stale read is refused and writes nothing', async () => {
        await apply(new Map(), [{ name: 'orders', content: 'v1' }]);
        await expect(
            apply(new Map(), [{ name: 'customers', content: 'v1' }]),
        ).rejects.toThrow(ModelDocumentsChangedError);
        expect(
            (await model.findDocuments(projectUuid)).map(({ name }) => name),
        ).toEqual(['orders']);
    });

    test('two writers from the same read: one lands, the other must reread', async () => {
        let deploying = 0;
        let overlapped = false;
        const deploy = async () => {
            deploying += 1;
            if (deploying > 1) overlapped = true;
            await new Promise((resolve) => {
                setTimeout(resolve, 200);
            });
            deploying -= 1;
            return 'deployed';
        };
        const outcomes = await Promise.allSettled([
            apply(new Map(), [{ name: 'orders', content: 'a' }], { deploy }),
            apply(new Map(), [{ name: 'customers', content: 'b' }], { deploy }),
        ]);
        expect(outcomes.map(({ status }) => status).sort()).toEqual([
            'fulfilled',
            'rejected',
        ]);
        const rejected = outcomes.find(
            (outcome): outcome is PromiseRejectedResult =>
                outcome.status === 'rejected',
        );
        expect(rejected?.reason).toBeInstanceOf(ModelDocumentsChangedError);
        expect(overlapped).toBe(false);
        expect(await model.findDocuments(projectUuid)).toHaveLength(1);
    });

    test('a failed deploy rolls the documents back', async () => {
        await expect(
            apply(new Map(), [{ name: 'orders', content: 'v1' }], {
                deploy: async () => {
                    throw new Error('deploy failed');
                },
            }),
        ).rejects.toThrow('deploy failed');
        expect(await model.findDocuments(projectUuid)).toEqual([]);
        expect(
            await migrated
                .database('project_model_change_sets')
                .where('project_uuid', projectUuid),
        ).toEqual([]);
    });

    test('reverting marks the change set once, and deletes a created document', async () => {
        const created = await apply(new Map(), [
            { name: 'orders', content: 'v1' },
        ]);
        await undo(
            new Map([['orders', 1]]),
            [{ name: 'orders', content: null }],
            [created.changeSetUuid],
        );
        expect(await model.findDocuments(projectUuid)).toEqual([]);
        const [changeSet] = await model.findChangeSets(projectUuid, [
            created.changeSetUuid,
        ]);
        expect(changeSet.revertedByChangeSetUuid).not.toBeNull();
        expect(changeSet.revisions).toEqual([
            { name: 'orders', contentBefore: null, contentAfter: 'v1' },
        ]);
        await expect(
            undo(new Map(), [], [created.changeSetUuid]),
        ).rejects.toThrow(ModelDocumentsChangedError);
    });

    test('settling one model leaves the rest of a mixed draft change drafted', async () => {
        const draftChangeUuid = await draft(['orders', 'customers']);
        const settled = await model.updateDraftChangeStatus({
            projectUuid,
            userUuid,
            workspaceUuid: null,
            drafts: { changeUuids: [draftChangeUuid], model: 'customers' },
            status: 'discarded',
            pullRequestUrl: null,
            discardedByUserUuid: null,
        });
        expect(settled).toBe(1);
        expect(await draftedModels()).toEqual([['orders']]);
        expect(
            await model.findSettledDraftChanges(projectUuid, userUuid),
        ).toEqual([
            expect.objectContaining({ status: 'discarded', discardedBy: null }),
        ]);
    });

    test('a discard by someone other than the owner records who and when', async () => {
        const [admin] = await migrated
            .database('users')
            .insert({ first_name: 'Person', last_name: 'B' } as never)
            .returning('user_uuid');
        const draftChangeUuid = await draft(['orders']);
        await model.updateDraftChangeStatus({
            projectUuid,
            userUuid,
            workspaceUuid: null,
            drafts: { changeUuids: [draftChangeUuid], model: null },
            status: 'discarded',
            pullRequestUrl: null,
            discardedByUserUuid: admin.user_uuid,
        });
        expect(
            await model.findSettledDraftChanges(projectUuid, userUuid),
        ).toEqual([
            expect.objectContaining({
                status: 'discarded',
                discardedBy: { name: 'Person B', at: expect.any(Date) },
            }),
        ]);
    });

    test('names who else is drafting a model and what was published under a draft', async () => {
        const [other] = await migrated
            .database('users')
            .insert({ first_name: 'Ada', last_name: 'Lovelace' } as never)
            .returning('user_uuid');
        await migrated.database('project_model_draft_changes').insert({
            project_uuid: projectUuid,
            created_by_user_uuid: other.user_uuid,
            prompt_uuid: null,
            workspace_uuid: null,
            models: JSON.stringify([
                {
                    name: 'orders',
                    yaml: 'label: x',
                    remove: [],
                    removeModel: false,
                },
            ]),
        });
        expect(await model.findOtherDrafters(projectUuid, userUuid)).toEqual([
            {
                userUuid: other.user_uuid,
                name: 'Ada Lovelace',
                models: ['orders'],
                lastActiveAt: expect.any(Date),
                changes: [
                    {
                        draftChangeUuid: expect.any(String),
                        workspaceUuid: null,
                        models: [expect.objectContaining({ name: 'orders' })],
                    },
                ],
            },
        ]);
        expect(
            await model.findOtherDrafters(projectUuid, other.user_uuid),
        ).toEqual([]);

        const before = new Date(Date.now() - 60_000);
        await model.createChangeSet(
            {
                projectUuid,
                userUuid: other.user_uuid,
                workspaceUuid: null,
                source: {
                    kind: 'draft',
                    promptUuid: null,
                    drafts: { changeUuids: [], model: null },
                },
                readVersions: new Map(),
                documents: [{ name: 'orders', content: 'v1' }],
            },
            async () => 'deployed',
        );
        const published = await model.findPublishedSince(
            projectUuid,
            userUuid,
            new Map([
                ['orders', before],
                ['customers', before],
            ]),
        );
        expect(published.get('orders')).toEqual(
            expect.objectContaining({ by: 'Ada Lovelace', isYours: false }),
        );
        expect(published.has('customers')).toBe(false);
        // A person's own publish, from another of their workspaces, is marked as theirs.
        expect(
            (
                await model.findPublishedSince(
                    projectUuid,
                    other.user_uuid,
                    new Map([['orders', before]]),
                )
            ).get('orders'),
        ).toEqual(
            expect.objectContaining({ by: 'Ada Lovelace', isYours: true }),
        );
    });

    test('two draft changes trade places', async () => {
        const first = await draft(['orders']);
        const second = await draft(['customers']);
        expect(await draftedModels()).toEqual([['orders'], ['customers']]);
        await model.swapDraftChanges(
            { projectUuid, userUuid, workspaceUuid: null },
            [first, second],
        );
        expect(await draftedModels()).toEqual([['customers'], ['orders']]);
        await expect(
            model.swapDraftChanges(
                { projectUuid, userUuid, workspaceUuid: null },
                [first, '00000000-0000-0000-0000-000000000000'],
            ),
        ).rejects.toThrow('Nothing in the draft matches');
    });

    test('a draft change keeps the version it was made on, and can be based on a later one', async () => {
        await apply(new Map(), [{ name: 'orders', content: 'v1' }]);
        await apply(new Map([['orders', 1]]), [
            { name: 'orders', content: 'v2' },
        ]);
        await draft(['orders', 'customers'], { orders: 1, customers: null });
        await draft(['customers']);
        const bases = async () =>
            (
                await model.findDraftChanges({
                    projectUuid,
                    userUuid,
                    workspaceUuid: null,
                })
            ).map(({ baseVersions }) => baseVersions);
        expect(await bases()).toEqual([{ orders: 1, customers: null }, null]);
        expect(
            await model.findDocumentsAt(
                projectUuid,
                new Map([
                    ['orders', 1],
                    ['customers', 7],
                ]),
            ),
        ).toEqual(new Map([['orders', 'v1']]));
        // Live is at version 2: an older version is refused and nothing is written.
        expect(
            await model.rebaseDraftChanges(
                { projectUuid, userUuid, workspaceUuid: null },
                'orders',
                1,
            ),
        ).toBe(false);
        expect((await bases())[0]).toEqual({ orders: 1, customers: null });
        expect(
            await model.rebaseDraftChanges(
                { projectUuid, userUuid, workspaceUuid: null },
                'orders',
                2,
            ),
        ).toBe(true);
        await model.rebaseDraftChanges(
            { projectUuid, userUuid, workspaceUuid: null },
            'customers',
            null,
        );
        expect(await bases()).toEqual([
            { orders: 2, customers: null },
            { customers: null },
        ]);
    });

    test('a draft applied as a pull request keeps the link', async () => {
        const drafts = { changeUuids: [await draft(['orders'])], model: null };
        await model.updateDraftChangeStatus({
            projectUuid,
            userUuid,
            workspaceUuid: null,
            drafts,
            status: 'applied',
            pullRequestUrl: 'https://github.example/acme/analytics/pull/1',
            discardedByUserUuid: null,
        });
        expect(
            await model.findSettledDraftChanges(projectUuid, userUuid),
        ).toEqual([
            expect.objectContaining({
                status: 'applied',
                pullRequestUrl: 'https://github.example/acme/analytics/pull/1',
            }),
        ]);
    });

    test('a commit takes one model of a draft change live, and a failed deploy leaves the draft whole', async () => {
        const drafts = {
            changeUuids: [await draft(['orders', 'customers'])],
            model: 'orders',
        };
        const documents = [{ name: 'orders', content: 'v1' }];
        await expect(
            apply(new Map(), documents, {
                drafts,
                deploy: async () => {
                    throw new Error('deploy failed');
                },
            }),
        ).rejects.toThrow('deploy failed');
        expect(await draftedModels()).toEqual([['orders', 'customers']]);

        await apply(new Map(), documents, { drafts });
        expect(await draftedModels()).toEqual([['customers']]);
        expect(
            await model.findSettledDraftChanges(projectUuid, userUuid),
        ).toEqual([expect.objectContaining({ status: 'applied' })]);
    });

    test('a commit refuses a draft change that was settled meanwhile', async () => {
        const drafts = { changeUuids: [await draft(['orders'])], model: null };
        await model.updateDraftChangeStatus({
            projectUuid,
            userUuid,
            workspaceUuid: null,
            drafts,
            status: 'discarded',
            pullRequestUrl: null,
            discardedByUserUuid: null,
        });
        await expect(
            apply(new Map(), [{ name: 'orders', content: 'v1' }], { drafts }),
        ).rejects.toThrow(ModelDocumentsChangedError);
        expect(await model.findDocuments(projectUuid)).toEqual([]);
    });

    test('a draft impact check is one per person and project, and a finished older check does not overwrite a newer one', async () => {
        const owner = { projectUuid, userUuid };
        expect(await model.findDraftImpactCheck(owner)).toBeNull();

        await model.startDraftImpactCheck({ ...owner, draftHash: 'first' });
        await model.startDraftImpactCheck({ ...owner, draftHash: 'second' });
        const breaks = {
            draft: [
                {
                    name: 'Orders by customer',
                    error: 'no field',
                    chartUuid: null,
                    dashboardUuid: null,
                },
            ],
            models: {},
        };
        await model.finishDraftImpactCheck({
            ...owner,
            draftHash: 'first',
            outcome: { status: 'done', breaks },
        });
        expect(await model.findDraftImpactCheck(owner)).toMatchObject({
            draftHash: 'second',
            status: 'checking',
            breaks: null,
        });

        await model.finishDraftImpactCheck({
            ...owner,
            draftHash: 'second',
            outcome: { status: 'done', breaks },
        });
        expect(await model.findDraftImpactCheck(owner)).toMatchObject({
            draftHash: 'second',
            status: 'done',
            breaks,
        });
    });

    test('first edit checks out a threadless change and stale edits cannot move to another checkout', async () => {
        const workspaces = new SemanticStudioWorkspaceModel({
            database: migrated.database,
        });
        const owner = { projectUuid, userUuid };
        const input = {
            ...owner,
            workspaceUuid: null,
            baseVersions: null,
            projectContextEntries: null,
            promptUuid: null,
            changeName: 'Orders revenue',
            models: [
                {
                    name: 'orders',
                    yaml: 'label: Orders',
                    remove: [],
                    removeModel: false,
                },
            ],
        };
        const first = await model.createCheckedOutDraftChange(
            input,
            organization.organization_uuid,
        );
        expect(first.startedChange).toEqual({
            workspaceUuid: first.workspaceUuid,
            name: 'Orders revenue',
        });
        expect(await workspaces.findActive(owner)).toMatchObject({
            workspaceUuid: first.workspaceUuid,
            threadUuid: null,
        });
        await workspaces.create(
            owner,
            organization.organization_uuid,
            'Second',
        );
        await expect(
            model.createCheckedOutDraftChange(
                { ...input, workspaceUuid: first.workspaceUuid },
                organization.organization_uuid,
            ),
        ).rejects.toThrow(ModelDocumentsChangedError);
        expect(await workspaces.listChanges(owner, null)).toEqual(
            expect.arrayContaining([
                {
                    name: 'Orders revenue',
                    isCheckedOut: false,
                    models: [{ name: 'orders', editedIn: ['by_hand'] }],
                },
                { name: 'Second', isCheckedOut: true, models: [] },
            ]),
        );
    });

    test('a chat that writes after its draft was published reopens that draft', async () => {
        const workspaces = new SemanticStudioWorkspaceModel({
            database: migrated.database,
        });
        const owner = { projectUuid, userUuid };
        const [{ ai_thread_uuid: threadUuid }] = await migrated
            .database('ai_thread')
            .insert({
                organization_uuid: organization.organization_uuid,
                project_uuid: projectUuid,
                created_from: 'semantic_studio',
            } as never)
            .returning('ai_thread_uuid');
        const [{ ai_prompt_uuid: promptUuid }] = await migrated
            .database('ai_prompt')
            .insert({
                ai_thread_uuid: threadUuid,
                prompt: 'Add a model',
            } as never)
            .returning('ai_prompt_uuid');
        const input = {
            ...owner,
            workspaceUuid: null,
            baseVersions: null,
            projectContextEntries: null,
            promptUuid,
            changeName: 'A model',
            models: [
                {
                    name: 'orders',
                    yaml: 'label: Orders',
                    remove: [],
                    removeModel: false,
                },
            ],
        };
        const first = await model.createCheckedOutDraftChange(
            input,
            organization.organization_uuid,
        );
        await migrated
            .database('semantic_studio_workspaces')
            .where('semantic_studio_workspace_uuid', first.workspaceUuid)
            .update({
                is_active: false,
                finished_at: migrated.database.fn.now(),
            });

        const second = await model.createCheckedOutDraftChange(
            input,
            organization.organization_uuid,
        );

        expect(second.workspaceUuid).toBe(first.workspaceUuid);
        expect(await workspaces.findActive(owner)).toMatchObject({
            workspaceUuid: first.workspaceUuid,
            threadUuid,
        });
        expect(
            await migrated
                .database('semantic_studio_workspaces')
                .where('semantic_studio_workspace_uuid', first.workspaceUuid)
                .first(),
        ).toMatchObject({ finished_at: null });
    });

    test('a draft belongs only to its workspace', async () => {
        const workspace = async () => {
            const [{ ai_thread_uuid: threadUuid }] = await migrated
                .database('ai_thread')
                .insert({
                    organization_uuid: organization.organization_uuid,
                    project_uuid: projectUuid,
                    created_from: 'semantic_studio',
                } as never)
                .returning('ai_thread_uuid');
            const [row] = await migrated
                .database('semantic_studio_workspaces')
                .insert({
                    organization_uuid: organization.organization_uuid,
                    project_uuid: projectUuid,
                    created_by_user_uuid: userUuid,
                    ai_thread_uuid: threadUuid,
                    name: 'A change',
                    is_active: false,
                })
                .returning('semantic_studio_workspace_uuid');
            return row.semantic_studio_workspace_uuid;
        };
        const [first, second] = [await workspace(), await workspace()];
        const linked = await migrated
            .database('semantic_studio_workspaces')
            .where('semantic_studio_workspace_uuid', first)
            .first();
        if (!linked?.ai_thread_uuid)
            throw new Error('Expected a linked conversation');
        await migrated
            .database('ai_thread')
            .where('ai_thread_uuid', linked.ai_thread_uuid)
            .delete();
        expect(
            await migrated
                .database('semantic_studio_workspaces')
                .where('semantic_studio_workspace_uuid', first)
                .first(),
        ).toMatchObject({ ai_thread_uuid: null });
        const draftIn = (workspaceUuid: string | null, name: string) =>
            model.createDraftChange({
                projectUuid,
                userUuid,
                workspaceUuid,
                promptUuid: null,
                baseVersions: null,
                projectContextEntries: null,
                models: [
                    {
                        name,
                        yaml: 'label: x\n',
                        remove: [],
                        removeModel: false,
                    },
                ],
            });
        const modelsIn = async (workspaceUuid: string | null) =>
            (
                await model.findDraftChanges({
                    projectUuid,
                    userUuid,
                    workspaceUuid,
                })
            ).flatMap(({ models }) => models.map(({ name }) => name));
        await draftIn(null, 'legacy');
        await draftIn(first, 'orders');
        await draftIn(second, 'customers');
        expect(await modelsIn(first)).toEqual(['orders']);
        expect(await modelsIn(second)).toEqual(['customers']);
        expect(await modelsIn(null)).toEqual(['legacy']);

        await migrated
            .database('semantic_studio_workspaces')
            .where('semantic_studio_workspace_uuid', second)
            .delete();
        // A change outlives its workspace as one from before workspaces.
        expect(await modelsIn(null)).toEqual(['legacy', 'customers']);
    });

    describe('project context published with the draft', () => {
        const entry = {
            id: 'active',
            kind: 'definition' as const,
            content: '"Active" means ordered in the last 30 days.',
            terms: ['active'],
            objects: [],
        };
        const contextModel = () =>
            new ProjectContextModel({ database: migrated.database });
        const writeContext = async (
            trx: Parameters<ProjectContextModel['upsertEntries']>[2],
        ) => {
            await contextModel().upsertEntries(projectUuid, [entry], trx);
        };

        test('a failed deploy takes the context back with the models', async () => {
            const drafts = {
                changeUuids: [await draft(['orders'])],
                model: null,
            };
            await expect(
                model.createChangeSet(
                    {
                        projectUuid,
                        userUuid,
                        workspaceUuid: null,
                        source: { kind: 'draft', promptUuid: null, drafts },
                        readVersions: new Map(),
                        documents: [{ name: 'orders', content: 'v1' }],
                        withSettled: writeContext,
                    },
                    async () => {
                        throw new Error('deploy failed');
                    },
                ),
            ).rejects.toThrow('deploy failed');
            expect(await contextModel().getDocument(projectUuid)).toEqual([]);
            expect(await draftedModels()).toEqual([['orders']]);
        });

        test('a draft settled meanwhile writes no context', async () => {
            const drafts = {
                changeUuids: [await draft(['orders'])],
                model: null,
            };
            await model.updateDraftChangeStatus({
                projectUuid,
                userUuid,
                workspaceUuid: null,
                drafts,
                status: 'discarded',
                pullRequestUrl: null,
                discardedByUserUuid: null,
            });
            await expect(
                model.createChangeSet(
                    {
                        projectUuid,
                        userUuid,
                        workspaceUuid: null,
                        source: { kind: 'draft', promptUuid: null, drafts },
                        readVersions: new Map(),
                        documents: [{ name: 'orders', content: 'v1' }],
                        withSettled: writeContext,
                    },
                    async () => 'deployed',
                ),
            ).rejects.toThrow(ModelDocumentsChangedError);
            expect(await contextModel().getDocument(projectUuid)).toEqual([]);
        });

        test('settling a context-only draft commits or rolls back with its context', async () => {
            const drafts = { changeUuids: [await draft([])], model: null };
            const settle = (
                withSettled: (
                    trx: Parameters<ProjectContextModel['upsertEntries']>[2],
                    settled: number,
                ) => Promise<void>,
            ) =>
                model.updateDraftChangeStatus({
                    projectUuid,
                    userUuid,
                    workspaceUuid: null,
                    drafts,
                    status: 'applied',
                    pullRequestUrl: null,
                    discardedByUserUuid: null,
                    withSettled,
                });
            await expect(
                settle(async (trx) => {
                    await writeContext(trx);
                    throw new Error('refused');
                }),
            ).rejects.toThrow('refused');
            expect(await contextModel().getDocument(projectUuid)).toEqual([]);
            expect(await draftedModels()).toEqual([[]]);

            let settledRows = -1;
            await settle(async (trx, settled) => {
                settledRows = settled;
                await writeContext(trx);
            });
            expect(settledRows).toBe(1);
            expect(await contextModel().getDocument(projectUuid)).toEqual([
                entry,
            ]);
            expect(await draftedModels()).toEqual([]);
        });

        test('a discard that lands first leaves nothing to settle', async () => {
            const drafts = { changeUuids: [await draft([])], model: null };
            await model.updateDraftChangeStatus({
                projectUuid,
                userUuid,
                workspaceUuid: null,
                drafts,
                status: 'discarded',
                pullRequestUrl: null,
                discardedByUserUuid: null,
            });
            let settledRows = -1;
            await model.updateDraftChangeStatus({
                projectUuid,
                userUuid,
                workspaceUuid: null,
                drafts,
                status: 'applied',
                pullRequestUrl: null,
                discardedByUserUuid: null,
                withSettled: async (_trx, settled) => {
                    settledRows = settled;
                },
            });
            expect(settledRows).toBe(0);
        });
    });
});
