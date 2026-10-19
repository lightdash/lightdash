import { useCallback, useMemo } from 'react';
import { useExploreQueries } from '../../../hooks/useExplore';
import {
    selectMetricQuery,
    selectParameters,
    selectTableName,
    selectUnsavedChartVersion,
    useExplorerSelector,
} from '../../explorer/store';
import { EMPTY_MERGE } from '../constants';
import { useMergeSafe } from '../context/useMerge';
import { getMergeSetup } from '../utils/getMergeSetup';
import { useMergeSourceNames } from './useMergeSourceNames';

/**
 * Everything derived from the selected sources and their relationship:
 * the merge to run, whether it can run, and what is stopping it.
 *
 * Lives in a hook rather than the setup panel because the run control is not
 * inside that panel. The explorer's own Run button runs a merge when one is
 * configured, and both need the same answer to "is this runnable, and what is
 * it".
 */
export const useMergeSetup = () => {
    const tableName = useExplorerSelector(selectTableName);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const parameters = useExplorerSelector(selectParameters);
    const unsavedChartVersion = useExplorerSelector(selectUnsavedChartVersion);
    const mergeContext = useMergeSafe();
    const state = mergeContext ?? EMPTY_MERGE;
    const sourceNames = useMergeSourceNames();
    const explores = useExploreQueries([
        tableName,
        ...state.additionalSources.map(
            (source) => source.exploreName ?? undefined,
        ),
    ]);
    const setup = useMemo(
        () =>
            getMergeSetup({
                metricQuery,
                tableName,
                primaryExplore: explores[0],
                additionalExplores: explores.slice(1),
                additionalSources: state.additionalSources,
                joinParts: state.joinParts,
                joinType: state.joinType,
                repeatValuesSourceIds: state.repeatValuesSourceIds,
                sourceNames,
                tableCalculations: mergeContext?.tableCalculations,
            }),
        [
            metricQuery,
            tableName,
            explores,
            state.additionalSources,
            state.joinParts,
            state.joinType,
            state.repeatValuesSourceIds,
            sourceNames,
            mergeContext?.tableCalculations,
        ],
    );
    const { run, isRunning, runErrors, mergeResults } = mergeContext ?? {};
    const { canRun } = setup;
    const handleRun = useCallback(() => {
        if (canRun && setup.mergeQuery)
            run?.(setup.mergeQuery, parameters, unsavedChartVersion);
    }, [canRun, setup.mergeQuery, run, parameters, unsavedChartVersion]);
    return {
        ...setup,
        isMerging: state.isMerging,
        joinType: state.joinType,
        repeatValuesSourceIds: state.repeatValuesSourceIds,
        setRepeatValues: state.setRepeatValues,
        run,
        isRunning,
        runErrors,
        mergeResults,
        sourceNames,
        canRun,
        handleRun,
    };
};
