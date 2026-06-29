/**
 * Unit tests for the PURE core of the SQL-shape migration linter.
 * Run: `npx tsx scripts/sql-migration-lint.test.ts`
 *
 * Covers lintSource over realistic Knex migration snippets. The IO shell
 * (addedMigrationPaths + readFile) is exercised by the CLI.
 */
import * as assert from 'assert';
import { lintSource } from './sql-migration-lint';

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

if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} failed, ${passed} passed:\n`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
}
console.log(`✅ ${passed} tests passed`);
