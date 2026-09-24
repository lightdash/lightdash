import { getTestContext } from '../../vitest.setup.integration';

class RollbackSentinel extends Error {}

describe('ProjectModel.tryAcquireProjectLock does not block DDL on projects', () => {
    test('a migration-style ALTER TABLE projects succeeds under lock_timeout while a compile lock is held', async () => {
        const { app, testProjectUuid } = getTestContext();
        const db = app.getDatabase();
        const projectModel = app.getModels().getProjectModel();

        let signalLockAcquired: () => void;
        const lockAcquired = new Promise<void>((resolve) => {
            signalLockAcquired = resolve;
        });
        let releaseLock: () => void;
        const holdLock = new Promise<void>((resolve) => {
            releaseLock = resolve;
        });

        const compilePromise = projectModel.tryAcquireProjectLock(
            testProjectUuid,
            async () => {
                signalLockAcquired();
                await holdLock;
            },
        );

        await lockAcquired;

        let alterError: unknown = null;
        try {
            await db
                .transaction(async (trx) => {
                    await trx.raw("SET LOCAL lock_timeout = '1s'");
                    try {
                        await trx.raw(
                            'ALTER TABLE projects ADD COLUMN spk2353_lock_test boolean',
                        );
                    } catch (e) {
                        alterError = e;
                    }
                    throw new RollbackSentinel();
                })
                .catch((e) => {
                    if (!(e instanceof RollbackSentinel)) throw e;
                });
        } finally {
            releaseLock!();
            await compilePromise;
        }

        expect(alterError).toBeNull();
    });
});
