import { describe, expect, it, vi } from 'vitest';
import { getPivotCellInteractionProps } from './getPivotCellInteractionProps';

describe('getPivotCellInteractionProps', () => {
    it('removes ordinary and total-cell menu behavior when disabled', () => {
        const menu = vi.fn();

        expect(
            getPivotCellInteractionProps({
                enabled: false,
                withInteractions: true,
                withMenu: menu,
            }),
        ).toEqual({ withInteractions: undefined, withMenu: undefined });
    });

    it('preserves menu behavior when enabled', () => {
        const menu = vi.fn();

        expect(
            getPivotCellInteractionProps({
                enabled: true,
                withInteractions: true,
                withMenu: menu,
            }),
        ).toEqual({ withInteractions: true, withMenu: menu });
    });
});
