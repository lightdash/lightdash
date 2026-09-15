import { ChartKind, ChartType } from '@lightdash/common';
import { IconTable } from '@tabler/icons-react';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createExplorerStore,
    explorerActions,
} from '../../../features/explorer/store';
import { renderWithProviders } from '../../../testing/testUtils';
import {
    CHART_GALLERY_SEARCH_ID,
    CHART_GALLERY_SIDEBAR_TITLE_ID,
} from '../../common/ChartGallery/ChartGalleryContext';
import ExplorerChartSidebar from './ExplorerChartSidebar';

vi.mock('../VisualizationCard/VisualizationConfig', () => ({
    default: () => <div>Configure controls</div>,
}));
vi.mock('./ChartTypeGallery', () => ({
    default: ({ onConfigure }: { onConfigure: () => void }) => (
        <>
            {/* The real gallery's search carries this id; the sidebar sends
                focus to it by id when the step opens. */}
            <input
                id={CHART_GALLERY_SEARCH_ID}
                aria-label="Search chart types"
            />
            <button>Select chart</button>
            <button onClick={onConfigure}>Configure Table</button>
        </>
    ),
    ChartTypeThumbnail: () => <span>Table thumbnail</span>,
}));
const { dataAppsFlagEnabled } = vi.hoisted(() => ({
    dataAppsFlagEnabled: { current: true },
}));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { enabled: dataAppsFlagEnabled.current },
        isLoading: false,
    }),
}));
const { selectedProjectType, vizConfig } = vi.hoisted(() => ({
    selectedProjectType: { current: undefined as unknown },
    vizConfig: {
        current: {
            chartType: 'table',
            chartConfig: {},
        } as unknown,
    },
}));
vi.mock('../../../features/chartTypes/hooks/useDataAppVisualization', () => ({
    useDataAppVisualization: () => ({ data: selectedProjectType.current }),
}));
vi.mock('../../../features/apps/hooks/useCanEditDataApp', () => ({
    useCanEditDataAppChecker: () => () => true,
}));
vi.mock('../../LightdashVisualization/useVisualizationContext', () => ({
    useVisualizationContext: () => ({
        visualizationConfig: vizConfig.current,
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

vi.mock('./useChartTypeOptions', () => ({
    useChartTypeOptions: () => ({
        getSelectedChartTypeItem,
    }),
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
    beforeEach(() => {
        selectedProjectType.current = undefined;
        vizConfig.current = { chartType: ChartType.TABLE, chartConfig: {} };
        dataAppsFlagEnabled.current = true;
    });

    it('offers one labeled configuration action for the current selection', async () => {
        renderSidebar(
            <ExplorerChartSidebar
                chartType={ChartType.TABLE}
                onClose={vi.fn()}
            />,
        );
        await userEvent.click(screen.getByRole('button', { name: 'Change' }));

        expect(screen.queryByText('Selected:')).not.toBeInTheDocument();
        expect(
            screen.getAllByRole('button', {
                name: 'Configure Table',
            }),
        ).toHaveLength(1);
    });

    it('configures the selected chart without changing its state and restores focus', async () => {
        const store = createExplorerStore();
        const onClose = vi.fn();
        renderSidebar(
            <ExplorerChartSidebar
                chartType={ChartType.TABLE}
                onClose={onClose}
            />,
            store,
        );
        await userEvent.click(screen.getByRole('button', { name: 'Change' }));
        const previousChart = store.getState().explorer.unsavedChartVersion;
        screen.getByRole('button', { name: 'Configure Table' }).focus();
        await userEvent.keyboard('{Enter}');

        expect(screen.getByText('Configure controls')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Change' })).toHaveFocus();
        expect(store.getState().explorer.unsavedChartVersion).toEqual(
            previousChart,
        );
        expect(onClose).not.toHaveBeenCalled();
    });

    it('hides the edit entry entirely while data-apps is disabled', () => {
        dataAppsFlagEnabled.current = false;
        vizConfig.current = {
            chartType: ChartType.DATA_APP_VIZ,
            chartConfig: { dataAppVizUuid: 'viz-1' },
        };
        selectedProjectType.current = {
            dataAppVizUuid: 'viz-1',
            name: 'Event pulse',
            spaceUuid: null,
            createdByUserUuid: 'user-1',
        };
        renderSidebar(
            <ExplorerChartSidebar
                chartType={ChartType.DATA_APP_VIZ}
                onClose={vi.fn()}
            />,
        );

        expect(
            screen.queryByRole('button', { name: 'Edit chart type' }),
        ).not.toBeInTheDocument();
    });

    it('offers editing the selected custom chart type in place', async () => {
        vizConfig.current = {
            chartType: ChartType.DATA_APP_VIZ,
            chartConfig: { dataAppVizUuid: 'viz-1' },
        };
        selectedProjectType.current = {
            dataAppVizUuid: 'viz-1',
            name: 'Event pulse',
            spaceUuid: null,
            createdByUserUuid: 'user-1',
            registrySlug: null,
        };
        const store = createExplorerStore();
        renderSidebar(
            <ExplorerChartSidebar
                chartType={ChartType.DATA_APP_VIZ}
                onClose={vi.fn()}
            />,
            store,
        );

        await userEvent.click(
            screen.getByRole('button', { name: 'Edit chart type' }),
        );

        expect(
            store.getState().explorer.chartTypeAuthoring?.dataAppVizUuid,
        ).toBe('viz-1');
    });

    it('hides the edit entry for an official (registry-installed) chart type', () => {
        vizConfig.current = {
            chartType: ChartType.DATA_APP_VIZ,
            chartConfig: { dataAppVizUuid: 'viz-1' },
        };
        selectedProjectType.current = {
            dataAppVizUuid: 'viz-1',
            name: 'Sankey',
            spaceUuid: null,
            createdByUserUuid: 'user-1',
            registrySlug: 'sankey',
        };
        renderSidebar(
            <ExplorerChartSidebar
                chartType={ChartType.DATA_APP_VIZ}
                onClose={vi.fn()}
            />,
        );

        expect(
            screen.queryByRole('button', { name: 'Edit chart type' }),
        ).not.toBeInTheDocument();
    });

    it('retitles itself while a chart type is authored', () => {
        const store = createExplorerStore();
        store.dispatch(explorerActions.setIsEditMode(true));
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

        expect(screen.getByText('Generated options')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Edit chart type' }),
        ).not.toBeInTheDocument();
    });

    it('uses the selected chart title instead of a duplicate Configure chart header', () => {
        renderSidebar(
            <ExplorerChartSidebar
                chartType={ChartType.TABLE}
                onClose={vi.fn()}
            />,
        );

        expect(screen.getByText('Table')).toHaveAttribute(
            'id',
            CHART_GALLERY_SIDEBAR_TITLE_ID,
        );
        expect(screen.queryByText('Configure chart')).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', {
                name: 'Close visualization config',
            }),
        ).toBeInTheDocument();
    });

    it('keeps Choose open after selection until the configuration action is requested', async () => {
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

        expect(screen.getByText('Choose chart type')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Select chart' }),
        ).toHaveFocus();

        await userEvent.click(
            screen.getByRole('button', { name: 'Configure Table' }),
        );
        expect(screen.getByText('Configure controls')).toBeInTheDocument();
    });

    it('returns to configuration with Back without closing or changing the chart', async () => {
        const onClose = vi.fn();
        const store = createExplorerStore();
        renderSidebar(
            <ExplorerChartSidebar
                chartType={ChartType.TABLE}
                onClose={onClose}
            />,
            store,
        );
        await userEvent.click(screen.getByRole('button', { name: 'Change' }));
        const previousState = store.getState();
        const back = screen.getByRole('button', {
            name: 'Back to configuration',
        });
        back.focus();
        await userEvent.keyboard('{Enter}');

        expect(screen.getByText('Configure controls')).toBeInTheDocument();
        expect(screen.getByText('Table')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Change' })).toHaveFocus();
        expect(onClose).not.toHaveBeenCalled();
        expect(store.getState().explorer.unsavedChartVersion).toEqual(
            previousState.explorer.unsavedChartVersion,
        );
    });

    it('opens Configure from Choose through the selected tile action', async () => {
        renderSidebar(
            <ExplorerChartSidebar
                chartType={ChartType.TABLE}
                onClose={vi.fn()}
            />,
        );

        await userEvent.click(screen.getByRole('button', { name: 'Change' }));
        expect(screen.getByText('Choose chart type')).toBeInTheDocument();

        await userEvent.click(
            screen.getByRole('button', { name: 'Configure Table' }),
        );

        expect(screen.getByText('Configure controls')).toBeInTheDocument();
    });

    it('keeps focus on the selected card until Configure moves it to Change', async () => {
        renderSidebar(
            <ExplorerChartSidebar
                chartType={ChartType.TABLE}
                onClose={vi.fn()}
            />,
        );

        // Nothing is stolen on mount; Configure is where the panel opens.
        expect(document.body).toHaveFocus();

        await userEvent.click(screen.getByText('Change'));
        expect(
            screen.getByRole('textbox', { name: 'Search chart types' }),
        ).toHaveFocus();

        await userEvent.click(screen.getByText('Select chart'));
        expect(screen.getByText('Select chart')).toHaveFocus();

        await userEvent.click(
            screen.getByRole('button', { name: 'Configure Table' }),
        );
        expect(screen.getByText('Change')).toHaveFocus();
    });

    it('falls back to the panel title when Change is not on screen', async () => {
        const store = createExplorerStore();
        store.dispatch(explorerActions.setIsEditMode(true));
        renderSidebar(
            <ExplorerChartSidebar
                chartType={ChartType.TABLE}
                onClose={vi.fn()}
            />,
            store,
        );

        await userEvent.click(screen.getByText('Change'));
        // Authoring returns to Configure and takes Change away with it; the
        // step still has somewhere to land.
        await act(async () =>
            store.dispatch(
                explorerActions.startChartTypeAuthoring({
                    dataAppVizUuid: null,
                }),
            ),
        );

        expect(screen.getByText('Generated options')).toHaveFocus();
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
