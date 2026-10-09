import { FeatureFlags } from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { useExploreQueries } from '../../../hooks/useExplore';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
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

export const useMergeSetup = (sourceId?: string) => {
    const { data: mergeFlag } = useServerFeatureFlag(FeatureFlags.MergeQueries);
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
                primaryExplore: explores[0].data,
                additionalExplores: explores
                    .slice(1)
                    .map((result) => result.data),
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
    const selectedId =
        sourceId ??
        (state.focus.kind === 'source' ? state.focus.sourceId : undefined);
    const selected =
        setup.sourceSetups.find(
            (pair) => pair.additionalSourceId === selectedId,
        ) ?? setup.first;
    const { run, isRunning, runErrors, mergeResults } = mergeContext ?? {};
    const canRun = mergeFlag?.enabled === true && setup.canRun;
    const handleRun = useCallback(() => {
        if (canRun && setup.mergeQuery)
            run?.(setup.mergeQuery, parameters, unsavedChartVersion);
    }, [canRun, setup.mergeQuery, run, parameters, unsavedChartVersion]);
    return {
        ...selected,
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
        unaccountedTotal: setup.fanOut.reduce(
            (total, source) => total + source.fields.length,
            0,
        ),
    };
};
