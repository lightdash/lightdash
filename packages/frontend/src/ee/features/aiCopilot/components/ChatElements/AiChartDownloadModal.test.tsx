import { ChartType, type MetricQuery } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { AiChartDownloadModal } from './AiChartDownloadModal';

const mocks = vi.hoisted(() => ({
    useVisualizationContext: vi.fn(),
}));

vi.mock(
    '../../../../../components/LightdashVisualization/useVisualizationContext',
    () => ({ useVisualizationContext: mocks.useVisualizationContext }),
);

vi.mock('../../../../../hooks/user/useUser', () => ({
    default: () => ({
        data: {
            organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
        },
    }),
}));

vi.mock('../../../../../providers/Ability', () => ({
    Can: ({ children }: { children: ReactNode }) => children,
}));

const metricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_status'],
    metrics: ['orders_total'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
    additionalMetrics: [],
    metricOverrides: {},
} satisfies MetricQuery;

describe('AiChartDownloadModal', () => {
    beforeEach(() => {
        mocks.useVisualizationContext.mockReturnValue({
            chartConfig: { type: ChartType.TABLE, config: {} },
            columnOrder: ['orders_status', 'orders_total'],
            itemsMap: {},
            parameters: {},
            pivotDimensions: ['orders_status'],
            resultsData: {
                metricQuery,
                totalResults: 25,
            },
            visualizationConfig: {
                chartType: ChartType.TABLE,
                chartConfig: {
                    columnProperties: {},
                    configuredRowFieldIds: [],
                    validConfig: {},
                    showTableNames: false,
                    conditionalFormattings: [],
                    showColumnCalculation: false,
                },
            },
        });
    });

    it('shows the shared export controls in a dialog', async () => {
        const onClose = vi.fn();
        renderWithProviders(
            <AiChartDownloadModal
                opened
                onClose={onClose}
                projectUuid="project-uuid"
                chartName="Orders"
                mergeQuery={null}
            />,
        );

        expect(screen.getByRole('dialog')).toBeVisible();
        expect(screen.getByText('Export Data')).toBeVisible();
        expect(await screen.findByText('Table rows')).toBeVisible();
        expect(screen.getByText('Grouped')).toBeVisible();
        expect(screen.getByText('Flat')).toBeVisible();

        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onClose).toHaveBeenCalledOnce();
    });
});
