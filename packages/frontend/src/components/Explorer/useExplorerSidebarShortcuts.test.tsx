import { fireEvent, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createExplorerStore,
    type ExplorerStoreState,
} from '../../features/explorer/store';
import { defaultState } from '../../providers/Explorer/defaultState';
import { ExplorerSection } from '../../providers/Explorer/types';
import { renderWithProviders } from '../../testing/testUtils';
import { useExplorerSidebarShortcuts } from './useExplorerSidebarShortcuts';

const { chartGalleryEnabled } = vi.hoisted(() => ({
    chartGalleryEnabled: { current: true },
}));

vi.mock('./ChartGallery/useIsChartGalleryEnabled', () => ({
    useIsChartGalleryEnabled: () => chartGalleryEnabled.current,
}));

const Harness = ({ enabled = true }: { enabled?: boolean }) => {
    useExplorerSidebarShortcuts({ enabled });
    return <input aria-label="Field search" />;
};

const renderHarness = ({
    enabled = true,
    state = {},
}: {
    enabled?: boolean;
    state?: Partial<ExplorerStoreState['explorer']>;
} = {}) => {
    const store = createExplorerStore({
        explorer: {
            ...defaultState,
            expandedSections: [ExplorerSection.RESULTS],
            ...state,
        },
    });

    renderWithProviders(
        <Provider store={store}>
            <MemoryRouter>
                <Harness enabled={enabled} />
            </MemoryRouter>
        </Provider>,
    );

    return store;
};

describe('useExplorerSidebarShortcuts', () => {
    beforeEach(() => {
        chartGalleryEnabled.current = true;
    });

    it('toggles the field sidebar with mod+b', () => {
        const store = renderHarness();

        expect(
            fireEvent.keyDown(document.documentElement, {
                key: 'b',
                ctrlKey: true,
            }),
        ).toBe(false);
        expect(store.getState().explorer.isFieldSidebarOpen).toBe(false);

        fireEvent.keyDown(document.documentElement, {
            key: 'b',
            ctrlKey: true,
        });
        expect(store.getState().explorer.isFieldSidebarOpen).toBe(true);
    });

    it('opens the visualization card and chart sidebar with mod+alt+b', () => {
        const store = renderHarness();

        fireEvent.keyDown(document.documentElement, {
            key: 'b',
            ctrlKey: true,
            altKey: true,
        });

        expect(store.getState().explorer.isVisualizationConfigOpen).toBe(true);
        expect(store.getState().explorer.expandedSections).toContain(
            ExplorerSection.VISUALIZATION,
        );

        fireEvent.keyDown(document.documentElement, {
            key: 'b',
            ctrlKey: true,
            altKey: true,
        });
        expect(store.getState().explorer.isVisualizationConfigOpen).toBe(
            false,
        );
    });

    it('does not register shortcuts when disabled', () => {
        const store = renderHarness({ enabled: false });

        fireEvent.keyDown(document.documentElement, {
            key: 'b',
            ctrlKey: true,
        });
        expect(store.getState().explorer.isFieldSidebarOpen).toBe(true);
    });

    it('does not register the chart shortcut when the gallery is disabled', () => {
        chartGalleryEnabled.current = false;
        const store = renderHarness();

        fireEvent.keyDown(document.documentElement, {
            key: 'b',
            ctrlKey: true,
            altKey: true,
        });
        expect(store.getState().explorer.isVisualizationConfigOpen).toBe(
            false,
        );
    });

    it('ignores shortcuts while typing in an input', () => {
        const store = renderHarness();

        fireEvent.keyDown(screen.getByRole('textbox', { name: 'Field search' }), {
            key: 'b',
            ctrlKey: true,
        });

        expect(store.getState().explorer.isFieldSidebarOpen).toBe(true);
    });
});
