import { FeatureFlags, type DataAppViz } from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppVersionHistory } from '../features/apps/hooks/useAppVersionHistory';
import { useCanEditDataApp } from '../features/apps/hooks/useCanEditDataApp';
import { useDeleteApp } from '../features/apps/hooks/useDeleteApp';
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

vi.mock('../features/apps/hooks/useDeleteApp', () => ({
    useDeleteApp: vi.fn(),
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

const setFlag = (enabled: boolean) => {
    vi.mocked(useServerFeatureFlag).mockReturnValue({
        data: { id: FeatureFlags.EnableDataApps, enabled },
        isLoading: false,
    } as ReturnType<typeof useServerFeatureFlag>);
};

const renderPage = () =>
    renderWithProviders(
        <MemoryRouter initialEntries={['/projects/project-1/gallery']}>
            <Routes>
                <Route
                    path="/projects/:projectUuid/gallery"
                    element={<ChartTypeGallery />}
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
        setFlag(true);
        vi.mocked(useCanEditDataApp).mockReturnValue(true);
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
            screen.queryByPlaceholderText('Search by name'),
        ).not.toBeInTheDocument();
    });

    it('shows a no-results message when a search matches nothing', async () => {
        setData([makeDataAppViz({})]);
        renderPage();

        fireEvent.change(screen.getByPlaceholderText('Search by name'), {
            target: { value: 'nonexistent' },
        });
        setData([]);

        await waitFor(() =>
            expect(
                screen.getByText(/No chart types match/),
            ).toBeInTheDocument(),
        );
    });

    it('redirects home when data apps are disabled', () => {
        setData([]);
        setFlag(false);
        renderPage();

        expect(screen.getByText('home')).toBeInTheDocument();
    });
});
