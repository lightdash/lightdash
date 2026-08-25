import { ChartKind, ChartType } from '@lightdash/common';
import { IconTable } from '@tabler/icons-react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import {
    createExplorerStore,
    explorerActions,
} from '../../../features/explorer/store';
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

const renderSidebar = (ui: ReactNode, store = createExplorerStore()) =>
    renderWithProviders(
        <Provider store={store}>
            <MemoryRouter>{ui}</MemoryRouter>
        </Provider>,
    );

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
        renderSidebar(
            <ExplorerChartSidebar
                chartType={ChartType.TABLE}
                onClose={vi.fn()}
            />,
        );

        expect(screen.getByText('Configure controls')).toBeInTheDocument();
        expect(screen.getByText('Table')).toBeInTheDocument();
        expect(getSelectedChartTypeItem).toHaveBeenCalledWith(
            ChartType.TABLE,
            null,
        );
        await userEvent.click(screen.getByRole('button', { name: 'Change' }));
        await userEvent.click(
            screen.getByRole('button', { name: 'Select chart' }),
        );

        expect(screen.getByText('Configure controls')).toBeInTheDocument();
    });

    it('returns to Configure from Choose without selecting', async () => {
        renderSidebar(
            <ExplorerChartSidebar
                chartType={ChartType.TABLE}
                onClose={vi.fn()}
            />,
        );

        await userEvent.click(screen.getByRole('button', { name: 'Change' }));
        expect(screen.getByText('Choose chart type')).toBeInTheDocument();

        await userEvent.click(
            screen.getByRole('button', { name: 'Back to configuration' }),
        );

        expect(screen.getByText('Configure controls')).toBeInTheDocument();
    });

    it('reopens in Configure after closing from Choose', async () => {
        renderSidebar(<ReopenHarness />);

        await userEvent.click(screen.getByRole('button', { name: 'Change' }));
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

    it('stays on Configure without Change or Close while a type is authored', () => {
        const store = createExplorerStore();
        store.dispatch(explorerActions.setIsEditMode(true));
        store.dispatch(explorerActions.setChartSidebarStep('choose'));
        store.dispatch(
            explorerActions.startChartTypeAuthoring({ dataAppVizUuid: null }),
        );
        renderSidebar(
            <ExplorerChartSidebar
                chartType={ChartType.DATA_APP_VIZ}
                onClose={vi.fn()}
            />,
            store,
        );

        expect(screen.getByText('Configure controls')).toBeInTheDocument();
        expect(screen.getByText('New chart type')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Change' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', {
                name: 'Close visualization config',
            }),
        ).not.toBeInTheDocument();
    });
});
