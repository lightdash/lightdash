import { type ResultRow } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { vizBuildSampleRows } from './vizBuildSampleRows';

describe('vizBuildSampleRows', () => {
    it('prioritizes every field in a multi-field input before applying the column limit', () => {
        const row: ResultRow = Object.fromEntries(
            Array.from({ length: 25 }, (_, i) => [
                `field_${i}`,
                { value: { raw: i, formatted: `${i}` } },
            ]),
        );

        const [sample] = vizBuildSampleRows([row], {
            values: ['field_24', 'field_23'],
            label: 'field_22',
        });

        expect(Object.keys(sample)).toHaveLength(20);
        expect(Object.keys(sample).slice(0, 3)).toEqual([
            'field_24',
            'field_23',
            'field_22',
        ]);
    });

    it('uses formatted visible rows, prioritizes mapped fields, and caps the sample', () => {
        const rows: ResultRow[] = Array.from({ length: 12 }, (_, i) => ({
            unmapped: {
                value: { raw: i, formatted: `unmapped-${i}` },
            },
            mapped: {
                value: { raw: i, formatted: `shown-${i}` },
            },
        }));

        const sample = vizBuildSampleRows(rows, { source: 'mapped' });

        expect(sample).toHaveLength(10);
        expect(Object.keys(sample[0])).toEqual(['mapped', 'unmapped']);
        expect(sample[0].mapped).toBe('shown-0');
        expect(sample[9].mapped).toBe('shown-9');
    });
});
