import {
    APP_STATE_MAX_HISTORY_VERSIONS,
    APP_STATE_MAX_KEYS_PER_SCOPE,
} from '@lightdash/common';
import { randomUUID } from 'node:crypto';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../../testing/migratedDatabase';
import { AppStateModel } from '../../../models/AppStateModel';

vi.mock('../../../../config/lightdashConfig', async () => {
    const { lightdashConfigMock: config } =
        await import('../../../../config/lightdashConfig.mock');
    return { lightdashConfig: config };
});

let migrated: MigratedDatabase;
let model: AppStateModel;

type SeedUser = { user_uuid: string; first_name: string; last_name: string };
type SeedApp = {
    app_id: string;
    name: string;
    project_uuid: string;
    created_by_user_uuid: string;
};

type Fixture = {
    appUuid: string;
    otherAppUuid: string;
    alice: string;
    bob: string;
};

const MAX_KEYS = APP_STATE_MAX_KEYS_PER_SCOPE;

const seed = async (): Promise<Fixture> => {
    const { database } = migrated;
    const [org] = await database<{
        organization_id: number;
        organization_name: string;
    }>('organizations')
        .insert({ organization_name: `org-${randomUUID()}` })
        .returning('organization_id');
    const [project] = await database<{
        project_uuid: string;
        name: string;
        organization_id: number;
    }>('projects')
        .insert({
            name: 'project',
            organization_id: org.organization_id,
        })
        .returning('project_uuid');
    const [alice] = await database<SeedUser>('users')
        .insert({ first_name: 'Alice', last_name: 'Ada' })
        .returning('user_uuid');
    const [bob] = await database<SeedUser>('users')
        .insert({ first_name: 'Bob', last_name: 'Bee' })
        .returning('user_uuid');
    const [app] = await database<SeedApp>('apps')
        .insert({
            name: 'app',
            project_uuid: project.project_uuid,
            created_by_user_uuid: alice.user_uuid,
        })
        .returning('app_id');
    const [otherApp] = await database<SeedApp>('apps')
        .insert({
            name: 'other app',
            project_uuid: project.project_uuid,
            created_by_user_uuid: alice.user_uuid,
        })
        .returning('app_id');
    return {
        appUuid: app.app_id,
        otherAppUuid: otherApp.app_id,
        alice: alice.user_uuid,
        bob: bob.user_uuid,
    };
};

const setUser = (
    appUuid: string,
    userUuid: string,
    key: string,
    value: unknown,
) =>
    model.upsertUserState({ appUuid, userUuid, key, value, maxKeys: MAX_KEYS });

const writer = (userUuid: string) => ({ kind: 'user', userUuid }) as const;

const setShared = (
    appUuid: string,
    key: string,
    value: unknown,
    expectedVersion: number | null,
    userUuid: string,
) =>
    model.upsertSharedState({
        appUuid,
        key,
        value,
        expectedVersion,
        writer: writer(userUuid),
        maxKeys: MAX_KEYS,
    });

beforeAll(async () => {
    migrated = await createMigratedDatabase();
    model = new AppStateModel({ database: migrated.database });
});

afterAll(async () => {
    await migrated?.destroy();
});

describe('per-user state', () => {
    test('is written in place, kept per user and per app, and round-trips arrays', async () => {
        const f = await seed();
        await setUser(f.appUuid, f.alice, 'filters', { region: 'EU' });
        const rewritten = await setUser(f.appUuid, f.alice, 'filters', {
            region: 'US',
        });
        expect(rewritten.outcome).toBe('written');
        await setUser(f.appUuid, f.alice, 'tabs', ['a', 'b']);
        await setUser(f.appUuid, f.bob, 'filters', 'bob');
        await setUser(f.otherAppUuid, f.alice, 'filters', 1);

        const forAlice = await model.getSnapshot(f.appUuid, f.alice);
        expect(forAlice.user.filters.value).toEqual({ region: 'US' });
        expect(forAlice.user.tabs.value).toEqual(['a', 'b']);
        expect(Object.keys(forAlice.user)).toHaveLength(2);
        expect(await model.countUserKeys(f.appUuid, f.alice)).toBe(2);

        const forBob = await model.getSnapshot(f.appUuid, f.bob);
        expect(forBob.user).toEqual({
            filters: expect.objectContaining({ value: 'bob' }),
        });

        const embed = await model.getSnapshot(f.appUuid, null);
        expect(embed.user).toEqual({});

        await model.deleteUserState(f.appUuid, f.alice, 'filters');
        const afterDelete = await model.getSnapshot(f.appUuid, f.alice);
        expect(Object.keys(afterDelete.user)).toEqual(['tabs']);
    });

    test('is removed when the user is deleted', async () => {
        const f = await seed();
        await setUser(f.appUuid, f.alice, 'filters', true);
        await migrated.database('users').where('user_uuid', f.alice).delete();
        expect(await model.countUserKeys(f.appUuid, f.alice)).toBe(0);
    });

    test('enforces the key cap even for concurrent creates', async () => {
        const f = await seed();
        for (let i = 0; i < MAX_KEYS - 1; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await setUser(f.appUuid, f.alice, `k${i}`, i);
        }
        const results = await Promise.all(
            Array.from({ length: 8 }, (_, i) =>
                setUser(f.appUuid, f.alice, `new${i}`, i),
            ),
        );
        expect(results.filter((r) => r.outcome === 'written')).toHaveLength(1);
        expect(results.filter((r) => r.outcome === 'over_cap')).toHaveLength(7);
        expect(await model.countUserKeys(f.appUuid, f.alice)).toBe(MAX_KEYS);
        // Existing keys can still be rewritten at the cap.
        const rewrite = await setUser(f.appUuid, f.alice, 'k0', 'again');
        expect(rewrite.outcome).toBe('written');
        // Other users and apps have their own budget.
        expect((await setUser(f.appUuid, f.bob, 'mine', 1)).outcome).toBe(
            'written',
        );
    });
});

describe('shared state', () => {
    test('creates, versions, records history with the author, and conflicts on stale versions', async () => {
        const f = await seed();
        const created = await setShared(
            f.appUuid,
            'targets',
            { q1: 100 },
            null,
            f.alice,
        );
        expect(created).toMatchObject({
            outcome: 'written',
            entry: {
                value: { q1: 100 },
                version: 1,
                updatedBy: { userUuid: f.alice, name: 'Alice Ada' },
            },
        });

        const duplicateCreate = await setShared(
            f.appUuid,
            'targets',
            { q1: 0 },
            null,
            f.bob,
        );
        expect(duplicateCreate).toMatchObject({
            outcome: 'conflict',
            current: { version: 1, value: { q1: 100 } },
        });

        const updated = await setShared(
            f.appUuid,
            'targets',
            { q1: 120 },
            1,
            f.bob,
        );
        expect(updated).toMatchObject({
            outcome: 'written',
            entry: {
                version: 2,
                updatedBy: { userUuid: f.bob, name: 'Bob Bee' },
            },
        });

        const stale = await setShared(
            f.appUuid,
            'targets',
            { q1: 999 },
            1,
            f.alice,
        );
        expect(stale).toMatchObject({
            outcome: 'conflict',
            current: { version: 2, value: { q1: 120 } },
        });

        const missing = await setShared(f.appUuid, 'never-set', 1, 1, f.alice);
        expect(missing).toEqual({ outcome: 'conflict', current: null });

        const history = await model.getSharedHistory(f.appUuid, 'targets', {
            limit: 10,
            beforeVersion: null,
        });
        expect(history.map((h) => h.version)).toEqual([2, 1]);
        expect(history[0].author).toEqual({
            kind: 'user',
            userUuid: f.bob,
            name: 'Bob Bee',
        });
        expect(history[1].value).toEqual({ q1: 100 });

        const paged = await model.getSharedHistory(f.appUuid, 'targets', {
            limit: 10,
            beforeVersion: 2,
        });
        expect(paged.map((h) => h.version)).toEqual([1]);

        const snapshot = await model.getSnapshot(f.appUuid, null);
        expect(snapshot.shared.targets.version).toBe(2);
        expect(await model.countSharedKeys(f.appUuid)).toBe(1);
        expect(await model.countSharedKeys(f.otherAppUuid)).toBe(0);
    });

    test('keeps history when the author is deleted', async () => {
        const f = await seed();
        await setShared(f.appUuid, 'notes', 'first', null, f.bob);
        await migrated.database('users').where('user_uuid', f.bob).delete();

        const entry = await model.getSharedState(f.appUuid, 'notes');
        expect(entry?.updatedBy).toBeNull();
        const [version] = await model.getSharedHistory(f.appUuid, 'notes', {
            limit: 1,
            beforeVersion: null,
        });
        expect(version.author).toEqual({
            kind: 'user',
            userUuid: null,
            name: null,
        });
    });

    test('a deleted key keeps its history and a recreated key continues the version sequence', async () => {
        const f = await seed();
        await setShared(f.appUuid, 'notes', 'v1', null, f.alice);
        await setShared(f.appUuid, 'notes', 'v2', 1, f.alice);
        await model.deleteSharedState(f.appUuid, 'notes');
        expect(await model.getSharedState(f.appUuid, 'notes')).toBeNull();
        expect(
            (
                await model.getSharedHistory(f.appUuid, 'notes', {
                    limit: 10,
                    beforeVersion: null,
                })
            ).map((h) => h.version),
        ).toEqual([2, 1]);

        const recreated = await setShared(
            f.appUuid,
            'notes',
            'fresh',
            null,
            f.bob,
        );
        expect(recreated).toMatchObject({
            outcome: 'written',
            entry: { version: 3, value: 'fresh' },
        });
        // A writer still holding a version from before the delete conflicts.
        const staleWriter = await setShared(
            f.appUuid,
            'notes',
            'old tab',
            2,
            f.alice,
        );
        expect(staleWriter).toMatchObject({
            outcome: 'conflict',
            current: { version: 3, value: 'fresh' },
        });
    });

    test('enforces the key cap even for concurrent creates', async () => {
        const f = await seed();
        for (let i = 0; i < MAX_KEYS - 1; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await setShared(f.appUuid, `k${i}`, i, null, f.alice);
        }
        const results = await Promise.all(
            Array.from({ length: 8 }, (_, i) =>
                setShared(f.appUuid, `new${i}`, i, null, f.alice),
            ),
        );
        expect(results.filter((r) => r.outcome === 'written')).toHaveLength(1);
        expect(results.filter((r) => r.outcome === 'over_cap')).toHaveLength(7);
        expect(await model.countSharedKeys(f.appUuid)).toBe(MAX_KEYS);
        // Updates to existing keys are not creates.
        const update = await setShared(f.appUuid, 'k0', 'again', 1, f.alice);
        expect(update.outcome).toBe('written');
        // A create for an existing key at the cap is a conflict the SDK can
        // recover from, not a cap error.
        const createExisting = await setShared(
            f.appUuid,
            'k0',
            'dup',
            null,
            f.alice,
        );
        expect(createExisting).toMatchObject({
            outcome: 'conflict',
            current: { version: 2, value: 'again' },
        });
    });

    test('prunes history past the retention cap', async () => {
        const f = await seed();
        const total = APP_STATE_MAX_HISTORY_VERSIONS + 3;
        for (let i = 1; i <= total; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            const result = await setShared(
                f.appUuid,
                'counter',
                i,
                i === 1 ? null : i - 1,
                f.alice,
            );
            expect(result.outcome).toBe('written');
        }
        const rows = await migrated
            .database('app_shared_state_history')
            .where({ app_uuid: f.appUuid, key: 'counter' })
            .count<{ count: string }[]>('* as count');
        expect(Number(rows[0].count)).toBe(APP_STATE_MAX_HISTORY_VERSIONS);
        const [oldest] = await model.getSharedHistory(f.appUuid, 'counter', {
            limit: 1,
            beforeVersion: 5,
        });
        expect(oldest.version).toBe(4);
    });

    test('is removed with the app', async () => {
        const f = await seed();
        await setShared(f.appUuid, 'k', 1, null, f.alice);
        await setUser(f.appUuid, f.alice, 'k', 1);
        await migrated.database('apps').where('app_id', f.appUuid).delete();
        expect(await model.getSnapshot(f.appUuid, f.alice)).toEqual({
            user: {},
            shared: {},
        });
        expect(
            await migrated
                .database('app_shared_state_history')
                .where('app_uuid', f.appUuid),
        ).toHaveLength(0);
    });
});
