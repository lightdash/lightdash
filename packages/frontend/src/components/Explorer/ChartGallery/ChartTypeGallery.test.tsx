import {
    ChartType,
    FeatureFlags,
    type DataAppViz,
    type ItemsMap,
} from '@lightdash/common';
import { IconChartBar } from '@tabler/icons-react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type * as ReactRouter from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDataAppVisualizations } from '../../../features/chartTypes/hooks/useDataAppVisualizations';
import { renderWithProviders } from '../../../testing/testUtils';
import ExplorerChartTypeGallery, {
    ChartTypeGallery,
    type ChartTypeGalleryItem,
    type ChartTypeGallerySection,
} from './ChartTypeGallery';

const { mocks, visualizationConfig } = vi.hoisted(() => ({
    mocks: {
        setChartType: vi.fn(),
        setCartesianType: vi.fn(),
        setStacking: vi.fn(),
        selectProjectChartType: vi.fn(),
        refetch: vi.fn(),
        fetchNextPage: vi.fn(),
        navigate: vi.fn(),
        dispatch: vi.fn(),
        canCreateDataApp: vi.fn(() => true),
        canEditChartType: vi.fn(() => true),
    },
    visualizationConfig: {
        current: {
            chartType: 'table',
            chartConfig: {},
        },
    },
}));

const projectChartType = {
    dataAppVizUuid: 'project-chart-type',
    slug: 'event-pulse',
    name: 'Event pulse',
    description: 'Reusable ranked bars',
    projectUuid: 'project-uuid',
    spaceUuid: null,
    createdAt: new Date('2026-08-20T00:00:00Z'),
    createdByUserUuid: 'user-uuid',
    schema: { fields: [], configOptions: [], colorPalette: null },
    icon: null,
    registrySlug: null,
} satisfies DataAppViz;

const installedChartType = {
    ...projectChartType,
    dataAppVizUuid: 'installed-chart-type',
    slug: 'official-pulse',
    name: 'Official pulse',
    description: 'Ranked bars from the library',
    registrySlug: 'official-pulse',
} satisfies DataAppViz;

const itemsMap = { orders_status: { name: 'status' } } as unknown as ItemsMap;

vi.mock('../../../features/chartTypes/hooks/useDataAppVisualizations');
const { featureFlags } = vi.hoisted(() => ({
    featureFlags: { current: {} as Record<string, boolean> },
}));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: (flag: string) => ({
        data: { enabled: featureFlags.current[flag] === true },
    }),
}));
vi.mock('../../LightdashVisualization/useVisualizationContext', () => ({
    useVisualizationContext: () => ({
        visualizationConfig: visualizationConfig.current,
        setChartType: mocks.setChartType,
        setCartesianType: mocks.setCartesianType,
        setStacking: mocks.setStacking,
        isLoading: false,
        resultsData: { rows: [{}] },
        pivotDimensions: undefined,
        itemsMap,
    }),
}));
vi.mock(
    '../../VisualizationConfigs/CustomChartType/useSelectProjectChartType',
    () => ({
        useSelectProjectChartType: () => mocks.selectProjectChartType,
    }),
);
vi.mock('../../../features/apps/hooks/useCanCreateDataApp', () => ({
    useCanCreateDataApp: () => mocks.canCreateDataApp(),
}));
vi.mock('../../../features/apps/hooks/useCanEditDataApp', () => ({
    useCanEditDataAppChecker: () => mocks.canEditChartType,
}));
vi.mock('../../../features/explorer/store', () => ({
    useExplorerDispatch: () => mocks.dispatch,
    explorerActions: {
        startChartTypeAuthoring: (payload: unknown) => ({
            type: 'startChartTypeAuthoring',
            payload,
        }),
    },
}));
vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<typeof ReactRouter>()),
    useParams: () => ({ projectUuid: 'project-uuid' }),
    useLocation: () => ({ search: '?tableName=orders' }),
    useNavigate: () => mocks.navigate,
}));

const galleryItem = (
    label: string,
    description: string | null = null,
): ChartTypeGalleryItem => ({
    key: label,
    label,
    description,
    icon: IconChartBar,
    rotatedIcon: false,
    selected: false,
    disabled: false,
    installed: false,
    select: vi.fn(),
    onEdit: null,
    onConfigure: null,
});

const gallerySection = (
    overrides: Partial<ChartTypeGallerySection> = {},
): ChartTypeGallerySection => ({
    label: 'Built in',
    items: [],
    emptyMessage: 'Nothing here',
    loading: false,
    errorMessage: null,
    onRetry: null,
    onLoadMore: null,
    moreCount: 0,
    loadingMore: false,
    onCreateNew: null,
    ...overrides,
});

const KeyboardSelectionHarness = ({
    onConfigure = vi.fn(),
}: {
    onConfigure?: () => void;
}) => {
    const [selectedLabel, setSelectedLabel] = useState('Bar chart');
    const item = (label: string) => ({
        ...galleryItem(label),
        selected: selectedLabel === label,
        select: () => setSelectedLabel(label),
        onConfigure,
    });

    return (
        <ChartTypeGallery
            search=""
            onSearchChange={vi.fn()}
            disabledReason={null}
            sections={[
                gallerySection({
                    items: [item('Bar chart'), item('Line chart')],
                }),
            ]}
        />
    );
};

describe('ChartTypeGallery', () => {
    it('selects on the first click and configures on the second tile click', async () => {
        const onConfigure = vi.fn();
        renderWithProviders(
            <KeyboardSelectionHarness onConfigure={onConfigure} />,
        );
        const tile = screen.getByRole('button', { name: 'Line chart' });

        await userEvent.click(tile);
        expect(tile).toHaveAttribute('aria-pressed', 'true');
        expect(onConfigure).not.toHaveBeenCalled();

        await userEvent.click(tile);
        expect(onConfigure).toHaveBeenCalledOnce();
    });

    it('selects and configures an unselected tile with a double click', async () => {
        const onConfigure = vi.fn();
        renderWithProviders(
            <KeyboardSelectionHarness onConfigure={onConfigure} />,
        );

        await userEvent.dblClick(
            screen.getByRole('button', { name: 'Line chart' }),
        );
        expect(onConfigure).toHaveBeenCalledOnce();
    });

    it.each(['{Enter}', ' '])(
        'configures the selected tile with the keyboard using %s',
        async (key) => {
            const onConfigure = vi.fn();
            renderWithProviders(
                <KeyboardSelectionHarness onConfigure={onConfigure} />,
            );
            screen.getByRole('button', { name: 'Bar chart' }).focus();

            await userEvent.keyboard(key);
            expect(onConfigure).toHaveBeenCalledOnce();
        },
    );

    it('moves a single configuration button with the selected tile', async () => {
        renderWithProviders(<KeyboardSelectionHarness />);
        expect(
            screen.getAllByRole('button', { name: /^Configure/ }),
        ).toHaveLength(1);
        expect(
            screen.getByRole('button', { name: 'Configure Bar chart' }),
        ).toBeVisible();
        expect(
            screen.queryByRole('button', { name: 'Configure Line chart' }),
        ).not.toBeInTheDocument();

        await userEvent.click(
            screen.getByRole('button', { name: 'Line chart' }),
        );
        expect(
            screen.getAllByRole('button', { name: /^Configure/ }),
        ).toHaveLength(1);
        expect(
            screen.getByRole('button', { name: 'Configure Line chart' }),
        ).toBeVisible();
        expect(
            screen.queryByRole('button', { name: 'Configure Bar chart' }),
        ).not.toBeInTheDocument();
    });
    it('keeps chart tiles dedicated to selection without configuration actions', () => {
        renderWithProviders(
            <ChartTypeGallery
                search=""
                onSearchChange={vi.fn()}
                disabledReason={null}
                sections={[
                    gallerySection({
                        items: [galleryItem('Bar chart')],
                    }),
                    gallerySection({
                        label: 'Custom',
                        items: [
                            {
                                ...galleryItem(
                                    'Event pulse',
                                    'Reusable ranked bars',
                                ),
                            },
                        ],
                    }),
                ]}
            />,
        );

        // Cards keep the label as the accessible name; the description lives
        // in a tooltip rather than the card face.
        expect(
            screen.getByRole('button', { name: 'Bar chart' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Event pulse' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('Reusable ranked bars'),
        ).not.toBeInTheDocument();
        // Configuration is offered once by the sidebar, outside the gallery.
        expect(
            screen.queryByRole('button', { name: /Configure/ }),
        ).not.toBeInTheDocument();
    });

    it('disables the selected tile configuration action when picking is unavailable', async () => {
        const onConfigure = vi.fn();
        renderWithProviders(
            <ChartTypeGallery
                search=""
                onSearchChange={vi.fn()}
                disabledReason="Run your query to pick a chart type"
                sections={[
                    gallerySection({
                        items: [
                            {
                                ...galleryItem('Bar chart'),
                                selected: true,
                                disabled: true,
                                onConfigure,
                            },
                        ],
                    }),
                ]}
            />,
        );
        const configure = screen.getByRole('button', {
            name: 'Configure Bar chart',
        });
        expect(configure).toBeDisabled();
        await userEvent.click(configure);
        await userEvent.click(
            screen.getByRole('button', { name: 'Bar chart' }),
        );
        expect(onConfigure).not.toHaveBeenCalled();
    });

    it('marks the selected grid card and disables cards that cannot be picked', async () => {
        const onEdit = vi.fn();
        renderWithProviders(
            <ChartTypeGallery
                search=""
                onSearchChange={vi.fn()}
                disabledReason={null}
                sections={[
                    gallerySection({
                        items: [
                            { ...galleryItem('Bar chart'), selected: true },
                            {
                                ...galleryItem('Line chart'),
                                disabled: true,
                                onEdit,
                            },
                        ],
                    }),
                ]}
            />,
        );

        expect(
            screen.getByRole('button', { name: 'Bar chart' }),
        ).toHaveAttribute('data-selected', 'true');
        const lineChart = screen.getByRole('button', { name: 'Line chart' });
        expect(lineChart).toHaveAttribute('data-selected', 'false');
        expect(lineChart).toBeDisabled();
        const moreActions = screen.getByRole('button', {
            name: 'More actions for Line chart',
        });
        expect(moreActions).toBeDisabled();
        await userEvent.click(moreActions);
        expect(onEdit).not.toHaveBeenCalled();
        expect(
            screen.queryByRole('menuitem', {
                name: 'Edit chart type',
            }),
        ).not.toBeInTheDocument();
    });

    it('keeps selecting a tile separate from configuring it', async () => {
        const select = vi.fn();
        renderWithProviders(
            <ChartTypeGallery
                search=""
                onSearchChange={vi.fn()}
                disabledReason={null}
                sections={[
                    gallerySection({
                        items: [
                            {
                                ...galleryItem('Pie chart'),
                                select,
                            },
                        ],
                    }),
                ]}
            />,
        );

        await userEvent.click(
            screen.getByRole('button', { name: 'Pie chart' }),
        );

        expect(select).toHaveBeenCalledOnce();
    });

    it('opens and dismisses an editable chart type menu from its own button', async () => {
        const select = vi.fn();
        const onEdit = vi.fn();
        const onConfigure = vi.fn();
        renderWithProviders(
            <ChartTypeGallery
                search=""
                onSearchChange={vi.fn()}
                disabledReason={null}
                sections={[
                    gallerySection({
                        items: [
                            {
                                ...galleryItem('Event pulse'),
                                selected: true,
                                select,
                                onEdit,
                                onConfigure,
                            },
                        ],
                    }),
                ]}
            />,
        );

        const menuButton = screen.getByRole('button', {
            name: 'More actions for Event pulse',
        });
        menuButton.focus();
        await userEvent.keyboard('{Enter}');

        expect(
            await screen.findByRole('menuitem', {
                name: 'Edit chart type',
            }),
        ).toBeInTheDocument();

        await userEvent.keyboard('{Escape}');
        expect(
            screen.queryByRole('menuitem', {
                name: 'Edit chart type',
            }),
        ).not.toBeInTheDocument();
        expect(menuButton).toHaveFocus();

        await userEvent.keyboard('{Enter}');
        await userEvent.click(
            await screen.findByRole('menuitem', {
                name: 'Edit chart type',
            }),
        );

        expect(onEdit).toHaveBeenCalledOnce();
        expect(select).not.toHaveBeenCalled();
        expect(onConfigure).not.toHaveBeenCalled();
    });

    it('keeps keyboard focus on a card when selection rerenders it', async () => {
        renderWithProviders(<KeyboardSelectionHarness />);
        const lineChart = screen.getByRole('button', { name: 'Line chart' });

        lineChart.focus();
        await userEvent.keyboard('{Enter}');

        expect(lineChart).toHaveFocus();
        expect(lineChart).toHaveAttribute('aria-pressed', 'true');
        expect(
            screen.getByRole('button', { name: 'Bar chart' }),
        ).toHaveAttribute('aria-pressed', 'false');
    });

    it('offers the create tile even when the section is empty', () => {
        const onCreateNew = vi.fn();
        renderWithProviders(
            <ChartTypeGallery
                search=""
                onSearchChange={vi.fn()}
                disabledReason={null}
                sections={[
                    gallerySection({
                        label: 'Custom',
                        emptyMessage: 'No custom chart types yet',
                        onCreateNew,
                    }),
                ]}
            />,
        );

        expect(
            screen.getByText('No custom chart types yet'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Create new chart type' }),
        ).toBeInTheDocument();
    });

    it('carries a name the card had to clamp into the tooltip', async () => {
        // jsdom has no layout, so stand in for the clamp the CSS applies.
        const clientHeight = vi
            .spyOn(HTMLElement.prototype, 'clientHeight', 'get')
            .mockReturnValue(20);
        const scrollHeight = vi
            .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
            .mockReturnValue(60);

        renderWithProviders(
            <ChartTypeGallery
                search=""
                onSearchChange={vi.fn()}
                disabledReason={null}
                sections={[
                    gallerySection({
                        items: [
                            galleryItem(
                                'Revenue changes over time',
                                'Reusable ranked bars',
                            ),
                        ],
                    }),
                ]}
            />,
        );

        await userEvent.hover(
            screen.getByRole('button', {
                name: 'Revenue changes over time',
            }),
        );
        // Both lines of the tooltip: the name the card had to cut, then what
        // the card never showed.
        const tooltip = await screen.findByRole('tooltip');
        expect(tooltip).toHaveTextContent('Revenue changes over time');
        expect(tooltip).toHaveTextContent('Reusable ranked bars');

        clientHeight.mockRestore();
        scrollHeight.mockRestore();
    });

    it('leaves a name the card shows in full out of the tooltip', async () => {
        renderWithProviders(
            <ChartTypeGallery
                search=""
                onSearchChange={vi.fn()}
                disabledReason={null}
                sections={[
                    gallerySection({
                        items: [galleryItem('Bar', 'Reusable ranked bars')],
                    }),
                ]}
            />,
        );

        await userEvent.hover(screen.getByRole('button', { name: 'Bar' }));
        expect(
            await screen.findByText('Reusable ranked bars'),
        ).toBeInTheDocument();
    });

    it('groups each shelf under its own label', () => {
        renderWithProviders(
            <ChartTypeGallery
                search=""
                onSearchChange={vi.fn()}
                disabledReason={null}
                sections={[
                    gallerySection({ items: [galleryItem('Bar chart')] }),
                    gallerySection({
                        label: 'Custom',
                        items: [galleryItem('Event pulse')],
                    }),
                ]}
            />,
        );

        expect(
            within(screen.getByRole('group', { name: 'Built in' })).getByRole(
                'button',
                { name: 'Bar chart' },
            ),
        ).toBeInTheDocument();
        expect(
            within(screen.getByRole('group', { name: 'Custom' })).getByRole(
                'button',
                { name: 'Event pulse' },
            ),
        ).toBeInTheDocument();
    });

    it('marks the picked card as pressed, like the other card pickers', () => {
        renderWithProviders(
            <ChartTypeGallery
                search=""
                onSearchChange={vi.fn()}
                disabledReason={null}
                sections={[
                    gallerySection({
                        items: [
                            { ...galleryItem('Bar chart'), selected: true },
                            galleryItem('Line chart'),
                        ],
                    }),
                ]}
            />,
        );

        expect(
            screen.getByRole('button', { name: 'Bar chart', pressed: true }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Line chart', pressed: false }),
        ).toBeInTheDocument();
    });

    it('flags a section that failed to load', () => {
        renderWithProviders(
            <ChartTypeGallery
                search=""
                onSearchChange={vi.fn()}
                disabledReason={null}
                sections={[
                    gallerySection({
                        errorMessage: 'Failed to load custom chart types',
                    }),
                ]}
            />,
        );

        expect(screen.getByRole('alert')).toHaveTextContent(
            'Failed to load custom chart types',
        );
    });

    it('shows the empty message when a section has no items', () => {
        renderWithProviders(
            <ChartTypeGallery
                search="zzz"
                onSearchChange={vi.fn()}
                disabledReason={null}
                sections={[
                    gallerySection({
                        emptyMessage:
                            'No built-in chart types match your search',
                    }),
                ]}
            />,
        );

        expect(
            screen.getByText('No built-in chart types match your search'),
        ).toBeInTheDocument();
    });
});

const mockedUseDataAppVisualizations = vi.mocked(useDataAppVisualizations);

const setProjectQuery = (error: Error | null = null) => {
    mockedUseDataAppVisualizations.mockReturnValue({
        data: error
            ? undefined
            : {
                  pages: [
                      {
                          data: [projectChartType],
                          pagination: {
                              page: 1,
                              pageSize: 25,
                              totalPageCount: 1,
                              totalResults: 1,
                          },
                      },
                  ],
                  pageParams: [1],
              },
        isInitialLoading: false,
        error,
        refetch: mocks.refetch,
        hasNextPage: false,
        fetchNextPage: mocks.fetchNextPage,
        isFetchingNextPage: false,
    } as unknown as ReturnType<typeof useDataAppVisualizations>);
};

const setProjectItems = (items: DataAppViz[]) => {
    mockedUseDataAppVisualizations.mockReturnValue({
        data: {
            pages: [
                {
                    data: items,
                    pagination: {
                        page: 1,
                        pageSize: 25,
                        totalPageCount: 1,
                        totalResults: items.length,
                    },
                },
            ],
            pageParams: [1],
        },
        isInitialLoading: false,
        error: null,
        refetch: mocks.refetch,
        hasNextPage: false,
        fetchNextPage: mocks.fetchNextPage,
        isFetchingNextPage: false,
    } as unknown as ReturnType<typeof useDataAppVisualizations>);
};

const renderGallery = (onConfigure = vi.fn()) => {
    renderWithProviders(<ExplorerChartTypeGallery onConfigure={onConfigure} />);
    return onConfigure;
};

describe('ExplorerChartTypeGallery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        featureFlags.current = {
            [FeatureFlags.EnableDataApps]: true,
            [FeatureFlags.ChartTypeRegistry]: true,
        };
        visualizationConfig.current = {
            chartType: ChartType.TABLE,
            chartConfig: {},
        };
        mocks.canCreateDataApp.mockReturnValue(true);
        // False by default (mirrors the real ability hook with no grants),
        // so existing selection/search tests keep a single "Event pulse"
        // match; edit-affordance tests opt in explicitly.
        mocks.canEditChartType.mockReturnValue(false);
        setProjectQuery();
    });

    it('surfaces Table first without changing its selection command', async () => {
        visualizationConfig.current.chartType = ChartType.PIE;
        renderGallery();

        const builtIn = screen.getByRole('group', { name: 'Built in' });
        expect(
            within(builtIn)
                .getAllByRole('button')
                .filter((button) => button.hasAttribute('aria-pressed'))
                .map((button) => button.textContent),
        ).toEqual([
            'Table',
            'Bar chart',
            'Horizontal bar chart',
            'Line chart',
            'Area chart',
            'Scatter chart',
            'Pie chart',
            'Funnel chart',
            'Treemap',
            'Gauge',
            'Sankey',
            'Map',
            'Big value',
            'Vega (JSON editor)',
        ]);

        await userEvent.click(
            within(builtIn).getByRole('button', {
                name: 'Table',
                pressed: false,
            }),
        );

        expect(mocks.setStacking).toHaveBeenCalledWith(undefined);
        expect(mocks.setCartesianType).toHaveBeenCalledWith(undefined);
        expect(mocks.setChartType).toHaveBeenCalledWith(ChartType.TABLE);
    });

    it('uses the shared built-in selection command without closing the chooser', async () => {
        renderGallery();

        await userEvent.click(
            screen.getByRole('button', { name: 'Pie chart' }),
        );

        expect(mocks.setStacking).toHaveBeenCalledWith(undefined);
        expect(mocks.setCartesianType).toHaveBeenCalledWith(undefined);
        expect(mocks.setChartType).toHaveBeenCalledWith(ChartType.PIE);
    });

    it('filters built-in choices using the gallery search', async () => {
        renderGallery();

        await userEvent.type(
            screen.getByRole('textbox', { name: 'Search chart types' }),
            'pie',
        );

        await waitFor(() =>
            expect(
                screen.queryByRole('button', { name: 'Bar chart' }),
            ).not.toBeInTheDocument(),
        );
        expect(
            screen.getByRole('button', { name: 'Pie chart' }),
        ).toBeInTheDocument();
    });

    it('reads clearly when no built-in chart types match the search', async () => {
        renderGallery();

        await userEvent.type(
            screen.getByRole('textbox', { name: 'Search chart types' }),
            'zzz',
        );

        expect(
            await screen.findByText('No chart types match your search'),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Bar chart' }),
        ).not.toBeInTheDocument();
    });

    it('selects the existing Vega configuration path', async () => {
        renderGallery();

        await userEvent.click(
            screen.getByRole('button', { name: 'Vega (JSON editor)' }),
        );

        expect(mocks.setChartType).toHaveBeenCalledWith(ChartType.CUSTOM);
    });

    it('uses the existing project chart-type selection handler', async () => {
        renderGallery();

        await userEvent.click(
            screen.getByRole('button', { name: 'Event pulse' }),
        );

        expect(mocks.selectProjectChartType).toHaveBeenCalledWith(
            projectChartType,
            itemsMap,
        );
    });

    it('configures the selected custom tile without resetting its bindings', async () => {
        visualizationConfig.current = {
            chartType: ChartType.DATA_APP_VIZ,
            chartConfig: { dataAppVizUuid: projectChartType.dataAppVizUuid },
        };
        const onConfigure = renderGallery();
        await userEvent.click(
            screen.getByRole('button', { name: 'Event pulse' }),
        );
        expect(mocks.selectProjectChartType).not.toHaveBeenCalled();
        expect(onConfigure).toHaveBeenCalledOnce();
    });

    it.each(['Table', 'Configure Table'])(
        'configures the selected built-in chart through %s without resetting its options',
        async (target) => {
            const onConfigure = renderGallery();
            await userEvent.click(screen.getByRole('button', { name: target }));
            expect(onConfigure).toHaveBeenCalledOnce();
            expect(mocks.setChartType).not.toHaveBeenCalled();
            expect(mocks.setCartesianType).not.toHaveBeenCalled();
            expect(mocks.setStacking).not.toHaveBeenCalled();
            expect(
                screen.queryByRole('button', { name: 'Configure Pie chart' }),
            ).not.toBeInTheDocument();
        },
    );

    it('configures the selected custom chart without resetting its bindings', async () => {
        visualizationConfig.current = {
            chartType: ChartType.DATA_APP_VIZ,
            chartConfig: { dataAppVizUuid: projectChartType.dataAppVizUuid },
        };
        const onConfigure = renderGallery();
        await userEvent.click(
            screen.getByRole('button', { name: 'Configure Event pulse' }),
        );
        expect(onConfigure).toHaveBeenCalledOnce();
        expect(mocks.selectProjectChartType).not.toHaveBeenCalled();
    });

    it('hides the builder action without edit permission', () => {
        renderGallery();

        expect(
            screen.queryByRole('button', {
                name: 'More actions for Event pulse',
            }),
        ).not.toBeInTheDocument();
    });

    it('opens the custom chart builder directly from the overflow menu', async () => {
        mocks.canEditChartType.mockReturnValue(true);
        renderGallery();

        await userEvent.click(
            screen.getByRole('button', {
                name: 'More actions for Event pulse',
            }),
        );
        await userEvent.click(
            await screen.findByRole('menuitem', {
                name: 'Edit chart type',
            }),
        );

        expect(mocks.dispatch).toHaveBeenCalledWith({
            type: 'startChartTypeAuthoring',
            payload: { dataAppVizUuid: projectChartType.dataAppVizUuid },
        });
        expect(mocks.selectProjectChartType).not.toHaveBeenCalled();
    });

    it('keeps official chart types read-only even with edit permission', () => {
        mocks.canEditChartType.mockReturnValue(true);
        visualizationConfig.current = {
            chartType: ChartType.DATA_APP_VIZ,
            chartConfig: { dataAppVizUuid: projectChartType.dataAppVizUuid },
        };
        mockedUseDataAppVisualizations.mockReturnValue({
            data: {
                pages: [
                    {
                        data: [
                            {
                                ...projectChartType,
                                registrySlug: 'official-pulse',
                            },
                        ],
                    },
                ],
            },
            isInitialLoading: false,
        } as unknown as ReturnType<typeof useDataAppVisualizations>);
        renderGallery();

        expect(
            screen.queryByRole('button', {
                name: 'More actions for Event pulse',
            }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Configure Event pulse' }),
        ).toBeInTheDocument();
    });

    it('starts authoring a new chart type in place from the project section', async () => {
        renderGallery();

        await userEvent.click(
            screen.getByRole('button', { name: /Create new chart type/ }),
        );

        expect(mocks.dispatch).toHaveBeenCalledWith({
            type: 'startChartTypeAuthoring',
            payload: { dataAppVizUuid: null },
        });
        expect(mocks.navigate).not.toHaveBeenCalled();
    });

    it('hides the create action without permission to author chart types', () => {
        mocks.canCreateDataApp.mockReturnValue(false);
        renderGallery();

        expect(
            screen.queryByRole('button', { name: /Create new chart type/ }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Event pulse' }),
        ).toBeInTheDocument();
    });

    it('caps the initial project list and reveals the rest via the "+N more" tile', async () => {
        const many = Array.from({ length: 8 }, (_, i) => ({
            ...projectChartType,
            dataAppVizUuid: `project-chart-type-${i}`,
            name: `Event pulse ${i}`,
        }));
        mockedUseDataAppVisualizations.mockReturnValue({
            data: {
                pages: [
                    {
                        data: many,
                        pagination: {
                            page: 1,
                            pageSize: 25,
                            totalPageCount: 1,
                            totalResults: 8,
                        },
                    },
                ],
                pageParams: [1],
            },
            isInitialLoading: false,
            error: null,
            refetch: mocks.refetch,
            hasNextPage: false,
            fetchNextPage: mocks.fetchNextPage,
            isFetchingNextPage: false,
        } as unknown as ReturnType<typeof useDataAppVisualizations>);
        renderGallery();

        expect(
            screen.getByRole('button', { name: 'Event pulse 4' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Event pulse 5' }),
        ).not.toBeInTheDocument();

        await userEvent.click(
            screen.getByRole('button', { name: 'Show 3 more chart types' }),
        );

        expect(
            screen.getByRole('button', { name: 'Event pulse 7' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /more chart types/ }),
        ).not.toBeInTheDocument();
        // Focus lands on the first revealed card once the tile unmounts.
        expect(
            screen.getByRole('button', { name: 'Event pulse 5' }),
        ).toHaveFocus();
        expect(mocks.fetchNextPage).not.toHaveBeenCalled();
    });

    it('fetches the next page from the "+N more" tile once every loaded item shows', async () => {
        const loaded = Array.from({ length: 6 }, (_, i) => ({
            ...projectChartType,
            dataAppVizUuid: `project-chart-type-${i}`,
            name: `Event pulse ${i}`,
        }));
        mockedUseDataAppVisualizations.mockReturnValue({
            data: {
                pages: [
                    {
                        data: loaded,
                        pagination: {
                            page: 1,
                            pageSize: 6,
                            totalPageCount: 2,
                            totalResults: 10,
                        },
                    },
                ],
                pageParams: [1],
            },
            isInitialLoading: false,
            error: null,
            refetch: mocks.refetch,
            hasNextPage: true,
            fetchNextPage: mocks.fetchNextPage,
            isFetchingNextPage: false,
        } as unknown as ReturnType<typeof useDataAppVisualizations>);
        renderGallery();

        expect(
            screen.getByRole('button', { name: 'Event pulse 5' }),
        ).toBeInTheDocument();
        await userEvent.click(
            screen.getByRole('button', { name: 'Show 4 more chart types' }),
        );

        expect(mocks.fetchNextPage).toHaveBeenCalled();
    });

    it('says why nothing can be picked before a query has run', () => {
        renderWithProviders(
            <ChartTypeGallery
                search=""
                onSearchChange={vi.fn()}
                disabledReason="Run your query to pick a chart type."
                sections={[
                    gallerySection({
                        items: [{ ...galleryItem('Bar'), disabled: true }],
                    }),
                ]}
            />,
        );

        expect(
            screen.getByText('Run your query to pick a chart type.'),
        ).toBeInTheDocument();
    });

    it('leaves the project shelves out entirely while chart types are off', () => {
        featureFlags.current = {};
        renderGallery();

        expect(screen.queryByText('Custom')).not.toBeInTheDocument();
        expect(screen.getByText('Built in')).toBeInTheDocument();
        // No project shelf means no reason to ask the server for one.
        expect(mockedUseDataAppVisualizations).toHaveBeenCalledWith(
            undefined,
            '',
        );
        expect(
            screen.queryByRole('button', { name: 'Create new chart type' }),
        ).not.toBeInTheDocument();
    });

    it('appends installed chart types to the built-in shelf with a provenance badge', () => {
        setProjectItems([projectChartType, installedChartType]);
        renderGallery();

        const custom = screen.getByRole('group', { name: 'Custom' });
        const builtIn = screen.getByRole('group', { name: 'Built in' });
        expect(
            screen.queryByRole('group', { name: 'Installed' }),
        ).not.toBeInTheDocument();
        // The install sits after the last built-in, marked and badged.
        const vega = within(builtIn).getByRole('button', {
            name: 'Vega (JSON editor)',
        });
        const install = within(builtIn).getByRole('button', {
            name: 'Official pulse',
        });
        expect(
            vega.compareDocumentPosition(install) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(install).toHaveAttribute('data-installed', 'true');
        expect(
            within(builtIn).getByRole('img', {
                name: 'Installed from the chart type library',
            }),
        ).toBeInTheDocument();
        // Local types keep their own shelf, unmarked.
        expect(
            within(custom).getByRole('button', { name: 'Event pulse' }),
        ).toHaveAttribute('data-installed', 'false');
        // New types are always local, so the create tile stays with Custom.
        expect(
            within(custom).getByRole('button', {
                name: 'Create new chart type',
            }),
        ).toBeInTheDocument();
    });

    it('leaves built-ins unbadged while the project has no installs', () => {
        renderGallery();

        expect(
            screen.queryByRole('img', {
                name: 'Installed from the chart type library',
            }),
        ).not.toBeInTheDocument();
    });

    it('hides the empty custom shelf for library-only customers', () => {
        featureFlags.current = { [FeatureFlags.ChartTypeRegistry]: true };
        setProjectItems([installedChartType]);
        renderGallery();

        expect(
            screen.queryByRole('group', { name: 'Custom' }),
        ).not.toBeInTheDocument();
        expect(
            within(screen.getByRole('group', { name: 'Built in' })).getByRole(
                'button',
                { name: 'Official pulse' },
            ),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Create new chart type' }),
        ).not.toBeInTheDocument();
    });

    it('reports a load failure to library-only customers without hiding built-ins', () => {
        featureFlags.current = { [FeatureFlags.ChartTypeRegistry]: true };
        setProjectQuery(new Error('unavailable'));
        renderGallery();

        expect(
            screen.getByText('Failed to load installed chart types'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Bar chart' }),
        ).toBeInTheDocument();
        expect(screen.queryByText('Custom')).not.toBeInTheDocument();
    });

    it('caps only the custom shelf, never the installed tail', () => {
        const locals = Array.from({ length: 8 }, (_, i) => ({
            ...projectChartType,
            dataAppVizUuid: `project-chart-type-${i}`,
            name: `Event pulse ${i}`,
        }));
        const installs = Array.from({ length: 3 }, (_, i) => ({
            ...installedChartType,
            dataAppVizUuid: `installed-chart-type-${i}`,
            name: `Official pulse ${i}`,
            registrySlug: `official-pulse-${i}`,
        }));
        setProjectItems([...locals, ...installs]);
        renderGallery();

        expect(
            screen.getByRole('button', { name: 'Event pulse 4' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Event pulse 5' }),
        ).not.toBeInTheDocument();
        // The "+N more" count spans hidden customs only; installs all show.
        expect(
            screen.getByRole('button', { name: 'Show 3 more chart types' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Official pulse 2' }),
        ).toBeInTheDocument();
    });

    it('keeps built-in choices usable when project types fail to load', async () => {
        setProjectQuery(new Error('unavailable'));
        renderGallery();

        expect(
            screen.getByText('Failed to load custom chart types'),
        ).toBeInTheDocument();
        await userEvent.click(
            screen.getByRole('button', { name: 'Vega (JSON editor)' }),
        );

        expect(mocks.setChartType).toHaveBeenCalledWith(ChartType.CUSTOM);
    });
});
