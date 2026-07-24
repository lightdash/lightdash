import type { ProjectContextEntry } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getProjectContextSearchEntries } from './memoryProjectContext';

const projectContext: ProjectContextEntry[] = [
    {
        id: 'revenue-definition',
        kind: 'definition',
        content: 'Revenue excludes refunds.',
        terms: ['revenue'],
        objects: [],
    },
];

const memories = [
    {
        slug: 'completed-order-revenue',
        content: 'Use completed orders for recognized revenue.',
        terms: ['recognized revenue'],
        objects: [{ type: 'explore' as const, name: 'orders' }],
    },
];

describe('getProjectContextSearchEntries', () => {
    it('leaves project context byte-compatible when memory is disabled', () => {
        expect(
            getProjectContextSearchEntries({
                projectContext,
                memories,
                memoryEnabled: false,
            }),
        ).toBe(projectContext);
    });

    it('labels both sources and maps memories to context entries', () => {
        expect(
            getProjectContextSearchEntries({
                projectContext,
                memories,
                memoryEnabled: true,
            }),
        ).toEqual([
            { ...projectContext[0], source: 'context' },
            {
                id: 'completed-order-revenue',
                kind: 'context',
                content: 'Use completed orders for recognized revenue.',
                terms: ['recognized revenue'],
                objects: [{ type: 'explore', name: 'orders' }],
                source: 'memory',
            },
        ]);
    });
});
