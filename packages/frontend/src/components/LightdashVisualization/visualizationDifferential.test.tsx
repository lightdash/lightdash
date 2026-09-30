import { ChartType, type ChartConfig } from '@lightdash/common';
import {
    renderChart,
    resolveChart,
    type ChartData,
} from '@lightdash/visualization';
import { getGaugeSizes } from '@lightdash/visualization/editor';
import { cleanup, screen } from '@testing-library/react';
import { writeFileSync } from 'fs';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import useEchartsCartesianConfig from '../../hooks/echarts/useEchartsCartesianConfig';
import useEchartsFunnelConfig from '../../hooks/echarts/useEchartsFunnelConfig';
import useEchartsGaugeConfig from '../../hooks/echarts/useEchartsGaugeConfig';
import useEchartsPieConfig from '../../hooks/echarts/useEchartsPieConfig';
import useEchartsSankeyConfig from '../../hooks/echarts/useEchartsSankeyConfig';
import useEchartsTreemapConfig from '../../hooks/echarts/useEchartsTreemapConfig';
import { useLegendDoubleClickSelection } from '../../hooks/echarts/useLegendDoubleClickSelection';
import ChartColorMappingContextProvider from '../../hooks/useChartColorConfig/ChartColorMappingContextProvider';
import { useVisualizationTheme } from '../../hooks/useVisualizationTheme';
import { renderWithProviders } from '../../testing/testUtils';
import { isCartesianVisualizationConfig } from './types';
import { useVisualizationContext } from './useVisualizationContext';
import {
    cartesianCases,
    columnOrder,
    deepDiff,
    fields,
    otherCases,
    results as baseResults,
} from './visualizationDifferential.fixtures';
import VisualizationProvider from './VisualizationProvider';

vi.mock('@shopify/react-web-worker', () => ({
    createWorkerFactory: () => () => ({}),
    useWorker: () => ({}),
}));
vi.mock('../../hooks/useServerOrClientFeatureFlag', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useServerFeatureFlag: () => ({ data: undefined }),
}));

const chartDataOf = (results: R): ChartData => ({
    rows: results.rows,
    fields,
    query: results.metricQuery,
    pivotDetails: results.pivotDetails,
    timezone: results.resolvedTimezone,
});

const chartViewOf = (chartConfig: ChartConfig, pivotColumns?: string[]) => ({
    chartConfig,
    pivotConfig: pivotColumns ? { columns: pivotColumns } : undefined,
    tableConfig: { columnOrder },
});

const resolveValid = (
    chartConfig: ChartConfig,
    results: R,
    pivotColumns?: string[],
): unknown =>
    resolveChart(chartViewOf(chartConfig, pivotColumns), chartDataOf(results), {
        colors: { palette: colorPalette },
    }).config;

const colorPalette = ['#111111', '#222222', '#333333', '#444444'];
const SIZE = { width: 600, height: 400 };
const plain = (value: unknown) => JSON.parse(JSON.stringify(value ?? null));

const useAppOption = (type: ChartType) => {
    const { visualizationConfig } = useVisualizationContext();
    const saved = isCartesianVisualizationConfig(visualizationConfig)
        ? visualizationConfig.chartConfig.dirtyEchartsConfig?.legend?.selected
        : undefined;
    const { selectedLegends } = useLegendDoubleClickSelection(saved);
    const cartesian = useEchartsCartesianConfig(
        selectedLegends,
        false,
        SIZE.width,
    );
    const pie = useEchartsPieConfig();
    const funnel = useEchartsFunnelConfig();
    const treemap = useEchartsTreemapConfig(false);
    const gauge = useEchartsGaugeConfig({
        isInDashboard: false,
        ...getGaugeSizes(SIZE),
    });
    const sankey = useEchartsSankeyConfig(false);
    switch (type) {
        case ChartType.PIE:
            return pie?.eChartsOption;
        case ChartType.FUNNEL:
            return funnel;
        case ChartType.TREEMAP:
            return treemap?.eChartsOption;
        case ChartType.GAUGE:
            return gauge?.eChartsOption;
        case ChartType.SANKEY:
            return sankey;
        default:
            return cartesian;
    }
};

type R = typeof baseResults;

const Probe = ({
    chartConfig,
    pivotColumns,
    results,
}: {
    chartConfig: ChartConfig;
    pivotColumns?: string[];
    results: R;
}) => {
    const appOption = useAppOption(chartConfig.type);
    const theme = useVisualizationTheme();
    const { isTouchDevice, visualizationConfig } = useVisualizationContext();
    const appValid = (
        visualizationConfig as { chartConfig?: { validConfig?: unknown } }
    )?.chartConfig?.validConfig;
    let resolved: unknown;
    try {
        resolved = resolveValid(chartConfig, results, pivotColumns);
    } catch (e) {
        resolved = { THREW: String(e) };
    }
    let headless: unknown;
    let error: string | undefined;
    try {
        const out = renderChart(
            chartViewOf(chartConfig, pivotColumns),
            chartDataOf(results),
            {
                theme,
                colors: { palette: colorPalette },
                size: SIZE,
                animation: true,
                tooltip: isTouchDevice ? 'inline' : 'body',
            },
        );
        headless = out.kind === 'echarts' ? out.option : undefined;
    } catch (e) {
        error = String(e);
    }
    return (
        <div
            data-testid="probe"
            data-app={JSON.stringify(plain(appOption))}
            data-headless={JSON.stringify(plain(headless))}
            data-error={error ?? ''}
            data-appvalid={JSON.stringify(plain(appValid))}
            data-resolved={JSON.stringify(plain(resolved))}
        />
    );
};

const RoundTrip = ({
    initial,
    results,
    pivotColumns,
}: {
    initial: ChartConfig;
    results: R;
    pivotColumns?: string[];
}) => {
    const [chartConfig, setChartConfig] = useState(initial);
    const live = process.env.REVIEW_ROUNDTRIP === '1';
    return (
        <VisualizationProvider
            chartConfig={live ? chartConfig : initial}
            onChartConfigChange={live ? setChartConfig : undefined}
            initialPivotDimensions={pivotColumns}
            resultsData={results}
            isLoading={false}
            columnOrder={columnOrder}
            colorPalette={colorPalette}
        >
            <Probe
                chartConfig={initial}
                pivotColumns={pivotColumns}
                results={results}
            />
        </VisualizationProvider>
    );
};

const renderBoth = (
    chartConfig: ChartConfig,
    results: R,
    pivotColumns?: string[],
) => {
    renderWithProviders(
        <MemoryRouter>
            <ChartColorMappingContextProvider>
                <RoundTrip
                    initial={chartConfig}
                    results={results}
                    pivotColumns={pivotColumns}
                />
            </ChartColorMappingContextProvider>
        </MemoryRouter>,
    );
    const probe = screen.getByTestId('probe');
    return {
        app: JSON.parse(probe.getAttribute('data-app') ?? 'null'),
        headless: JSON.parse(probe.getAttribute('data-headless') ?? 'null'),
        error: probe.getAttribute('data-error'),
        appValid: JSON.parse(probe.getAttribute('data-appvalid') ?? 'null'),
        resolved: JSON.parse(probe.getAttribute('data-resolved') ?? 'null'),
    };
};

const report: { name: string; diff: string[]; error?: string }[] = [];
const dump: unknown[] = [];
let total = 0;

/**
 * Differential test: the app's hooks and `renderChart` from
 * @lightdash/visualization on the same configs (seeded random cartesian
 * configs plus every other chart type). Asserts that neither side throws and
 * that the app and the package resolve the same valid config.
 *
 * The drawn options still differ in known places (series colors, legend
 * selection) that are being closed separately, so their diff is reported
 * rather than asserted: set REVIEW_OUT to write it, and REVIEW_DUMP to write
 * every case's output for comparing two builds.
 */
describe('visualization differential: app hooks vs renderChart', () => {
    afterEach(() => cleanup());
    afterAll(() => {
        if (process.env.REVIEW_OUT)
            writeFileSync(
                process.env.REVIEW_OUT,
                JSON.stringify({ total, failures: report }, null, 2),
            );
        if (process.env.REVIEW_DUMP)
            writeFileSync(
                process.env.REVIEW_DUMP,
                JSON.stringify({
                    fields,
                    metricQuery: baseResults.metricQuery,
                    columnOrder,
                    colorPalette,
                    cases: dump,
                }),
            );
    });

    const all = [
        ...cartesianCases(Number(process.env.REVIEW_RANDOM ?? 150)).map(
            (c) => ({ ...c }),
        ),
        ...otherCases().map((c) => ({
            ...c,
            results: baseResults,
            pivotColumns: undefined,
        })),
    ];

    it.each(all.map((c, i) => [i, c.name, c] as const))(
        'case %i %s',
        (_i, name, c) => {
            total += 1;
            let out;
            try {
                out = renderBoth(c.chartConfig, c.results, c.pivotColumns);
            } catch (e) {
                throw new Error(`app threw: ${e}`);
            }
            dump.push({
                name,
                chartConfig: c.chartConfig,
                pivotColumns: c.pivotColumns,
                results: {
                    rows: c.results.rows,
                    pivotDetails: c.results.pivotDetails,
                    resolvedTimezone: c.results.resolvedTimezone,
                },
                app: out.app,
                headless: out.headless,
                appValid: out.appValid,
                resolved: out.resolved,
            });
            if (
                out.app?.legend?.selected &&
                Object.keys(out.app.legend.selected).length === 0
            )
                delete out.app.legend.selected;
            const vdiff = deepDiff(out.appValid, out.resolved);
            if (vdiff.length)
                report.push({ name: `VALID ${name}`, diff: vdiff });
            const diff = deepDiff(out.app, out.headless);
            if (out.app === null || out.headless === null)
                report.push({
                    name,
                    diff: [
                        `NULLS app=${out.app === null} headless=${out.headless === null}`,
                    ],
                });
            if (diff.length || out.error) {
                report.push({ name, diff, error: out.error || undefined });
            }
            expect(out.error).toBe('');
            expect(vdiff).toEqual([]);
        },
    );
});
