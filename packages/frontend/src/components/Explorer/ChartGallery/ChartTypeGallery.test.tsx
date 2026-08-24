import { ChartType, type DataAppViz, type ItemsMap } from '@lightdash/common';
import { IconChartBar } from '@tabler/icons-react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as ReactRouter from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDataAppVisualizations } from '../../../features/chartTypes/hooks/useDataAppVisualizations';
import { renderWithProviders } from '../../../testing/testUtils';
import ExplorerChartTypeGallery, {
    ChartTypeGallery,
    type ChartTypeGalleryRowItem,
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
} satisfies DataAppViz;

const itemsMap = { orders_status: { name: 'status' } } as unknown as ItemsMap;

vi.mock('../../../features/chartTypes/hooks/useDataAppVisualizations');
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: true } }),
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
vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<typeof ReactRouter>()),
    useParams: () => ({ projectUuid: 'project-uuid' }),
    useLocation: () => ({ search: '?tableName=orders' }),
    useNavigate: () => mocks.navigate,
}));

const galleryItem = (
    label: string,
    description: string,
): ChartTypeGalleryRowItem => ({
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

describe('ChartTypeGallery', () => {
    it('renders grid sections as icon+label cards and rows sections with descriptions', () => {
        renderWithProviders(
            <ChartTypeGallery
                search=""
                onSearchChange={vi.fn()}
                sections={[
                    {
                        label: 'Built in',
                        layout: 'grid',
                        items: [galleryItem('Bar chart', 'Compare categories')],
                        emptyMessage: 'Nothing here',
                    },
                    {
                        label: 'Project',
                        layout: 'rows',
                        items: [
                            galleryItem('Event pulse', 'Reusable ranked bars'),
                        ],
                        emptyMessage: 'Nothing here',
                        loading: false,
                        errorMessage: null,
                        onRetry: null,
                        onLoadMore: null,
                        loadingMore: false,
                        onCreateNew: null,
                    },
                ]}
            />,
        );

        // Grid cards keep the label as the accessible name, drop the description.
        expect(
            screen.getByRole('button', { name: 'Bar chart' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('Compare categories'),
        ).not.toBeInTheDocument();

        expect(
            screen.getByRole('button', { name: /Event pulse/ }),
        ).toBeInTheDocument();
        expect(screen.getByText('Reusable ranked bars')).toBeInTheDocument();
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

    it('opens the chart type builder from the project section', async () => {
        renderGallery();

        await userEvent.click(
            screen.getByRole('button', { name: /Create new chart type/ }),
        );

        expect(mocks.navigate).toHaveBeenCalledWith({
            pathname: '/projects/project-uuid/chart-types/new',
            search: '?tableName=orders',
        });
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
