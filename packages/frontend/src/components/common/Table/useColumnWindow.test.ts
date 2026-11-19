import { renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { useColumnWindow } from './useColumnWindow';

describe('useColumnWindow', () => {
    it.each([40, 41])(
        'counts %i data columns independently of the row number',
        (count) => {
            const viewport = createRef<HTMLDivElement>();
            const fields = Array.from({ length: count }, (_, index) => ({
                id: String(index),
                width: 100,
            }));
            const columns = [{ id: 'row-number', width: 40 }, ...fields];
            const { result } = renderHook(() =>
                useColumnWindow(viewport, columns, count),
            );
            expect(result.current !== undefined).toBe(count > 40);
        },
    );
});
