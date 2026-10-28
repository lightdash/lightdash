import { ExploreType, type ApiExploreResults } from '@lightdash/common';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createExplorerStore } from '../../../features/explorer/store';
import { useExplore } from '../../../hooks/useExplore';
import { renderWithProviders } from '../../../testing/testUtils';
import ExplorePanel from './index';

const testState = vi.hoisted(() => ({
    merge: undefined as
        | {
              isMerging: boolean;
              readOnly: boolean;
              additionalSources: never[];
              addSource: ReturnType<typeof vi.fn>;
          }
        | undefined,
}));

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
vi.mock('../../../features/mergeQuery/context/useMerge', () => ({
    useMergeSafe: () => testState.merge,
}));
vi.mock('../../../features/mergeQuery/components/MergeQuerySidebar', () => ({
    MergeQuerySidebar: () => null,
}));
vi.mock('../../../features/virtualView', () => ({
    EditVirtualViewModal: () => null,
    DeleteVirtualViewModal: () => null,
}));
vi.mock(
    '../../../features/contentAsCode/components/VirtualViewAsCodeModal',
    () => ({
        default: ({ opened }: { opened: boolean }) =>
            opened ? <div role="dialog">Virtual view as code modal</div> : null,
    }),
);
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
    ymlPath: 'models/orders.yml',
    warehouseConnectionUuid: null,
} as unknown as ApiExploreResults;

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

const renderPanel = (appMocks?: Parameters<typeof renderWithProviders>[1]) => {
    const store = createExplorerStore();

    return renderWithProviders(
        <MemoryRouter>
            <Provider store={store}>
                <ExplorePanel />
            </Provider>
        </MemoryRouter>,
        appMocks,
    );
};

describe('ExplorePanel loading state', () => {
    beforeEach(() => {
        mockUseExplore.mockReset();
        testState.merge = undefined;
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

describe('ExplorePanel virtual view actions', () => {
    beforeEach(() => {
        mockUseExplore.mockReset();
        testState.merge = undefined;
    });

    it('starts a merge from a virtual view without edit permissions', async () => {
        const user = userEvent.setup();
        const addSource = vi.fn();
        mockUseExplore.mockReturnValue(
            exploreQuery({
                data: { ...mockExplore, type: ExploreType.VIRTUAL },
            }),
        );
        testState.merge = {
            isMerging: false,
            readOnly: false,
            additionalSources: [],
            addSource,
        };

        renderPanel({ user: { abilityRules: [] } });
        expect(
            screen.queryByRole('button', { name: 'Query options' }),
        ).not.toBeInTheDocument();
        await user.click(
            screen.getByRole('button', { name: 'Virtual view actions' }),
        );
        expect(
            screen.queryByRole('menuitem', { name: 'Edit virtual view' }),
        ).not.toBeInTheDocument();
        await user.click(
            screen.getByRole('menuitem', { name: /Merge another query/ }),
        );
        expect(addSource).toHaveBeenCalledOnce();
    });

    it.each([
        { isMerging: true, readOnly: false },
        { isMerging: false, readOnly: true },
    ])('hides merge when unavailable: %o', (state) => {
        mockUseExplore.mockReturnValue(
            exploreQuery({
                data: { ...mockExplore, type: ExploreType.VIRTUAL },
            }),
        );
        testState.merge = {
            ...state,
            additionalSources: [],
            addSource: vi.fn(),
        };

        renderPanel({ user: { abilityRules: [] } });
        expect(
            screen.queryByRole('button', { name: 'Virtual view actions' }),
        ).not.toBeInTheDocument();
    });

    it('opens content as code from the virtual view menu', async () => {
        const user = userEvent.setup();
        mockUseExplore.mockReturnValue(
            exploreQuery({
                data: { ...mockExplore, type: ExploreType.VIRTUAL },
            }),
        );

        renderPanel({
            user: {
                abilityRules: [
                    {
                        action: 'view',
                        subject: 'ContentAsCode',
                        conditions: {
                            organizationUuid:
                                '172a2270-000f-42be-9c68-c4752c23ae51',
                            projectUuid: 'project-uuid',
                        },
                    },
                ],
            },
        });

        await user.click(
            await screen.findByRole('button', {
                name: 'Virtual view actions',
            }),
        );
        await user.click(
            await screen.findByRole('menuitem', { name: 'View as code' }),
        );

        expect(screen.getByRole('dialog')).toHaveTextContent(
            'Virtual view as code modal',
        );
    });
});

describe('ExplorePanel query options', () => {
    beforeEach(() => {
        mockUseExplore.mockReset();
        mockUseExplore.mockReturnValue(exploreQuery({ data: mockExplore }));
        testState.merge = undefined;
    });

    it('hides query options when merge is unavailable', () => {
        renderPanel();

        expect(
            screen.queryByRole('button', { name: 'Query options' }),
        ).not.toBeInTheDocument();
    });

    it('offers merge, marked beta, with no feature flag enabled', async () => {
        const user = userEvent.setup();
        const addSource = vi.fn();
        testState.merge = {
            isMerging: false,
            readOnly: false,
            additionalSources: [],
            addSource,
        };

        renderPanel();
        expect(
            screen.queryByRole('button', { name: 'Merge' }),
        ).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Query options' }));
        const mergeItem = screen.getByRole('menuitem', {
            name: /Merge another query/,
        });
        expect(within(mergeItem).getByText('Beta')).toBeInTheDocument();
        await user.click(mergeItem);

        expect(addSource).toHaveBeenCalledOnce();
    });
});
