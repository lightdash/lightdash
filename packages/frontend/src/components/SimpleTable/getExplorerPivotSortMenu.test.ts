import { describe, expect, it, vi } from 'vitest';
import { getExplorerPivotSortMenu } from './getExplorerPivotSortMenu';

describe('getExplorerPivotSortMenu', () => {
    it('removes edit-mode sort menus when context menus are disabled', () => {
        expect(
            getExplorerPivotSortMenu({
                enableContextMenu: false,
                isEditMode: true,
                renderSortMenu: vi.fn(),
            }),
        ).toBeUndefined();
    });

    it('keeps edit-mode sort menus when interactions are enabled', () => {
        const renderSortMenu = vi.fn();
        expect(
            getExplorerPivotSortMenu({
                enableContextMenu: true,
                isEditMode: true,
                renderSortMenu,
            }),
        ).toBe(renderSortMenu);
    });
});
