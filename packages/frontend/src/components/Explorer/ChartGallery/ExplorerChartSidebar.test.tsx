import { ChartKind, ChartType } from '@lightdash/common';
import { IconTable } from '@tabler/icons-react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import ExplorerChartSidebar from './ExplorerChartSidebar';

vi.mock('../VisualizationCard/VisualizationConfig', () => ({
    default: () => <div>Configure controls</div>,
}));
vi.mock('./ChartTypeGallery', () => ({
    default: ({ onSelected }: { onSelected: () => void }) => (
        <button onClick={onSelected}>Select chart</button>
    ),
    ChartTypeThumbnail: () => <span>Table thumbnail</span>,
}));
vi.mock('../../../features/chartTypes/hooks/useDataAppVisualization', () => ({
    useDataAppVisualization: () => ({ data: undefined }),
}));
vi.mock('../../LightdashVisualization/useVisualizationContext', () => ({
    useVisualizationContext: () => ({
        visualizationConfig: {
            chartType: ChartType.TABLE,
            chartConfig: {},
        },
    }),
}));

const { getSelectedChartTypeItem } = vi.hoisted(() => ({
    getSelectedChartTypeItem: vi.fn(() => ({
        id: ChartKind.TABLE,
        label: 'Table',
        icon: IconTable,
        rotatedIcon: false,
    })),
}));

vi.mock('../VisualizationCardOptions/useChartTypeOptions', () => ({
    useChartTypeOptions: () => ({ getSelectedChartTypeItem }),
}));

const ReopenHarness = () => {
    const [open, setOpen] = useState(true);
    return (
        <>
            {open ? (
                <ExplorerChartSidebar
                    chartType={ChartType.TABLE}
                    onClose={() => setOpen(false)}
                />
            ) : (
                <button onClick={() => setOpen(true)}>Reopen</button>
            )}
        </>
    );
};

describe('ExplorerChartSidebar', () => {
    it('moves from Configure to Choose and back after selection', async () => {
        renderWithProviders(
            <MemoryRouter>
                <ExplorerChartSidebar
                    chartType={ChartType.TABLE}
                    onClose={vi.fn()}
                />
            </MemoryRouter>,
        );

        expect(screen.getByText('Configure controls')).toBeInTheDocument();
        expect(screen.getByText('Table')).toBeInTheDocument();
        expect(getSelectedChartTypeItem).toHaveBeenCalledWith(
            ChartType.TABLE,
            null,
        );
        await userEvent.click(screen.getByText('Choose type'));
        await userEvent.click(
            screen.getByRole('button', { name: 'Select chart' }),
        );

        expect(screen.getByText('Configure controls')).toBeInTheDocument();
    });

    it('reopens in Configure after closing from Choose', async () => {
        renderWithProviders(
            <MemoryRouter>
                <ReopenHarness />
            </MemoryRouter>,
        );

        await userEvent.click(screen.getByText('Choose type'));
        await userEvent.click(
            screen.getByRole('button', {
                name: 'Close visualization config',
            }),
        );
        await userEvent.click(screen.getByRole('button', { name: 'Reopen' }));

        expect(screen.getByText('Configure controls')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Select chart' }),
        ).not.toBeInTheDocument();
    });
});
