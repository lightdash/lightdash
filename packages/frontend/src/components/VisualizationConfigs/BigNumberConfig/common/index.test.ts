import { Compact } from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import { StyleOptions } from '.';

describe('Big Number style options', () => {
    test('includes Auto and keeps existing fixed compact styles', () => {
        expect(StyleOptions).toEqual([
            { value: '', label: 'None' },
            { value: Compact.AUTO, label: 'Auto (K, M, B, T)' },
            { value: Compact.THOUSANDS, label: 'thousands (K)' },
            { value: Compact.MILLIONS, label: 'millions (M)' },
            { value: Compact.BILLIONS, label: 'billions (B)' },
            { value: Compact.TRILLIONS, label: 'trillions (T)' },
        ]);
    });
});
