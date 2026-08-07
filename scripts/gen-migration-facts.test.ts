/**
 * Unit tests for the PURE core of the migration-facts asset generator (SPK-872).
 * Run: `npx tsx scripts/gen-migration-facts.test.ts`
 */
import * as assert from 'assert';
import {
    migrationNamesFromChanges,
    selectFactsForMigrations,
} from './gen-migration-facts';
import { MigrationFact } from './preflight';

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
    try {
        fn();
        passed += 1;
    } catch (err) {
        failures.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
}

const fact = (migration: string): MigrationFact => ({
    migration,
    introducedIn: '1.50.0',
    runsInTransaction: true,
    resumable: false,
    batchSize: null,
    lockTimeout: null,
    tables: [],
    backfill: null,
    notes: null,
});

test('only ADDED migration files count; edits, deletes and strays are ignored', () => {
    const names = migrationNamesFromChanges([
        { status: 'A', path: 'packages/backend/src/database/migrations/20260101000000_one.ts' },
        { status: 'A', path: 'packages/backend/src/ee/database/migrations/20260102000000_two.js' },
        { status: 'M', path: 'packages/backend/src/database/migrations/20260103000000_edited.ts' },
        { status: 'D', path: 'packages/backend/src/database/migrations/20260104000000_deleted.ts' },
        { status: 'A', path: 'packages/backend/src/database/migrations/CLAUDE.md' },
    ]);
    assert.deepStrictEqual(
        [...names].sort(),
        ['20260101000000_one', '20260102000000_two'],
    );
});

test('renames carry the new path and still count as added', () => {
    const names = migrationNamesFromChanges([
        { status: 'A', path: 'packages/backend/src/database/migrations/20260105000000_renamed.ts' },
    ]);
    assert.strictEqual(names.has('20260105000000_renamed'), true);
});

test('selects only facts for migrations in the release, sorted, and reports the rest', () => {
    const facts = [fact('20260101000000_one'), fact('20260199000000_other_release')];
    const { selected, withoutFacts } = selectFactsForMigrations(
        facts,
        new Set(['20260102000000_two', '20260101000000_one']),
    );
    assert.deepStrictEqual(
        selected.map((f) => f.migration),
        ['20260101000000_one'],
    );
    assert.deepStrictEqual(withoutFacts, ['20260102000000_two']);
});

test('a release with no facts-bearing migrations selects nothing', () => {
    const { selected, withoutFacts } = selectFactsForMigrations(
        [fact('20260101000000_one')],
        new Set(),
    );
    assert.deepStrictEqual(selected, []);
    assert.deepStrictEqual(withoutFacts, []);
});

if (failures.length > 0) {
    console.error(`${failures.length} test(s) failed:`);
    for (const failure of failures) console.error(`  ✖ ${failure}`);
    process.exit(1);
}
console.log(`gen-migration-facts: ${passed} tests passed`);
