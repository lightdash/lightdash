import { describe, expect, it } from 'vitest';
import {
    isPresent,
    readPath,
    refsIn,
    resolveOptions,
    resolveRows,
    resolveValue,
    type GenerativeUiBindingContext,
} from './bindings';

const context: GenerativeUiBindingContext = {
    state: { spaceUuid: 's-1', chartUuids: ['c-1', 'c-2'], note: null },
    queries: new Map([
        [
            'spaces',
            [
                { uuid: 's-1', name: 'Finance' },
                { uuid: 's-2', name: 'Sales' },
            ],
        ],
    ]),
    results: new Map<string, unknown>([
        ['createSpace', { uuid: 'space-new' }],
        ['move', [null, null]],
    ]),
    item: { value: { uuid: 'c-9', nested: { id: 3 } } },
};

describe('readPath', () => {
    it('reads nested keys and array indexes', () => {
        const value = { data: [{ uuid: 'a' }, { uuid: 'b' }] };

        expect(readPath(value, '')).toBe(value);
        expect(readPath(value, 'data.1.uuid')).toBe('b');
        expect(readPath(value, 'data.2.uuid')).toBeUndefined();
        expect(readPath(value, 'data.first')).toBeUndefined();
        expect(readPath('text', 'length')).toBeUndefined();
    });

    it('never reads inherited properties', () => {
        expect(readPath({}, 'constructor')).toBeUndefined();
        expect(readPath({ a: {} }, 'a.toString')).toBeUndefined();
    });
});

describe('resolveValue', () => {
    it('replaces every reference kind and keeps literals in place', () => {
        expect(
            resolveValue(
                {
                    action: {
                        type: 'move',
                        targetSpaceUuid: {
                            $result: 'createSpace',
                            path: 'uuid',
                        },
                    },
                    item: {
                        uuid: { $item: 'uuid' },
                        id: { $item: 'nested.id' },
                    },
                    space: { $state: 'spaceUuid' },
                    firstSpace: { $query: 'spaces', path: '0.name' },
                    moved: { $result: 'move' },
                    list: [{ $state: 'chartUuids' }, 1, true, null],
                },
                context,
            ),
        ).toEqual({
            action: { type: 'move', targetSpaceUuid: 'space-new' },
            item: { uuid: 'c-9', id: 3 },
            space: 's-1',
            firstSpace: 'Finance',
            moved: [null, null],
            list: [['c-1', 'c-2'], 1, true, null],
        });
    });

    it('resolves to undefined when a source is not available', () => {
        expect(resolveValue({ $query: 'charts' }, context)).toBeUndefined();
        expect(resolveValue({ $result: 'later' }, context)).toBeUndefined();
        expect(
            resolveValue({ $item: '' }, { ...context, item: null }),
        ).toBeUndefined();
        expect(resolveValue({ $state: 'note' }, context)).toBeNull();
    });
});

describe('refsIn', () => {
    it('finds references inside nested objects and arrays', () => {
        expect(
            refsIn({
                a: [{ $state: 'x' }, { b: { $query: 'q', path: 'data' } }],
                c: 'literal',
            }),
        ).toEqual([
            { kind: 'state', key: 'x' },
            { kind: 'query', queryId: 'q', path: 'data' },
        ]);
    });
});

describe('isPresent', () => {
    it('treats null, empty strings and empty arrays as missing', () => {
        expect([undefined, null, '', []].map(isPresent)).toEqual([
            false,
            false,
            false,
            false,
        ]);
        expect([0, false, 'a', ['a']].map(isPresent)).toEqual([
            true,
            true,
            true,
            true,
        ]);
    });
});

describe('resolveOptions', () => {
    it('keeps static options as written', () => {
        const options = [{ label: 'Daily', value: 'daily' }];

        expect(resolveOptions(options, new Map())).toEqual({
            status: 'ready',
            options,
        });
    });

    it('waits for its query', () => {
        expect(
            resolveOptions(
                { $query: 'spaces', label: 'name', value: 'uuid' },
                new Map(),
            ),
        ).toEqual({ status: 'waiting' });
    });

    it('maps query items to string options, skipping duplicates and items without a value', () => {
        const queries = new Map([
            [
                'users',
                {
                    data: [
                        { id: 1, name: 'Ana' },
                        { id: 1, name: 'Duplicate' },
                        { name: 'No id' },
                        { id: 'x' },
                    ],
                },
            ],
        ]);

        expect(
            resolveOptions(
                { $query: 'users', path: 'data', label: 'name', value: 'id' },
                queries,
            ),
        ).toEqual({
            status: 'ready',
            options: [
                { value: '1', label: 'Ana' },
                { value: 'x', label: 'x' },
            ],
        });
    });
});

describe('resolveRows', () => {
    it('returns literal rows, query rows, and nothing for non-arrays', () => {
        const rows = [{ uuid: 'a', name: 'Revenue' }];
        const queries = new Map<string, unknown>([
            ['schedulers', { data: [{ id: 1 }, 'not a row'] }],
            ['user', { uuid: 'u-1' }],
        ]);

        expect(resolveRows(rows, queries)).toEqual({ status: 'ready', rows });
        expect(
            resolveRows({ $query: 'schedulers', path: 'data' }, queries),
        ).toEqual({ status: 'ready', rows: [{ id: 1 }] });
        expect(resolveRows({ $query: 'user' }, queries)).toEqual({
            status: 'ready',
            rows: [],
        });
        expect(resolveRows({ $query: 'charts' }, queries)).toEqual({
            status: 'waiting',
        });
    });
});
