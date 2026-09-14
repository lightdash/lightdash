import { renderHook } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';
import {
    createExplorerStore,
    explorerActions,
} from '../../../features/explorer/store';
import { useChartGalleryRightSidebar } from './useChartGalleryRightSidebar';

vi.mock('../VisualizationCard/VisualizationConfigPortal', () => ({
    default: () => <div data-testid="visualization-config-portal" />,
}));

const renderWithStore = <Result,>(
    ui: () => Result,
    { openVisualizationConfig = false } = {},
) => {
    const store = createExplorerStore();
    if (openVisualizationConfig) {
        store.dispatch(explorerActions.openVisualizationConfig());
    }

    const wrapper = ({ children }: PropsWithChildren) => (
        <Provider store={store}>{children}</Provider>
    );

    return renderHook(ui, { wrapper });
};

describe('useChartGalleryRightSidebar', () => {
    it('returns the portal and follows the selector when enabled', () => {
        const { result } = renderWithStore(
            () => useChartGalleryRightSidebar({ enabled: true }),
            { openVisualizationConfig: true },
        );

        expect(result.current.rightSidebar).not.toBeNull();
        expect(result.current.isRightSidebarOpen).toBe(true);
        expect(result.current.keepRightSidebarMounted).toBe(true);
        expect(result.current.noRightSidebarPadding).toBe(true);
    });

    it('hides the sidebar when the caller has not enabled it', () => {
        const { result } = renderWithStore(
            () => useChartGalleryRightSidebar({ enabled: false }),
            { openVisualizationConfig: true },
        );

        expect(result.current.rightSidebar).toBeNull();
        expect(result.current.isRightSidebarOpen).toBe(false);
        expect(result.current.keepRightSidebarMounted).toBe(true);
        expect(result.current.noRightSidebarPadding).toBe(true);
    });
});
