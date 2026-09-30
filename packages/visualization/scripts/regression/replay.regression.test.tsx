/**
 * Regression replay: `run.mjs` copies this file into the frontend of a base
 * checkout and of this one, runs it on the same cases, and compares what the
 * web app's chart hooks produced. Not a test of its own: it records.
 */
import {
    ChartType,
    QueryHistoryStatus,
    type ChartConfig,
} from '@lightdash/common';
import { act, cleanup, screen } from '@testing-library/react';
import { readFileSync, writeFileSync } from 'fs';
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
import MantineProvider from '../../providers/MantineProvider';
import { renderWithProviders } from '../../testing/testUtils';
import { isCartesianVisualizationConfig } from './types';
import { useVisualizationContext } from './useVisualizationContext';
import VisualizationProvider from './VisualizationProvider';

const SCHEME = (process.env.REPLAY_SCHEME ?? 'light') as 'light' | 'dark';
const FLAG = process.env.REPLAY_FLAG === '1';
const DASH = process.env.REPLAY_DASH === '1';
const SHARED = process.env.REPLAY_SHARED === '1';

const workerCalls: unknown[] = [];
vi.mock('@shopify/react-web-worker', async () => {
    const pivot = await import('@lightdash/common/src/pivot/pivotQueryResults');
    const worker = {
        convertSqlPivotedRowsToPivotData: async (args: unknown) => {
            workerCalls.push(JSON.parse(JSON.stringify(args)));
            return (pivot as any).convertSqlPivotedRowsToPivotData(args);
        },
    };
    return { createWorkerFactory: () => () => worker, useWorker: () => worker };
});
vi.mock('../../hooks/useServerOrClientFeatureFlag', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useServerFeatureFlag: () => ({
        data:
            process.env.REPLAY_FLAG === '1'
                ? { id: 'x', enabled: true }
                : undefined,
    }),
}));

const input = JSON.parse(readFileSync(process.env.REPLAY_CASES!, 'utf8'));
const { fields, metricQuery, columnOrder, colorPalette } = input;
const GAUGE = {
    tileFontSize: 21,
    detailsFontSize: 64,
    lineSize: 64,
    radius: 135,
};
const IDS = [...columnOrder, 'missing'];

/* ---------- serialisation that also exercises functions ---------- */
const SCALARS = [
    1234.5,
    0,
    -3,
    'completed',
    '2024-01-10',
    '2024-01-10T02:30:00.000Z',
    null,
];
const show = (v: unknown) => {
    try {
        const s = JSON.stringify(v);
        return s === undefined ? String(v) : s;
    } catch {
        return String(v);
    }
};
const call = (fn: Function, args: unknown[]) => {
    try {
        return show(fn(...args));
    } catch (e) {
        return `throw ${(e as Error)?.message ?? e}`;
    }
};

/** Parameters an ECharts formatter gets, built from the option's own data. */
const echartsParams = (option: any) => {
    const series: any[] = Array.isArray(option?.series)
        ? option.series
        : option?.series
          ? [option.series]
          : [];
    const src =
        option?.dataset?.source ??
        (Array.isArray(option?.dataset)
            ? option.dataset[0]?.source
            : undefined);
    const rowAt = (i: number, s: any) =>
        Array.isArray(src) ? src[i] : s?.data?.[i];
    const one = (s: any, i: number, row: number) => {
        const data = rowAt(row, s);
        const value =
            data && typeof data === 'object' && 'value' in data
                ? data.value
                : data;
        return {
            componentType: 'series',
            seriesType: s?.type,
            seriesIndex: i,
            seriesName: s?.name ?? `series${i}`,
            dataIndex: row,
            name:
                data?.name ??
                (Array.isArray(src) && src[row]
                    ? Object.values(src[row])[0]
                    : 'n'),
            data,
            value,
            encode: s?.encode
                ? Object.fromEntries(
                      Object.entries(s.encode).map(([k, v]) => [
                          k,
                          Array.isArray(v) ? v : [v],
                      ]),
                  )
                : { x: [0], y: [1] },
            dimensionNames:
                s?.dimensions ??
                (data && typeof data === 'object' ? Object.keys(data) : []),
            percent: 25,
            marker: '<m>',
            color: '#000000',
            axisValue:
                Array.isArray(src) && src[row]
                    ? Object.values(src[row])[0]
                    : 'n',
            axisValueLabel: 'label',
            treePathInfo: [
                { name: 'root', value: 1 },
                { name: 'n', value: 1 },
            ],
        };
    };
    return {
        single: [
            series[0] ? one(series[0], 0, 0) : undefined,
            series[0] ? one(series[0], 0, 1) : undefined,
        ],
        list: [
            series.map((s, i) => one(s, i, 0)),
            series.map((s, i) => one(s, i, 1)),
        ],
    };
};

const serialise = (
    root: unknown,
    probeFn: (fn: Function, key: string) => unknown,
) => {
    const seen = new WeakSet();
    const walk = (v: any, key: string, depth: number): unknown => {
        if (typeof v === 'function') return probeFn(v, key);
        if (v === undefined) return undefined;
        if (v === null || typeof v !== 'object') return v;
        if (v instanceof Date) return `Date(${v.toISOString()})`;
        if (seen.has(v)) return '[cycle]';
        if (depth > 12) return '[deep]';
        if (v.$$typeof) return '[react]';
        seen.add(v);
        const out = Array.isArray(v)
            ? v.map((x, i) => walk(x, String(i), depth + 1))
            : v instanceof Map
              ? {
                    __map: [...v.entries()].map(([k, x]) => [
                        k,
                        walk(x, k, depth + 1),
                    ]),
                }
              : v instanceof Set
                ? { __set: [...v].map((x, i) => walk(x, String(i), depth + 1)) }
                : Object.fromEntries(
                      Object.entries(v)
                          .map(([k, x]) => [k, walk(x, k, depth + 1)])
                          .filter(([, x]) => x !== undefined),
                  );
        seen.delete(v);
        return out;
    };
    return walk(root, '', 0);
};

const serialiseOption = (option: unknown) => {
    const params = echartsParams(option);
    return serialise(option, (fn, key) => {
        if (!/formatter$/i.test(key)) return '[fn]';
        return {
            scalars: SCALARS.map((s) => call(fn, [s])),
            single: params.single.map((p) => call(fn, [p])),
            list: params.list.map((p) => call(fn, [p])),
        };
    });
};

const serialiseConfig = (config: unknown) =>
    serialise(config, (fn, key) =>
        /^(get|is)[A-Z]/.test(key) && fn.length <= 1
            ? Object.fromEntries(IDS.map((id) => [id, call(fn, [id])]))
            : '[fn]',
    );

/* ---------- the app's way ---------- */
const useAppOption = (type: ChartType) => {
    const { visualizationConfig } = useVisualizationContext();
    const saved = isCartesianVisualizationConfig(visualizationConfig)
        ? visualizationConfig.chartConfig.dirtyEchartsConfig?.legend?.selected
        : undefined;
    const { selectedLegends } = useLegendDoubleClickSelection(saved);
    const cartesian = useEchartsCartesianConfig(
        selectedLegends,
        DASH,
        DASH ? 280 : 600,
    );
    const pie = useEchartsPieConfig();
    const funnel = useEchartsFunnelConfig();
    const treemap = useEchartsTreemapConfig(DASH);
    const gauge = useEchartsGaugeConfig({ isInDashboard: DASH, ...GAUGE });
    const sankey = useEchartsSankeyConfig(DASH);
    switch (type) {
        case ChartType.PIE:
            return pie;
        case ChartType.FUNNEL:
            return funnel;
        case ChartType.TREEMAP:
            return treemap;
        case ChartType.GAUGE:
            return gauge;
        case ChartType.SANKEY:
            return sankey;
        case ChartType.CARTESIAN:
            return cartesian;
        default:
            return null;
    }
};

const live: { chartConfig?: any } = {};

const Probe = ({ type, id = 'probe' }: { type: ChartType; id?: string }) => {
    const app = useAppOption(type);
    const ctx = useVisualizationContext();
    if (id === 'probe')
        live.chartConfig = (ctx.visualizationConfig as any)?.chartConfig;
    let snapshot: string;
    try {
        snapshot = JSON.stringify({
            option: serialiseOption(app),
            config: serialiseConfig(
                (ctx.visualizationConfig as any)?.chartConfig,
            ),
            chartType: ctx.visualizationConfig?.chartType,
            colorPalette: ctx.colorPalette,
            pivotDimensions: ctx.pivotDimensions,
            minimal: ctx.minimal,
        });
    } catch (e) {
        snapshot = JSON.stringify({ probeError: String(e) });
    }
    return <div data-testid={id} data-snapshot={snapshot} />;
};

const RoundTrip = ({ initial, results, pivotColumns, id }: any) => {
    const [chartConfig, setChartConfig] = useState<ChartConfig>(initial);
    return (
        <VisualizationProvider
            chartConfig={chartConfig}
            onChartConfigChange={setChartConfig}
            initialPivotDimensions={pivotColumns}
            resultsData={results}
            isLoading={false}
            columnOrder={columnOrder}
            colorPalette={colorPalette}
            minimal={DASH}
            isDashboard={DASH}
            containerWidth={DASH ? 280 : undefined}
            containerHeight={DASH ? 200 : undefined}
        >
            <Probe type={initial.type} id={id} />
        </VisualizationProvider>
    );
};

const ACTIONS: Record<string, [string, unknown[]][]> = {
    [ChartType.CARTESIAN]: [
        ['setXField', ['orders_channel']],
        ['addSingleSeries', ['orders_count']],
        ['setStacking', [true]],
        ['setType', ['line', false, true]],
        ['setFlipAxis', [true]],
        ['setShowGridX', [true]],
        ['setColorByCategory', [true]],
        ['setLegend', [{ show: true, orient: 'vertical' }]],
        ['updateYField', [0, 'orders_profit']],
        ['removeSingleSeries', [0]],
    ],
    [ChartType.PIE]: [
        ['toggleDonut', []],
        ['groupAdd', ['orders_channel']],
        ['metricChange', ['orders_count']],
        ['valueLabelChange', ['outside']],
        ['toggleShowPercentage', []],
        ['groupColorChange', ['completed', '#123456']],
        ['groupRemove', ['orders_channel']],
    ],
    [ChartType.FUNNEL]: [
        ['onFieldChange', ['orders_count']],
        ['toggleShowLegend', []],
        ['setDataInput', ['column']],
    ],
    [ChartType.TREEMAP]: [
        ['sizeMetricChange', ['orders_count']],
        ['toggleDynamicColors', []],
        ['setLeafDepth', [2]],
        ['colorMetricChange', ['orders_profit']],
    ],
    [ChartType.SANKEY]: [
        ['onOrientChange', ['vertical']],
        ['onMetricFieldChange', ['orders_count']],
        ['onSourceFieldChange', ['orders_channel']],
    ],
    [ChartType.BIG_NUMBER]: [
        ['setSelectedField', ['orders_count']],
        ['setShowComparison', [true]],
        ['setComparisonFormat', ['percentage']],
        ['setFlipColors', [true]],
        ['setShowBigNumberLabel', [false]],
    ],
    [ChartType.TABLE]: [
        ['setShowTableNames', [true]],
        ['setShowColumnCalculation', [true]],
        ['updateColumnProperty', ['orders_status', { visible: false }]],
        ['setShowSubtotals', [true]],
    ],
    [ChartType.GAUGE]: [
        ['setSelectedField', ['orders_count']],
        ['setMax', [100]],
        ['setShowAxisLabels', [true]],
    ],
};
const withActions = new Set<string>();
// Charts that share the page with each case: a pie by status and a chart
// grouped by channel, which claim colours first.
const neighbours = [
    input.cases.find((c: any) => c.name.startsWith('pie 1 ')),
    input.cases.find((c: any) => c.pivotColumns?.length),
].filter(Boolean);

const out: unknown[] = [];
describe(`replay ${SCHEME}${FLAG ? ' flag' : ''}`, () => {
    afterEach(() => cleanup());
    afterAll(() => writeFileSync(process.env.REPLAY_OUT!, JSON.stringify(out)));
    it.each(input.cases.map((c: any, i: number) => [i, c]))(
        'case %i',
        async (_i, c: any) => {
            const results = {
                queryUuid: 'q',
                queryStatus: QueryHistoryStatus.READY,
                rows: c.results.rows,
                totalResults: c.results.rows.length,
                pivotDetails: c.results.pivotDetails,
                resolvedTimezone: c.results.resolvedTimezone,
                isInitialLoading: false,
                isFetchingFirstPage: false,
                isFetchingRows: false,
                isFetchingAllPages: false,
                fetchMoreRows: () => {},
                refetchRows: async () => {},
                setFetchAll: () => {},
                fetchAll: false,
                hasFetchedAllRows: true,
                totalClientFetchTimeMs: undefined,
                error: null,
                metricQuery,
                fields,
            };
            const steps: unknown[] = [];
            const read = () =>
                JSON.parse(
                    screen.getByTestId('probe').getAttribute('data-snapshot') ??
                        'null',
                );
            let error: string | undefined;
            try {
                renderWithProviders(
                    <MantineProvider env="test" forceColorScheme={SCHEME}>
                        <MemoryRouter>
                            <ChartColorMappingContextProvider>
                                {SHARED &&
                                    neighbours.map((n: any, k: number) => (
                                        <RoundTrip
                                            key={k}
                                            id={`n${k}`}
                                            initial={n.chartConfig}
                                            results={{
                                                ...results,
                                                rows: n.results.rows,
                                                pivotDetails:
                                                    n.results.pivotDetails,
                                            }}
                                            pivotColumns={n.pivotColumns}
                                        />
                                    ))}
                                <RoundTrip
                                    initial={c.chartConfig}
                                    results={results}
                                    pivotColumns={c.pivotColumns}
                                />
                            </ChartColorMappingContextProvider>
                        </MemoryRouter>
                    </MantineProvider>,
                );
                await act(async () => {});
                await act(async () => {
                    await new Promise((r) => setTimeout(r, 0));
                });
                steps.push({
                    step: 'mount',
                    workerCalls: workerCalls.splice(0),
                    ...read(),
                });
                const type = c.chartConfig.type as string;
                if (!withActions.has(type) && ACTIONS[type]) {
                    withActions.add(type);
                    for (const [name, args] of ACTIONS[type]) {
                        let actionError: string | undefined;
                        await act(async () => {
                            const fn = live.chartConfig?.[name];
                            if (typeof fn !== 'function') {
                                actionError = 'missing';
                                return;
                            }
                            try {
                                fn(...args);
                            } catch (e) {
                                actionError = String(e);
                            }
                        });
                        await act(async () => {
                            await new Promise((r) => setTimeout(r, 0));
                        });
                        steps.push({
                            step: name,
                            actionError,
                            workerCalls: workerCalls.splice(0),
                            ...read(),
                        });
                    }
                }
            } catch (e) {
                error = String(e);
            }
            out.push({ name: c.name, steps, error });
            expect(true).toBe(true);
        },
    );
});
