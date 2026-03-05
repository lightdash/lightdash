import { describe, expect, it } from 'vitest';
import { type NestableItem } from './types';
import { convertNestableListToTree, getAllParentPaths } from './utils';

describe('convertNestableListToTree', () => {
    it('returns empty array for empty input', () => {
        expect(convertNestableListToTree([])).toEqual([]);
    });

    it('returns flat list when items have no parent-child relationships', () => {
        const items: NestableItem[] = [
            { uuid: '1', name: 'Space A', path: 'a' },
            { uuid: '2', name: 'Space B', path: 'b' },
        ];
        const result = convertNestableListToTree(items);
        expect(result).toHaveLength(2);
        expect(result[0].label).toBe('Space A');
        expect(result[1].label).toBe('Space B');
        expect(result[0].children).toBeUndefined();
        expect(result[1].children).toBeUndefined();
    });

    it('nests child under parent based on path', () => {
        const items: NestableItem[] = [
            { uuid: '1', name: 'Parent', path: 'a' },
            { uuid: '2', name: 'Child', path: 'a.b' },
        ];
        const result = convertNestableListToTree(items);
        expect(result).toHaveLength(1);
        expect(result[0].label).toBe('Parent');
        expect(result[0].children).toHaveLength(1);
        expect(result[0].children![0].label).toBe('Child');
    });

    it('builds deep nested hierarchy', () => {
        const items: NestableItem[] = [
            { uuid: '1', name: 'Root', path: 'a' },
            { uuid: '2', name: 'Child', path: 'a.b' },
            { uuid: '3', name: 'Grandchild', path: 'a.b.c' },
        ];
        const result = convertNestableListToTree(items);
        expect(result).toHaveLength(1);
        expect(result[0].children).toHaveLength(1);
        expect(result[0].children![0].children).toHaveLength(1);
        expect(result[0].children![0].children![0].label).toBe('Grandchild');
    });

    it('handles items in any order (not pre-sorted)', () => {
        const items: NestableItem[] = [
            { uuid: '3', name: 'Grandchild', path: 'a.b.c' },
            { uuid: '1', name: 'Root', path: 'a' },
            { uuid: '2', name: 'Child', path: 'a.b' },
        ];
        const result = convertNestableListToTree(items);
        expect(result).toHaveLength(1);
        expect(result[0].label).toBe('Root');
        expect(result[0].children![0].label).toBe('Child');
        expect(result[0].children![0].children![0].label).toBe('Grandchild');
    });

    it('skips missing ancestors and attaches to nearest present ancestor', () => {
        // Parent "a.b" is missing — grandchild should attach to "a"
        const items: NestableItem[] = [
            { uuid: '1', name: 'Root', path: 'a' },
            { uuid: '3', name: 'Grandchild', path: 'a.b.c' },
        ];
        const result = convertNestableListToTree(items);
        expect(result).toHaveLength(1);
        expect(result[0].children).toHaveLength(1);
        expect(result[0].children![0].label).toBe('Grandchild');
    });

    it('handles multiple roots with children', () => {
        const items: NestableItem[] = [
            { uuid: '1', name: 'Root A', path: 'a' },
            { uuid: '2', name: 'Root B', path: 'b' },
            { uuid: '3', name: 'Child A1', path: 'a.a1' },
            { uuid: '4', name: 'Child B1', path: 'b.b1' },
        ];
        const result = convertNestableListToTree(items);
        expect(result).toHaveLength(2);
        expect(result[0].children).toHaveLength(1);
        expect(result[0].children![0].label).toBe('Child A1');
        expect(result[1].children).toHaveLength(1);
        expect(result[1].children![0].label).toBe('Child B1');
    });

    it('preserves uuid in nodeProps', () => {
        const items: NestableItem[] = [
            { uuid: 'abc-123', name: 'Space', path: 'x' },
        ];
        const result = convertNestableListToTree(items);
        expect(result[0].nodeProps).toEqual({ uuid: 'abc-123' });
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
            });
        }

        const start = performance.now();
        const result = convertNestableListToTree(items);
        const elapsed = performance.now() - start;

        // Should complete in well under 1 second
        expect(elapsed).toBeLessThan(1000);

        // Verify structure: single chain from root to leaf
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

describe('getAllParentPaths', () => {
    it('returns path for a root node', () => {
        const tree = convertNestableListToTree([
            { uuid: '1', name: 'Root', path: 'a' },
        ]);
        expect(getAllParentPaths(tree, 'a')).toEqual(['a']);
    });

    it('returns all ancestor paths for a nested node', () => {
        const tree = convertNestableListToTree([
            { uuid: '1', name: 'Root', path: 'a' },
            { uuid: '2', name: 'Child', path: 'a.b' },
            { uuid: '3', name: 'Grandchild', path: 'a.b.c' },
        ]);
        expect(getAllParentPaths(tree, 'a.b.c')).toEqual(['a', 'a.b', 'a.b.c']);
    });

    it('returns empty array for non-existent path', () => {
        const tree = convertNestableListToTree([
            { uuid: '1', name: 'Root', path: 'a' },
        ]);
        expect(getAllParentPaths(tree, 'x.y.z')).toEqual([]);
    });
});
