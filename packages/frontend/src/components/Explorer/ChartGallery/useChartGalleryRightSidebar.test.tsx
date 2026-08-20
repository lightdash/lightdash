import { renderHook } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createExplorerStore,
    explorerActions,
} from '../../../features/explorer/store';
import { useChartGalleryRightSidebar } from './useChartGalleryRightSidebar';

const testState = vi.hoisted(() => ({
    isChartGalleryEnabled: false,
}));

vi.mock('./useIsChartGalleryEnabled', () => ({
    useIsChartGalleryEnabled: () => testState.isChartGalleryEnabled,
}));

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
    beforeEach(() => {
        testState.isChartGalleryEnabled = false;
    });

    it('returns falsy/null right-sidebar props when the flag is off', () => {
        const { result } = renderWithStore(() =>
            useChartGalleryRightSidebar({ enabled: true }),
        );

        expect(result.current.rightSidebar).toBeNull();
        expect(result.current.isRightSidebarOpen).toBe(false);
        expect(result.current.keepRightSidebarMounted).toBe(false);
        expect(result.current.noRightSidebarPadding).toBe(false);
    });

    it('returns the portal and follows the selector when the flag is on and enabled', () => {
        testState.isChartGalleryEnabled = true;

        const { result } = renderWithStore(
            () => useChartGalleryRightSidebar({ enabled: true }),
            { openVisualizationConfig: true },
        );

        expect(result.current.rightSidebar).not.toBeNull();
        expect(result.current.isRightSidebarOpen).toBe(true);
        expect(result.current.keepRightSidebarMounted).toBe(true);
        expect(result.current.noRightSidebarPadding).toBe(true);
    });

    it('hides the sidebar when the flag is on but the caller has not enabled it', () => {
        testState.isChartGalleryEnabled = true;

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
