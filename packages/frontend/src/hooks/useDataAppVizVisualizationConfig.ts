import {
    type DataAppVizChart,
    type DataAppVizFieldMapping,
    type DataAppVizOptionValue,
    type DataAppVizOptionValues,
} from '@lightdash/common';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export interface DataAppVizVisualizationConfigAndData {
    validConfig: DataAppVizChart;
    dataAppVizUuid: string;
    fieldMapping: Record<string, string>;
    optionValues: DataAppVizOptionValues;
    /**
     * `fieldMapping` is the caller's binding for the newly selected viz —
     * computed from its contract and the query's result columns. Passed in
     * rather than derived here so this hook stays free of server state.
     */
    setDataAppVizUuid: (
        dataAppVizUuid: string,
        fieldMapping: DataAppVizFieldMapping,
    ) => void;
    setField: (fieldName: string, fieldId: string | null) => void;
    /** `dataAppVizUuid` is the viz the edited control belonged to. */
    setOption: (
        dataAppVizUuid: string,
        optionName: string,
        value: DataAppVizOptionValue,
    ) => void;
}

// Local state for a data-app-viz chart (selected viz + field mapping + config
// option values); setters push each change up via `onConfigChange`. Mirrors
// useCustomVisualizationConfig. Only options the user explicitly changed are
// stored — declared defaults are resolved at render time.
const useDataAppVizVisualizationConfig = (
    initialChartConfig: DataAppVizChart | undefined,
    onConfigChange?: (config: DataAppVizChart) => void,
): DataAppVizVisualizationConfigAndData => {
    const [config, setConfigState] = useState<Required<DataAppVizChart>>(
        () => ({
            dataAppVizUuid: initialChartConfig?.dataAppVizUuid ?? '',
            fieldMapping: initialChartConfig?.fieldMapping ?? {},
            optionValues: initialChartConfig?.optionValues ?? {},
        }),
    );

    // Track the committed config in a ref so setters called within a single
    // commit (debounced controls all flushing as the panel closes) build on
    // each other instead of on a stale render closure.
    const configRef = useRef(config);
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

    const commit = useCallback((next: Required<DataAppVizChart>) => {
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
            });
        },
        [commit],
    );

    const setField = useCallback(
        (fieldName: string, fieldId: string | null) => {
            const nextMapping = { ...configRef.current.fieldMapping };
            if (fieldId === null) {
                delete nextMapping[fieldName];
            } else {
                nextMapping[fieldName] = fieldId;
            }
            commit({ ...configRef.current, fieldMapping: nextMapping });
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
            if (dataAppVizUuid !== configRef.current.dataAppVizUuid) return;
            commit({
                ...configRef.current,
                optionValues: {
                    ...configRef.current.optionValues,
                    [optionName]: value,
                },
            });
        },
        [commit],
    );

    return {
        validConfig: config,
        dataAppVizUuid: config.dataAppVizUuid,
        fieldMapping: config.fieldMapping,
        optionValues: config.optionValues,
        setDataAppVizUuid,
        setField,
        setOption,
    };
};

export default useDataAppVizVisualizationConfig;
