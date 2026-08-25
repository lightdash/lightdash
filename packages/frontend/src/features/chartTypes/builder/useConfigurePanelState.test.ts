import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useConfigurePanelState } from './useConfigurePanelState';

describe('useConfigurePanelState', () => {
    it('keeps only what the author changed', () => {
        const { result } = renderHook(() => useConfigurePanelState('viz-1'));

        act(() => {
            result.current.onOptionChange('legend', 'top');
            result.current.onPaletteChange('palette-1');
        });

        expect(result.current.optionValues).toEqual({ legend: 'top' });
        expect(result.current.colorPaletteUuid).toBe('palette-1');
    });

    it('resets when the host moves to another viz', () => {
        const { result, rerender } = renderHook(
            ({ uuid }: { uuid: string | null }) => useConfigurePanelState(uuid),
            { initialProps: { uuid: 'viz-1' } },
        );
        act(() => {
            result.current.onOptionChange('legend', 'top');
            result.current.onPaletteChange('palette-1');
        });

        rerender({ uuid: 'viz-2' });

        expect(result.current.optionValues).toEqual({});
        expect(result.current.colorPaletteUuid).toBeNull();
    });

    it('keeps edits when the host adopts the uuid a first build claimed', () => {
        const { result, rerender } = renderHook(
            ({ uuid }: { uuid: string | null }) => useConfigurePanelState(uuid),
            { initialProps: { uuid: null as string | null } },
        );
        act(() => result.current.onOptionChange('legend', 'top'));

        rerender({ uuid: 'viz-1' });

        expect(result.current.optionValues).toEqual({ legend: 'top' });
    });
});
