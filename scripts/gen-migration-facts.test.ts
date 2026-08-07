/**
 * Unit tests for the PURE core of the migration-facts asset generator (SPK-872).
 * Run: `npx tsx scripts/gen-migration-facts.test.ts`
 */
import * as assert from 'assert';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    assertFactsPointAtRealMigrations,
    buildFactsAsset,
    gitNameStatus,
    gitTreePaths,
    migrationNamesFromChanges,
    migrationNamesFromPaths,
    selectFactsForMigrations,
} from './gen-migration-facts';
import { FactsFile, MigrationFact, parseFactsFile } from './preflight';

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

const source = (migrationFacts: MigrationFact[]): FactsFile => ({
    schemaVersion: '1-draft',
    release: null,
    previousRelease: null,
    cumulativeThrough: null,
    migrationsInRelease: null,
    migrationsWithoutFacts: null,
    migrationFacts,
});

test('only ADDED migration files count; edits, deletes and strays are ignored', () => {
    const names = migrationNamesFromChanges([
        { status: 'A', path: 'packages/backend/src/database/migrations/20260101000000_one.ts' },
        { status: 'A', path: 'packages/backend/src/ee/database/migrations/20260102000000_two.js' },
        { status: 'M', path: 'packages/backend/src/database/migrations/20260103000000_edited.ts' },
        { status: 'D', path: 'packages/backend/src/database/migrations/20260104000000_deleted.ts' },
        { status: 'A', path: 'packages/backend/src/database/migrations/CLAUDE.md' },
        { status: 'A', path: 'packages/backend/src/database/migrations/__tests__/20260106000000_not_a_migration.test.ts' },
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

test('generated assets carry concrete release coverage', () => {
    const output = buildFactsAsset(
        source([
            fact('20260101000000_one'),
            fact('20260103000000_enterprise'),
        ]),
        new Set(['20260102000000_two', '20260101000000_one']),
        new Set(['20260103000000_enterprise']),
        false,
        '1.51.0',
        '1.50.0',
        null,
    );
    assert.strictEqual(output.migrationsInRelease, 2);
    assert.deepStrictEqual(output.migrationsWithoutFacts, ['20260102000000_two']);
    assert.strictEqual(output.enterpriseMigrationsInRelease, 1);
    assert.deepStrictEqual(output.enterpriseMigrationsWithoutFacts, []);
    assert.strictEqual(output.release, '1.51.0');
    assert.strictEqual(output.previousRelease, '1.50.0');
    assert.strictEqual(output.cumulativeThrough, null);
    assert.deepStrictEqual(
        output.migrationFacts.map((migration) => migration.migration),
        ['20260101000000_one', '20260103000000_enterprise'],
    );
    assert.doesNotThrow(() => parseFactsFile(JSON.stringify(output)));
});

test('--all selects every authored fact while coverage still describes the release range', () => {
    const output = buildFactsAsset(
        source([
            fact('20260199000000_other_release'),
            fact('20260101000000_one'),
        ]),
        new Set(['20260102000000_two', '20260101000000_one']),
        new Set(),
        true,
        '1.51.0',
        '1.50.0',
        null,
    );
    assert.deepStrictEqual(
        output.migrationFacts.map((migration) => migration.migration),
        ['20260101000000_one', '20260199000000_other_release'],
    );
    assert.strictEqual(output.migrationsInRelease, 2);
    assert.deepStrictEqual(output.migrationsWithoutFacts, ['20260102000000_two']);
});

function withTempGitRepo(run: (repo: string) => void): void {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-facts-test-'));
    const previousCwd = process.cwd();
    try {
        process.chdir(repo);
        execFileSync('git', ['init', '--quiet']);
        execFileSync('git', ['config', 'user.email', 'test@example.com']);
        execFileSync('git', ['config', 'user.name', 'Migration Facts Test']);
        fs.writeFileSync('README.md', 'test\n');
        execFileSync('git', ['add', 'README.md']);
        execFileSync('git', ['commit', '--quiet', '-m', 'base']);
        run(repo);
    } finally {
        process.chdir(previousCwd);
        fs.rmSync(repo, { recursive: true, force: true });
    }
}

test('--to limits the generated migration range to the supplied ref', () => {
    withTempGitRepo((repo) => {
        const migrationDir = path.join(
            repo,
            'packages/backend/src/database/migrations',
        );
        fs.mkdirSync(migrationDir, { recursive: true });
        const base = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
        fs.writeFileSync(path.join(migrationDir, '20260101000000_one.ts'), 'export {};\n');
        execFileSync('git', ['add', '.']);
        execFileSync('git', ['commit', '--quiet', '-m', 'one']);
        const to = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
        fs.writeFileSync(path.join(migrationDir, '20260102000000_two.ts'), 'export {};\n');
        execFileSync('git', ['add', '.']);
        execFileSync('git', ['commit', '--quiet', '-m', 'two']);

        const atTo = migrationNamesFromChanges(
            gitNameStatus(`${base}..${to}`, [
                'packages/backend/src/database/migrations',
            ]),
        );
        const atHead = migrationNamesFromChanges(
            gitNameStatus(`${base}..HEAD`, [
                'packages/backend/src/database/migrations',
            ]),
        );
        assert.deepStrictEqual([...atTo], ['20260101000000_one']);
        assert.deepStrictEqual([...atHead].sort(), [
            '20260101000000_one',
            '20260102000000_two',
        ]);
    });
});

test('cumulative mode counts every migration at the target ref and excludes test files', () => {
    withTempGitRepo((repo) => {
        const migrationDir = path.join(
            repo,
            'packages/backend/src/database/migrations',
        );
        fs.mkdirSync(path.join(migrationDir, '__tests__'), { recursive: true });
        fs.writeFileSync(path.join(migrationDir, '20260101000000_before_range.ts'), 'export {};\n');
        execFileSync('git', ['add', '.']);
        execFileSync('git', ['commit', '--quiet', '-m', 'before range']);
        const lastTag = execFileSync('git', ['rev-parse', 'HEAD'], {
            encoding: 'utf-8',
        }).trim();
        fs.writeFileSync(path.join(migrationDir, '20260102000000_in_range.ts'), 'export {};\n');
        fs.writeFileSync(
            path.join(migrationDir, '__tests__/20260103000000_not_a_migration.test.ts'),
            'export {};\n',
        );
        execFileSync('git', ['add', '.']);
        execFileSync('git', ['commit', '--quiet', '-m', 'target']);
        const target = execFileSync('git', ['rev-parse', 'HEAD'], {
            encoding: 'utf-8',
        }).trim();

        const rangeNames = migrationNamesFromChanges(
            gitNameStatus(`${lastTag}..${target}`, [
                'packages/backend/src/database/migrations',
            ]),
        );
        const cumulativeNames = migrationNamesFromPaths(
            gitTreePaths(target, ['packages/backend/src/database/migrations']),
        );

        assert.deepStrictEqual([...rangeNames], ['20260102000000_in_range']);
        assert.deepStrictEqual([...cumulativeNames].sort(), [
            '20260101000000_before_range',
            '20260102000000_in_range',
        ]);
    });
});

test('cumulative assets carry cumulative release bounds and every authored fact', () => {
    const output = buildFactsAsset(
        source([
            fact('20260199000000_other_release'),
            fact('20260101000000_one'),
        ]),
        new Set(['20260102000000_two', '20260101000000_one']),
        new Set(),
        false,
        '1.79.0',
        null,
        '1.79.0',
    );
    assert.strictEqual(output.release, '1.79.0');
    assert.strictEqual(output.previousRelease, null);
    assert.strictEqual(output.cumulativeThrough, '1.79.0');
    assert.deepStrictEqual(
        output.migrationFacts.map((migration) => migration.migration),
        ['20260101000000_one', '20260199000000_other_release'],
    );
});

test('migration existence is asserted against the supplied ref', () => {
    withTempGitRepo((repo) => {
        const migrationDir = path.join(
            repo,
            'packages/backend/src/database/migrations',
        );
        fs.mkdirSync(migrationDir, { recursive: true });
        const migrationPath = path.join(migrationDir, '20260101000000_one.ts');
        fs.writeFileSync(migrationPath, 'export {};\n');
        execFileSync('git', ['add', '.']);
        execFileSync('git', ['commit', '--quiet', '-m', 'add migration']);
        const withMigration = execFileSync('git', ['rev-parse', 'HEAD'], {
            encoding: 'utf-8',
        }).trim();
        fs.rmSync(migrationPath);
        execFileSync('git', ['add', '.']);
        execFileSync('git', ['commit', '--quiet', '-m', 'remove migration']);

        assert.doesNotThrow(() =>
            assertFactsPointAtRealMigrations(
                [fact('20260101000000_one')],
                withMigration,
            ),
        );
        assert.throws(
            () => assertFactsPointAtRealMigrations([fact('20260101000000_one')], 'HEAD'),
            /does not match any migration file/,
        );
    });
});

test('a bogus corpus fact throws even when it is outside the selected range', () => {
    withTempGitRepo((repo) => {
        const migrationDir = path.join(
            repo,
            'packages/backend/src/database/migrations',
        );
        fs.mkdirSync(migrationDir, { recursive: true });
        fs.writeFileSync(
            path.join(migrationDir, '20260101000000_one.ts'),
            'export {};\n',
        );
        execFileSync('git', ['add', '.']);
        execFileSync('git', ['commit', '--quiet', '-m', 'add migration']);
        const corpus = [
            fact('20260101000000_one'),
            fact('20260199000000_bogus'),
        ];
        const output = buildFactsAsset(
            source(corpus),
            new Set(['20260101000000_one']),
            new Set(),
            false,
            '1.51.0',
            '1.50.0',
            null,
        );

        assert.deepStrictEqual(
            output.migrationFacts.map((migration) => migration.migration),
            ['20260101000000_one'],
        );
        assert.throws(
            () => assertFactsPointAtRealMigrations(corpus, 'HEAD'),
            /20260199000000_bogus/,
        );
    });
});

if (failures.length > 0) {
    console.error(`${failures.length} test(s) failed:`);
    for (const failure of failures) console.error(`  ✖ ${failure}`);
    process.exit(1);
}
console.log(`gen-migration-facts: ${passed} tests passed`);
