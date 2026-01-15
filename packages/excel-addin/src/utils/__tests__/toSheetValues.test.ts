import { describe, expect, it } from 'vitest';
import { toSheetValues } from '../toSheetValues';

it('maps rows to sheet values with headers', () => {
    const { values } = toSheetValues(
        ['Status', 'Revenue'],
        [{ Status: 'completed', Revenue: 10 }],
    );

    expect(values).toEqual([
        ['Status', 'Revenue'],
        ['completed', 10],
    ]);
});
