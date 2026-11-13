import { subject } from '@casl/ability';
import { useCallback } from 'react';
import {
    selectColumnOrder,
    selectMetricQuery,
    selectParameters,
    selectSavedChart,
    selectTableName,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { useMergeSafe } from '../../../features/mergeQuery/context/useMerge';
import { resolveMergeColumnOrder } from '../../../features/mergeQuery/utils/resolveMergeColumnOrder';
import { uploadGsheet } from '../../../hooks/gdrive/useGdrive';
import { useExplorerQuery } from '../../../hooks/useExplorerQuery';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useAccount } from '../../../hooks/user/useAccount';
import { useCanExportEmbeddedContent } from '../../../hooks/user/useCanExportEmbeddedContent';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import useApp from '../../../providers/App/useApp';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

/**
 * Everything the raw results export needs: permission, whether there is
 * anything to export, and the inputs for ExportSelector.
 */
export const useResultsExport = () => {
    const lightdashApi = useLightdashApi();
    const projectUuid = useProjectUuid();
    const tableName = useExplorerSelector(selectTableName);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const parameters = useExplorerSelector(selectParameters);
    const columnOrder = useExplorerSelector(selectColumnOrder);
    const savedChart = useExplorerSelector(selectSavedChart);

    const { queryResults, getDownloadQueryUuid } = useExplorerQuery();
    const merge = useMergeSafe();
    const mergeResults = merge?.mergeResults;

    const mergedTotalResults =
        mergeResults?.unpivotedResults?.totalResults ??
        mergeResults?.results.totalResults;
    const totalResults = mergeResults
        ? (mergedTotalResults ?? mergeResults.metricQuery.limit)
        : queryResults.totalResults;

    const { user } = useApp();
    const ability = useAbilityContext();
    const { data: account } = useAccount();
    const isEmbedded = account?.isJwtUser() === true;
    const canEmbedExportCsv = useCanExportEmbeddedContent('csv');
    const canExportCsv =
        canEmbedExportCsv ||
        ability.can(
            'manage',
            subject('ExportCsv', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
            }),
        );

    const getGsheetLink = async () => {
        if (projectUuid) {
            return uploadGsheet(lightdashApi, {
                projectUuid,
                exploreId: tableName,
                metricQuery,
                columnOrder,
                showTableNames: true,
                parameters,
                // No pivotConfig: this export is always the raw table data
            });
        }
        throw new Error('Project UUID is missing');
    };

    // Always downloads raw unpivoted results
    const getResultsDownloadQueryUuid = useCallback(
        (limit: number | null) =>
            mergeResults
                ? merge.getDownloadQueryUuid(limit, false)
                : getDownloadQueryUuid(limit, false),
        [getDownloadQueryUuid, merge, mergeResults],
    );

    return {
        projectUuid,
        canExport: canExportCsv && !!projectUuid && !!tableName,
        disabled: (totalResults ?? 0) <= 0,
        totalResults,
        getDownloadQueryUuid: getResultsDownloadQueryUuid,
        getGsheetLink: mergeResults || isEmbedded ? undefined : getGsheetLink,
        columnOrder: mergeResults
            ? resolveMergeColumnOrder(mergeResults.columnOrder, columnOrder)
            : columnOrder,
        chartName: savedChart?.name,
    };
};
