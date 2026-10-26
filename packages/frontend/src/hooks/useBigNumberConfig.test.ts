import {
    ChartType,
    ComparisonFormatTypes,
    type BigNumber,
    type ItemsMap,
    type TableCalculationMetadata,
} from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { createElement, type FC, type PropsWithChildren } from 'react';
import { describe, expect, it } from 'vitest';
import {
    StateContext,
    type VisualizationState,
} from '../components/LightdashVisualization/context';
import {
    buildInitialVisualizationState,
    createVisualizationStore,
    tableCalculationsRenamed,
} from '../features/visualization/store';
import { withVisualizationStore } from '../testing/visualizationStore';
import { VisualizationStoreTestProvider } from '../testing/VisualizationStoreTestProvider';
import useBigNumberConfig from './useBigNumberConfig';

const render = (config?: BigNumber, itemsMap?: ItemsMap) =>
    renderHook(() => useBigNumberConfig(), {
        wrapper: withVisualizationStore(
            { type: ChartType.BIG_NUMBER, config },
            { itemsMap },
        ),
    });

describe('useBigNumberConfig', () => {
    it('applies the config defaults on mount', () => {
        const { result } = render(undefined);
        expect(result.current.validConfig).toMatchObject({
            showBigNumberLabel: true,
            showTableNamesInLabel: true,
            showComparison: false,
            comparisonFormat: ComparisonFormatTypes.RAW,
            flipColors: false,
            conditionalFormattings: [],
        });
    });

    it('sets values and toggles', () => {
        const { result } = render({ label: 'Orders' });
        act(() => result.current.setBigNumberLabel('Edited'));
        act(() => result.current.toggleShowComparison());
        expect(result.current.bigNumberLabel).toBe('Edited');
        expect(result.current.showComparison).toBe(true);
        expect(result.current.validConfig.label).toBe('Edited');
    });

    it('falls back to the first available field when the selected one is gone', () => {
        const itemsMap: ItemsMap = {
            orders_total: {
                name: 'orders_total',
                displayName: 'Total',
                sql: '1',
            },
        };
        const { result } = render({ selectedField: 'missing' }, itemsMap);
        expect(result.current.selectedField).toBe('orders_total');
        expect(result.current.validConfig.selectedField).toBe('orders_total');
    });

    describe('a renamed table calculation', () => {
        const tc = (name: string) => ({ name, displayName: name, sql: '1' });
        const items = (...names: string[]): ItemsMap =>
            Object.fromEntries(names.map((name) => [name, tc(name)]));

        const baseInputs: VisualizationState = {
            resultsData: undefined,
            itemsMap: undefined,
            colorPalette: [],
            columnOrder: [],
            pivotDimensions: undefined,
            initialPivotRows: undefined,
            parameters: undefined,
            unsavedMetricQuery: undefined,
            tableCalculationsMetadata: undefined,
            dashboardFilters: undefined,
            invalidateCache: undefined,
            isLoading: false,
            minimal: false,
            getGroupColor: () => '#000000',
            hasExplorerStore: true,
        };

        // Mirrors the provider: inputs change and the rename is dispatched
        const renderWithInputs = () => {
            const inputs = {
                itemsMap: items('m_x', 'tc_old'),
                metadata: undefined as TableCalculationMetadata[] | undefined,
            };
            const store = createVisualizationStore(
                buildInitialVisualizationState(
                    {
                        type: ChartType.BIG_NUMBER,
                        config: { selectedField: 'tc_old' },
                    },
                    { itemsMap: inputs.itemsMap, hasConfigOwner: true },
                ),
            );
            const wrapper: FC<PropsWithChildren> = ({ children }) =>
                createElement(
                    VisualizationStoreTestProvider,
                    { store },
                    createElement(
                        StateContext.Provider,
                        {
                            value: {
                                ...baseInputs,
                                itemsMap: inputs.itemsMap,
                                tableCalculationsMetadata: inputs.metadata,
                            },
                        },
                        children,
                    ),
                );
            const hook = renderHook(() => useBigNumberConfig(), { wrapper });
            const update = (
                itemsMap: ItemsMap,
                metadata: TableCalculationMetadata[] | undefined,
            ) => {
                inputs.itemsMap = itemsMap;
                inputs.metadata = metadata;
                act(() => {
                    if (metadata?.length)
                        store.dispatch(tableCalculationsRenamed(metadata));
                    hook.rerender();
                });
            };
            return { ...hook, update };
        };

        it('keeps the new name after the query re-runs and the metadata clears', () => {
            const { result, update } = renderWithInputs();
            update(items('m_x', 'tc_old'), [
                { oldName: 'tc_old', name: 'tc_new' },
            ]);
            expect(result.current.selectedField).toBe('tc_new');
            update(items('m_x', 'tc_new'), undefined);
            expect(result.current.selectedField).toBe('tc_new');
            expect(result.current.validConfig.selectedField).toBe('tc_new');
        });

        it('follows a second rename', () => {
            const { result, update } = renderWithInputs();
            update(items('m_x', 'tc_old'), [
                { oldName: 'tc_old', name: 'tc_mid' },
            ]);
            update(items('m_x', 'tc_mid'), undefined);
            update(items('m_x', 'tc_mid'), [
                { oldName: 'tc_mid', name: 'tc_new' },
            ]);
            update(items('m_x', 'tc_new'), undefined);
            expect(result.current.validConfig.selectedField).toBe('tc_new');
        });
    });
});
