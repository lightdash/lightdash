import {
    type DataAppVizChart,
    type DataAppVizFieldMapping,
    type DataAppVizOptionValue,
    type DataAppVizOptionValues,
} from '@lightdash/common';
import { type UnknownAction } from '@reduxjs/toolkit';
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import {
    buildDataAppVizEditorState,
    dataAppVizEditorActions,
    selectDataAppVizEditor,
    useEditorState,
    useVisualizationStore,
} from '../features/visualization/store';
import {
    readDataAppVizUuid,
    toSelectedDataAppViz,
    type SelectedDataAppViz,
} from '../features/visualization/store/dataAppVizEditorSlice';

export { readDataAppVizUuid, type SelectedDataAppViz };

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
}

// Local state for a data-app-viz chart (selected viz + field mapping + config
// option values); setters push each change up via `onConfigChange`. Mirrors
// useCustomVisualizationConfig. Only options the user explicitly changed are
// stored — declared defaults are resolved at render time.
const useDataAppVizVisualizationConfig = (
    initialChartConfig: DataAppVizChart | undefined,
    onConfigChange?: (config: SelectedDataAppViz | null) => void,
): DataAppVizVisualizationConfigAndData => {
    const { config } = useEditorState(
        selectDataAppVizEditor,
        dataAppVizEditorActions,
        () => buildDataAppVizEditorState(initialChartConfig),
    );

    // Read the committed config from the store so setters called within a
    // single commit (debounced controls all flushing as the panel closes)
    // build on each other instead of on a stale render closure.
    const store = useVisualizationStore();
    const readConfig = useCallback(
        () => selectDataAppVizEditor(store.getState())?.config ?? null,
        [store],
    );
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
        const current = readConfig();
        const currentUuid = current?.dataAppVizUuid ?? null;
        const currentVersion = current?.dataAppVizVersion;
        if (
            externalDataAppVizUuid === currentUuid &&
            externalDataAppVizVersion === currentVersion
        ) {
            return;
        }
        store.dispatch(
            dataAppVizEditorActions.set({
                key: 'config',
                value: toSelectedDataAppViz(initialChartConfig),
            }),
        );
    }, [
        externalDataAppVizUuid,
        externalDataAppVizVersion,
        initialChartConfig,
        readConfig,
        store,
    ]);

    // Pushes the edit up only when the reducer applied it
    const commit = useCallback(
        (action: UnknownAction) => {
            const previous = readConfig();
            store.dispatch(action);
            const next = readConfig();
            if (next !== previous) onConfigChangeRef.current?.(next);
        },
        [readConfig, store],
    );

    const setDataAppVizUuid = useCallback(
        (dataAppVizUuid: string, fieldMapping: DataAppVizFieldMapping) =>
            commit(
                dataAppVizEditorActions.vizSelected({
                    dataAppVizUuid,
                    fieldMapping,
                }),
            ),
        [commit],
    );

    const clearDataAppViz = useCallback(() => {
        store.dispatch(
            dataAppVizEditorActions.set({ key: 'config', value: null }),
        );
        onConfigChangeRef.current?.(null);
    }, [store]);

    const setDataAppVizVersion = useCallback(
        (dataAppVizVersion: number) =>
            commit(dataAppVizEditorActions.versionSet(dataAppVizVersion)),
        [commit],
    );

    const upgradeDataAppVizVersion = useCallback(
        (
            dataAppVizVersion: number,
            fieldMapping: DataAppVizFieldMapping,
            optionValues: DataAppVizOptionValues,
        ) =>
            commit(
                dataAppVizEditorActions.versionUpgraded({
                    dataAppVizVersion,
                    fieldMapping,
                    optionValues,
                }),
            ),
        [commit],
    );

    const setField = useCallback(
        (fieldName: string, fieldId: string | string[] | null) =>
            commit(dataAppVizEditorActions.fieldSet({ fieldName, fieldId })),
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
            commit(
                dataAppVizEditorActions.optionSet({
                    dataAppVizUuid,
                    optionName,
                    value,
                }),
            );
        },
        [commit],
    );

    return useMemo(
        () => ({
            validConfig: config,
            dataAppVizUuid: config?.dataAppVizUuid ?? null,
            setDataAppVizUuid,
            setDataAppVizVersion,
            upgradeDataAppVizVersion,
            clearDataAppViz,
            setField,
            setOption,
        }),
        [
            config,
            setDataAppVizUuid,
            setDataAppVizVersion,
            upgradeDataAppVizVersion,
            clearDataAppViz,
            setField,
            setOption,
        ],
    );
};

export default useDataAppVizVisualizationConfig;
