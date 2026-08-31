import { ChartType, type DataAppViz, type ItemsMap } from '@lightdash/common';
import { IconChartBar } from '@tabler/icons-react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as ReactRouter from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDataAppVisualizations } from '../../../features/chartTypes/hooks/useDataAppVisualizations';
import { renderWithProviders } from '../../../testing/testUtils';
import ExplorerChartTypeGallery, {
    ChartTypeGallery,
    type ChartTypeGalleryItem,
    type ChartTypeGallerySection,
} from './ChartTypeGallery';

const { mocks } = vi.hoisted(() => ({
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
    },
}));

const projectChartType = {
    dataAppVizUuid: 'project-chart-type',
    name: 'Event pulse',
    description: 'Reusable ranked bars',
    projectUuid: 'project-uuid',
    spaceUuid: null,
    createdAt: new Date('2026-08-20T00:00:00Z'),
    createdByUserUuid: 'user-uuid',
    schema: { fields: [], configOptions: [], colorPalette: null },
    registrySlug: null,
} satisfies DataAppViz;

const itemsMap = { orders_status: { name: 'status' } } as unknown as ItemsMap;

vi.mock('../../../features/chartTypes/hooks/useDataAppVisualizations');
const { dataAppsEnabled } = vi.hoisted(() => ({
    dataAppsEnabled: { current: true },
}));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { enabled: dataAppsEnabled.current },
    }),
}));
vi.mock('../../LightdashVisualization/useVisualizationContext', () => ({
    useVisualizationContext: () => ({
        visualizationConfig: {
            chartType: ChartType.TABLE,
            chartConfig: {},
        },
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
    select: vi.fn(),
    onEdit: null,
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

describe('ChartTypeGallery', () => {
    it('renders every section as cards, with Edit only where it is offered', () => {
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
                        label: 'Project',
                        items: [
                            {
                                ...galleryItem(
                                    'Event pulse',
                                    'Reusable ranked bars',
                                ),
                                onEdit: vi.fn(),
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
        // Edit names its card so repeated pencils stay distinguishable.
        expect(
            screen.getByRole('button', { name: 'Edit Event pulse' }),
        ).toBeInTheDocument();
    });

    it('marks the selected grid card and disables cards that cannot be picked', () => {
        renderWithProviders(
            <ChartTypeGallery
                search=""
                onSearchChange={vi.fn()}
                disabledReason={null}
                sections={[
                    gallerySection({
                        items: [
                            { ...galleryItem('Bar chart'), selected: true },
                            { ...galleryItem('Line chart'), disabled: true },
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
                        label: 'Project',
                        emptyMessage: 'No project chart types yet',
                        onCreateNew,
                    }),
                ]}
            />,
        );

        expect(
            screen.getByText('No project chart types yet'),
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
                        label: 'Project',
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
            within(screen.getByRole('group', { name: 'Project' })).getByRole(
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
                        errorMessage: 'Failed to load project chart types',
                    }),
                ]}
            />,
        );

        expect(screen.getByRole('alert')).toHaveTextContent(
            'Failed to load project chart types',
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

const renderGallery = () => {
    const onSelected = vi.fn();
    renderWithProviders(<ExplorerChartTypeGallery onSelected={onSelected} />);
    return onSelected;
};

describe('ExplorerChartTypeGallery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        dataAppsEnabled.current = true;
        mocks.canCreateDataApp.mockReturnValue(true);
        setProjectQuery();
    });

    it('uses the shared built-in selection command and opens Configure', async () => {
        const onSelected = renderGallery();

        await userEvent.click(
            screen.getByRole('button', { name: /Pie chart/ }),
        );

        expect(mocks.setStacking).toHaveBeenCalledWith(undefined);
        expect(mocks.setCartesianType).toHaveBeenCalledWith(undefined);
        expect(mocks.setChartType).toHaveBeenCalledWith(ChartType.PIE);
        expect(onSelected).toHaveBeenCalledTimes(1);
    });

    it('filters built-in choices using the gallery search', async () => {
        renderGallery();

        await userEvent.type(
            screen.getByRole('textbox', { name: 'Search chart types' }),
            'pie',
        );

        await waitFor(() =>
            expect(
                screen.queryByRole('button', { name: /Bar chart/ }),
            ).not.toBeInTheDocument(),
        );
        expect(
            screen.getByRole('button', { name: /Pie chart/ }),
        ).toBeInTheDocument();
    });

    it('reads clearly when no built-in chart types match the search', async () => {
        renderGallery();

        await userEvent.type(
            screen.getByRole('textbox', { name: 'Search chart types' }),
            'zzz',
        );

        expect(
            await screen.findByText(
                'No built-in chart types match your search',
            ),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /Bar chart/ }),
        ).not.toBeInTheDocument();
    });

    it('selects the existing Vega configuration path', async () => {
        const onSelected = renderGallery();

        await userEvent.click(
            screen.getByRole('button', { name: /Vega \(JSON editor\)/ }),
        );

        expect(mocks.setChartType).toHaveBeenCalledWith(ChartType.CUSTOM);
        expect(onSelected).toHaveBeenCalledTimes(1);
    });

    it('uses the existing project chart-type selection handler', async () => {
        const onSelected = renderGallery();

        await userEvent.click(
            screen.getByRole('button', { name: /Event pulse/ }),
        );

        expect(mocks.selectProjectChartType).toHaveBeenCalledWith(
            projectChartType,
            itemsMap,
        );
        expect(onSelected).toHaveBeenCalledTimes(1);
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
            screen.getByRole('button', { name: /Event pulse/ }),
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

    it('leaves the project shelf out entirely while data-apps is off', () => {
        dataAppsEnabled.current = false;
        renderGallery();

        expect(screen.queryByText('Project')).not.toBeInTheDocument();
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

    it('keeps built-in choices usable when project types fail to load', async () => {
        setProjectQuery(new Error('unavailable'));
        renderGallery();

        expect(
            screen.getByText('Failed to load project chart types'),
        ).toBeInTheDocument();
        await userEvent.click(
            screen.getByRole('button', { name: /Vega \(JSON editor\)/ }),
        );

        expect(mocks.setChartType).toHaveBeenCalledWith(ChartType.CUSTOM);
    });
});
