import { ChartType, type ChartConfig } from '@lightdash/common';
import { type UnknownAction } from '@reduxjs/toolkit';
import { act, cleanup } from '@testing-library/react';
import { StrictMode, useSyncExternalStore, type FC } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    buildInitialExplorerState,
    createExplorerStore,
    explorerActions,
    explorerHistoryActions,
} from '../../features/explorer/store';
import {
    bigNumberEditorActions,
    cartesianEditorActions,
    funnelEditorActions,
    gaugeEditorActions,
    pieEditorActions,
    tableEditorActions,
    treemapEditorActions,
    type VisualizationStore,
} from '../../features/visualization/store';
import { useVisualizationStore } from '../../features/visualization/store/hooks';
import ChartColorMappingContextProvider from '../../hooks/useChartColorConfig/ChartColorMappingContextProvider';
import { defaultState } from '../../providers/Explorer/defaultState';
import { renderWithProviders } from '../../testing/testUtils';
import {
    cartesianCases,
    columnOrder,
    deepDiff,
    otherCases,
    results,
} from './visualizationDifferential.fixtures';
import VisualizationProvider from './VisualizationProvider';

// Drives the real provider against an explorer store with history, wired as
// the explorer wires it, and diffs the chart every undo and redo lands on
// against the chart it should restore.

vi.mock('@shopify/react-web-worker', () => ({
    createWorkerFactory: () => () => ({}),
    useWorker: () => ({}),
}));

type Case = {
    name: string;
    chartConfig: ChartConfig;
    pivotColumns: string[] | undefined;
    results: typeof results;
};

const RANDOM_CARTESIAN_CASES = 20;
// A cartesian chart with no config at all is left out: seeding it again adds the new-chart axis tick default
const cases: Case[] = [
    ...cartesianCases(RANDOM_CARTESIAN_CASES).map((c, index) => ({
        ...c,
        name: `${index} ${c.name}`,
        pivotColumns: c.pivotColumns,
    })),
    ...[
        ...otherCases(),
        { name: 'map empty', chartConfig: { type: ChartType.MAP } },
        { name: 'custom empty', chartConfig: { type: ChartType.CUSTOM } },
    ].map((c) => ({ ...c, pivotColumns: undefined, results })),
];

// One edit a user makes in each chart type's config panel
const userEdit = (type: ChartType): UnknownAction | null => {
    switch (type) {
        case ChartType.CARTESIAN:
            return cartesianEditorActions.gridMerge({ containLabel: false });
        case ChartType.PIE:
            return pieEditorActions.toggleDonut();
        case ChartType.BIG_NUMBER:
            return bigNumberEditorActions.toggleShowBigNumberLabel();
        case ChartType.FUNNEL:
            return funnelEditorActions.toggleShowLegend();
        case ChartType.GAUGE:
            return gaugeEditorActions.addSection();
        case ChartType.TREEMAP:
            return treemapEditorActions.toggleDynamicColors();
        case ChartType.TABLE:
            return tableEditorActions.toggle('hideRowNumbers');
        default:
            return null;
    }
};

type ExplorerStore = ReturnType<typeof createExplorerStore>;
type ExplorerState = ReturnType<ExplorerStore['getState']>;

let visualizationStore: VisualizationStore | null = null;
const GrabVisualizationStore: FC = () => {
    visualizationStore = useVisualizationStore();
    return null;
};

const useStoreValue = <T,>(
    store: ExplorerStore,
    select: (state: ExplorerState) => T,
) => useSyncExternalStore(store.subscribe, () => select(store.getState()));

const Host: FC<{ store: ExplorerStore; resultsData: typeof results }> = ({
    store,
    resultsData,
}) => {
    const version = useStoreValue(store, (s) => s.explorer.unsavedChartVersion);
    const revision = useStoreValue(store, (s) => s.history.revision);
    return (
        <VisualizationProvider
            chartConfig={version.chartConfig}
            chartConfigRevision={revision}
            initialPivotDimensions={version.pivotConfig?.columns}
            initialPivotRows={version.pivotConfig?.rows}
            unsavedMetricQuery={version.metricQuery}
            resultsData={resultsData}
            isLoading={false}
            columnOrder={columnOrder}
            colorPalette={['#111111', '#222222', '#333333']}
            onChartConfigChange={(chartConfig) =>
                store.dispatch(explorerActions.setChartConfig({ chartConfig }))
            }
            onChartTypeChange={(chartType) =>
                store.dispatch(explorerActions.setChartType({ chartType }))
            }
            onPivotDimensionsChange={(fields = []) =>
                store.dispatch(explorerActions.setPivotColumns(fields))
            }
            onPivotRowsChange={(rows = []) =>
                store.dispatch(explorerActions.setPivotRows(rows))
            }
        >
            <GrabVisualizationStore />
        </VisualizationProvider>
    );
};

// Lets effects settle and ends the browser task, so the next dispatch is a new gesture
const settle = () =>
    act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

const run = async (c: Case, strict: boolean) => {
    const findings: string[] = [];
    const skipped: string[] = [];
    const store = createExplorerStore({
        explorer: buildInitialExplorerState({
            isEditMode: true,
            initialState: {
                unsavedChartVersion: {
                    ...defaultState.unsavedChartVersion,
                    tableName: 'orders',
                    metricQuery: c.results.metricQuery,
                    chartConfig: c.chartConfig,
                    pivotConfig: c.pivotColumns && { columns: c.pivotColumns },
                },
            },
        }),
    });
    const chart = () => store.getState().explorer.unsavedChartVersion;
    const expectChart = (label: string, expected: unknown) => {
        const diff = deepDiff(expected, chart());
        if (diff.length)
            findings.push(
                `${label}: chart drifted\n    ${diff.join('\n    ')}`,
            );
    };
    const expectHistory = (label: string, past: number, future: number) => {
        const history = store.getState().history;
        if (history.past.length !== past || history.future.length !== future)
            findings.push(
                `${label}: history is ${history.past.length} past / ${history.future.length} future, expected ${past} / ${future}`,
            );
    };
    const gesture = async (dispatchAll: () => void) => {
        act(dispatchAll);
        await settle();
    };
    const undo = () =>
        gesture(() => store.dispatch(explorerHistoryActions.undo()));
    const redo = () =>
        gesture(() => store.dispatch(explorerHistoryActions.redo()));

    const tree = (
        <MemoryRouter>
            <ChartColorMappingContextProvider>
                <Host store={store} resultsData={c.results} />
            </ChartColorMappingContextProvider>
        </MemoryRouter>
    );
    renderWithProviders(strict ? <StrictMode>{tree}</StrictMode> : tree);
    await settle();

    // The chart deriving its config on load is nothing to undo
    expectHistory('load', 0, 0);
    const settled = chart();

    // Every step is one gesture: undone, redone and undone again, it must land exactly
    const step = async (label: string, dispatchAll: () => void) => {
        await gesture(dispatchAll);
        if (deepDiff(settled, chart()).length === 0) {
            skipped.push(label);
            return;
        }
        expectHistory(label, 1, 0);
        const after = chart();
        await undo();
        expectChart(`undo of ${label}`, settled);
        expectHistory(`undo of ${label}`, 0, 1);
        await redo();
        expectChart(`redo of ${label}`, after);
        expectHistory(`redo of ${label}`, 1, 0);
        await undo();
        expectChart(`second undo of ${label}`, settled);
        // The editor starts over from the restored chart, so the same edit gives the same chart
        await gesture(dispatchAll);
        expectChart(`${label} again after undo`, after);
        expectHistory(`${label} again after undo`, 1, 0);
        await undo();
    };

    const edit = userEdit(c.chartConfig.type);
    if (edit)
        await step('config edit', () => visualizationStore?.dispatch(edit));
    if (c.chartConfig.type === ChartType.CARTESIAN) {
        await step('stacking', () =>
            visualizationStore?.dispatch(
                cartesianEditorActions.stackingApply({
                    stack: true,
                    pivotKeys: c.pivotColumns,
                }),
            ),
        );
    }
    await step('chart type switch', () =>
        store.dispatch(
            explorerActions.setChartType({
                chartType:
                    c.chartConfig.type === ChartType.TABLE
                        ? ChartType.PIE
                        : ChartType.TABLE,
            }),
        ),
    );
    await step('pivot change in two dispatches', () => {
        store.dispatch(explorerActions.setPivotColumns(['orders_channel']));
        store.dispatch(explorerActions.setPivotRows(['orders_status']));
    });
    // The results stay as fetched, as they do with auto-fetch off
    await step('field removal', () =>
        store.dispatch(
            explorerActions.removeField(c.results.metricQuery.dimensions[0]),
        ),
    );

    return { findings, skipped };
};

describe('explorer undo against the real visualization provider', () => {
    afterEach(() => {
        cleanup();
        visualizationStore = null;
    });

    describe.each([false, true])('strict mode %s', (strict) => {
        it.each(cases.map((c) => [c.name, c] as const))(
            '%s',
            async (_name, c) => {
                const { findings } = await run(c, strict);
                expect(findings).toEqual([]);
            },
        );
    });

    it('exercises a config edit for every chart type that has one', async () => {
        const unedited = new Set(
            cases
                .map((c) => c.chartConfig.type)
                .filter((type) => userEdit(type) !== null),
        );
        for (const c of cases) {
            if (!unedited.has(c.chartConfig.type)) continue;
            // eslint-disable-next-line no-await-in-loop
            const { skipped } = await run(c, false);
            cleanup();
            if (!skipped.includes('config edit'))
                unedited.delete(c.chartConfig.type);
        }
        expect([...unedited]).toEqual([]);
    });
});
