import {
    closeAll,
    configure,
    resetForTesting,
    withInstance,
} from './MotherduckInstanceCache';

describe('MotherduckInstanceCache catalog freshness regression', () => {
    beforeEach(() => {
        resetForTesting();
        configure({
            idleTtlMs: 60_000,
            maxAgeMs: 60_000,
            maxEntries: 1,
        });
    });

    afterEach(async () => {
        await closeAll('shutdown');
    });

    it('serves a new table and column through both an already-warm connection and a fresh connection on the held instance', async () => {
        let entryId = '';
        await withInstance(
            ':memory:',
            {},
            async (instance, acquiredEntryId) => {
                entryId = acquiredEntryId;
                const warmConnection = await instance.connect();
                const ddlConnection = await instance.connect();
                try {
                    await warmConnection.run(
                        'SELECT * FROM information_schema.columns',
                    );
                    await ddlConnection.run(
                        'CREATE TABLE catalog_freshness (initial_column INTEGER)',
                    );
                    await ddlConnection.run(
                        'ALTER TABLE catalog_freshness ADD COLUMN added_column VARCHAR',
                    );

                    const warmResult = await warmConnection.run(
                        "SELECT column_name FROM information_schema.columns WHERE table_name = 'catalog_freshness' ORDER BY ordinal_position",
                    );
                    await expect(warmResult.getRowObjects()).resolves.toEqual([
                        { column_name: 'initial_column' },
                        { column_name: 'added_column' },
                    ]);
                } finally {
                    ddlConnection.closeSync();
                    warmConnection.closeSync();
                }
            },
        );

        await withInstance(
            ':memory:',
            {},
            async (instance, acquiredEntryId) => {
                expect(acquiredEntryId).toBe(entryId);
                const freshConnection = await instance.connect();
                try {
                    const freshResult = await freshConnection.run(
                        "SELECT column_name FROM information_schema.columns WHERE table_name = 'catalog_freshness' ORDER BY ordinal_position",
                    );
                    await expect(freshResult.getRowObjects()).resolves.toEqual([
                        { column_name: 'initial_column' },
                        { column_name: 'added_column' },
                    ]);
                } finally {
                    freshConnection.closeSync();
                }
            },
        );
    });
});
