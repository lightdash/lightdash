import { ChartType } from '@lightdash/common';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LightdashVisualization from '.';
import { renderWithProviders } from '../../testing/testUtils';

const mocks = vi.hoisted(() => ({
    useVisualizationContext: vi.fn(),
}));

vi.mock('./useVisualizationContext', () => ({
    useVisualizationContext: mocks.useVisualizationContext,
}));

vi.mock('../SimpleTable', () => ({
    default: ({ enableContextMenu }: { enableContextMenu?: boolean }) => (
        <div
            data-testid="table"
            data-context-menu-enabled={String(enableContextMenu)}
        />
    ),
}));
vi.mock('../SimplePieChart', () => ({
    default: ({ enableContextMenu }: { enableContextMenu?: boolean }) => (
        <div
            data-testid="pie"
            data-context-menu-enabled={String(enableContextMenu)}
        />
    ),
}));
vi.mock('../FunnelChart', () => ({
    default: ({ enableContextMenu }: { enableContextMenu?: boolean }) => (
        <div
            data-testid="funnel"
            data-context-menu-enabled={String(enableContextMenu)}
        />
    ),
}));

const renderVisualization = (
    chartType: ChartType,
    enableContextMenu?: boolean,
) => {
    mocks.useVisualizationContext.mockReturnValue({
        visualizationConfig: { chartType },
        minimal: false,
        apiErrorDetail: null,
    });

    return renderWithProviders(
        <LightdashVisualization enableContextMenu={enableContextMenu} />,
    );
};

describe('LightdashVisualization context menus', () => {
    afterEach(() => {
        cleanup();
        mocks.useVisualizationContext.mockReset();
    });

    it.each([
        [ChartType.TABLE, 'table'],
        [ChartType.PIE, 'pie'],
        [ChartType.FUNNEL, 'funnel'],
    ])('disables menus for %s visualizations', (chartType, testId) => {
        renderVisualization(chartType, false);

        expect(screen.getByTestId(testId)).toHaveAttribute(
            'data-context-menu-enabled',
            'false',
        );
    });

    it('keeps context menus enabled by default', () => {
        renderVisualization(ChartType.PIE);

        expect(screen.getByTestId('pie')).toHaveAttribute(
            'data-context-menu-enabled',
            'true',
        );
    });
});
