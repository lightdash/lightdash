import { SEED_ORG_1_ADMIN, SEED_PROJECT } from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import {
    AppsTableName,
    AppThreadsTableName,
    AppVersionsTableName,
} from '../database/entities/apps';
import { backfillThreadOne } from '../database/migrations/20260917100000_create_app_threads';
import { getTestContext } from '../vitest.setup.integration';
import { AppModel } from './AppModel';

const projectUuid = SEED_PROJECT.project_uuid;
const userUuid = SEED_ORG_1_ADMIN.user_uuid;

describe('AppModel threads PostgreSQL integration', () => {
    let database: Knex;
    let transaction: Knex.Transaction;
    let model: AppModel;

    beforeAll(() => {
        database = getTestContext().db;
    });

    beforeEach(async () => {
        transaction = await database.transaction();
        model = new AppModel({ database: transaction });
    });

    afterEach(async () => {
        await transaction.rollback();
    });

    const createApp = () =>
        model.createWithVersion(
            {
                project_uuid: projectUuid,
                created_by_user_uuid: userUuid,
                name: `threads ${randomUUID()}`,
            },
            { version: 1, prompt: 'first prompt' },
            'ready',
        );

    it('creates thread 1 with the app and puts the first version under it', async () => {
        const { app, version, thread } = await createApp();

        const current = await model.getCurrentThread(app.app_id);
        expect(current.thread_number).toBe(1);
        expect(current.origin).toBe('builder');
        expect(current.ai_thread_uuid).toBeNull();
        expect(thread.app_thread_uuid).toBe(current.app_thread_uuid);

        const stored = await model.getVersion(app.app_id, version.version);
        expect(stored?.app_thread_uuid).toBe(current.app_thread_uuid);
        expect(stored?.thread_number).toBe(1);
    });

    it('records the origin and Ask AI thread of an AI-created app', async () => {
        const aiThreadUuid = randomUUID();
        const { app } = await model.createWithVersion(
            {
                project_uuid: projectUuid,
                created_by_user_uuid: userUuid,
                name: `ai ${randomUUID()}`,
            },
            { version: 1, prompt: 'from ask ai' },
            'pending',
            undefined,
            undefined,
            undefined,
            { thread: { origin: 'ai_thread', aiThreadUuid } },
        );

        const current = await model.getCurrentThread(app.app_id);
        expect(current.origin).toBe('ai_thread');
        expect(current.ai_thread_uuid).toBe(aiThreadUuid);
    });

    it('numbers each new thread one higher and makes it current', async () => {
        const { app } = await createApp();

        const second = await model.createThread({
            appUuid: app.app_id,
            origin: 'builder',
            aiThreadUuid: null,
            createdByUserUuid: userUuid,
        });
        const third = await model.createThread({
            appUuid: app.app_id,
            origin: 'builder',
            aiThreadUuid: null,
            createdByUserUuid: userUuid,
        });

        expect(second.thread_number).toBe(2);
        expect(third.thread_number).toBe(3);
        const current = await model.getCurrentThread(app.app_id);
        expect(current.app_thread_uuid).toBe(third.app_thread_uuid);
        expect(await model.findThreadByUuid(second.app_thread_uuid)).toEqual(
            second,
        );
    });

    it('appends new versions to the current thread', async () => {
        const { app, thread: first } = await createApp();
        const second = await model.createThread({
            appUuid: app.app_id,
            origin: 'builder',
            aiThreadUuid: null,
            createdByUserUuid: userUuid,
        });

        await model.createVersion(
            app.app_id,
            { version: 2, prompt: 'after clear' },
            'ready',
            userUuid,
        );

        const stored = await model.getVersion(app.app_id, 2);
        expect(stored?.app_thread_uuid).toBe(second.app_thread_uuid);
        expect(stored?.thread_number).toBe(2);
        const firstVersion = await model.getVersion(app.app_id, 1);
        expect(firstVersion?.app_thread_uuid).toBe(first.app_thread_uuid);
    });

    it('puts a restore made while thread 3 is current under thread 3', async () => {
        const { app } = await createApp();
        await model.createThread({
            appUuid: app.app_id,
            origin: 'builder',
            aiThreadUuid: null,
            createdByUserUuid: userUuid,
        });
        const third = await model.createThread({
            appUuid: app.app_id,
            origin: 'builder',
            aiThreadUuid: null,
            createdByUserUuid: userUuid,
        });

        // Mirrors restoreVersion: the current thread is resolved up front and
        // passed explicitly.
        const current = await model.getCurrentThread(app.app_id);
        await model.createVersion(
            app.app_id,
            { version: 2, prompt: 'Restore version 1' },
            'ready',
            userUuid,
            undefined,
            undefined,
            undefined,
            { appThreadUuid: current.app_thread_uuid },
        );

        const restored = await model.getVersion(app.app_id, 2);
        expect(restored?.app_thread_uuid).toBe(third.app_thread_uuid);
        expect(restored?.thread_number).toBe(3);
    });

    describe('threadHasVersionThatReachedCodingAgent', () => {
        const newThread = (appUuid: string) =>
            model.createThread({
                appUuid,
                origin: 'builder',
                aiThreadUuid: null,
                createdByUserUuid: userUuid,
            });

        const buildVersionWithAgentNarration = async (
            appUuid: string,
            version: number,
        ) => {
            await model.createVersion(
                appUuid,
                { version, prompt: `prompt ${version}` },
                'pending',
                userUuid,
            );
            await model.recordBuildNarration(
                appUuid,
                version,
                'Reading App.tsx',
                'tool',
            );
        };

        it('is false for a freshly cleared thread', async () => {
            const { app } = await createApp();
            const second = await newThread(app.app_id);

            expect(
                await model.threadHasVersionThatReachedCodingAgent(
                    second.app_thread_uuid,
                    null,
                ),
            ).toBe(false);
        });

        it('ignores versions written without the agent, such as restores', async () => {
            const { app } = await createApp();
            const second = await newThread(app.app_id);
            await model.createVersion(
                app.app_id,
                { version: 2, prompt: 'Restore version 1' },
                'ready',
                userUuid,
            );

            expect(
                await model.threadHasVersionThatReachedCodingAgent(
                    second.app_thread_uuid,
                    null,
                ),
            ).toBe(false);
        });

        it('is true once a version in the thread ran the agent, excluding the one being built', async () => {
            const { app } = await createApp();
            const second = await newThread(app.app_id);
            await buildVersionWithAgentNarration(app.app_id, 2);

            expect(
                await model.threadHasVersionThatReachedCodingAgent(
                    second.app_thread_uuid,
                    2,
                ),
            ).toBe(false);
            expect(
                await model.threadHasVersionThatReachedCodingAgent(
                    second.app_thread_uuid,
                    3,
                ),
            ).toBe(true);
        });

        it('counts every earlier version of a backfilled thread 1, narration or not', async () => {
            const { app, thread: first } = await createApp();

            expect(
                await model.threadHasVersionThatReachedCodingAgent(
                    first.app_thread_uuid,
                    1,
                ),
            ).toBe(false);
            expect(
                await model.threadHasVersionThatReachedCodingAgent(
                    first.app_thread_uuid,
                    null,
                ),
            ).toBe(true);
            await model.createVersion(
                app.app_id,
                { version: 2, prompt: 'a second prompt' },
                'pending',
                userUuid,
            );
            expect(
                await model.threadHasVersionThatReachedCodingAgent(
                    first.app_thread_uuid,
                    2,
                ),
            ).toBe(true);
        });

        it('counts pre-thread versions towards thread 1 only', async () => {
            const { app, thread: first } = await createApp();
            await transaction(AppVersionsTableName).insert({
                app_id: app.app_id,
                version: 2,
                prompt: 'built by an old pod',
                status: 'pending',
                created_by_user_uuid: userUuid,
            });
            await model.recordBuildNarration(
                app.app_id,
                2,
                'Editing App.tsx',
                'tool',
            );
            const second = await newThread(app.app_id);

            expect(
                await model.threadHasVersionThatReachedCodingAgent(
                    first.app_thread_uuid,
                    null,
                ),
            ).toBe(true);
            expect(
                await model.threadHasVersionThatReachedCodingAgent(
                    second.app_thread_uuid,
                    null,
                ),
            ).toBe(false);
        });
    });

    describe('setThreadCodingAgentSessionId', () => {
        it('stores the first session id a thread learns and keeps it on later turns', async () => {
            const { thread } = await createApp();
            expect(thread.coding_agent_session_id).toBeNull();

            expect(
                await model.setThreadCodingAgentSessionId(
                    thread.app_thread_uuid,
                    { replacing: null, sessionId: 'session-1' },
                ),
            ).toBe(true);
            // A later turn that still believed the slot was empty cannot clobber it.
            expect(
                await model.setThreadCodingAgentSessionId(
                    thread.app_thread_uuid,
                    { replacing: null, sessionId: 'session-2' },
                ),
            ).toBe(false);

            const stored = await model.findThreadByUuid(thread.app_thread_uuid);
            expect(stored?.coding_agent_session_id).toBe('session-1');
        });

        it('replaces a lost session only when the stored id is the one that was lost', async () => {
            const { thread } = await createApp();
            await model.setThreadCodingAgentSessionId(thread.app_thread_uuid, {
                replacing: null,
                sessionId: 'session-1',
            });

            expect(
                await model.setThreadCodingAgentSessionId(
                    thread.app_thread_uuid,
                    { replacing: 'session-0', sessionId: 'session-3' },
                ),
            ).toBe(false);
            expect(
                await model.setThreadCodingAgentSessionId(
                    thread.app_thread_uuid,
                    { replacing: 'session-1', sessionId: 'session-2' },
                ),
            ).toBe(true);

            const stored = await model.findThreadByUuid(thread.app_thread_uuid);
            expect(stored?.coding_agent_session_id).toBe('session-2');
        });

        it('leaves other threads of the app untouched', async () => {
            const { app, thread: first } = await createApp();
            const second = await model.createThread({
                appUuid: app.app_id,
                origin: 'builder',
                aiThreadUuid: null,
                createdByUserUuid: userUuid,
            });

            await model.setThreadCodingAgentSessionId(second.app_thread_uuid, {
                replacing: null,
                sessionId: 'session-2',
            });

            expect(
                (await model.findThreadByUuid(first.app_thread_uuid))
                    ?.coding_agent_session_id,
            ).toBeNull();
            expect(
                (await model.findThreadByUuid(second.app_thread_uuid))
                    ?.coding_agent_session_id,
            ).toBe('session-2');
        });
    });

    it('reads a version with no thread back under thread 1', async () => {
        const { app, thread } = await createApp();
        await transaction(AppVersionsTableName).insert({
            app_id: app.app_id,
            version: 2,
            prompt: 'written by an old pod',
            status: 'ready',
            created_by_user_uuid: userUuid,
        });

        const single = await model.getVersion(app.app_id, 2);
        expect(single?.app_thread_uuid).toBe(thread.app_thread_uuid);
        expect(single?.thread_number).toBe(1);

        const latest = await model.getLatestVersion(app.app_id);
        expect(latest?.version).toBe(2);
        expect(latest?.app_thread_uuid).toBe(thread.app_thread_uuid);

        const { versions, currentThread } = await model.getAppWithVersions(
            app.app_id,
            projectUuid,
        );
        expect(currentThread.app_thread_uuid).toBe(thread.app_thread_uuid);
        expect(
            versions.map((v) => [
                v.version,
                v.app_thread_uuid,
                v.thread_number,
            ]),
        ).toEqual([
            [2, thread.app_thread_uuid, 1],
            [1, thread.app_thread_uuid, 1],
        ]);
    });

    it('gives an app with no threads its thread 1 on first read', async () => {
        const [app] = await transaction(AppsTableName)
            .insert({
                project_uuid: projectUuid,
                created_by_user_uuid: userUuid,
                slug: `old-pod-${randomUUID()}`,
            })
            .returning('*');
        await transaction(AppVersionsTableName).insert({
            app_id: app.app_id,
            version: 1,
            prompt: 'pre-thread version',
            status: 'ready',
            created_by_user_uuid: userUuid,
        });

        const { currentThread, versions } = await model.getAppWithVersions(
            app.app_id,
            projectUuid,
        );
        expect(currentThread.thread_number).toBe(1);
        expect(currentThread.created_by_user_uuid).toBe(userUuid);
        expect(versions[0].app_thread_uuid).toBe(currentThread.app_thread_uuid);
    });

    it('reads a version of an app with no threads under a thread 1 it creates', async () => {
        const [app] = await transaction(AppsTableName)
            .insert({
                project_uuid: projectUuid,
                created_by_user_uuid: userUuid,
                slug: `old-pod-read-${randomUUID()}`,
            })
            .returning('*');
        await transaction(AppVersionsTableName).insert({
            app_id: app.app_id,
            version: 1,
            prompt: 'pre-thread version',
            status: 'ready',
            created_by_user_uuid: userUuid,
        });

        const ready = await model.getLatestReadyVersion(app.app_id);
        const single = await model.getVersion(app.app_id, 1);
        const threads = await transaction(AppThreadsTableName).where({
            app_id: app.app_id,
        });

        expect(threads).toHaveLength(1);
        expect(threads[0].thread_number).toBe(1);
        expect(ready?.app_thread_uuid).toBe(threads[0].app_thread_uuid);
        expect(ready?.thread_number).toBe(1);
        expect(single?.app_thread_uuid).toBe(threads[0].app_thread_uuid);
    });

    it('never gives concurrent threads the same number', async () => {
        // Committed rows: concurrency needs separate connections.
        const committedModel = new AppModel({ database });
        const { app } = await committedModel.createWithVersion(
            {
                project_uuid: projectUuid,
                created_by_user_uuid: userUuid,
                name: `concurrent ${randomUUID()}`,
            },
            { version: 1, prompt: 'first prompt' },
            'ready',
        );
        try {
            const threads = await Promise.all(
                Array.from({ length: 5 }, () =>
                    committedModel.createThread({
                        appUuid: app.app_id,
                        origin: 'builder',
                        aiThreadUuid: null,
                        createdByUserUuid: userUuid,
                    }),
                ),
            );

            expect(threads.map((t) => t.thread_number).sort()).toEqual([
                2, 3, 4, 5, 6,
            ]);
            const current = await committedModel.getCurrentThread(app.app_id);
            expect(current.thread_number).toBe(6);
        } finally {
            await database(AppsTableName)
                .where({ app_id: app.app_id })
                .delete();
        }
    });

    it('backfills thread 1 idempotently, soft-deleted apps included', async () => {
        const [liveApp, deletedApp] = await transaction(AppsTableName)
            .insert([
                {
                    project_uuid: projectUuid,
                    created_by_user_uuid: userUuid,
                    slug: `backfill-live-${randomUUID()}`,
                },
                {
                    project_uuid: projectUuid,
                    created_by_user_uuid: userUuid,
                    slug: `backfill-deleted-${randomUUID()}`,
                },
            ])
            .returning('*');
        await transaction(AppsTableName)
            .where({ app_id: deletedApp.app_id })
            .update({ deleted_at: new Date(), deleted_by_user_uuid: userUuid });
        await transaction(AppVersionsTableName).insert(
            [liveApp, deletedApp].flatMap((app) =>
                [1, 2].map((version) => ({
                    app_id: app.app_id,
                    version,
                    prompt: `v${version}`,
                    status: 'ready' as const,
                    created_by_user_uuid: userUuid,
                })),
            ),
        );

        const first = await backfillThreadOne(transaction);
        const second = await backfillThreadOne(transaction);

        expect(first.threadsInserted).toBeGreaterThanOrEqual(2);
        expect(first.versionsAttached).toBeGreaterThanOrEqual(4);
        expect(second).toEqual({ threadsInserted: 0, versionsAttached: 0 });

        const threads = await transaction(AppThreadsTableName)
            .whereIn('app_id', [liveApp.app_id, deletedApp.app_id])
            .orderBy('app_id');
        expect(threads).toHaveLength(2);
        expect(threads.map((t) => t.thread_number)).toEqual([1, 1]);
        expect(threads.map((t) => t.origin)).toEqual(['builder', 'builder']);
        expect(threads.map((t) => t.created_by_user_uuid)).toEqual([
            userUuid,
            userUuid,
        ]);
        const deletedThread = threads.find(
            (t) => t.app_id === deletedApp.app_id,
        );
        expect(deletedThread?.created_at).toEqual(deletedApp.created_at);

        const versions = await transaction(AppVersionsTableName)
            .whereIn('app_id', [liveApp.app_id, deletedApp.app_id])
            .select('app_id', 'app_thread_uuid');
        expect(versions).toHaveLength(4);
        versions.forEach((v) => {
            expect(v.app_thread_uuid).toBe(
                threads.find((t) => t.app_id === v.app_id)?.app_thread_uuid,
            );
        });
    });
});
