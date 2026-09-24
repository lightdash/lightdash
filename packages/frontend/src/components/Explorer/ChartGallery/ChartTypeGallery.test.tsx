import {
    ChartType,
    FeatureFlags,
    type ApiError,
    type DataAppViz,
    type ItemsMap,
} from '@lightdash/common';
import { IconChartBar } from '@tabler/icons-react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../api';
import useEmbed from '../../../ee/providers/Embed/useEmbed';
import { useDataAppVisualizations } from '../../../features/chartTypes/hooks/useDataAppVisualizations';
import { renderWithProviders } from '../../../testing/testUtils';
import { EventName } from '../../../types/Events';
import ExplorerChartTypeGallery, {
    ChartTypeGallery,
    type ChartTypeGalleryItem,
} from './ChartTypeGallery';

const { mocks, visualizationConfig } = vi.hoisted(() => ({
    mocks: {
        setChartType: vi.fn(),
        setCartesianType: vi.fn(),
        setStacking: vi.fn(),
        selectProjectChartType: vi.fn(),
        refetch: vi.fn(),
        fetchNextPage: vi.fn(),
        dispatch: vi.fn(),
        canEditChartType: vi.fn(() => true),
        canFork: vi.fn(() => true),
        track: vi.fn(),
        configure: vi.fn(),
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

const BUILT_IN_LABELS = [
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
];

const itemsMap = { orders_status: { name: 'status' } } as unknown as ItemsMap;

vi.mock('../../../features/chartTypes/hooks/useDataAppVisualizations');
vi.mock('../../../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../../../ee/providers/Embed/useEmbed', () => ({
    default: vi.fn(() => ({})),
}));
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
// The real hook resolves slugs via the projects query; the param here is
// already the identity every mocked hook expects.
vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-uuid',
}));
vi.mock('../../../features/apps/hooks/useCanEditDataApp', () => ({
    useCanEditDataAppChecker: () => mocks.canEditChartType,
}));
vi.mock('../../../features/apps/hooks/useCanCreateDataApp', () => ({
    useCanCreateDataApp: () => mocks.canFork(),
}));
vi.mock('../../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: mocks.track }),
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
vi.mock('../../../features/chartTypes/components/ChartTypeForkModal', () => ({
    default: ({
        appUuid,
        defaultName,
        onClose,
        onForked,
    }: {
        appUuid: string;
        defaultName: string;
        onClose: () => void;
        onForked: (result: { appUuid: string; slug: string }) => void;
    }) => (
        <div role="dialog">
            <span>
                Fork {appUuid} as {defaultName}
            </span>
            <button onClick={onClose}>Cancel fork</button>
            <button
                onClick={() =>
                    onForked({ appUuid: 'forked-uuid', slug: 'forked' })
                }
            >
                Confirm fork
            </button>
        </div>
    ),
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
    provenance: null,
    select: vi.fn(),
    onEdit: null,
    onFork: null,
    onConfigure: null,
});

type GalleryProps = ComponentProps<typeof ChartTypeGallery>;

const galleryProps = (overrides: Partial<GalleryProps> = {}): GalleryProps => ({
    search: '',
    onSearchChange: vi.fn(),
    items: [],
    emptyMessage: null,
    loading: false,
    errorMessage: null,
    onRetry: null,
    onLoadMore: null,
    moreCount: 0,
    loadingMore: false,
    disabledReason: null,
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
            {...galleryProps({
                items: [item('Bar chart'), item('Line chart')],
            })}
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
                {...galleryProps({
                    items: [
                        galleryItem('Bar chart'),
                        galleryItem('Event pulse', 'Reusable ranked bars'),
                    ],
                })}
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
                {...galleryProps({
                    disabledReason: 'Run your query to pick a chart type',
                    items: [
                        {
                            ...galleryItem('Bar chart'),
                            selected: true,
                            disabled: true,
                            onConfigure,
                        },
                    ],
                })}
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
                {...galleryProps({
                    items: [
                        { ...galleryItem('Bar chart'), selected: true },
                        {
                            ...galleryItem('Line chart'),
                            disabled: true,
                            onEdit,
                        },
                    ],
                })}
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
                {...galleryProps({
                    items: [{ ...galleryItem('Pie chart'), select }],
                })}
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
                {...galleryProps({
                    items: [
                        {
                            ...galleryItem('Event pulse'),
                            selected: true,
                            select,
                            onEdit,
                            onConfigure,
                        },
                    ],
                })}
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

    it.each([
        ['official', 'Built by Lightdash'],
        ['custom', 'Custom chart type, built by your team'],
    ] as const)(
        'names the %s mark in its own tooltip',
        async (provenance, description) => {
            renderWithProviders(
                <ChartTypeGallery
                    {...galleryProps({
                        items: [
                            {
                                ...galleryItem('Pulse', 'Ranked bars'),
                                provenance,
                            },
                        ],
                    })}
                />,
            );

            await userEvent.hover(
                screen.getByRole('img', { name: description }),
            );

            expect(await screen.findByRole('tooltip')).toHaveTextContent(
                description,
            );
        },
    );

    it('keeps the provenance out of the card tooltip', async () => {
        renderWithProviders(
            <ChartTypeGallery
                {...galleryProps({
                    items: [
                        {
                            ...galleryItem(
                                'Official pulse',
                                'Ranked bars from the library',
                            ),
                            provenance: 'official',
                        },
                    ],
                })}
            />,
        );

        await userEvent.hover(
            screen.getByRole('button', { name: 'Official pulse' }),
        );

        const tooltip = await screen.findByRole('tooltip');
        expect(tooltip).toHaveTextContent('Ranked bars from the library');
        expect(tooltip).not.toHaveTextContent('Built by Lightdash');
    });

    it('leaves a built-in card unmarked and untold', async () => {
        renderWithProviders(
            <ChartTypeGallery
                {...galleryProps({ items: [galleryItem('Bar chart')] })}
            />,
        );

        await userEvent.hover(
            screen.getByRole('button', { name: 'Bar chart' }),
        );

        await waitFor(() =>
            expect(screen.queryByRole('tooltip')).not.toBeInTheDocument(),
        );
        expect(
            screen.queryByText('Built by Lightdash'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText('Custom chart type, built by your team'),
        ).not.toBeInTheDocument();
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
                {...galleryProps({
                    items: [
                        galleryItem(
                            'Revenue changes over time',
                            'Reusable ranked bars',
                        ),
                    ],
                })}
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
                {...galleryProps({
                    items: [galleryItem('Bar', 'Reusable ranked bars')],
                })}
            />,
        );

        await userEvent.hover(screen.getByRole('button', { name: 'Bar' }));
        expect(
            await screen.findByText('Reusable ranked bars'),
        ).toBeInTheDocument();
    });

    it('marks the picked card as pressed, like the other card pickers', () => {
        renderWithProviders(
            <ChartTypeGallery
                {...galleryProps({
                    items: [
                        { ...galleryItem('Bar chart'), selected: true },
                        galleryItem('Line chart'),
                    ],
                })}
            />,
        );

        expect(
            screen.getByRole('button', { name: 'Bar chart', pressed: true }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Line chart', pressed: false }),
        ).toBeInTheDocument();
    });

    it('keeps the cards on screen while the remote list loads', () => {
        renderWithProviders(
            <ChartTypeGallery
                {...galleryProps({
                    items: [galleryItem('Bar chart')],
                    loading: true,
                })}
            />,
        );

        const notice = screen.getByRole('status');
        expect(notice).toHaveTextContent('Loading chart types…');
        const grid = screen.getByRole('group', { name: 'Chart types' });
        expect(
            grid.compareDocumentPosition(notice) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
            within(grid).getByRole('button', { name: 'Bar chart' }),
        ).toBeInTheDocument();
    });

    it('offers a retry after the grid when the remote list fails', async () => {
        const onRetry = vi.fn();
        renderWithProviders(
            <ChartTypeGallery
                {...galleryProps({
                    items: [galleryItem('Bar chart')],
                    errorMessage: 'Failed to load chart types',
                    onRetry,
                })}
            />,
        );

        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent('Failed to load chart types');
        const grid = screen.getByRole('group', { name: 'Chart types' });
        expect(
            grid.compareDocumentPosition(alert) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
            screen.getByRole('button', { name: 'Bar chart' }),
        ).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(onRetry).toHaveBeenCalledOnce();
    });

    it('shows the empty message when nothing matches', () => {
        renderWithProviders(
            <ChartTypeGallery
                {...galleryProps({
                    search: 'zzz',
                    emptyMessage: 'No chart types match your search',
                })}
            />,
        );

        expect(
            screen.getByText('No chart types match your search'),
        ).toBeInTheDocument();
    });

    describe('selection scroll', () => {
        const scrollIntoView = vi.fn();
        beforeEach(() => {
            scrollIntoView.mockClear();
            (
                Element.prototype as unknown as { scrollIntoView: unknown }
            ).scrollIntoView = scrollIntoView;
        });
        afterEach(() => {
            delete (
                Element.prototype as unknown as { scrollIntoView?: unknown }
            ).scrollIntoView;
        });

        it('brings the selected card into view when the picker opens', () => {
            renderWithProviders(
                <ChartTypeGallery
                    {...galleryProps({
                        items: [
                            galleryItem('Bar chart'),
                            { ...galleryItem('Line chart'), selected: true },
                        ],
                    })}
                />,
            );

            expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
            expect(scrollIntoView.mock.instances[0]).toBe(
                screen.getByRole('button', { name: 'Line chart' }),
            );
        });
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

const selectedTypeProps = {
    selectedProjectType: projectChartType as DataAppViz | null,
    selectedProjectTypeError: null as ApiError | null,
    onRetrySelectedProjectType: vi.fn(),
};

const renderGallery = (onConfigure = vi.fn()) => {
    renderWithProviders(
        <ExplorerChartTypeGallery
            {...selectedTypeProps}
            onConfigure={onConfigure}
        />,
    );
    return onConfigure;
};

const pickableLabels = () =>
    within(screen.getByRole('group', { name: 'Chart types' }))
        .getAllByRole('button')
        .filter((button) => button.hasAttribute('aria-pressed'))
        .map((button) => button.textContent);

describe('ExplorerChartTypeGallery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useEmbed).mockReturnValue({} as ReturnType<typeof useEmbed>);
        selectedTypeProps.selectedProjectType = projectChartType;
        featureFlags.current = {
            [FeatureFlags.EnableDataApps]: true,
            [FeatureFlags.ChartTypeRegistry]: true,
        };
        visualizationConfig.current = {
            chartType: ChartType.TABLE,
            chartConfig: {},
        };
        // False by default (mirrors the real ability hook with no grants),
        // so existing selection/search tests keep a single "Event pulse"
        // match; edit-affordance tests opt in explicitly.
        mocks.canEditChartType.mockReturnValue(false);
        mocks.canFork.mockReturnValue(false);
        setProjectQuery();
    });

    it.each([
        { name: 'empty', types: [] },
        { name: 'populated', types: [projectChartType] },
    ])(
        'opens an $name embedded Explore picker without a load error',
        async ({ types }) => {
            const { useDataAppVisualizations: useRealDataAppVisualizations } =
                await vi.importActual<{
                    useDataAppVisualizations: typeof useDataAppVisualizations;
                }>(
                    '../../../features/chartTypes/hooks/useDataAppVisualizations',
                );
            mockedUseDataAppVisualizations.mockImplementation(
                useRealDataAppVisualizations,
            );
            vi.mocked(useEmbed).mockReturnValue({
                embedToken: 'embed-token',
                projectUuid: 'project-uuid',
            } as ReturnType<typeof useEmbed>);
            vi.mocked(lightdashApi).mockImplementation(({ url }) =>
                url.startsWith('/ee/')
                    ? Promise.reject({
                          status: 'error',
                          error: {
                              statusCode: 403,
                              message: 'Registered account required',
                          },
                      })
                    : Promise.resolve({ data: types, pagination: undefined }),
            );

            renderGallery();

            await waitFor(() =>
                expect(screen.queryByRole('status')).not.toBeInTheDocument(),
            );
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Table' })).toBeVisible();
            expect(lightdashApi).toHaveBeenCalledWith({
                method: 'GET',
                url: '/embed/project-uuid/visualizations?page=1&pageSize=6&sortBy=name&sortDirection=asc',
                body: undefined,
            });
            if (types.length > 0) {
                expect(
                    screen.getByRole('button', { name: /Event pulse/ }),
                ).toBeVisible();
            }
        },
    );

    it('surfaces Table first without changing its selection command', async () => {
        visualizationConfig.current.chartType = ChartType.PIE;
        renderGallery();

        expect(pickableLabels()).toEqual([...BUILT_IN_LABELS, 'Event pulse']);

        await userEvent.click(
            screen.getByRole('button', {
                name: 'Table',
                pressed: false,
            }),
        );

        expect(mocks.setStacking).toHaveBeenCalledWith(undefined);
        expect(mocks.setCartesianType).toHaveBeenCalledWith(undefined);
        expect(mocks.setChartType).toHaveBeenCalledWith(ChartType.TABLE);
    });

    it('runs one grid: built-ins in order, then project types A–Z', () => {
        // The server returns project types already sorted by name; the
        // gallery must render that order as-is, not re-sort client-side.
        setProjectItems([
            projectChartType,
            installedChartType,
            { ...projectChartType, name: 'Zebra pulse' },
        ]);
        renderGallery();

        expect(pickableLabels()).toEqual([
            ...BUILT_IN_LABELS,
            'Event pulse',
            'Official pulse',
            'Zebra pulse',
        ]);
    });

    it('marks project types by where they came from', async () => {
        setProjectItems([installedChartType, projectChartType]);
        renderGallery();

        expect(
            screen.getByRole('img', { name: 'Built by Lightdash' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('img', {
                name: 'Custom chart type, built by your team',
            }),
        ).toBeInTheDocument();
        await userEvent.hover(
            screen.getByRole('img', { name: 'Built by Lightdash' }),
        );
        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            'Built by Lightdash',
        );
        expect(
            screen.queryByRole('img', { name: /Bar chart/ }),
        ).not.toBeInTheDocument();
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

    it('reads clearly when no chart type matches the search', async () => {
        setProjectItems([]);
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

    it('keeps official chart types uneditable even with edit permission', () => {
        selectedTypeProps.selectedProjectType = {
            ...projectChartType,
            registrySlug: 'official-pulse',
        };
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

        // No fork permission and no edit path for an official type leaves no
        // overflow menu at all.
        expect(
            screen.queryByRole('button', {
                name: 'More actions for Event pulse',
            }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Configure Event pulse' }),
        ).toBeInTheDocument();
    });

    describe('fork', () => {
        beforeEach(() => {
            mocks.canEditChartType.mockReturnValue(true);
            mocks.canFork.mockReturnValue(true);
            setProjectItems([installedChartType, projectChartType]);
        });

        it('shows only Fork to customize on an official card', async () => {
            renderGallery();

            await userEvent.click(
                screen.getByRole('button', {
                    name: 'More actions for Official pulse',
                }),
            );

            const menuItems = await screen.findAllByRole('menuitem');
            expect(menuItems.map((item) => item.textContent)).toEqual([
                'Fork to customize',
            ]);
        });

        it('never offers Fork to customize on a custom card', async () => {
            renderGallery();

            await userEvent.click(
                screen.getByRole('button', {
                    name: 'More actions for Event pulse',
                }),
            );

            expect(
                await screen.findByRole('menuitem', {
                    name: 'Edit chart type',
                }),
            ).toBeInTheDocument();
            expect(
                screen.queryByRole('menuitem', {
                    name: 'Fork to customize',
                }),
            ).not.toBeInTheDocument();
        });

        it('hides the overflow menu on an official card without create permission', () => {
            mocks.canFork.mockReturnValue(false);
            renderGallery();

            expect(
                screen.queryByRole('button', {
                    name: 'More actions for Official pulse',
                }),
            ).not.toBeInTheDocument();
        });

        it('hides the overflow menu on an official card when data apps are disabled', () => {
            featureFlags.current = {
                [FeatureFlags.EnableDataApps]: false,
                [FeatureFlags.ChartTypeRegistry]: true,
            };
            renderGallery();

            expect(
                screen.queryByRole('button', {
                    name: 'More actions for Official pulse',
                }),
            ).not.toBeInTheDocument();
        });

        it('opens and dismisses the fork modal for the clicked card', async () => {
            renderGallery();

            await userEvent.click(
                screen.getByRole('button', {
                    name: 'More actions for Official pulse',
                }),
            );
            await userEvent.click(
                await screen.findByRole('menuitem', {
                    name: 'Fork to customize',
                }),
            );

            expect(
                screen.getByText(
                    `Fork ${installedChartType.dataAppVizUuid} as Official pulse (custom)`,
                ),
            ).toBeInTheDocument();

            await userEvent.click(
                screen.getByRole('button', { name: 'Cancel fork' }),
            );

            expect(
                screen.queryByText(
                    `Fork ${installedChartType.dataAppVizUuid} as Official pulse (custom)`,
                ),
            ).not.toBeInTheDocument();
        });

        it('opens Chart Studio in the sidebar for the forked app once the fork completes', async () => {
            renderGallery();

            await userEvent.click(
                screen.getByRole('button', {
                    name: 'More actions for Official pulse',
                }),
            );
            await userEvent.click(
                await screen.findByRole('menuitem', {
                    name: 'Fork to customize',
                }),
            );
            await userEvent.click(
                screen.getByRole('button', { name: 'Confirm fork' }),
            );

            expect(mocks.dispatch).toHaveBeenCalledWith({
                type: 'startChartTypeAuthoring',
                payload: { dataAppVizUuid: 'forked-uuid' },
            });
            expect(
                screen.queryByText(
                    `Fork ${installedChartType.dataAppVizUuid} as Official pulse (custom)`,
                ),
            ).not.toBeInTheDocument();
        });

        it('tracks the fork modal opening with the project and registry slug', async () => {
            renderGallery();

            await userEvent.click(
                screen.getByRole('button', {
                    name: 'More actions for Official pulse',
                }),
            );
            await userEvent.click(
                await screen.findByRole('menuitem', {
                    name: 'Fork to customize',
                }),
            );

            expect(mocks.track).toHaveBeenCalledWith({
                name: EventName.CHART_TYPE_FORK_MODAL_OPENED,
                properties: {
                    projectUuid: 'project-uuid',
                    registrySlug: installedChartType.registrySlug,
                },
            });
        });
    });

    it('shows only built-ins when chart types are off', () => {
        featureFlags.current = {};
        renderGallery();

        expect(
            screen.getByRole('button', { name: 'Bar chart' }),
        ).toBeInTheDocument();
        // No project types means no reason to ask the server for one.
        expect(mockedUseDataAppVisualizations).toHaveBeenCalledWith(
            undefined,
            '',
            { sortBy: 'name', sortDirection: 'asc' },
            6,
        );
        expect(
            screen.queryByRole('button', { name: 'Event pulse' }),
        ).not.toBeInTheDocument();
    });

    it('says why nothing can be picked before a query has run', () => {
        renderWithProviders(
            <ChartTypeGallery
                {...galleryProps({
                    disabledReason: 'Run your query to pick a chart type.',
                    items: [{ ...galleryItem('Bar'), disabled: true }],
                })}
            />,
        );

        expect(
            screen.getByText('Run your query to pick a chart type.'),
        ).toBeInTheDocument();
    });

    describe('selected type outside the paginated list', () => {
        const selected = {
            ...projectChartType,
            dataAppVizUuid: 'later-chart-type',
            name: 'Zebra pulse',
        };
        const renderSelected = (
            overrides: Partial<typeof selectedTypeProps> = {},
        ) => (
            <ExplorerChartTypeGallery
                {...selectedTypeProps}
                selectedProjectType={selected}
                {...overrides}
                onConfigure={mocks.configure}
            />
        );

        beforeEach(() => {
            visualizationConfig.current = {
                chartType: ChartType.DATA_APP_VIZ,
                chartConfig: { dataAppVizUuid: selected.dataAppVizUuid },
            };
            mockedUseDataAppVisualizations.mockReturnValue({
                data: {
                    pages: [
                        {
                            data: [projectChartType],
                            pagination: {
                                page: 1,
                                pageSize: 25,
                                totalPageCount: 40,
                                totalResults: 1000,
                            },
                        },
                    ],
                    pageParams: [1],
                },
                error: null,
                isInitialLoading: false,
                refetch: mocks.refetch,
                fetchNextPage: mocks.fetchNextPage,
                isFetchingNextPage: false,
                hasNextPage: true,
                isFetching: false,
                isPreviousData: false,
            } as unknown as ReturnType<typeof useDataAppVisualizations>);
        });

        it('appends and configures the off-page selection in the grid without fetching', async () => {
            renderWithProviders(renderSelected());
            expect(mocks.fetchNextPage).not.toHaveBeenCalled();
            expect(pickableLabels().at(-1)).toBe('Zebra pulse');
            const selectedGroup = screen.getByRole('group', {
                name: 'Chart types',
            });
            expect(
                within(selectedGroup).getByRole('button', {
                    name: 'Zebra pulse',
                    pressed: true,
                }),
            ).toBeVisible();
            await userEvent.click(
                within(selectedGroup).getByRole('button', {
                    name: 'Configure Zebra pulse',
                }),
            );
            expect(mocks.configure).toHaveBeenCalledOnce();
            expect(mocks.selectProjectChartType).not.toHaveBeenCalled();
        });

        it('keeps the selection visible during search and after clearing search', async () => {
            renderWithProviders(renderSelected());
            const input = screen.getByRole('textbox', {
                name: 'Search chart types',
            });
            await userEvent.type(input, 'table');
            await waitFor(() =>
                expect(
                    screen.queryByRole('button', { name: 'Bar chart' }),
                ).not.toBeInTheDocument(),
            );
            expect(
                screen.getByRole('button', {
                    name: 'Zebra pulse',
                    pressed: true,
                }),
            ).toBeVisible();
            await userEvent.clear(input);
            await screen.findByRole('button', { name: 'Bar chart' });
            expect(mocks.fetchNextPage).not.toHaveBeenCalled();
        });

        it('keeps a loaded selection in its normal grid position', () => {
            setProjectItems([selected, projectChartType]);
            renderWithProviders(renderSelected());
            expect(pickableLabels()).toEqual([
                ...BUILT_IN_LABELS,
                'Zebra pulse',
                'Event pulse',
            ]);
            expect(screen.queryByText('Selected')).not.toBeInTheDocument();
        });

        it('does not duplicate the selection when its page is loaded manually', async () => {
            const { rerender } = renderWithProviders(renderSelected());
            await userEvent.click(
                screen.getByRole('button', {
                    name: /(?:Show .* more|Load more) chart types/,
                }),
            );
            expect(mocks.fetchNextPage).toHaveBeenCalledOnce();
            setProjectItems([projectChartType, selected]);
            rerender(renderSelected());
            expect(
                screen.getAllByRole('button', {
                    name: 'Zebra pulse',
                    pressed: true,
                }),
            ).toHaveLength(1);
            expect(
                within(
                    screen.getByRole('group', { name: 'Chart types' }),
                ).queryByRole('button', { name: 'Zebra pulse' }),
            ).toBeInTheDocument();
        });

        it('restores focus when the last page contains only the appended selection', async () => {
            const { rerender } = renderWithProviders(renderSelected());
            const more = screen.getByRole('button', {
                name: /(?:Show .* more|Load more) chart types/,
            });
            more.focus();
            await userEvent.keyboard('{Enter}');
            setProjectItems([projectChartType, selected]);
            rerender(renderSelected());
            expect(
                screen.getByRole('button', { name: 'Zebra pulse' }),
            ).toHaveFocus();
        });

        it('keeps keyboard focus on a custom card when it is selected', async () => {
            visualizationConfig.current = {
                chartType: ChartType.TABLE,
                chartConfig: {},
            };
            const { rerender } = renderWithProviders(renderSelected());
            const card = screen.getByRole('button', { name: 'Event pulse' });
            card.focus();
            await userEvent.keyboard('{Enter}');
            visualizationConfig.current = {
                chartType: ChartType.DATA_APP_VIZ,
                chartConfig: {
                    dataAppVizUuid: projectChartType.dataAppVizUuid,
                },
            };
            rerender(renderSelected({ selectedProjectType: projectChartType }));
            expect(
                within(
                    screen.getByRole('group', { name: 'Chart types' }),
                ).getByRole('button', { name: 'Event pulse' }),
            ).toHaveFocus();
        });

        it('focuses the first new card when paging moves the appended selection into order', async () => {
            const { rerender } = renderWithProviders(renderSelected());
            await userEvent.click(
                screen.getByRole('button', { name: 'Load more chart types' }),
            );
            setProjectItems([
                projectChartType,
                {
                    ...projectChartType,
                    dataAppVizUuid: 'new',
                    name: 'New type',
                },
                selected,
            ]);
            rerender(renderSelected());
            expect(
                screen.getByRole('button', { name: 'New type' }),
            ).toHaveFocus();
            expect(pickableLabels().slice(-3)).toEqual([
                'Event pulse',
                'New type',
                'Zebra pulse',
            ]);
        });

        it('does not display the previous selection while the new one loads', () => {
            const { rerender } = renderWithProviders(renderSelected());
            visualizationConfig.current.chartConfig = {
                dataAppVizUuid: 'new-selection',
            };
            rerender(renderSelected());
            expect(
                screen.queryByRole('button', { name: 'Zebra pulse' }),
            ).not.toBeInTheDocument();
            expect(
                screen.getByText('Loading selected chart type…'),
            ).toBeVisible();
            rerender(
                renderSelected({
                    selectedProjectType: {
                        ...selected,
                        dataAppVizUuid: 'new-selection',
                        name: 'New selection',
                    },
                }),
            );
            expect(
                screen.getByRole('button', {
                    name: 'New selection',
                    pressed: true,
                }),
            ).toBeVisible();
            expect(mocks.fetchNextPage).not.toHaveBeenCalled();
        });

        it.each([403, 404, 500])(
            'shows an unavailable selection on %s without exhausting the list',
            async (statusCode) => {
                renderWithProviders(
                    renderSelected({
                        selectedProjectType: null,
                        selectedProjectTypeError: {
                            status: 'error',
                            error: {
                                statusCode,
                                name: 'Error',
                                message: 'Unavailable',
                                data: {},
                            },
                        },
                    }),
                );
                expect(screen.getByRole('alert')).toHaveTextContent(
                    'Selected chart type is unavailable',
                );
                expect(
                    screen.getByRole('button', { name: 'Table' }),
                ).toBeVisible();
                await userEvent.click(
                    screen.getByRole('button', { name: 'Retry' }),
                );
                expect(
                    selectedTypeProps.onRetrySelectedProjectType,
                ).toHaveBeenCalledOnce();
                expect(mocks.fetchNextPage).not.toHaveBeenCalled();
            },
        );
    });

    it('fetches the next page from the "+N more" tile', async () => {
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

        // Everything loaded shows; only the unfetched pages hide.
        expect(
            screen.getByRole('button', { name: 'Event pulse 5' }),
        ).toBeInTheDocument();
        await userEvent.click(
            screen.getByRole('button', { name: 'Show 4 more chart types' }),
        );

        expect(mocks.fetchNextPage).toHaveBeenCalled();
    });

    it('leaves the "+N more" tile out while every page is loaded', () => {
        const many = Array.from({ length: 8 }, (_, i) => ({
            ...projectChartType,
            dataAppVizUuid: `project-chart-type-${i}`,
            name: `Event pulse ${i}`,
        }));
        setProjectItems(many);
        renderGallery();

        expect(
            screen.getByRole('button', { name: 'Event pulse 7' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /more chart types/ }),
        ).not.toBeInTheDocument();
    });

    it('keeps built-in choices usable when project types fail to load', async () => {
        setProjectQuery(new Error('unavailable'));
        renderGallery();

        expect(
            screen.getByText('Failed to load chart types'),
        ).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(mocks.refetch).toHaveBeenCalled();

        await userEvent.click(
            screen.getByRole('button', { name: 'Vega (JSON editor)' }),
        );
        expect(mocks.setChartType).toHaveBeenCalledWith(ChartType.CUSTOM);
    });
});
