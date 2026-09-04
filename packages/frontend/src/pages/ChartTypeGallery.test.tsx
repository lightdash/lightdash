import { FeatureFlags, type DataAppViz } from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppVersionHistory } from '../features/apps/hooks/useAppVersionHistory';
import { useCanCreateDataApp } from '../features/apps/hooks/useCanCreateDataApp';
import { useCanEditDataApp } from '../features/apps/hooks/useCanEditDataApp';
import { useDeleteApp } from '../features/apps/hooks/useDeleteApp';
import { useDuplicateApp } from '../features/apps/hooks/useDuplicateApp';
import { useDataAppVisualizations } from '../features/chartTypes/hooks/useDataAppVisualizations';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import { renderWithProviders } from '../testing/testUtils';
import ChartTypeGallery from './ChartTypeGallery';

vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(),
}));

vi.mock('../features/chartTypes/hooks/useDataAppVisualizations', () => ({
    useDataAppVisualizations: vi.fn(),
}));

vi.mock('../features/apps/hooks/useAppVersionHistory', () => ({
    useAppVersionHistory: vi.fn(),
}));

vi.mock('../features/apps/hooks/useCanEditDataApp', () => ({
    useCanEditDataApp: vi.fn(),
}));

vi.mock('../features/apps/hooks/useCanCreateDataApp', () => ({
    useCanCreateDataApp: vi.fn(),
}));

vi.mock('../features/apps/hooks/useDeleteApp', () => ({
    useDeleteApp: vi.fn(),
}));

vi.mock('../features/apps/hooks/useDuplicateApp', () => ({
    useDuplicateApp: vi.fn(),
}));

vi.mock('../features/chartTypes/components/ChartTypeSamplePreview', () => ({
    default: () => <div data-testid="sample-preview" />,
}));

const mockedUseDataAppVisualizations = vi.mocked(useDataAppVisualizations);

const makeDataAppViz = (overrides: Partial<DataAppViz>): DataAppViz => ({
    dataAppVizUuid: 'data-app-viz-1',
    name: 'Radial gauge',
    description: 'A gauge for KPI progress',
    projectUuid: 'project-1',
    spaceUuid: null,
    schema: {
        fields: [
            { name: 'value', label: 'Value', type: 'metric', required: true },
        ],
        configOptions: [],
        colorPalette: null,
    },
    createdAt: new Date('2026-06-30'),
    createdByUserUuid: 'user-1',
    registrySlug: null,
    ...overrides,
});

const setData = (data: DataAppViz[]) => {
    mockedUseDataAppVisualizations.mockReturnValue({
        data: {
            pages: [
                {
                    data,
                    pagination: {
                        page: 1,
                        pageSize: 25,
                        totalPageCount: 1,
                        totalResults: data.length,
                    },
                },
            ],
            pageParams: [1],
        },
        isInitialLoading: false,
        isFetching: false,
        error: null,
        refetch: vi.fn(),
        hasNextPage: false,
        fetchNextPage: vi.fn(),
        isFetchingNextPage: false,
    } as unknown as ReturnType<typeof useDataAppVisualizations>);
};

const setFlags = ({
    dataApps = true,
    chartTypeRegistry = true,
}: {
    dataApps?: boolean;
    chartTypeRegistry?: boolean;
} = {}) => {
    vi.mocked(useServerFeatureFlag).mockImplementation(
        (flag) =>
            ({
                data: {
                    id: flag,
                    enabled:
                        flag === FeatureFlags.EnableDataApps
                            ? dataApps
                            : chartTypeRegistry,
                },
                isLoading: false,
            }) as ReturnType<typeof useServerFeatureFlag>,
    );
};

const LocationSearch = () => {
    const { search } = useLocation();
    return <div data-testid="location-search">{search}</div>;
};

const renderPage = (initialEntry = '/projects/project-1/gallery') =>
    renderWithProviders(
        <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
                <Route
                    path="/projects/:projectUuid/gallery"
                    element={
                        <>
                            <ChartTypeGallery />
                            <LocationSearch />
                        </>
                    }
                />
                <Route
                    path="/projects/:projectUuid/home"
                    element={<div>home</div>}
                />
            </Routes>
        </MemoryRouter>,
    );

const mockedDeleteApp = vi.fn();

describe('ChartTypeGallery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setFlags();
        vi.mocked(useCanEditDataApp).mockReturnValue(true);
        vi.mocked(useCanCreateDataApp).mockReturnValue(true);
        vi.mocked(useDuplicateApp).mockReturnValue({
            mutate: vi.fn(),
            isLoading: false,
        } as unknown as ReturnType<typeof useDuplicateApp>);
        mockedDeleteApp.mockResolvedValue(undefined);
        vi.mocked(useDeleteApp).mockReturnValue({
            mutateAsync: mockedDeleteApp,
            isLoading: false,
        } as unknown as ReturnType<typeof useDeleteApp>);
        vi.mocked(useAppVersionHistory).mockReturnValue({
            versions: [],
            oldest: null,
            latest: null,
            latestReadyVersion: 3,
            hasOrigin: false,
            hasEarlier: false,
            isLoading: false,
            isError: false,
            isFetchingEarlier: false,
            fetchEarlier: vi.fn(),
        });
    });

    it('lists the project chart types and opens the detail modal', () => {
        setData([
            makeDataAppViz({}),
            makeDataAppViz({ dataAppVizUuid: 'viz-2', name: 'Bar race' }),
        ]);
        renderPage();

        expect(screen.getByText('Bar race')).toBeInTheDocument();
        expect(screen.getByText('Gallery')).toBeInTheDocument();
        expect(screen.getByText('(2)')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Radial gauge'));

        expect(screen.getByText('Preview in explorer')).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Edit' }).closest('a'),
        ).toHaveAttribute(
            'href',
            '/projects/project-1/chart-types/data-app-viz-1',
        );
        expect(screen.getByText('v3')).toBeInTheDocument();
        expect(screen.getByText('Value')).toBeInTheDocument();
    });

    it('separates installed charts and the chart library into top-level tabs', () => {
        setData([makeDataAppViz({})]);
        renderPage();

        const chartTypesTab = screen.getByRole('tab', {
            name: 'Installed charts (1)',
        });
        const libraryTab = screen.getByRole('tab', {
            name: 'Chart library',
        });

        expect(chartTypesTab).toHaveAttribute('aria-selected', 'true');
        expect(libraryTab).toHaveAttribute('aria-selected', 'false');
        expect(screen.getByText('Radial gauge')).toBeInTheDocument();

        fireEvent.click(libraryTab);

        expect(libraryTab).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByTestId('location-search')).toHaveTextContent(
            '?tab=chart-library',
        );
        expect(
            screen.queryByRole('button', { name: 'Radial gauge' }),
        ).not.toBeInTheDocument();

        fireEvent.click(chartTypesTab);

        expect(screen.getByTestId('location-search')).toBeEmptyDOMElement();
    });

    it('opens the chart library tab from a deep link', () => {
        setData([makeDataAppViz({})]);
        renderPage('/projects/project-1/gallery?tab=chart-library');

        expect(
            screen.getByRole('tab', { name: 'Chart library' }),
        ).toHaveAttribute('aria-selected', 'true');
        expect(
            screen.queryByRole('button', { name: 'Radial gauge' }),
        ).not.toBeInTheDocument();
    });

    it('hides the library tab when the chart type registry is disabled', () => {
        setFlags({ chartTypeRegistry: false });
        setData([makeDataAppViz({})]);
        renderPage();

        expect(
            screen.queryByRole('tab', { name: 'Chart library' }),
        ).not.toBeInTheDocument();
    });

    it('shows origin author and last update in the detail modal', () => {
        const originVersion = {
            version: 1,
            createdAt: new Date('2026-07-01'),
            statusUpdatedAt: new Date('2026-07-01'),
            createdByUser: {
                userUuid: 'user-1',
                firstName: 'Ada',
                lastName: 'Lovelace',
            },
        };
        vi.mocked(useAppVersionHistory).mockReturnValue({
            versions: [],
            oldest: originVersion,
            latest: originVersion,
            latestReadyVersion: 1,
            hasOrigin: true,
            hasEarlier: false,
            isLoading: false,
            isError: false,
            isFetchingEarlier: false,
            fetchEarlier: vi.fn(),
        } as unknown as ReturnType<typeof useAppVersionHistory>);
        setData([makeDataAppViz({})]);
        renderPage();

        fireEvent.click(screen.getByText('Radial gauge'));

        expect(screen.getByText('Built by')).toBeInTheDocument();
        expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
        expect(screen.getByText('Last updated')).toBeInTheDocument();
    });

    it('links the card menu actions and deletes after confirmation', async () => {
        setData([makeDataAppViz({})]);
        renderPage();

        expect(
            screen.getByLabelText('Edit Radial gauge').closest('a'),
        ).toHaveAttribute(
            'href',
            '/projects/project-1/chart-types/data-app-viz-1',
        );

        fireEvent.click(screen.getByLabelText('Actions for Radial gauge'));

        expect(
            screen.getByText('Preview in explorer').closest('a'),
        ).toHaveAttribute(
            'href',
            '/projects/project-1/tables?dataAppVizUuid=data-app-viz-1',
        );

        fireEvent.click(screen.getByText('Delete'));

        expect(screen.getByText('Delete chart type')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

        await waitFor(() =>
            expect(mockedDeleteApp).toHaveBeenCalledWith({
                projectUuid: 'project-1',
                appUuid: 'data-app-viz-1',
                successTitle: 'Chart type deleted',
            }),
        );
    });

    it('opens the delete confirmation from the detail modal', () => {
        setData([makeDataAppViz({})]);
        renderPage();

        fireEvent.click(screen.getByText('Radial gauge'));
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

        expect(screen.getByText('Delete chart type')).toBeInTheDocument();
    });

    it('hides edit and delete actions from non-editors', () => {
        vi.mocked(useCanEditDataApp).mockReturnValue(false);
        setData([makeDataAppViz({})]);
        renderPage();

        expect(
            screen.queryByLabelText('Edit Radial gauge'),
        ).not.toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('Actions for Radial gauge'));

        expect(screen.getByText('Preview in explorer')).toBeInTheDocument();
        expect(screen.queryByText('Delete')).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('Radial gauge'));

        expect(
            screen.queryByRole('button', { name: 'Delete' }),
        ).not.toBeInTheDocument();
    });

    it('shows the empty state when the project has no chart types', () => {
        setData([]);
        renderPage();

        expect(
            screen.getByText(/Chart types are custom visualizations/),
        ).toBeInTheDocument();
        expect(
            screen.queryByPlaceholderText('Search by name or description'),
        ).not.toBeInTheDocument();
    });

    it('shows a no-results message for an empty searched page', async () => {
        setData([makeDataAppViz({})]);
        renderPage();

        fireEvent.change(
            screen.getByPlaceholderText('Search by name or description'),
            {
                target: { value: 'prog' },
            },
        );
        setData([]);

        await waitFor(() =>
            expect(mockedUseDataAppVisualizations).toHaveBeenLastCalledWith(
                'project-1',
                'prog',
            ),
        );

        await waitFor(() =>
            expect(
                screen.getByText(/No chart types match/),
            ).toBeInTheDocument(),
        );
    });

    it('redirects home when data apps are disabled', () => {
        setData([]);
        setFlags({ dataApps: false });
        renderPage();

        expect(screen.getByText('home')).toBeInTheDocument();
    });

    describe('official (registry-installed) chart types', () => {
        it('shows the Official badge and a fork action instead of edit', () => {
            setData([makeDataAppViz({ registrySlug: 'radial-gauge' })]);
            renderPage();

            expect(screen.getByText('Official')).toBeInTheDocument();
            expect(
                screen.queryByLabelText('Edit Radial gauge'),
            ).not.toBeInTheDocument();
            expect(
                screen.getByLabelText('Fork Radial gauge'),
            ).toBeInTheDocument();
        });

        it('hides the fork action from users who cannot create data apps', () => {
            vi.mocked(useCanCreateDataApp).mockReturnValue(false);
            setData([makeDataAppViz({ registrySlug: 'radial-gauge' })]);
            renderPage();

            expect(
                screen.queryByLabelText('Fork Radial gauge'),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByLabelText('Edit Radial gauge'),
            ).not.toBeInTheDocument();
        });

        it('opens the fork modal from the card and submits the fork', () => {
            const mockedDuplicate = vi.fn();
            vi.mocked(useDuplicateApp).mockReturnValue({
                mutate: mockedDuplicate,
                isLoading: false,
            } as unknown as ReturnType<typeof useDuplicateApp>);
            setData([makeDataAppViz({ registrySlug: 'radial-gauge' })]);
            renderPage();

            fireEvent.click(screen.getByLabelText('Fork Radial gauge'));

            expect(screen.getByText('Fork to customize')).toBeInTheDocument();
            expect(screen.getByLabelText(/Name/)).toHaveValue(
                'Radial gauge (custom)',
            );

            fireEvent.click(screen.getAllByRole('button', { name: 'Fork' })[0]);

            expect(mockedDuplicate).toHaveBeenCalledWith(
                {
                    projectUuid: 'project-1',
                    appUuid: 'data-app-viz-1',
                    name: 'Radial gauge (custom)',
                },
                expect.objectContaining({ onSuccess: expect.any(Function) }),
            );
        });

        it('shows the badge and a fork action in the detail modal', () => {
            setData([makeDataAppViz({ registrySlug: 'radial-gauge' })]);
            renderPage();

            fireEvent.click(screen.getByText('Radial gauge'));

            expect(
                screen.getByRole('button', { name: /Fork to customize/ }),
            ).toBeInTheDocument();
            expect(screen.queryByText('Edit')).not.toBeInTheDocument();
        });
    });
});
