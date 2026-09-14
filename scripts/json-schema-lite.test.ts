/**
 * Unit tests for the dependency-free release-safety JSON-Schema subset.
 * Run: `npx tsx scripts/json-schema-lite.test.ts`
 */
import * as assert from 'assert';
import { validateAgainstSchema } from './json-schema-lite';

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

const errors = (data: unknown, schema: Record<string, unknown>): string[] =>
    validateAgainstSchema(data, schema);

test('type accepts supported JSON types and rejects the wrong type', () => {
    const fixtures: Array<[unknown, string]> = [
        [{}, 'object'],
        [[], 'array'],
        ['x', 'string'],
        [1, 'integer'],
        [1.5, 'number'],
        [true, 'boolean'],
        [null, 'null'],
    ];
    for (const [value, type] of fixtures) assert.deepStrictEqual(errors(value, { type }), []);
    assert.match(errors('1', { type: 'integer' })[0], /expected type integer/);
});

test('type arrays accept null and reject values outside the union', () => {
    const schema = { type: ['string', 'null'] };
    assert.deepStrictEqual(errors(null, schema), []);
    assert.deepStrictEqual(errors('value', schema), []);
    assert.match(errors(false, schema)[0], /expected type string\|null/);
});

test('const and enum accept matching values and reject non-members including null', () => {
    assert.deepStrictEqual(errors('1', { const: '1' }), []);
    assert.match(errors('2', { const: '1' })[0], /does not equal const/);
    assert.deepStrictEqual(errors(null, { enum: ['x', null] }), []);
    assert.match(errors('y', { enum: ['x', null] })[0], /not in enum/);
});

test('properties, required, and additionalProperties false validate object shape', () => {
    const schema = {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
        additionalProperties: false,
    };
    assert.deepStrictEqual(errors({ name: 'ok' }, schema), []);
    assert.match(errors({ name: 1 }, schema)[0], /name: expected type string/);
    assert.match(errors({}, schema)[0], /name: required property missing/);
    assert.match(errors({ name: 'ok', extra: true }, schema)[0], /extra: additional property/);
});

test('additionalProperties schema validates every dynamic property', () => {
    const schema = {
        type: 'object',
        additionalProperties: { type: 'integer', minimum: 0 },
    };
    assert.deepStrictEqual(errors({ one: 1, two: 2 }, schema), []);
    assert.match(errors({ bad: -1 }, schema)[0], /bad: value -1 is less than minimum 0/);
});

test('items validates array entries and reports indexed nested paths', () => {
    const schema = {
        type: 'array',
        items: {
            type: 'object',
            properties: { enabled: { type: 'boolean' } },
            required: ['enabled'],
        },
    };
    assert.deepStrictEqual(errors([{ enabled: true }], schema), []);
    assert.match(errors([{ enabled: 'yes' }], schema)[0], /\$\[0\]\.enabled/);
});

test('oneOf requires exactly one matching schema', () => {
    const schema = { oneOf: [{ type: 'string' }, { type: 'boolean' }] };
    assert.deepStrictEqual(errors('ok', schema), []);
    assert.match(errors(1, schema)[0], /matched 0/);
    assert.match(errors(1, { oneOf: [{ type: 'number' }, { type: 'integer' }] })[0], /matched 2/);
});

test('$ref resolves definitions against the root schema', () => {
    const root = {
        definitions: { label: { type: 'string', enum: ['safe'] } },
        $ref: '#/definitions/label',
    };
    assert.deepStrictEqual(errors('safe', root), []);
    assert.match(errors('unsafe', root)[0], /not in enum/);
});

test('$ref accepts an explicit root schema for a schema fragment', () => {
    const root = { definitions: { count: { type: 'integer', minimum: 1 } } };
    const schema = { $ref: '#/definitions/count' };
    assert.deepStrictEqual(validateAgainstSchema(1, schema, root), []);
    assert.match(validateAgainstSchema(0, schema, root)[0], /minimum 1/);
});

test('ignored metadata keywords do not affect validation', () => {
    const schema = {
        $schema: 'draft-07',
        $id: 'test',
        title: 'Title',
        description: 'Description',
        format: 'date-time',
        default: 'x',
        type: 'string',
    };
    assert.deepStrictEqual(errors('anything', schema), []);
});

test('unsupported schema keywords throw even in an unvisited branch', () => {
    assert.throws(
        () => errors({}, { type: 'object', properties: { unused: { type: 'string', pattern: '^x' } } }),
        /unsupported schema construct: pattern/,
    );
});

if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} failed, ${passed} passed:\n`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}
console.log(`✅ ${passed} tests passed`);
