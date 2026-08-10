import * as assert from 'assert';
import {
    collectChangeDeclarations,
    collectChangeDeclarationsFromSources,
    parseChangeDeclarations,
} from './breaking-change-declarations';

let passed = 0;
const failures: string[] = [];

function test(name: string, run: () => void): void {
    try {
        run();
        passed += 1;
    } catch (error) {
        failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

function messages(source: string): string[] {
    return parseChangeDeclarations(source, 'migration.ts').diagnostics.map(
        (diagnostic) => `${diagnostic.line}:${diagnostic.message}`,
    );
}

test('parses the exact breaking declaration literals', () => {
    const parsed = parseChangeDeclarations(
        `import { Knex } from 'knex';
export const breaking = { reason: 'old pods read legacy_column', requiredStop: true };
export async function up(_knex: Knex): Promise<void> {}`,
        'migration.ts',
    );
    assert.deepStrictEqual(parsed.diagnostics, []);
    assert.deepStrictEqual(parsed.breaking, {
        file: 'migration.ts',
        line: 2,
        reason: 'old pods read legacy_column',
        requiredStop: true,
    });
});

test('decodes escaped string literals without evaluating source', () => {
    const parsed = parseChangeDeclarations(
        String.raw`export const breaking = { reason: "line\n\u0062", requiredStop: false };`,
    );
    assert.strictEqual(parsed.breaking?.reason, 'line\nb');
    assert.strictEqual(parsed.breaking?.requiredStop, false);
});

test('rejects empty and nonliteral reasons with line diagnostics', () => {
    assert.ok(messages(`export const breaking = {
  reason: '   ', requiredStop: false
};`)[0].includes('2:export const breaking.reason must not be empty'));
    assert.ok(
        messages(`const reason = 'dynamic';
export const breaking = { reason, requiredStop: false };`).some((message) =>
            message.includes('2:export const breaking must use explicit property assignments'),
        ),
    );
    assert.ok(
        messages('export const breaking = { reason: `template`, requiredStop: false };').some(
            (message) => message.includes('string literal'),
        ),
    );
});

test('rejects wrong requiredStop types and expressions', () => {
    assert.ok(
        messages(`export const breaking = { reason: 'x', requiredStop: 'false' };`).some(
            (message) => message.includes('boolean literal true or false'),
        ),
    );
    assert.ok(
        messages(`const stop = false;
export const breaking = { reason: 'x', requiredStop: stop };`).some((message) =>
            message.includes('boolean literal true or false'),
        ),
    );
});

test('rejects malformed breaking declaration shapes', () => {
    const cases = [
        [`export let breaking = { reason: 'x', requiredStop: false };`, 'top-level export const'],
        [`const breaking = { reason: 'x', requiredStop: false };`, 'top-level export const'],
        [`export const breaking: object = { reason: 'x', requiredStop: false };`, 'unannotated object literal'],
        [`export const breaking = { reason: 'x' };`, 'missing required property requiredStop'],
        [`export const breaking = { reason: 'x', requiredStop: false, extra: true };`, 'unsupported property'],
        [`export const breaking = getBreaking();`, 'must be an object literal'],
        [`export const breaking = { reason: 'x', requiredStop: false }, other = 1;`, 'only declaration'],
    ] as const;
    for (const [source, expected] of cases) {
        assert.ok(messages(source).some((message) => message.includes(expected)), source);
    }
});

test('parses unannotated safe and breaking classifications', () => {
    const safe = parseChangeDeclarations(
        `export const classification = { kind: 'safe', reason: 'sets a session timeout' };`,
        'safe.ts',
    );
    assert.deepStrictEqual(safe.classification, {
        file: 'safe.ts',
        line: 1,
        kind: 'safe',
        reason: 'sets a session timeout',
    });
    const breaking = parseChangeDeclarations(
        `export const classification = { reason: 'rewrites a live contract', kind: 'breaking' };`,
    );
    assert.strictEqual(breaking.classification?.kind, 'breaking');
});

test('parses only the frozen annotated classification type', () => {
    const parsed = parseChangeDeclarations(
        `export const classification: { kind: "safe" | "breaking"; reason: string } = {
  kind: 'safe',
  reason: 'known session statement'
};`,
        'migration.ts',
    );
    assert.deepStrictEqual(parsed.diagnostics, []);
    assert.strictEqual(parsed.classification?.reason, 'known session statement');
    const invalid = [
        `export const classification: { kind: string; reason: string } = { kind: 'safe', reason: 'x' };`,
        `export const classification: { kind: "safe" | "breaking"; reason?: string } = { kind: 'safe', reason: 'x' };`,
        `export const classification: { kind: "safe" | "breaking"; reason: string; extra: boolean } = { kind: 'safe', reason: 'x' };`,
    ];
    for (const source of invalid) {
        assert.ok(messages(source).some((message) => message.includes('type must be exactly')));
    }
});

test('rejects malformed classification values', () => {
    const cases = [
        [`export const classification = { kind: 'maybe', reason: 'x' };`, '"safe" or "breaking"'],
        [`export const classification = { kind: 'safe', reason: '' };`, 'must not be empty'],
        [`export const classification = { kind: 'safe' };`, 'missing required property reason'],
        [`export const classification = { kind: 'safe', reason: 'x', extra: 1 };`, 'unsupported property'],
    ] as const;
    for (const [source, expected] of cases) {
        assert.ok(messages(source).some((message) => message.includes(expected)), source);
    }
});

test('ignores declaration-like content in comments strings templates and nested scopes', () => {
    const parsed = parseChangeDeclarations(`
// export const breaking = { reason: 'comment', requiredStop: true };
const sql = "export const breaking = { reason: 'string', requiredStop: true };";
const template = \`export const classification = { kind: 'breaking', reason: 'template' };\`;
function helper() { const breaking = { reason: 'nested', requiredStop: true }; }
`);
    assert.strictEqual(parsed.breaking, null);
    assert.strictEqual(parsed.classification, null);
    assert.deepStrictEqual(parsed.diagnostics, []);
});

test('rejects duplicate top-level declarations', () => {
    const parsed = parseChangeDeclarations(`
export const breaking = { reason: 'one', requiredStop: false };
export const breaking = { reason: 'two', requiredStop: true };
`);
    assert.ok(parsed.diagnostics.some((diagnostic) => diagnostic.message.includes('exactly once')));
});

test('collects declarations and diagnostics from supplied sources only', () => {
    const collected = collectChangeDeclarationsFromSources([
        {
            file: 'a.ts',
            source: `export const breaking = { reason: 'a', requiredStop: false };`,
        },
        {
            file: 'b.ts',
            source: `export const classification = { kind: 'safe', reason: 'b' };`,
        },
        {
            file: 'c.ts',
            source: `export const breaking = { reason: '', requiredStop: false };`,
        },
    ]);
    assert.deepStrictEqual(collected.breaking.map((value) => value.file), ['a.ts']);
    assert.deepStrictEqual(collected.classifications.map((value) => value.file), ['b.ts']);
    assert.strictEqual(collected.diagnostics.length, 1);
});

test('collection reports read failures without reading any implicit paths', () => {
    const requested: string[] = [];
    const collected = collectChangeDeclarations(['changed.ts'], (path) => {
        requested.push(path);
        throw new Error('not found');
    });
    assert.deepStrictEqual(requested, ['changed.ts']);
    assert.strictEqual(collected.diagnostics[0]?.declaration, 'source');
    assert.ok(collected.diagnostics[0]?.message.includes('not found'));
});

if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} failed, ${passed} passed:\n`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}

console.log(`✅ ${passed} tests passed`);
