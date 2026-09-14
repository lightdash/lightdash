import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import {
    selectHasUnsavedChanges,
    selectSavedChart,
    selectUnsavedChartVersion,
    useExplorerSelector,
} from '../../features/explorer/store';
import { stringifyCreateSavedChartVersion } from '../../hooks/useExplorerRoute';

/** Dashboard URL param carrying the editing session's unsaved chart version. */
export const CREATE_SAVED_CHART_VERSION_SEARCH_PARAM =
    'create_saved_chart_version';

/**
 * Mirrors the session's unsaved edits into the host dashboard's url, so a
 * reload, a copied address bar or a step back from the chart page reopens the
 * editor on the same edits. A clean session carries nothing.
 * Only mount this under the modal's store, and only for a dashboard host.
 */
export const useDashboardChartEditorUrlSync = (): void => {
    const savedChart = useExplorerSelector(selectSavedChart);
    const unsavedChartVersion = useExplorerSelector(selectUnsavedChartVersion);
    const hasUnsavedChanges = useExplorerSelector(selectHasUnsavedChanges);
    const [searchParams, setSearchParams] = useSearchParams();

    const desiredValue = useMemo(
        () =>
            savedChart && hasUnsavedChanges
                ? stringifyCreateSavedChartVersion(unsavedChartVersion)
                : null,
        [savedChart, hasUnsavedChanges, unsavedChartVersion],
    );
    const currentValue = searchParams.get(
        CREATE_SAVED_CHART_VERSION_SEARCH_PARAM,
    );

    useEffect(() => {
        if (!savedChart) return;
        // setSearchParams always navigates, so only write on a real change.
        if (desiredValue === currentValue) return;
        setSearchParams(
            (params) => {
                if (desiredValue === null) {
                    params.delete(CREATE_SAVED_CHART_VERSION_SEARCH_PARAM);
                } else {
                    params.set(
                        CREATE_SAVED_CHART_VERSION_SEARCH_PARAM,
                        desiredValue,
                    );
                }
                return params;
            },
            { replace: true },
        );
    }, [savedChart, desiredValue, currentValue, setSearchParams]);
};
