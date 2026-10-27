import { type Dashboard, type LanguageMap } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type FC } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    selectControlSections,
    useDashboardSelector,
} from '../../../../../features/dashboard/store';
import DashboardProvider from '../../../../../providers/Dashboard/DashboardProvider';
import { renderWithProviders } from '../../../../../testing/testUtils';
import EmbedDashboard from './EmbedDashboard';

const mocks = vi.hoisted(() => ({
    embed: {} as Record<string, unknown>,
    updateDashboard: vi.fn(),
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
        useUpdateDashboard: () => ({
            mutate: mocks.updateDashboard,
            isLoading: false,
        }),
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

const languageMap = {
    dashboard: {
        sales: { config: { controlSections: [{ id: 'a', name: 'Fechas' }] } },
    },
} as unknown as LanguageMap;

const SectionNames: FC = () => {
    const sections = useDashboardSelector(selectControlSections);
    return (
        <output data-testid="section-names">
            {sections.map(({ name }) => name).join(',')}
        </output>
    );
};

const renderEmbed = (isEditMode: boolean) =>
    renderWithProviders(
        <MemoryRouter>
            <DashboardProvider embedToken="token" projectUuid="project-1">
                <SectionNames />
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
            languageMap,
            mode: 'direct',
            writeActions: { spaceUuid: SPACE_UUID },
            filters: undefined,
            t: () => undefined,
        };
    });

    it("shows the dashboard's sections on the viewer bar, translated by id", async () => {
        renderEmbed(false);
        expect(
            await screen.findByRole('group', { name: 'Fechas' }),
        ).toBeInTheDocument();
    });

    it('shows translated section names and saves the untranslated ones', async () => {
        renderEmbed(true);
        await waitFor(() =>
            expect(screen.getByTestId('section-names')).toHaveTextContent(
                'Fechas',
            ),
        );

        // Any change enables Save
        const name = screen.getByDisplayValue('Sales');
        await userEvent.clear(name);
        await userEvent.type(name, 'Sales 2');
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        expect(mocks.updateDashboard).toHaveBeenCalledTimes(1);
        expect(
            mocks.updateDashboard.mock.calls[0][0].config.controlSections,
        ).toEqual([{ id: 'a', name: 'Dates' }]);
    });
});
