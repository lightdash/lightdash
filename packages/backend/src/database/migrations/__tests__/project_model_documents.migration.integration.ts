import {
    ModelDocumentsChangedError,
    ProjectModelDocumentModel,
    type DraftSelection,
} from '../../../ee/models/ProjectModelDocumentModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { down, up } from '../20261110100000_create_project_model_documents';
import { up as addPullRequestUrl } from '../20261111130000_add_pull_request_url_to_project_model_draft_changes';

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
                source: { kind: 'draft', promptUuid, drafts },
                readVersions,
                documents,
            },
            deploy,
        );

    const draft = (models: string[]) =>
        model.createDraftChange({
            projectUuid,
            userUuid,
            promptUuid: null,
            models: models.map((name) => ({
                name,
                yaml: 'label: Drafted\n',
                remove: [],
                removeModel: false,
            })),
        });

    const draftedModels = async () =>
        (await model.findDraftChanges(projectUuid, userUuid)).map(
            ({ models }) => models.map(({ name }) => name),
        );

    test('down and up remove and restore the tables', async () => {
        const { database } = migrated;
        await database.transaction(down);
        expect(await database.schema.hasTable('project_model_documents')).toBe(
            false,
        );
        expect(
            await database.schema.hasTable('project_model_draft_changes'),
        ).toBe(false);
        await database.transaction(up);
        await database.transaction(addPullRequestUrl);
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
            drafts: { changeUuids: [draftChangeUuid], model: 'customers' },
            status: 'discarded',
            pullRequestUrl: null,
        });
        expect(settled).toBe(1);
        expect(await draftedModels()).toEqual([['orders']]);
        expect(
            await model.findSettledDraftChanges(projectUuid, userUuid),
        ).toEqual([expect.objectContaining({ status: 'discarded' })]);
    });

    test('a draft applied as a pull request keeps the link', async () => {
        const drafts = { changeUuids: [await draft(['orders'])], model: null };
        await model.updateDraftChangeStatus({
            projectUuid,
            userUuid,
            drafts,
            status: 'applied',
            pullRequestUrl: 'https://github.example/acme/analytics/pull/1',
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
            drafts,
            status: 'discarded',
            pullRequestUrl: null,
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
});
