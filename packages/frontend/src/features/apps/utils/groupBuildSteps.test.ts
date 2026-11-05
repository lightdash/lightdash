import { describe, expect, it } from 'vitest';
import { groupBuildSteps } from './groupBuildSteps';

const steps = [
    'Reading _index.md',
    'Reading orders.yml',
    'Searching codebase',
    'Reading payments.yml',
    'Searching codebase',
    'Editing App.tsx',
];

describe('groupBuildSteps', () => {
    it('folds steps into one row per kind of work, in first-seen order', () => {
        const { groups, currentIndex } = groupBuildSteps(steps, false);
        expect(groups.map((g) => [g.label, g.targets])).toEqual([
            ['Read 1 file', ['_index.md']],
            ['Read 2 data models', ['orders', 'payments']],
            ['Searched the code', []],
            ['Edited 1 file', ['App.tsx']],
        ]);
        expect(currentIndex).toBeNull();
    });

    it('marks the latest kind of work as current while live', () => {
        const { groups, currentIndex } = groupBuildSteps(
            steps.slice(0, 4),
            true,
        );
        expect(currentIndex).toBe(1);
        expect(groups[1].label).toBe('Reading data models');
    });

    it('keeps unknown steps as their own rows', () => {
        const { groups } = groupBuildSteps(['Bundling the app'], false);
        expect(groups[0]).toMatchObject({
            kind: 'other',
            label: 'Bundling the app',
        });
    });
});
