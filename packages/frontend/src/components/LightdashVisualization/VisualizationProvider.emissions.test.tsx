import { ChartType, type ChartConfig } from '@lightdash/common';
import { act, cleanup } from '@testing-library/react';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
    StrictMode,
    useSyncExternalStore,
    type FC,
    type PropsWithChildren,
    type ReactElement,
} from 'react';
import { MemoryRouter } from 'react-router';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
    buildInitialExplorerState,
    createExplorerStore,
    explorerActions,
} from '../../features/explorer/store';
import ChartColorMappingContextProvider from '../../hooks/useChartColorConfig/ChartColorMappingContextProvider';
import { defaultState } from '../../providers/Explorer/defaultState';
import { renderWithProviders } from '../../testing/testUtils';
import {
    cartesianCases,
    columnOrder,
    otherCases,
    results,
} from './visualizationDifferential.fixtures';
import VisualizationProvider from './VisualizationProvider';

// Pins what every chart type reports to its owner through
// onChartConfigChange: the distinct payload sequence on mount, the final
// explorer-store config and how many calls the owner receives.

vi.mock('@shopify/react-web-worker', () => ({
    createWorkerFactory: () => () => ({}),
    useWorker: () => ({}),
}));

vi.mock('../../hooks/useServerOrClientFeatureFlag', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useServerFeatureFlag: () => ({ data: undefined }),
}));

const cases: { name: string; chartConfig: ChartConfig }[] = [
    {
        name: 'cartesian empty',
        chartConfig: { type: ChartType.CARTESIAN, config: undefined },
    },
    ...cartesianCases(0)
        .filter((c) => !c.pivotColumns && c.results === results)
        .slice(0, 12),
    ...otherCases(),
    { name: 'map empty', chartConfig: { type: ChartType.MAP } },
    { name: 'custom empty', chartConfig: { type: ChartType.CUSTOM } },
    {
        name: 'data app viz empty',
        chartConfig: { type: ChartType.DATA_APP_VIZ },
    },
];

const Shell: FC<PropsWithChildren<{ strict: boolean }>> = ({
    strict,
    children,
}) => {
    const tree = (
        <MemoryRouter>
            <ChartColorMappingContextProvider>
                {children}
            </ChartColorMappingContextProvider>
        </MemoryRouter>
    );
    return strict ? <StrictMode>{tree}</StrictMode> : tree;
};

const flush = () =>
    act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

// Consecutive duplicates collapse: the owner sees the same states in order.
const distinct = (configs: ChartConfig[]) =>
    configs.filter(
        (c, i) =>
            i === 0 || JSON.stringify(c) !== JSON.stringify(configs[i - 1]),
    );

const props = {
    initialPivotDimensions: undefined,
    resultsData: results,
    isLoading: false,
    columnOrder,
    colorPalette: ['#111111', '#222222', '#333333'],
};

const recordWithoutFeedback = async (
    chartConfig: ChartConfig,
    strict: boolean,
) => {
    const calls: ChartConfig[] = [];
    const onChartConfigChange = (c: ChartConfig) => calls.push(c);
    const ui = (): ReactElement => (
        <Shell strict={strict}>
            <VisualizationProvider
                {...props}
                chartConfig={chartConfig}
                onChartConfigChange={onChartConfigChange}
            />
        </Shell>
    );
    const { rerender } = renderWithProviders(ui());
    await flush();
    const mountCalls = calls.length;
    rerender(ui());
    rerender(ui());
    await flush();
    return {
        sequence: distinct(calls),
        mountCalls,
        idleCalls: calls.length - mountCalls,
    };
};

const ExplorerHost: FC<{ store: ReturnType<typeof createExplorerStore> }> = ({
    store,
}) => {
    const chartConfig = useSyncExternalStore(
        store.subscribe,
        () => store.getState().explorer.unsavedChartVersion.chartConfig,
    );
    return (
        <VisualizationProvider
            {...props}
            chartConfig={chartConfig}
            onChartConfigChange={(c) =>
                store.dispatch(
                    explorerActions.setChartConfig({ chartConfig: c }),
                )
            }
        />
    );
};

const recordWithExplorerStore = async (
    chartConfig: ChartConfig,
    strict: boolean,
) => {
    const store = createExplorerStore({
        explorer: buildInitialExplorerState({
            isEditMode: true,
            initialState: {
                unsavedChartVersion: {
                    ...defaultState.unsavedChartVersion,
                    tableName: 'orders',
                    metricQuery: results.metricQuery,
                    chartConfig,
                },
            },
        }),
    });
    const dispatched: ChartConfig[] = [];
    store.subscribe(() =>
        dispatched.push(
            store.getState().explorer.unsavedChartVersion.chartConfig,
        ),
    );
    renderWithProviders(
        <Shell strict={strict}>
            <ExplorerHost store={store} />
        </Shell>,
    );
    await flush();
    return {
        storeSequence: distinct(dispatched),
        dispatches: dispatched.length,
        final: store.getState().explorer.unsavedChartVersion.chartConfig,
    };
};

// Pinned results live beside the test, one JSON value per line; regenerate
// deliberately with UPDATE_EMISSIONS=1 and review the diff. Payloads are
// stored once, by hash.
const pinPath = path.join(__dirname, 'VisualizationProvider.emissions.jsonl');
type Pins = {
    cases: Record<string, unknown>;
    payloads: Record<string, unknown>;
};
const readPins = (): Pins => {
    const pins: Pins = { cases: {}, payloads: {} };
    if (!existsSync(pinPath)) return pins;
    readFileSync(pinPath, 'utf8')
        .split('\n')
        .filter(Boolean)
        .forEach((line) => {
            const [kind, key, value] = JSON.parse(line);
            pins[kind as keyof Pins][key] = value;
        });
    return pins;
};
const writePins = (pins: Pins) =>
    writeFileSync(
        pinPath,
        (['cases', 'payloads'] as const)
            .flatMap((kind) =>
                Object.entries(pins[kind])
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, value]) => JSON.stringify([kind, key, value])),
            )
            .join('\n')
            .concat('\n'),
    );
const pinned = readPins();
const observed: Pins = { cases: {}, payloads: {} };

const byHash = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(byHash);
    if (value && typeof value === 'object' && 'type' in value) {
        const json = JSON.stringify(value);
        const hash = createHash('sha1').update(json).digest('hex').slice(0, 10);
        observed.payloads[hash] = JSON.parse(json);
        return hash;
    }
    if (value && typeof value === 'object')
        return Object.fromEntries(
            Object.entries(value).map(([k, v]) => [k, byHash(v)]),
        );
    return value;
};

const pin = (key: string, value: unknown) => {
    const hashed = byHash(value);
    observed.cases[key] = hashed;
    if (process.env.UPDATE_EMISSIONS) return;
    expect(hashed).toEqual(pinned.cases[key]);
};

describe('VisualizationProvider emissions', () => {
    afterEach(() => cleanup());
    afterAll(() => {
        if (process.env.UPDATE_EMISSIONS) writePins(observed);
    });

    describe.each([false, true])('strict mode %s', (strict) => {
        it.each(cases.map((c) => [c.name, c.chartConfig] as const))(
            'without feedback: %s',
            async (name, chartConfig) => {
                pin(
                    `strict=${strict} no-feedback ${name}`,
                    await recordWithoutFeedback(chartConfig, strict),
                );
            },
        );

        it.each(cases.map((c) => [c.name, c.chartConfig] as const))(
            'explorer store: %s',
            async (name, chartConfig) => {
                pin(
                    `strict=${strict} explorer-store ${name}`,
                    await recordWithExplorerStore(chartConfig, strict),
                );
            },
        );
    });
});
