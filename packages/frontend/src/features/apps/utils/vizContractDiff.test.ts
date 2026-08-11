import { type DataAppVizConfigOption } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    countVizContractChanges,
    diffVizConfigOptions,
    formatVizOptionValue,
} from './vizContractDiff';

const boolOption = (
    name: string,
    defaultValue: boolean,
): DataAppVizConfigOption => ({
    name,
    label: name,
    type: 'boolean',
    default: defaultValue,
});

const selectOption = (
    name: string,
    defaultValue: string,
): DataAppVizConfigOption => ({
    name,
    label: name,
    type: 'select',
    choices: [
        { value: 'right', label: 'Right' },
        { value: 'bottom', label: 'Bottom' },
    ],
    default: defaultValue,
});

describe('diffVizConfigOptions', () => {
    it('reports added, changed and removed options', () => {
        const prev = [
            boolOption('grid', false),
            selectOption('legend', 'right'),
            boolOption('smooth', true),
        ];
        const next = [
            boolOption('grid', true),
            boolOption('smooth', true),
            boolOption('markers', false),
        ];

        const diff = diffVizConfigOptions(prev, next, 3, 4);

        expect(diff.added).toEqual(['markers']);
        expect(Object.keys(diff.changed)).toEqual(['grid']);
        expect(diff.changed.grid).toEqual(boolOption('grid', false));
        expect(diff.removed).toEqual([selectOption('legend', 'right')]);
        expect(countVizContractChanges(diff)).toBe(3);
    });

    it('counts a type change under a stable name as changed', () => {
        const diff = diffVizConfigOptions(
            [boolOption('legend', true)],
            [selectOption('legend', 'right')],
            1,
            2,
        );

        expect(Object.keys(diff.changed)).toEqual(['legend']);
        expect(diff.added).toEqual([]);
        expect(diff.removed).toEqual([]);
    });

    it('is empty when the contract is unchanged', () => {
        const options = [boolOption('grid', false)];
        const diff = diffVizConfigOptions(options, options, 5, 6);

        expect(countVizContractChanges(diff)).toBe(0);
    });
});

describe('formatVizOptionValue', () => {
    it('words booleans as the switch does', () => {
        expect(formatVizOptionValue(boolOption('grid', false), true)).toBe(
            'On',
        );
        expect(formatVizOptionValue(boolOption('grid', false), false)).toBe(
            'Off',
        );
    });

    it('resolves select values to their choice label', () => {
        expect(
            formatVizOptionValue(selectOption('legend', 'right'), 'bottom'),
        ).toBe('Bottom');
        expect(
            formatVizOptionValue(selectOption('legend', 'right'), 'gone'),
        ).toBe('gone');
    });

    it('stringifies numbers and text', () => {
        const numberOption: DataAppVizConfigOption = {
            name: 'opacity',
            label: 'Opacity',
            type: 'number',
            default: 90,
        };
        expect(formatVizOptionValue(numberOption, 75)).toBe('75');
    });
});
