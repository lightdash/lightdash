import {
    getDataAppVizFieldIds,
    pruneDataAppVizInputFieldOptions,
    type DataAppVizChart,
    type DataAppVizFieldMapping,
    type DataAppVizFieldOptionValues,
    type DataAppVizOptionValue,
    type DataAppVizOptionValues,
} from '@lightdash/common';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { pruneDataAppVizQueryFieldOptions } from '../features/chartTypes/utils/pruneDataAppVizQueryFieldOptions';

/**
 * The chart's binding to a picked viz; null while it points at none.
 * Deliberately not Required<DataAppVizChart>: the as-code-only
 * dataAppVizSlug never participates in runtime state.
 */
export type SelectedDataAppViz = Pick<
    DataAppVizChart,
    'dataAppVizUuid' | 'dataAppVizVersion' | 'fieldMapping'
> &
    Required<Pick<DataAppVizChart, 'optionValues' | 'fieldOptionValues'>>;

export interface DataAppVizVisualizationConfigAndData {
    validConfig: SelectedDataAppViz | null;
    dataAppVizUuid: string | null;
    /**
     * `fieldMapping` is the caller's binding for the newly selected viz —
     * computed from its contract and the query's result columns. Passed in
     * rather than derived here so this hook stays free of server state.
     */
    setDataAppVizUuid: (
        dataAppVizUuid: string,
        fieldMapping: DataAppVizFieldMapping,
    ) => void;
    setDataAppVizVersion: (dataAppVizVersion: number) => void;
    /**
     * Move the chart to a newer version of its type. The caller reconciles
     * the binding and options against that version's contract, for the same
     * reason `setDataAppVizUuid` takes its mapping ready-made.
     */
    upgradeDataAppVizVersion: (
        dataAppVizVersion: number,
        fieldMapping: DataAppVizFieldMapping,
        optionValues: DataAppVizOptionValues,
        fieldOptionValues: DataAppVizFieldOptionValues,
    ) => void;
    /** Back to pointing at no viz; bindings and options go with it. */
    clearDataAppViz: () => void;
    setField: (fieldName: string, fieldId: string | string[] | null) => void;
    /** `dataAppVizUuid` is the viz the edited control belonged to. */
    setOption: (
        dataAppVizUuid: string,
        optionName: string,
        value: DataAppVizOptionValue,
    ) => void;
    /** An option of one query field bound to the input `fieldName`. */
    setFieldOption: (
        dataAppVizUuid: string,
        fieldName: string,
        fieldId: string,
        optionName: string,
        value: DataAppVizOptionValue,
    ) => void;
}

// Charts saved while '' stood in for "no viz yet" still carry that value,
// and a config from a URL may carry no uuid at all.
export const readDataAppVizUuid = (
    chartConfig: DataAppVizChart | undefined,
): string | null => {
    const uuid = chartConfig?.dataAppVizUuid;
    return typeof uuid === 'string' && uuid !== '' ? uuid : null;
};

const toSelected = (
    chartConfig: DataAppVizChart | undefined,
): SelectedDataAppViz | null => {
    const dataAppVizUuid = readDataAppVizUuid(chartConfig);
    return chartConfig !== undefined && dataAppVizUuid !== null
        ? {
              dataAppVizUuid,
              dataAppVizVersion: chartConfig.dataAppVizVersion,
              fieldMapping: chartConfig.fieldMapping,
              optionValues: chartConfig.optionValues ?? {},
              fieldOptionValues: chartConfig.fieldOptionValues ?? {},
          }
        : null;
};

// Local state for a data-app-viz chart (selected viz + field mapping + config
// option values); setters push each change up via `onConfigChange`. Mirrors
// useCustomVisualizationConfig. Only options the user explicitly changed are
// stored — declared defaults are resolved at render time.
const useDataAppVizVisualizationConfig = (
    initialChartConfig: DataAppVizChart | undefined,
    onConfigChange?: (config: SelectedDataAppViz | null) => void,
    queryFieldIds: ReadonlySet<string> | null = null,
): DataAppVizVisualizationConfigAndData => {
    const [storedConfig, setConfigState] = useState<SelectedDataAppViz | null>(
        () => toSelected(initialChartConfig),
    );

    const fieldOptionValues =
        storedConfig && queryFieldIds
            ? pruneDataAppVizQueryFieldOptions(
                  storedConfig.fieldOptionValues,
                  queryFieldIds,
              )
            : storedConfig?.fieldOptionValues;
    const config =
        storedConfig &&
        fieldOptionValues &&
        fieldOptionValues !== storedConfig.fieldOptionValues
            ? { ...storedConfig, fieldOptionValues }
            : storedConfig;
    const pendingQueryPruneRef = useRef<SelectedDataAppViz | null>(null);
    if (config !== storedConfig) {
        setConfigState(config);
        pendingQueryPruneRef.current = config;
    }
    const queryFieldIdsRef = useRef(queryFieldIds);
    queryFieldIdsRef.current = queryFieldIds;

    // Track the committed config in a ref so setters called within a single
    // commit (debounced controls all flushing as the panel closes) build on
    // each other instead of on a stale render closure.
    const configRef = useRef(config);
    if (config !== storedConfig) configRef.current = config;
    const onConfigChangeRef = useRef(onConfigChange);
    onConfigChangeRef.current = onConfigChange;

    // Cleared in the mutation phase, so it is already false by the time the
    // passive cleanups of the same commit (a debounced control's flush) run.
    const isOwningChartConfigRef = useRef(true);
    useLayoutEffect(() => {
        isOwningChartConfigRef.current = true;
        return () => {
            isOwningChartConfigRef.current = false;
        };
    }, []);

    // A viz switched from outside this hook (the chart gallery goes through
    // the store) arrives as a new initial config while the hook stays mounted.
    const externalDataAppVizUuid = readDataAppVizUuid(initialChartConfig);
    const externalDataAppVizVersion = initialChartConfig?.dataAppVizVersion;
    useLayoutEffect(() => {
        const currentUuid = configRef.current?.dataAppVizUuid ?? null;
        const currentVersion = configRef.current?.dataAppVizVersion;
        if (
            externalDataAppVizUuid === currentUuid &&
            externalDataAppVizVersion === currentVersion
        ) {
            return;
        }
        const next = toSelected(initialChartConfig);
        configRef.current = next;
        setConfigState(next);
    }, [externalDataAppVizUuid, externalDataAppVizVersion, initialChartConfig]);

    // Persist query-driven pruning even when no option control is edited.
    useLayoutEffect(() => {
        const pending = pendingQueryPruneRef.current;
        pendingQueryPruneRef.current = null;
        if (pending !== null && pending === configRef.current) {
            onConfigChangeRef.current?.(pending);
        }
    });

    const commit = useCallback((next: SelectedDataAppViz | null) => {
        configRef.current = next;
        setConfigState(next);
        onConfigChangeRef.current?.(next);
    }, []);

    const setDataAppVizUuid = useCallback(
        (newDataAppVizUuid: string, fieldMapping: DataAppVizFieldMapping) => {
            // Options are viz-specific, so switching viz drops them rather
            // than carrying over now-meaningless names. The mapping is
            // replaced wholesale by the caller's auto-binding.
            commit({
                dataAppVizUuid: newDataAppVizUuid,
                fieldMapping,
                optionValues: {},
                fieldOptionValues: {},
            });
        },
        [commit],
    );

    const clearDataAppViz = useCallback(() => commit(null), [commit]);

    const setDataAppVizVersion = useCallback(
        (dataAppVizVersion: number) => {
            const selected = configRef.current;
            if (
                selected === null ||
                selected.dataAppVizVersion === dataAppVizVersion
            ) {
                return;
            }
            commit({ ...selected, dataAppVizVersion });
        },
        [commit],
    );

    const upgradeDataAppVizVersion = useCallback(
        (
            dataAppVizVersion: number,
            fieldMapping: DataAppVizFieldMapping,
            optionValues: DataAppVizOptionValues,
            fieldOptionValues: DataAppVizFieldOptionValues,
        ) => {
            const selected = configRef.current;
            if (selected === null) return;
            commit({
                ...selected,
                dataAppVizVersion,
                fieldMapping,
                optionValues,
                fieldOptionValues,
            });
        },
        [commit],
    );

    const setField = useCallback(
        (fieldName: string, fieldId: string | string[] | null) => {
            const selected = configRef.current;
            if (selected === null) return;
            const fieldMapping = { ...selected.fieldMapping };
            if (Array.isArray(fieldId)) {
                fieldMapping[fieldName] = fieldId;
            } else if (fieldId === null) {
                delete fieldMapping[fieldName];
            } else {
                fieldMapping[fieldName] = fieldId;
            }
            commit({
                ...selected,
                fieldMapping,
                fieldOptionValues: pruneDataAppVizInputFieldOptions(
                    fieldName,
                    getDataAppVizFieldIds(fieldMapping[fieldName]),
                    selected.fieldOptionValues,
                ),
            });
        },
        [commit],
    );

    const setOption = useCallback(
        (
            dataAppVizUuid: string,
            optionName: string,
            value: DataAppVizOptionValue,
        ) => {
            // A debounced control flushes from its unmount cleanup, by which
            // point the edit can belong to a config that no longer owns the
            // chart, or to a viz the user has switched away from.
            if (!isOwningChartConfigRef.current) return;
            const selected = configRef.current;
            if (selected === null || dataAppVizUuid !== selected.dataAppVizUuid)
                return;
            commit({
                ...selected,
                optionValues: { ...selected.optionValues, [optionName]: value },
            });
        },
        [commit],
    );

    const setFieldOption = useCallback(
        (
            dataAppVizUuid: string,
            fieldName: string,
            fieldId: string,
            optionName: string,
            value: DataAppVizOptionValue,
        ) => {
            if (!isOwningChartConfigRef.current) return;
            if (
                queryFieldIdsRef.current &&
                !queryFieldIdsRef.current.has(fieldId)
            )
                return;
            const selected = configRef.current;
            if (selected === null || dataAppVizUuid !== selected.dataAppVizUuid)
                return;
            // Reconciled fields may not be persisted yet. Reject a removed
            // field only when its binding changed since this callback rendered.
            if (
                config?.fieldMapping[fieldName] !==
                    selected.fieldMapping[fieldName] &&
                !getDataAppVizFieldIds(
                    selected.fieldMapping[fieldName],
                ).includes(fieldId)
            )
                return;
            const byFieldId = selected.fieldOptionValues[fieldName] ?? {};
            commit({
                ...selected,
                fieldOptionValues: {
                    ...selected.fieldOptionValues,
                    [fieldName]: {
                        ...byFieldId,
                        [fieldId]: {
                            ...byFieldId[fieldId],
                            [optionName]: value,
                        },
                    },
                },
            });
        },
        [commit, config?.fieldMapping],
    );

    return {
        validConfig: config,
        dataAppVizUuid: config?.dataAppVizUuid ?? null,
        setDataAppVizUuid,
        setDataAppVizVersion,
        upgradeDataAppVizVersion,
        clearDataAppViz,
        setField,
        setOption,
        setFieldOption,
    };
};

export default useDataAppVizVisualizationConfig;
