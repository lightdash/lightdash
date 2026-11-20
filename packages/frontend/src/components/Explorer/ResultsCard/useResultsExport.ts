import { subject } from '@casl/ability';
import {
    getItemLabel,
    getItemMap,
    isField,
    QueryHistoryStatus,
    type ResultRow,
} from '@lightdash/common';
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
import useHealth from '../../../hooks/health/useHealth';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorerQuery } from '../../../hooks/useExplorerQuery';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { getResultsPage } from '../../../hooks/useQueryResults';
import { useAccount } from '../../../hooks/user/useAccount';
import { useCanExportEmbeddedContent } from '../../../hooks/user/useCanExportEmbeddedContent';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import useApp from '../../../providers/App/useApp';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import {
    writeResultsToClipboard,
    type ClipboardColumn,
} from './resultsToClipboard';

const COPY_PAGE_SIZE = 500;
const DEFAULT_COPY_CELLS_LIMIT = 100000;

export type CopyResultsOutcome = {
    copiedRows: number;
    totalResults: number;
};

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

    const {
        queryResults,
        unpivotedEnabled,
        unpivotedQueryResults,
        getDownloadQueryUuid,
    } = useExplorerQuery();
    const merge = useMergeSafe();
    const mergeResults = merge?.mergeResults;

    const mergedTotalResults =
        mergeResults?.unpivotedResults?.totalResults ??
        mergeResults?.results.totalResults;
    const totalResults = mergeResults
        ? (mergedTotalResults ?? mergeResults.metricQuery.limit)
        : queryResults.totalResults;

    const health = useHealth();
    const { data: explore } = useExplore(tableName, {
        refetchOnMount: false,
    });

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

    // Copies the flat rows already run in the explorer, up to the CSV cell
    // limit. A pivoted chart's Rows view reads its unpivoted query, so copy
    // reads that one too.
    const copyResultsToClipboard =
        useCallback(async (): Promise<CopyResultsOutcome> => {
            const source = unpivotedEnabled
                ? unpivotedQueryResults
                : queryResults;
            const { queryUuid, columns } = source;
            if (!projectUuid || !queryUuid || !columns || !explore) {
                throw new Error(
                    'The results are still loading. Try again in a moment.',
                );
            }
            const itemsMap = getItemMap(
                explore,
                metricQuery.additionalMetrics,
                metricQuery.tableCalculations,
                metricQuery.customDimensions,
            );
            const fieldIds = [
                ...columnOrder.filter((fieldId) => fieldId in columns),
                ...Object.keys(columns).filter(
                    (fieldId) => !columnOrder.includes(fieldId),
                ),
            ];
            const clipboardColumns: ClipboardColumn[] = fieldIds.map(
                (fieldId) => {
                    const item = itemsMap[fieldId];
                    if (!item) return { fieldId, label: fieldId };
                    return {
                        fieldId,
                        label: isField(item) ? item.label : getItemLabel(item),
                    };
                },
            );

            const cellsLimit =
                health.data?.query?.csvCellsLimit || DEFAULT_COPY_CELLS_LIMIT;
            const total = source.totalResults ?? 0;
            const rowLimit = Math.min(
                total,
                Math.max(1, Math.floor(cellsLimit / fieldIds.length)),
            );

            const fetchRows = async (): Promise<ResultRow[]> => {
                const rows: ResultRow[] = [];
                let page: number | undefined = 1;
                while (page && rows.length < rowLimit) {
                    // eslint-disable-next-line no-await-in-loop
                    const result = await getResultsPage(
                        lightdashApi,
                        projectUuid,
                        queryUuid,
                        page,
                        COPY_PAGE_SIZE,
                    );
                    if (result.status !== QueryHistoryStatus.READY) {
                        throw new Error(
                            'The results are not ready to copy yet',
                        );
                    }
                    rows.push(...result.rows);
                    page = result.nextPage;
                }
                return rows.slice(0, rowLimit);
            };
            // The clipboard write starts before the rows arrive, while the
            // click still counts as a user gesture
            const rowsPromise = fetchRows();
            await writeResultsToClipboard(clipboardColumns, rowsPromise);
            const copiedRows = await rowsPromise;
            return { copiedRows: copiedRows.length, totalResults: total };
        }, [
            columnOrder,
            explore,
            health.data?.query?.csvCellsLimit,
            lightdashApi,
            metricQuery,
            projectUuid,
            queryResults,
            unpivotedEnabled,
            unpivotedQueryResults,
        ]);

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
        // A pivoted chart's flat rows can still be loading after its main
        // query finishes, so copy waits for them and the explore
        isCopyReady:
            !!explore &&
            !!(unpivotedEnabled ? unpivotedQueryResults : queryResults).columns,
        // Merged results come from several queries, so they are not copied
        copyResultsToClipboard: mergeResults
            ? undefined
            : copyResultsToClipboard,
    };
};
