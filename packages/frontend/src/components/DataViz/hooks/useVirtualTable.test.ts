import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useVirtualTable } from './useVirtualTable';

describe('SQL results column widths', () => {
    it('sizes JSON preview columns without serializing offscreen objects', () => {
        const columnNames = Array.from({ length: 41 }, (_, i) => String(i));
        const value = {
            toJSON() {
                throw new Error('offscreen serialization');
            },
        };
        const { result } = renderHook(() =>
            useVirtualTable({
                isCompact: true,
                enableJsonViewer: true,
                columnNames,
                rows: [{ '40': value }],
            }),
        );
        expect(result.current.columnWindow?.width).toBeGreaterThan(0);
    });
    it.each([false, true])(
        'fits sampled values with compact mode %s',
        (isCompact) => {
            const columnNames = Array.from(
                { length: 41 },
                (_, i) => `field.${i}`,
            );
            const render = (value: string) =>
                renderHook(() =>
                    useVirtualTable({
                        isCompact,
                        columnNames,
                        rows: [{ 'field.0': value }],
                    }),
                ).result.current;
            const narrow = render('a');
            const wide = render('a longer value in the result set');
            expect(wide.columnWindow!.width).toBeGreaterThan(
                narrow.columnWindow!.width,
            );
            expect(wide.table.getRowModel().rows[0].getValue('field.0')).toBe(
                'a longer value in the result set',
            );
        },
    );
});
