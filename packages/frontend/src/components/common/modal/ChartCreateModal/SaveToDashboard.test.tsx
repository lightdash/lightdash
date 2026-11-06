import { ChartType, type CreateSavedChartVersion } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EmbedProviderContext from '../../../../ee/providers/Embed/context';
import { renderWithProviders } from '../../../../testing/testUtils';
import { SaveToDashboard } from './SaveToDashboard';

const mocks = vi.hoisted(() => ({
    createChart: vi.fn(),
    useDashboardQuery: vi.fn(),
}));

vi.mock('../../../../hooks/useSavedQuery', () => ({
    useCreateMutation: () => ({ mutateAsync: mocks.createChart }),
}));

vi.mock('../../../../hooks/dashboard/useDashboard', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    useDashboardQuery: (args: unknown) => {
        mocks.useDashboardQuery(args);
        return { data: undefined };
    },
}));

const savedData = {
    tableName: 'orders',
    metricQuery: {},
    chartConfig: { type: ChartType.TABLE, config: {} },
    tableConfig: { columnOrder: [] },
} as unknown as CreateSavedChartVersion;

const savedChart = { uuid: 'chart-uuid', dashboardUuid: 'dashboard-uuid' };

const renderInEmbed = (onConfirm: () => void) =>
    renderWithProviders(
        <MemoryRouter>
            <EmbedProviderContext.Provider
                value={{
                    embedToken: 'token',
                    projectUuid: 'project-uuid',
                    t: () => undefined,
                    backDestination: 'dashboard',
                    dispatchEmbedEvent: () => false,
                    isEmbedEventReady: false,
                    mode: 'sdk',
                    theme: 'light',
                    backgroundColor: null,
                    timezone: null,
                    aiAgentThreadSetup: null,
                    aiAgentNavigationDisabled: false,
                }}
            >
                <SaveToDashboard
                    projectUuid="project-uuid"
                    dashboardName="Sales"
                    dashboardUuid="dashboard-uuid"
                    savedData={savedData}
                    onConfirm={onConfirm}
                    onClose={vi.fn()}
                    defaults={{ name: 'Revenue', description: '' }}
                />
            </EmbedProviderContext.Provider>
        </MemoryRouter>,
    );

describe('SaveToDashboard in an embed', () => {
    beforeEach(() => {
        mocks.createChart.mockReset().mockResolvedValue(savedChart);
        mocks.useDashboardQuery.mockReset();
    });

    it('saves the chart into the dashboard and hands it to the host', async () => {
        const onConfirm = vi.fn();
        renderInEmbed(onConfirm);

        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(savedChart));
        expect(mocks.createChart).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Revenue',
                dashboardUuid: 'dashboard-uuid',
            }),
        );
        expect(mocks.useDashboardQuery).toHaveBeenCalledWith(
            expect.objectContaining({ uuidOrSlug: undefined }),
        );
        expect(mocks.useDashboardQuery).not.toHaveBeenCalledWith(
            expect.objectContaining({ uuidOrSlug: 'dashboard-uuid' }),
        );
    });
});
