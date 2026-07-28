import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';

/**
 * Guards the screenshot-readiness contract for custom (Vega-Lite)
 * visualizations. Every dashboard tile must eventually call
 * onScreenshotReady or onScreenshotError — the export's ready indicator
 * only mounts once all tiles have reported, so a tile that settles into a
 * rendered empty state ("No data available" / "No visualization loaded")
 * without signaling makes dashboard exports hang until timeout
 * (PROD-9255: custom-viz tiles with zero rows stalled exports for 10
 * minutes and 502'd the sync export API).
 */

const { mockContext } = vi.hoisted(() => ({
    mockContext: {
        current: {} as Record<string, unknown>,
    },
}));

vi.mock('react-vega', () => ({
    VegaEmbed: () => null,
}));

vi.mock('../LightdashVisualization/types', () => ({
    isCustomVisualizationConfig: () => true,
}));

vi.mock('../LightdashVisualization/useVisualizationContext', () => ({
    useVisualizationContext: () => mockContext.current,
}));

// eslint-disable-next-line import/first
import CustomVisualization from './index';

const buildContext = (
    overrides: Partial<{
        isLoading: boolean;
        spec: object | undefined;
        series: object[];
    }> = {},
) => ({
    isLoading: overrides.isLoading ?? false,
    visualizationConfig: {
        chartConfig: {
            validConfig: {
                spec: 'spec' in overrides ? overrides.spec : { mark: 'bar' },
            },
            series: overrides.series ?? [{ x: 'a', y: 1 }],
        },
    },
    resultsData: { setFetchAll: vi.fn() },
    containerWidth: 400,
    containerHeight: 300,
});

describe('CustomVisualization screenshot readiness (PROD-9255)', () => {
    beforeEach(() => {
        mockContext.current = buildContext();
    });

    it('signals ready when the query returns zero rows', async () => {
        mockContext.current = buildContext({ series: [] });
        const onScreenshotReady = vi.fn();

        renderWithProviders(
            <CustomVisualization onScreenshotReady={onScreenshotReady} />,
        );

        await waitFor(() => expect(onScreenshotReady).toHaveBeenCalled());
    });

    it('signals ready when the chart has no Vega spec', async () => {
        mockContext.current = buildContext({ spec: undefined });
        const onScreenshotReady = vi.fn();

        renderWithProviders(
            <CustomVisualization onScreenshotReady={onScreenshotReady} />,
        );

        await waitFor(() => expect(onScreenshotReady).toHaveBeenCalled());
    });

    it('does not signal while results are still loading', async () => {
        mockContext.current = buildContext({ isLoading: true, series: [] });
        const onScreenshotReady = vi.fn();

        renderWithProviders(
            <CustomVisualization onScreenshotReady={onScreenshotReady} />,
        );

        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(onScreenshotReady).not.toHaveBeenCalled();
    });

    it('leaves signaling to onEmbed when the chart has data', async () => {
        const onScreenshotReady = vi.fn();

        renderWithProviders(
            <CustomVisualization onScreenshotReady={onScreenshotReady} />,
        );

        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(onScreenshotReady).not.toHaveBeenCalled();
    });
});
