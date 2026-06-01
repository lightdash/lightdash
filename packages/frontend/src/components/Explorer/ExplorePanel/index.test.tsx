import { ExploreType, type Explore } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createExplorerStore } from '../../../features/explorer/store';
import { useExplore } from '../../../hooks/useExplore';
import { renderWithProviders } from '../../../testing/testUtils';
import ExplorePanel from './index';

// ExploreTree owns the search + expanded-category state in local useState.
// Stub it so we can assert whether ExplorePanel keeps it mounted, without
// pulling in the virtualized tree.
vi.mock('../ExploreTree', () => ({
    default: () => <div data-testid="explore-tree" />,
}));

vi.mock('../../../hooks/useExplore', () => ({ useExplore: vi.fn() }));
vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-uuid',
}));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: undefined }),
}));
vi.mock('../WriteBackModal/hooks', () => ({ useIsGitProject: () => false }));
vi.mock('../../../features/sourceCodeEditor', () => ({
    useSourceCodeEditor: () => ({ open: vi.fn() }),
}));
vi.mock('../../../features/virtualView', () => ({
    EditVirtualViewModal: () => null,
    DeleteVirtualViewModal: () => null,
}));
vi.mock('../../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: vi.fn() }),
}));

const mockUseExplore = vi.mocked(useExplore);

const mockExplore = {
    name: 'orders',
    label: 'Orders',
    baseTable: 'orders',
    tables: {},
    joinedTables: [],
    targetDatabase: 'postgres',
    type: ExploreType.DEFAULT,
} as unknown as Explore;

type ExploreQuery = ReturnType<typeof useExplore>;

const exploreQuery = (overrides: Partial<ExploreQuery>): ExploreQuery =>
    ({
        data: undefined,
        isInitialLoading: false,
        isFetching: false,
        status: 'success',
        error: null,
        ...overrides,
    }) as unknown as ExploreQuery;

const renderPanel = () =>
    renderWithProviders(
        <MemoryRouter>
            <Provider store={createExplorerStore()}>
                <ExplorePanel />
            </Provider>
        </MemoryRouter>,
    );

describe('ExplorePanel loading state', () => {
    beforeEach(() => {
        mockUseExplore.mockReset();
    });

    it('shows the skeleton on the initial load (no data yet)', () => {
        mockUseExplore.mockReturnValue(
            exploreQuery({ isInitialLoading: true, status: 'loading' }),
        );

        renderPanel();

        expect(screen.queryByTestId('explore-tree')).toBeNull();
    });

    it('renders the field tree once the explore has loaded', () => {
        mockUseExplore.mockReturnValue(exploreQuery({ data: mockExplore }));

        renderPanel();

        expect(screen.queryByTestId('explore-tree')).not.toBeNull();
    });

    // Regression: a background refetch (isFetching, but data already present)
    // must NOT swap in the skeleton, which would unmount ExploreTree and wipe
    // the user's search term + expanded categories. See PROD-8043.
    it('keeps the field tree mounted during a background refetch', () => {
        mockUseExplore.mockReturnValue(
            exploreQuery({
                data: mockExplore,
                isFetching: true,
                isInitialLoading: false,
            }),
        );

        renderPanel();

        expect(screen.queryByTestId('explore-tree')).not.toBeNull();
    });
});
