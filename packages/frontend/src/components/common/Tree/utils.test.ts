import { describe, expect, it } from 'vitest';
import { type NestableItem } from './types';
import {
    convertNestableListToTree,
    getAncestorUuids,
    getParentUuids,
} from './utils';

describe('convertNestableListToTree', () => {
    it('returns empty array for empty input', () => {
        expect(convertNestableListToTree([])).toEqual([]);
    });

    it('returns flat list when items have no parent-child relationships', () => {
        const items: NestableItem[] = [
            { uuid: '1', name: 'Space A', path: 'a', parentSpaceUuid: null },
            { uuid: '2', name: 'Space B', path: 'b', parentSpaceUuid: null },
        ];
        const result = convertNestableListToTree(items);
        expect(result).toHaveLength(2);
        expect(result[0].label).toBe('Space A');
        expect(result[1].label).toBe('Space B');
        expect(result[0].children).toBeUndefined();
        expect(result[1].children).toBeUndefined();
    });

    it('nests child under its parent space', () => {
        const items: NestableItem[] = [
            { uuid: '1', name: 'Parent', path: 'a', parentSpaceUuid: null },
            { uuid: '2', name: 'Child', path: 'a.b', parentSpaceUuid: '1' },
        ];
        const result = convertNestableListToTree(items);
        expect(result).toHaveLength(1);
        expect(result[0].label).toBe('Parent');
        expect(result[0].children).toHaveLength(1);
        expect(result[0].children![0].label).toBe('Child');
    });

    it('builds deep nested hierarchy', () => {
        const items: NestableItem[] = [
            { uuid: '1', name: 'Root', path: 'a', parentSpaceUuid: null },
            { uuid: '2', name: 'Child', path: 'a.b', parentSpaceUuid: '1' },
            {
                uuid: '3',
                name: 'Grandchild',
                path: 'a.b.c',
                parentSpaceUuid: '2',
            },
        ];
        const result = convertNestableListToTree(items);
        expect(result).toHaveLength(1);
        expect(result[0].children).toHaveLength(1);
        expect(result[0].children![0].children).toHaveLength(1);
        expect(result[0].children![0].children![0].label).toBe('Grandchild');
    });

    it('handles items in any order (not pre-sorted)', () => {
        const items: NestableItem[] = [
            {
                uuid: '3',
                name: 'Grandchild',
                path: 'a.b.c',
                parentSpaceUuid: '2',
            },
            { uuid: '1', name: 'Root', path: 'a', parentSpaceUuid: null },
            { uuid: '2', name: 'Child', path: 'a.b', parentSpaceUuid: '1' },
        ];
        const result = convertNestableListToTree(items);
        expect(result).toHaveLength(1);
        expect(result[0].label).toBe('Root');
        expect(result[0].children![0].label).toBe('Child');
        expect(result[0].children![0].children![0].label).toBe('Grandchild');
    });

    it('skips missing ancestors and attaches to nearest present ancestor', () => {
        const items: NestableItem[] = [
            { uuid: '1', name: 'Root', path: 'a', parentSpaceUuid: null },
            {
                uuid: '3',
                name: 'Grandchild',
                path: 'a.b.c',
                parentSpaceUuid: '2',
            },
        ];
        const result = convertNestableListToTree(items);
        expect(result).toHaveLength(1);
        expect(result[0].children).toHaveLength(1);
        expect(result[0].children![0].label).toBe('Grandchild');
    });

    it('handles multiple roots with children', () => {
        const items: NestableItem[] = [
            { uuid: '1', name: 'Root A', path: 'a', parentSpaceUuid: null },
            { uuid: '2', name: 'Root B', path: 'b', parentSpaceUuid: null },
            {
                uuid: '3',
                name: 'Child A1',
                path: 'a.a1',
                parentSpaceUuid: '1',
            },
            {
                uuid: '4',
                name: 'Child B1',
                path: 'b.b1',
                parentSpaceUuid: '2',
            },
        ];
        const result = convertNestableListToTree(items);
        expect(result).toHaveLength(2);
        expect(result[0].children).toHaveLength(1);
        expect(result[0].children![0].label).toBe('Child A1');
        expect(result[1].children).toHaveLength(1);
        expect(result[1].children![0].label).toBe('Child B1');
    });

    it('uses the space uuid as the node value', () => {
        const items: NestableItem[] = [
            {
                uuid: 'abc-123',
                name: 'Space',
                path: 'x',
                parentSpaceUuid: null,
            },
        ];
        const result = convertNestableListToTree(items);
        expect(result[0].value).toBe('abc-123');
        expect(result[0].nodeProps).toEqual({ uuid: 'abc-123' });
    });

    it('keeps spaces that share a path as separate nodes', () => {
        const items: NestableItem[] = [
            {
                uuid: 'product',
                name: 'Product',
                path: 'product',
                parentSpaceUuid: null,
            },
            {
                uuid: 'charts-a',
                name: 'Charts',
                path: 'product.charts',
                parentSpaceUuid: 'product',
            },
            {
                uuid: 'charts-b',
                name: 'Charts',
                path: 'product.charts',
                parentSpaceUuid: 'product',
            },
        ];
        const result = convertNestableListToTree(items);
        expect(result).toHaveLength(1);
        expect(result[0].children?.map((node) => node.value)).toEqual([
            'charts-a',
            'charts-b',
        ]);
    });

    it('nests by parent space when the path points elsewhere', () => {
        const items: NestableItem[] = [
            {
                uuid: 'product',
                name: 'Product',
                path: 'product',
                parentSpaceUuid: null,
            },
            {
                uuid: 'marketing',
                name: 'Marketing',
                path: 'marketing',
                parentSpaceUuid: null,
            },
            {
                uuid: 'charts',
                name: 'Charts',
                path: 'marketing.charts',
                parentSpaceUuid: 'product',
            },
        ];
        const result = convertNestableListToTree(items);
        expect(result[0].children?.map((node) => node.value)).toEqual([
            'charts',
        ]);
        expect(result[1].children).toBeUndefined();
    });

    it('handles large deeply nested chains efficiently', () => {
        const depth = 1000;
        const items: NestableItem[] = [];
        for (let i = 0; i < depth; i++) {
            const pathParts = Array.from({ length: i + 1 }, (_, j) =>
                String(j),
            );
            items.push({
                uuid: String(i),
                name: `Level ${i}`,
                path: pathParts.join('.'),
                parentSpaceUuid: i === 0 ? null : String(i - 1),
            });
        }

        const start = performance.now();
        const result = convertNestableListToTree(items);
        const elapsed = performance.now() - start;

        expect(elapsed).toBeLessThan(1000);

        expect(result).toHaveLength(1);
        let node = result[0];
        for (let i = 0; i < depth - 1; i++) {
            expect(node.children).toHaveLength(1);
            node = node.children![0];
        }
        expect(node.children).toBeUndefined();
        expect(node.label).toBe(`Level ${depth - 1}`);
    });
});

describe('getParentUuids', () => {
    it('does not fall back to an ambiguous path ancestor', () => {
        const parents = getParentUuids([
            { uuid: '1', name: 'A', path: 'a', parentSpaceUuid: null },
            { uuid: '2', name: 'A', path: 'a', parentSpaceUuid: null },
            { uuid: '3', name: 'C', path: 'a.b.c', parentSpaceUuid: 'gone' },
        ]);
        expect(parents.get('3')).toBeNull();
    });

    it('treats a parent cycle as a root', () => {
        const parents = getParentUuids([
            { uuid: '1', name: 'A', path: 'a', parentSpaceUuid: '2' },
            { uuid: '2', name: 'B', path: 'b', parentSpaceUuid: '1' },
        ]);
        expect([parents.get('1'), parents.get('2')]).toContain(null);
    });
});

describe('getAncestorUuids', () => {
    const items: NestableItem[] = [
        { uuid: '1', name: 'Root', path: 'a', parentSpaceUuid: null },
        { uuid: '2', name: 'Child', path: 'a.b', parentSpaceUuid: '1' },
        { uuid: '3', name: 'Grandchild', path: 'a.b.c', parentSpaceUuid: '2' },
    ];

    it('returns the uuid for a root node', () => {
        expect(getAncestorUuids(getParentUuids(items), '1')).toEqual(['1']);
    });

    it('returns all ancestor uuids for a nested node, root first', () => {
        expect(getAncestorUuids(getParentUuids(items), '3')).toEqual([
            '1',
            '2',
            '3',
        ]);
    });

    it('returns empty array for an unknown uuid', () => {
        expect(getAncestorUuids(getParentUuids(items), 'x')).toEqual([]);
    });
});
