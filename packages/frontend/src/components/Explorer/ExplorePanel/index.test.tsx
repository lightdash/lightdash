import { ExploreType, FeatureFlags, type Explore } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createExplorerStore,
    explorerActions,
} from '../../../features/explorer/store';
import { useExplore } from '../../../hooks/useExplore';
import { renderWithProviders } from '../../../testing/testUtils';
import ExplorePanel from './index';

const testState = vi.hoisted(() => ({
    enabledFlags: new Set<string>(),
    isGitProject: false,
    merge: undefined as
        | {
              isMerging: boolean;
              readOnly: boolean;
              additionalSources: never[];
              addSource: ReturnType<typeof vi.fn>;
          }
        | undefined,
    openSourceCodeEditor: vi.fn(),
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
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: (flag: string) => ({
        data: { enabled: testState.enabledFlags.has(flag) },
    }),
}));
vi.mock('../WriteBackModal/hooks', () => ({
    useIsGitProject: () => testState.isGitProject,
}));
vi.mock('../../../features/sourceCodeEditor', () => ({
    useSourceCodeEditor: () => ({ open: testState.openSourceCodeEditor }),
}));
vi.mock('../../../features/mergeQuery/context/useMerge', () => ({
    useMergeSafe: () => testState.merge,
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

const renderPanel = (
    appMocks?: Parameters<typeof renderWithProviders>[1],
    openVisualizationConfig = false,
) => {
    const store = createExplorerStore();
    if (openVisualizationConfig) {
        store.dispatch(explorerActions.openVisualizationConfig());
    }

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
        testState.enabledFlags.clear();
        testState.isGitProject = false;
        testState.merge = undefined;
        testState.openSourceCodeEditor.mockReset();
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

describe('ExplorePanel chart configuration placement', () => {
    beforeEach(() => {
        mockUseExplore.mockReturnValue(exploreQuery({ data: mockExplore }));
        testState.enabledFlags.clear();
    });

    it('keeps the legacy portal and hides fields when the gallery flag is off', () => {
        renderPanel(undefined, true);

        expect(
            document.getElementById('visualization-config-portal'),
        ).not.toBeNull();
        expect(screen.getByTestId('explore-tree')).not.toBeVisible();
    });

    it('keeps fields mounted and leaves the portal to the right rail when enabled', () => {
        testState.enabledFlags.add(FeatureFlags.ExplorerChartGallery);

        renderPanel(undefined, true);

        expect(
            document.getElementById('visualization-config-portal'),
        ).toBeNull();
        expect(screen.getByTestId('explore-tree')).toBeVisible();
    });
});

describe('ExplorePanel virtual view actions', () => {
    beforeEach(() => {
        mockUseExplore.mockReset();
        testState.enabledFlags.clear();
        testState.isGitProject = false;
        testState.merge = undefined;
        testState.openSourceCodeEditor.mockReset();
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

const sourceCodeAbility = {
    user: {
        abilityRules: [
            {
                action: 'view' as const,
                subject: 'SourceCode' as const,
            },
        ],
    },
};

describe('ExplorePanel query options', () => {
    beforeEach(() => {
        mockUseExplore.mockReset();
        mockUseExplore.mockReturnValue(exploreQuery({ data: mockExplore }));
        testState.enabledFlags.clear();
        testState.isGitProject = false;
        testState.merge = undefined;
        testState.openSourceCodeEditor.mockReset();
    });

    it('hides query options when both features are unavailable', () => {
        renderPanel();

        expect(
            screen.queryByRole('button', { name: 'Query options' }),
        ).not.toBeInTheDocument();
    });

    it('shows only source code when only its feature is available', async () => {
        const user = userEvent.setup();
        testState.enabledFlags.add(FeatureFlags.EditYamlInUi);
        testState.isGitProject = true;

        renderPanel(sourceCodeAbility);
        await user.click(
            await screen.findByRole('button', { name: 'Query options' }),
        );

        expect(
            screen.getByRole('menuitem', { name: 'View source code' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('menuitem', { name: 'Merge another query' }),
        ).not.toBeInTheDocument();
    });

    it('shows only merge when only its feature is available', async () => {
        const user = userEvent.setup();
        const addSource = vi.fn();
        testState.enabledFlags.add(FeatureFlags.MergeQueries);
        testState.merge = {
            isMerging: false,
            readOnly: false,
            additionalSources: [],
            addSource,
        };

        renderPanel();
        await user.click(screen.getByRole('button', { name: 'Query options' }));
        await user.click(
            screen.getByRole('menuitem', { name: 'Merge another query' }),
        );

        expect(
            screen.queryByRole('menuitem', { name: 'View source code' }),
        ).not.toBeInTheDocument();
        expect(addSource).toHaveBeenCalledOnce();
    });

    it('shows both actions in one menu when both features are available', async () => {
        const user = userEvent.setup();
        testState.enabledFlags.add(FeatureFlags.EditYamlInUi);
        testState.enabledFlags.add(FeatureFlags.MergeQueries);
        testState.isGitProject = true;
        testState.merge = {
            isMerging: false,
            readOnly: false,
            additionalSources: [],
            addSource: vi.fn(),
        };

        renderPanel(sourceCodeAbility);
        await user.click(screen.getByRole('button', { name: 'Query options' }));

        expect(
            screen.getByRole('menuitem', { name: 'View source code' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('menuitem', { name: 'Merge another query' }),
        ).toBeInTheDocument();
        expect(screen.getAllByRole('menu')).toHaveLength(1);
    });
});
