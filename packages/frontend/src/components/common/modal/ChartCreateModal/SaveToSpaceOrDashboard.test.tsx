import { ChartType, type CreateSavedChartVersion } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { SaveToSpaceOrDashboard } from './SaveToSpaceOrDashboard';

const mocks = vi.hoisted(() => ({ createChart: vi.fn() }));

vi.mock('../../../../hooks/useSavedQuery', () => ({
    useCreateMutation: () => ({
        mutateAsync: mocks.createChart,
        isLoading: false,
    }),
}));

const savedData = {
    tableName: 'orders',
    metricQuery: { dimensions: [], metrics: [] },
    chartConfig: { type: ChartType.TABLE, config: {} },
    tableConfig: { columnOrder: [] },
} as unknown as CreateSavedChartVersion;

const savedChart = { uuid: 'chart-uuid' };

const renderDialog = (onConfirm: () => void) =>
    renderWithProviders(
        <MemoryRouter>
            <SaveToSpaceOrDashboard
                projectUuid="project-uuid"
                savedData={savedData}
                onConfirm={onConfirm}
                onClose={vi.fn()}
                restrictedSpaces={[{ uuid: 'space-uuid', name: 'Shared' }]}
                restrictedDashboard={{ uuid: 'dashboard-uuid', name: 'Sales' }}
                chartMetadata={{ name: 'Revenue', description: '' }}
                redirectOnSuccess={false}
                showViewChartAction={false}
            />
        </MemoryRouter>,
    );

describe('SaveToSpaceOrDashboard with an embedded dashboard destination', () => {
    beforeEach(() => {
        mocks.createChart.mockReset().mockResolvedValue(savedChart);
    });

    it('saves into the dashboard by default', async () => {
        const onConfirm = vi.fn();
        renderDialog(onConfirm);

        await userEvent.click(
            await screen.findByRole('button', { name: 'Save' }),
        );

        await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(savedChart));
        expect(mocks.createChart).toHaveBeenCalledWith(
            expect.objectContaining({ dashboardUuid: 'dashboard-uuid' }),
        );
    });

    it('saves into the space when the user picks it', async () => {
        const onConfirm = vi.fn();
        renderDialog(onConfirm);

        await userEvent.click(
            await screen.findByRole('radio', { name: '"Shared" space' }),
        );
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(savedChart));
        expect(mocks.createChart).toHaveBeenCalledWith(
            expect.objectContaining({
                spaceUuid: 'space-uuid',
                dashboardUuid: undefined,
            }),
        );
    });
});
