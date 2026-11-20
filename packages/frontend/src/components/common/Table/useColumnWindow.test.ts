import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHookWithProviders } from '../../../testing/testUtils';
import { useColumnWindow } from './useColumnWindow';

describe('useColumnWindow', () => {
    it.each([
        [40, true],
        [41, true],
        [41, false],
    ])(
        'counts %i data columns independently of the row number with windowing %s',
        (count, columnWindowing) => {
            const viewport = createRef<HTMLDivElement>();
            const fields = Array.from({ length: count }, (_, index) => ({
                id: String(index),
                width: 100,
            }));
            const columns = [{ id: 'row-number', width: 40 }, ...fields];
            const { result } = renderHookWithProviders(
                () => useColumnWindow(viewport, columns, count),
                undefined,
                { columnWindowing },
            );
            expect(result.current !== undefined).toBe(
                columnWindowing && count > 40,
            );
        },
    );
});
