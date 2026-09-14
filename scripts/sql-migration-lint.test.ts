/**
 * Unit tests for the PURE core of the SQL-shape migration linter.
 * Run: `npx tsx scripts/sql-migration-lint.test.ts`
 *
 * Covers lintSource over realistic Knex migration snippets. The IO shell
 * (addedMigrationPaths + readFile) is exercised by the CLI.
 */
import * as assert from 'assert';
import {
    changedMigrationPathsFromNameStatus,
    evaluateMigrationEnforcement,
    evaluateMigrationSource,
    lintSource,
} from './sql-migration-lint';
import type { BreakingChangeDeclaration } from './release-safety-declarations';

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

const rules = (src: string): string[] => lintSource(src).map((f) => f.rule).sort();

// --- additive / safe migrations ----------------------------------------------

test('adding a nullable column is not flagged', () => {
    const src = `export async function up(knex){ await knex.schema.alterTable('users', t => { t.string('nickname'); }); }
export async function down(knex){ await knex.schema.alterTable('users', t => t.dropColumn('nickname')); }`;
    assert.deepStrictEqual(rules(src), []);
});

test('new table with a NOT NULL column is not flagged (no old rows, no old code)', () => {
    const src = `export async function up(knex){ await knex.schema.createTable('widgets', t => { t.uuid('id').primary(); t.string('name').notNullable(); }); }
export async function down(knex){ await knex.schema.dropTable('widgets'); }`;
    assert.deepStrictEqual(rules(src), []);
});

test('NOT NULL with a default is not flagged', () => {
    const src = `export async function up(knex){ await knex.schema.alterTable('users', t => { t.boolean('active').notNullable().defaultTo(true); }); }`;
    assert.deepStrictEqual(rules(src), []);
});

// --- breaking shapes ---------------------------------------------------------

test('extracts the dropped/renamed object name for expand-version tracing', () => {
    const drop = lintSource(`export async function up(knex){ await knex.schema.alterTable('users', t => t.dropColumn('legacy_field')); }`);
    assert.strictEqual(drop[0]?.object, 'legacy_field');
    const renameCol = lintSource(`export async function up(knex){ await knex.schema.alterTable('users', t => t.renameColumn('old_name', 'new_name')); }`);
    assert.strictEqual(renameCol[0]?.object, 'old_name'); // the removed (old) name
    const dropTable = lintSource(`export async function up(knex){ await knex.schema.dropTableIfExists('audit_log'); }`);
    assert.strictEqual(dropTable[0]?.object, 'audit_log');
    // non-string-literal arg → no object captured, but still flagged
    const dynamic = lintSource(`export async function up(knex){ await knex.schema.alterTable('users', t => t.dropColumn(colName)); }`);
    assert.strictEqual(dynamic[0]?.rule, 'drop-column');
    assert.strictEqual(dynamic[0]?.object, undefined);
});

test('dropColumn in up() is flagged', () => {
    const src = `export async function up(knex){ await knex.schema.alterTable('users', t => { t.dropColumn('legacy'); }); }
export async function down(knex){ await knex.schema.alterTable('users', t => t.string('legacy')); }`;
    assert.deepStrictEqual(rules(src), ['drop-column']);
});

test('renameColumn is flagged', () => {
    const src = `export async function up(knex){ await knex.schema.alterTable('users', t => { t.renameColumn('a', 'b'); }); }`;
    assert.deepStrictEqual(rules(src), ['rename-column']);
});

test('dropTable in up() is flagged', () => {
    const src = `export async function up(knex){ await knex.schema.dropTable('old_audit'); }`;
    assert.deepStrictEqual(rules(src), ['drop-table']);
});

test('NOT NULL without default on an existing table is flagged', () => {
    const src = `export async function up(knex){ await knex.schema.alterTable('users', t => { t.string('email').notNullable(); }); }`;
    assert.deepStrictEqual(rules(src), ['not-null-no-default']);
});

test('raw SQL DROP COLUMN is flagged', () => {
    const src = `export async function up(knex){ await knex.raw('ALTER TABLE users DROP COLUMN legacy'); }`;
    assert.deepStrictEqual(rules(src), ['raw-drop-column']);
});

test('raw SQL SET NOT NULL is flagged', () => {
    const src = `export async function up(knex){ await knex.raw('ALTER TABLE users ALTER COLUMN email SET NOT NULL'); }`;
    assert.ok(rules(src).includes('raw-set-not-null'));
});

test('raw SQL column type change is flagged', () => {
    const src = `export async function up(knex){ await knex.raw('ALTER TABLE users ALTER COLUMN age TYPE bigint'); }`;
    assert.ok(rules(src).includes('raw-alter-type'));
});

test('block comments containing destructive SQL and method text are ignored', () => {
    const src = `export async function up(knex){
  /* await knex.raw('ALTER TABLE users DROP COLUMN legacy');
     await knex.schema.alterTable('users', t => t.dropColumn('legacy')); */
}`;
    assert.deepStrictEqual(rules(src), []);
});

test('raw SQL DROP COLUMN reports the line inside the raw call', () => {
    const src = `export async function up(knex){
  await knex.raw('ALTER TABLE users DROP COLUMN legacy');
}`;
    const found = lintSource(src);
    assert.strictEqual(found[0]?.rule, 'raw-drop-column');
    assert.strictEqual(found[0]?.line, 2);
});

test('plain strings containing destructive SQL are ignored', () => {
    const src = `export async function up(){ const example = 'ALTER TABLE users DROP COLUMN legacy'; }`;
    assert.deepStrictEqual(rules(src), []);
});

test('multi-line raw SQL reports a later RENAME TO line', () => {
    const src = `export async function up(knex){
  await knex.raw(\`
    ALTER TABLE users
    RENAME TO app_users
  \`);
}`;
    const found = lintSource(src).find((f) => f.rule === 'raw-rename-to');
    assert.strictEqual(found?.line, 4);
});

test('dropNullable on an existing column is flagged with its object name', () => {
    const src = `export async function up(knex){
  await knex.schema.alterTable('saved_queries_versions', (table) => {
    table.dropNullable('timezone');
  });
}`;
    const found = lintSource(src);
    assert.strictEqual(found[0]?.rule, 'drop-nullable');
    assert.strictEqual(found[0]?.object, 'timezone');
});

test('notNullable inside a block comment is ignored', () => {
    const src = `export async function up(knex){
  /* await knex.schema.alterTable('users', t => t.string('email').notNullable()); */
}`;
    assert.deepStrictEqual(rules(src), []);
});

// --- only the up() body is scanned -------------------------------------------

test('destructive ops in down() only are NOT flagged', () => {
    const src = `export async function up(knex){ await knex.schema.alterTable('users', t => { t.string('nickname'); }); }
export async function down(knex){ await knex.schema.alterTable('users', t => { t.dropColumn('nickname'); t.renameColumn('a','b'); }); await knex.schema.dropTable('users'); }`;
    assert.deepStrictEqual(rules(src), []);
});

test('handles const-arrow down declaration form', () => {
    const src = `export const up = async (knex) => { await knex.schema.alterTable('u', t => t.string('x')); };
export const down = async (knex) => { await knex.schema.alterTable('u', t => t.dropColumn('x')); };`;
    assert.deepStrictEqual(rules(src), []);
});

// --- multiple findings + line numbers ----------------------------------------

test('accumulates multiple findings with line numbers', () => {
    const src = [
        'export async function up(knex){',
        "  await knex.schema.alterTable('users', t => {",
        "    t.dropColumn('legacy');",
        "    t.renameColumn('a', 'b');",
        '  });',
        '}',
        'export async function down(knex){}',
    ].join('\n');
    const found = lintSource(src);
    assert.strictEqual(found.length, 2);
    const drop = found.find((f) => f.rule === 'drop-column');
    assert.strictEqual(drop?.line, 3);
    const rename = found.find((f) => f.rule === 'rename-column');
    assert.strictEqual(rename?.line, 4);
});

test('line comment does not hide nor over-trigger on the next line', () => {
    const src = `export async function up(knex){
  // we deliberately keep the old column for now
  await knex.schema.alterTable('users', t => t.string('note'));
}`;
    assert.deepStrictEqual(rules(src), []);
});

const migrationDeclaration: BreakingChangeDeclaration = {
    id: 'migration-break',
    reason: 'Deployments running the prior backend still read users.legacy.',
    requiredStop: false,
    migration: 'migration.ts',
};
const enforcement = (
    source: string,
    declarations: BreakingChangeDeclaration[] = [],
) => evaluateMigrationSource(source, 'migration.ts', declarations);
const enforcementRules = (source: string, severity?: 'error' | 'warning'): string[] =>
    enforcement(source)
        .filter((finding) => severity === undefined || finding.severity === severity)
        .map((finding) => finding.rule)
        .sort();

test('undeclared breaking behavior is an error with an actionable declaration shape', () => {
    const source = `export async function up(knex) { await knex.schema.alterTable('users', table => table.dropColumn('legacy')); }
export async function down(knex) { await knex.schema.alterTable('users', table => table.string('legacy')); }`;
    const findings = enforcement(source);
    assert.ok(findings.some((finding) => finding.rule === 'drop-column' && finding.severity === 'error'));
    const undeclared = findings.find((finding) => finding.rule === 'undeclared-breaking-change');
    assert.ok(undeclared?.message.includes('Detected at migration.ts:1'));
    assert.ok(
        undeclared?.message.includes(
            'redesign to expand-only — e.g. deprecate-now-drop-later',
        ),
    );
    assert.ok(
        undeclared?.message.includes(
            'declare — flips this release to not-rolling-safe, advises Recreate to every self-hosted customer',
        ),
    );
    assert.ok(
        undeclared?.message.includes(
            'Declaring is a product decision — confirm with a human before adding a registry entry.',
        ),
    );
});

test('hollow breaking reasons do not satisfy migration enforcement', () => {
    const hollowReasons = [
        '',
        '   ',
        'breaking change',
        'fix',
        'incompatibilityincompatibility',
        '<operator-facing reason>',
    ];
    for (const reason of hollowReasons) {
        const source = `export async function up(knex) { await knex.schema.alterTable('users', table => table.dropColumn('legacy')); }
export async function down(knex) { await knex.schema.alterTable('users', table => table.string('legacy')); }`;
        const findings = enforcement(source, [
            { ...migrationDeclaration, reason },
        ]);
        assert.ok(
            findings.some(
                (finding) =>
                    finding.rule === 'hollow-breaking-declaration' &&
                    finding.message.includes(
                        'describe what breaks and for whom',
                    ),
            ),
            `expected hollow reason to fail: ${JSON.stringify(reason)}`,
        );
        assert.ok(
            findings.some(
                (finding) => finding.rule === 'undeclared-breaking-change',
            ),
        );
    }
});

test('a substantive breaking reason satisfies migration enforcement', () => {
    const source = `export async function up(knex) { await knex.schema.alterTable('users', table => table.dropColumn('legacy')); }
export async function down(knex) { await knex.schema.alterTable('users', table => table.string('legacy')); }`;
    assert.ok(
        !enforcement(source, [migrationDeclaration]).some(
            (finding) => finding.severity === 'error',
        ),
    );
});

test('declared breaking behavior passes enforcement while preserving the legacy finding', () => {
    const source = `export async function up(knex) { await knex.schema.alterTable('users', table => table.dropColumn('legacy')); }
export async function down(knex) { await knex.schema.alterTable('users', table => table.string('legacy')); }`;
    const findings = enforcement(source, [migrationDeclaration]);
    assert.ok(findings.some((finding) => finding.rule === 'drop-column' && finding.severity === 'warning'));
    assert.ok(!findings.some((finding) => finding.severity === 'error'));
});

test('raw breaking SQL with a valid breaking declaration needs no classification', () => {
    const source = `export async function up(knex) { await knex.raw('ALTER TABLE users DROP COLUMN legacy'); }
export async function down(knex) { await knex.raw('ALTER TABLE users ADD COLUMN legacy text'); }`;
    const findings = enforcement(source, [migrationDeclaration]);
    assert.ok(findings.some((finding) => finding.rule === 'raw-drop-column'));
    assert.ok(!findings.some((finding) => finding.rule === 'unclassified-knex-raw'));
    assert.ok(!findings.some((finding) => finding.severity === 'error'));
});

test('malformed declarations are enforcement errors', () => {
    const source = `export const breaking = { reason: '', requiredStop: 'no' };
export async function up(knex) { await knex.schema.alterTable('users', table => table.dropColumn('legacy')); }
export async function down() { throw new Error('irreversible: test fixture'); }`;
    const findings = enforcement(source);
    assert.ok(findings.some((finding) => finding.rule === 'malformed-breaking-declaration'));
    assert.ok(findings.some((finding) => finding.rule === 'undeclared-breaking-change'));
});

test('a valid inline breaking declaration does not satisfy migration enforcement', () => {
    const source = `export const breaking = { reason: 'Deployments running the prior backend still read users.legacy.', requiredStop: false };
export async function up(knex) { await knex.schema.alterTable('users', table => table.dropColumn('legacy')); }
export async function down(knex) { await knex.schema.alterTable('users', table => table.string('legacy')); }`;
    const findings = enforcement(source);
    assert.ok(
        findings.some(
            (finding) => finding.rule === 'inline-breaking-declaration',
        ),
    );
    assert.ok(
        findings.some(
            (finding) => finding.rule === 'undeclared-breaking-change',
        ),
    );
});

test('literal DML raw SQL requires explicit classification', () => {
    const source = `export async function up(knex) { await knex.raw('UPDATE users SET active = true'); }
export async function down() { throw new Error('irreversible: test fixture'); }`;
    assert.ok(enforcementRules(source, 'error').includes('unclassified-knex-raw'));
});

test('dynamic raw SQL requires explicit classification', () => {
    const source = `export async function up(knex) { await knex.raw(statement); }
export async function down() { throw new Error('irreversible: test fixture'); }`;
    assert.ok(enforcementRules(source, 'error').includes('unclassified-knex-raw'));
});

test('explicit safe classification permits otherwise unclassifiable raw SQL', () => {
    const source = `export const classification: { kind: "safe" | "breaking"; reason: string } = { kind: 'safe', reason: 'idempotent repair' };
export async function up(knex) { await knex.raw('UPDATE users SET active = true WHERE active IS NULL'); }
export async function down() { throw new Error('irreversible: test fixture'); }`;
    assert.ok(!enforcement(source).some((finding) => finding.severity === 'error'));
});

test('known-safe session SQL and metadata SELECT do not require classification', () => {
    const source = `export async function up(knex) {
  await knex.raw('SET statement_timeout = 0');
  await knex.raw('SELECT indisvalid FROM pg_index WHERE indexrelid = ?::regclass', ['idx_users']);
}
export async function down() { throw new Error('irreversible: test fixture'); }`;
    assert.ok(!enforcementRules(source, 'error').includes('unclassified-knex-raw'));
});

test('breaking classification requires a breaking declaration', () => {
    const source = `export const classification = { kind: 'breaking', reason: 'rewrites a live contract' };
export async function up(knex) { await knex.raw('VACUUM users'); }
export async function down() { throw new Error('irreversible: test fixture'); }`;
    assert.ok(enforcementRules(source, 'error').includes('undeclared-breaking-change'));
});

test('breaking classification with a declaration passes and remains visible', () => {
    const source = `export const classification = { kind: 'breaking', reason: 'rewrites a live contract' };
export async function up(knex) { await knex.raw('VACUUM users'); }
export async function down() { throw new Error('irreversible: test fixture'); }`;
    const findings = enforcement(source, [migrationDeclaration]);
    assert.ok(findings.some((finding) => finding.rule === 'classified-breaking-change'));
    assert.ok(!findings.some((finding) => finding.severity === 'error'));
});

test('transaction false with bare concurrent index is an error', () => {
    const source = `export const config = { transaction: false };
export async function up(knex) { await knex.raw('CREATE INDEX CONCURRENTLY idx_users_email ON users (email)'); }
export async function down(knex) { await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_users_email'); }`;
    assert.ok(enforcementRules(source, 'error').includes('non-resumable-concurrent-index'));
});

test('transaction false with a non-resumable backfill is an error', () => {
    const source = `export const config = { transaction: false };
export const classification = { kind: 'safe', reason: 'bounded maintenance window' };
export async function up(knex) { await knex.raw('UPDATE users SET active = true'); }
export async function down() { throw new Error('irreversible: test fixture'); }`;
    assert.ok(enforcementRules(source, 'error').includes('non-resumable-backfill'));
});

test('transaction false with an idempotently guarded backfill passes', () => {
    const source = `export const config = { transaction: false };
export const classification = { kind: 'safe', reason: 'only repairs missing values' };
export async function up(knex) { await knex.raw('UPDATE users SET active = true WHERE active IS NULL'); }
export async function down() { throw new Error('irreversible: test fixture'); }`;
    assert.ok(!enforcement(source).some((finding) => finding.severity === 'error'));
});

test('missing down is an error', () => {
    const source = `export async function up() {}`;
    assert.ok(enforcementRules(source, 'error').includes('missing-down'));
});

test('silent no-op down forms are errors', () => {
    const empty = `export async function up() {}
export async function down() {}`;
    const resolved = `export async function up() {}
export const down = async () => Promise.resolve();`;
    assert.ok(enforcementRules(empty, 'error').includes('silent-noop-down'));
    assert.ok(enforcementRules(resolved, 'error').includes('silent-noop-down'));
});

test('real down and explicit irreversible throw pass rollback enforcement', () => {
    const real = `export async function up(knex) { await knex.schema.createTable('widgets', table => table.uuid('id')); }
export async function down(knex) { await knex.schema.dropTable('widgets'); }`;
    const irreversible = `export async function up() {}
export async function down() { throw new Error('irreversible: source data cannot be reconstructed'); }`;
    assert.ok(!enforcementRules(real, 'error').includes('missing-down'));
    assert.ok(!enforcementRules(real, 'error').includes('silent-noop-down'));
    assert.ok(!enforcementRules(irreversible, 'error').includes('missing-down'));
    assert.ok(!enforcementRules(irreversible, 'error').includes('silent-noop-down'));
});

test('irreversible down throw without the required prefix fails', () => {
    const source = `export async function up() {}
export async function down() { throw new Error('cannot roll back'); }`;
    assert.ok(enforcementRules(source, 'error').includes('invalid-irreversible-down'));
});

test('DDL without lock timeout warns with the extracted table name', () => {
    const source = `export async function up(knex) { await knex.schema.alterTable('users', table => table.string('nickname')); }
export async function down(knex) { await knex.schema.alterTable('users', table => table.dropColumn('nickname')); }`;
    const warning = enforcement(source).find((finding) => finding.rule === 'missing-lock-timeout');
    assert.strictEqual(warning?.severity, 'warning');
    assert.ok(warning?.message.includes('users'));
});

test('SET LOCAL lock_timeout suppresses the DDL warning', () => {
    const source = `export async function up(knex) {
  await knex.raw("SET LOCAL lock_timeout = '5s'");
  await knex.schema.alterTable('users', table => table.string('nickname'));
}
export async function down(knex) { await knex.schema.alterTable('users', table => table.dropColumn('nickname')); }`;
    assert.ok(!enforcementRules(source, 'warning').includes('missing-lock-timeout'));
});

test('concurrent IF NOT EXISTS warns with literal runtime-guard discoverability', () => {
    const source = `export const config = { transaction: false };
export async function up(knex) { await knex.raw('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users (email)'); }
export async function down(knex) { await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_users_email'); }`;
    const warning = enforcement(source).find((finding) => finding.rule === 'concurrent-index-invalid-retry');
    assert.strictEqual(warning?.severity, 'warning');
    assert.ok(warning?.message.includes('idx_users_email'));
    assert.ok(warning?.message.includes('runtime retry guard'));
});

test('dynamic concurrent index warning requires explicit pg_index cleanup', () => {
    const source = `export const config = { transaction: false };
export async function up(knex) { await knex.raw('CREATE INDEX CONCURRENTLY IF NOT EXISTS ?? ON users (email)', [indexName]); }
export async function down(knex) { await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS ??', [indexName]); }`;
    const findings = enforcement(source);
    const warning = findings.find((finding) => finding.rule === 'concurrent-index-invalid-retry');
    assert.ok(warning?.message.includes('cannot discover'), JSON.stringify(findings));
    assert.ok(warning?.message.includes('pg_index'), JSON.stringify(findings));
});

test('dynamic concurrent index warning recognizes explicit invalid-index cleanup', () => {
    const source = `export const config = { transaction: false };
export async function up(knex) {
  await knex.raw('SELECT indisvalid FROM pg_index WHERE indexrelid = ?::regclass', [indexName]);
  await knex.raw('CREATE INDEX CONCURRENTLY IF NOT EXISTS ?? ON users (email)', [indexName]);
}
export async function down(knex) { await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS ??', [indexName]); }`;
    assert.ok(!enforcementRules(source, 'warning').includes('concurrent-index-invalid-retry'));
});

test('changed migration paths exclude tests colocated with migrations', () => {
    const root = 'packages/backend/src/database/migrations';
    const paths = changedMigrationPathsFromNameStatus(
        [
            `A\t${root}/20260101000000_added.ts`,
            `A\t${root}/__tests__/20260101000000_added.test.ts`,
        ].join('\n'),
        () => true,
    );
    assert.deepStrictEqual(paths, [`${root}/20260101000000_added.ts`]);
});

test('changed migration paths include existing A M R C destinations and exclude deletes', () => {
    const root = 'packages/backend/src/database/migrations';
    const paths = changedMigrationPathsFromNameStatus(
        [
            `A\t${root}/20260101000000_added.ts`,
            `M\t${root}/20260101000001_modified.ts`,
            `R100\t${root}/20260101000002_old.ts\t${root}/20260101000002_renamed.ts`,
            `C100\t${root}/20260101000003_source.ts\t${root}/20260101000003_copied.ts`,
            `D\t${root}/20260101000004_deleted.ts`,
            'M\tscripts/not-a-migration.ts',
        ].join('\n'),
        (path) => !path.includes('missing'),
    );
    assert.deepStrictEqual(paths, [
        `${root}/20260101000000_added.ts`,
        `${root}/20260101000001_modified.ts`,
        `${root}/20260101000002_renamed.ts`,
        `${root}/20260101000003_copied.ts`,
    ]);
});

test('enforcement evaluator reads only caller-supplied changed paths', () => {
    const read: string[] = [];
    const result = evaluateMigrationEnforcement({
        paths: ['changed.ts'],
        readFile: (path) => {
            read.push(path);
            return `export async function up() {}
export async function down() { throw new Error('irreversible: test fixture'); }`;
        },
    });
    assert.deepStrictEqual(read, ['changed.ts']);
    assert.strictEqual(result.ran, true);
    assert.strictEqual(result.passed, true);
    assert.deepStrictEqual(result.errors, []);
});

test('registry diagnostics fail migration enforcement without changed migrations', () => {
    const result = evaluateMigrationEnforcement({
        paths: [],
        declarationChanges: {
            added: [],
            diagnostics: [
                {
                    file: 'release-safety.declarations.json',
                    line: 1,
                    message: 'declaration "old-break" was removed',
                },
            ],
        },
    });
    assert.strictEqual(result.passed, false);
    assert.ok(
        result.errors.some(
            (finding) => finding.rule === 'breaking-declaration-registry',
        ),
    );
});

if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} failed, ${passed} passed:\n`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
}
console.log(`✅ ${passed} tests passed`);
