import {
    type DataAppVizChart,
    type DataAppVizFieldMapping,
    type DataAppVizOptionValue,
    type DataAppVizOptionValues,
} from '@lightdash/common';
import { type UnknownAction } from '@reduxjs/toolkit';
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import {
    dataAppVizEditorActions,
    selectDataAppVizValidConfig,
    useVisualizationSelector,
    useVisualizationStore,
} from '../features/visualization/store';
import {
    readDataAppVizUuid,
    type SelectedDataAppViz,
} from '../features/visualization/store/dataAppVizEditorSlice';
import { useStableCallback } from './useStableCallback';

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

// Stores only the options the user changed and pushes each applied edit through `onConfigChange`
const useDataAppVizVisualizationConfig = (
    initialChartConfig: DataAppVizChart | undefined,
    onConfigChange?: (config: SelectedDataAppViz | null) => void,
): DataAppVizVisualizationConfigAndData => {
    const config = useVisualizationSelector(selectDataAppVizValidConfig);

    // Reads the store, so setters flushed in one commit build on each other, not a stale closure
    const store = useVisualizationStore();
    const readConfig = useCallback(
        () => selectDataAppVizValidConfig(store.getState()),
        [store],
    );
    const emitConfigChange = useStableCallback(
        (next: SelectedDataAppViz | null) => onConfigChange?.(next),
    );

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
            dataAppVizEditorActions.externalConfigReceived(initialChartConfig),
        );
    }, [
        externalDataAppVizUuid,
        externalDataAppVizVersion,
        initialChartConfig,
        readConfig,
        store,
    ]);

    // Pushes only applied edits; an unmount flush can target a config that no longer owns the chart
    const commit = useCallback(
        (action: UnknownAction) => {
            if (!isOwningChartConfigRef.current) return;
            const previous = readConfig();
            store.dispatch(action);
            const next = readConfig();
            if (next !== previous) emitConfigChange(next);
        },
        [readConfig, store, emitConfigChange],
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
        if (!isOwningChartConfigRef.current) return;
        store.dispatch(dataAppVizEditorActions.vizCleared());
        emitConfigChange(null);
    }, [store, emitConfigChange]);

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
        ) =>
            // The reducer drops an edit to a viz the user has switched away from
            commit(
                dataAppVizEditorActions.optionSet({
                    dataAppVizUuid,
                    optionName,
                    value,
                }),
            ),
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
