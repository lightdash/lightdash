import type { ProjectContextCitableEntry } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getProjectContextSearchEntries } from './memoryProjectContext';

const projectContext: ProjectContextCitableEntry[] = [
    {
        id: 'revenue-definition',
        slug: 'revenue-definition-3fa9c2d1',
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
        scope: 'project' as const,
        terms: ['recognized revenue'],
        objects: [{ type: 'explore' as const, name: 'orders' }],
        ageDays: 0,
    },
];

describe('getProjectContextSearchEntries', () => {
    it('labels project context as its own source when memory is disabled', () => {
        expect(
            getProjectContextSearchEntries({
                projectContext,
                memories,
                memoryEnabled: false,
            }),
        ).toEqual([{ ...projectContext[0], source: 'context' }]);
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
                slug: 'completed-order-revenue',
                content: 'Use completed orders for recognized revenue.',
                terms: ['recognized revenue'],
                objects: [{ type: 'explore', name: 'orders' }],
                source: 'memory',
                memoryScope: 'project',
                memoryAgeDays: 0,
            },
        ]);
    });
});
