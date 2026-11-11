import { type Dashboard } from '@lightdash/common';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, type FC } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    selectControlSections,
    selectDashboardFilters,
    selectRawTemporaryFilters,
    useDashboardSelector,
} from '../../../../../features/dashboard/store';
import DashboardProvider from '../../../../../providers/Dashboard/DashboardProvider';
import useDashboardContext from '../../../../../providers/Dashboard/useDashboardContext';
import { renderWithProviders } from '../../../../../testing/testUtils';
import EmbedDashboard from './EmbedDashboard';

const mocks = vi.hoisted(() => ({
    embed: {} as Record<string, unknown>,
    updateDashboard: vi.fn(),
    onUpdateSuccess: undefined as ((dashboard: unknown) => void) | undefined,
    setTemporaryFilters: undefined as ((filters: unknown) => void) | undefined,
    committedFilterIds: [] as string[],
}));

// The chart editor's SQL editor is never opened here
vi.mock('../../../../../components/MonacoEditor', () => ({
    default: () => null,
    Editor: () => null,
    useMonaco: () => null,
}));
vi.mock('../../../../providers/Embed/useEmbed', () => ({
    default: () => mocks.embed,
}));
vi.mock(
    '../../../../../hooks/dashboard/useDashboard',
    async (importActual) => ({
        ...(await importActual<object>()),
        useDashboardQuery: () => ({
            data: undefined,
            isInitialLoading: false,
            error: null,
        }),
        useDashboardVersionRefresh: () => ({
            mutateAsync: vi.fn(),
            isLoading: false,
        }),
        useDashboardsAvailableFilters: () => ({
            data: undefined,
            isInitialLoading: false,
            isFetching: false,
        }),
        useUpdateDashboard: (
            _uuid: unknown,
            _projectUuid: unknown,
            _showToast: unknown,
            onSuccess: (dashboard: unknown) => void,
        ) => {
            mocks.onUpdateSuccess = onSuccess;
            return { mutate: mocks.updateDashboard, isLoading: false };
        },
    }),
);
vi.mock('../hooks', async (importActual) => ({
    ...(await importActual<object>()),
    useEmbedDashboard: () => ({ data: undefined, error: null }),
    useEmbedSavedParameters: () => undefined,
}));
vi.mock('../../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { enabled: true },
        isInitialLoading: false,
    }),
}));
vi.mock('../../../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastWarning: vi.fn(), showToastInfo: vi.fn() }),
}));
vi.mock('../../../../../features/comments', () => ({
    useGetComments: () => ({ data: undefined }),
}));
vi.mock('../../../../../features/parameters', async (importActual) => ({
    ...(await importActual<object>()),
    useParameters: () => ({ data: undefined }),
}));

const SPACE_UUID = 'space-1';

const dashboard = {
    uuid: 'dashboard-1',
    slug: 'sales',
    name: 'Sales',
    projectUuid: 'project-1',
    spaceUuid: SPACE_UUID,
    // A tile, so the grid and the filter rail's bar render
    tiles: [
        {
            uuid: 'tile-1',
            type: 'markdown',
            x: 0,
            y: 0,
            w: 12,
            h: 3,
            tabUuid: undefined,
            properties: { title: 'Notes', content: 'Hello' },
        },
    ],
    tabs: [],
    filters: {
        dimensions: [
            {
                id: 'rule-1',
                label: 'Order date',
                operator: 'equals',
                target: { fieldId: 'orders_date', tableName: 'orders' },
                values: ['2024'],
                sectionId: 'a',
            },
        ],
        metrics: [],
        tableCalculations: [],
    },
    parameters: {},
    config: {
        isDateZoomDisabled: false,
        controlSections: [{ id: 'a', name: 'Dates' }],
    },
    canDateZoom: false,
    dashboardFiltersInteractivity: { enabled: 'all' },
    parameterInteractivity: { enabled: false },
} as unknown as Dashboard;

const SectionNames: FC = () => {
    const sections = useDashboardSelector(selectControlSections);
    return (
        <output data-testid="section-names">
            {sections.map(({ name }) => name).join(',')}
        </output>
    );
};

const FilterIds: FC = () => {
    const filters = useDashboardSelector(selectDashboardFilters);
    const temporaryFilters = useDashboardSelector(selectRawTemporaryFilters);
    mocks.setTemporaryFilters = useDashboardContext(
        (c) => c.setDashboardTemporaryFilters,
    ) as (filters: unknown) => void;
    const ids = [...filters.dimensions, ...temporaryFilters.dimensions]
        .map(({ id }) => id)
        .join(',');
    useEffect(() => {
        mocks.committedFilterIds.push(ids);
    }, [ids]);
    return <output data-testid="filter-ids">{ids}</output>;
};

const renderEmbed = (isEditMode: boolean) =>
    renderWithProviders(
        <MemoryRouter>
            <DashboardProvider embedToken="token" projectUuid="project-1">
                <SectionNames />
                <FilterIds />
                <EmbedDashboard
                    initialDashboard={
                        dashboard as unknown as Parameters<
                            typeof EmbedDashboard
                        >[0]['initialDashboard']
                    }
                    isEditMode={isEditMode}
                />
            </DashboardProvider>
        </MemoryRouter>,
    );

describe('EmbedDashboard sections', () => {
    beforeEach(() => {
        mocks.updateDashboard.mockReset();
        mocks.embed = {
            dashboardUuid: dashboard.uuid,
            dispatchEmbedEvent: vi.fn(),
            embedToken: 'token',
            embedWriteContext: {
                canUpdateDashboard: true,
                canCreateSavedChart: false,
            },
            languageMap: undefined,
            mode: 'direct',
            writeActions: { spaceUuid: SPACE_UUID },
            filters: undefined,
            t: () => undefined,
        };
    });

    it("shows the embed's dashboard sections on the viewer bar", async () => {
        renderEmbed(false);
        expect(
            await screen.findByRole('group', { name: 'Dates' }),
        ).toBeInTheDocument();
    });

    it("keeps the sections and each rule's section through an editor's save", async () => {
        renderEmbed(true);
        await waitFor(() =>
            expect(screen.getByTestId('section-names')).toHaveTextContent(
                'Dates',
            ),
        );

        // Any change enables Save
        const name = screen.getByDisplayValue('Sales');
        await userEvent.clear(name);
        await userEvent.type(name, 'Sales 2');
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        expect(mocks.updateDashboard).toHaveBeenCalledTimes(1);
        const payload = mocks.updateDashboard.mock.calls[0][0];
        expect(payload.config.controlSections).toEqual([
            { id: 'a', name: 'Dates' },
        ]);
        expect(
            payload.filters.dimensions.map(
                ({ sectionId }: { sectionId?: string }) => sectionId,
            ),
        ).toEqual(['a']);
    });

    it("keeps a viewer's added filter applied, once, through its save", async () => {
        renderEmbed(false);
        await waitFor(() =>
            expect(screen.getByTestId('filter-ids')).toHaveTextContent(
                'rule-1',
            ),
        );
        const viewerFilter = {
            id: 'viewer-city',
            operator: 'equals',
            target: { fieldId: 'orders_city', tableName: 'orders' },
            values: ['Porto'],
        };
        act(() =>
            mocks.setTemporaryFilters?.({
                dimensions: [viewerFilter],
                metrics: [],
                tableCalculations: [],
            }),
        );

        mocks.committedFilterIds = [];
        act(() =>
            mocks.onUpdateSuccess?.({
                ...dashboard,
                filters: {
                    ...dashboard.filters,
                    dimensions: [...dashboard.filters.dimensions, viewerFilter],
                },
            }),
        );

        await waitFor(() =>
            expect(screen.getByTestId('filter-ids').textContent).toBe(
                'rule-1,viewer-city',
            ),
        );
        expect(
            mocks.committedFilterIds.filter(
                (ids) => ids !== 'rule-1,viewer-city',
            ),
        ).toEqual([]);
    });
});
