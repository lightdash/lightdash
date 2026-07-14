import { describe, expect, it } from 'vitest';
import { groupComboboxItems } from './utils';

describe('groupComboboxItems', () => {
    it('preserves first-seen group and option order, metadata, and trailing ungrouped options', () => {
        expect(
            groupComboboxItems([
                { value: 'a', label: 'A', group: 'Second', disabled: true },
                { value: 'b', label: 'B' },
                { value: 'c', label: 'C', group: 'First', metadata: 1 },
                { value: 'd', label: 'D', group: 'Second' },
            ]),
        ).toEqual([
            {
                group: 'Second',
                items: [
                    { value: 'a', label: 'A', disabled: true },
                    { value: 'd', label: 'D' },
                ],
            },
            {
                group: 'First',
                items: [{ value: 'c', label: 'C', metadata: 1 }],
            },
            { value: 'b', label: 'B' },
        ]);
    });

    it('rejects duplicate values across groups', () => {
        expect(() =>
            groupComboboxItems([
                { value: 'duplicate', label: 'A', group: 'One' },
                { value: 'duplicate', label: 'B', group: 'Two' },
            ]),
        ).toThrow('Duplicate Select option value: duplicate');
    });
});
