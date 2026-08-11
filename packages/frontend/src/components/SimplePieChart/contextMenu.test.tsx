import { cleanup, screen } from '@testing-library/react';
import { type ComponentType } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SimplePieChart from '.';
import { renderWithProviders } from '../../testing/testUtils';
import FunnelChart from '../FunnelChart';

vi.mock('../../hooks/echarts/useEchartsPieConfig', () => ({
    default: () => ({ eChartsOption: {} }),
}));

vi.mock('../../hooks/echarts/useEchartsFunnelConfig', () => ({
    default: () => ({}),
}));

vi.mock('../../hooks/echarts/useLegendDoubleClickSelection', () => ({
    useLegendDoubleClickSelection: () => ({
        selectedLegends: undefined,
        onLegendChange: vi.fn(),
    }),
}));

vi.mock('../../hooks/useContextMenuPermissions', () => ({
    useContextMenuPermissions: () => ({
        shouldShowMenu: true,
        canViewUnderlyingData: true,
    }),
}));

vi.mock('../LightdashVisualization/useVisualizationContext', () => ({
    useVisualizationContext: () => ({
        chartRef: { current: null },
        isLoading: false,
        resultsData: { setFetchAll: vi.fn() },
        minimal: false,
    }),
}));

vi.mock('../EChartsReactWrapper', () => ({
    default: ({ onEvents }: { onEvents?: Record<string, unknown> }) => (
        <div
            data-testid="echarts"
            data-events={Object.keys(onEvents ?? {})
                .sort()
                .join(',')}
        />
    ),
}));

vi.mock('./PieChartContextMenu', () => ({
    default: () => <div data-testid="pie-menu" />,
}));

vi.mock('../FunnelChart/FunnelChartContextMenu', () => ({
    default: () => <div data-testid="funnel-menu" />,
}));

type ChartComponentProps = {
    isInDashboard: boolean;
    enableContextMenu?: boolean;
};

const charts: Array<{
    name: string;
    Component: ComponentType<ChartComponentProps>;
    menuTestId: string;
}> = [
    { name: 'pie', Component: SimplePieChart, menuTestId: 'pie-menu' },
    { name: 'funnel', Component: FunnelChart, menuTestId: 'funnel-menu' },
];

describe('non-cartesian chart context menus', () => {
    afterEach(cleanup);

    it.each(charts)(
        'keeps legend interaction but removes analytical events for $name charts',
        ({ Component, menuTestId }) => {
            renderWithProviders(
                <Component isInDashboard={false} enableContextMenu={false} />,
            );

            expect(screen.getByTestId('echarts')).toHaveAttribute(
                'data-events',
                'legendselectchanged',
            );
            expect(screen.queryByTestId(menuTestId)).toBeNull();
        },
    );

    it.each(charts)(
        'preserves analytical events by default for $name charts',
        ({ Component, menuTestId }) => {
            renderWithProviders(<Component isInDashboard={false} />);

            expect(screen.getByTestId('echarts')).toHaveAttribute(
                'data-events',
                'click,legendselectchanged,oncontextmenu',
            );
            expect(screen.getByTestId(menuTestId)).toBeVisible();
        },
    );
});
