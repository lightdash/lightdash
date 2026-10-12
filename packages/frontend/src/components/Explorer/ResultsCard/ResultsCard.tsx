import { subject } from '@casl/ability';
import { ActionIcon, Group, Popover, SegmentedControl } from '@mantine/core';
import { IconShare2 } from '@tabler/icons-react';
import {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import {
    selectColumnOrder,
    selectIsEditMode,
    selectMetricQuery,
    selectParameters,
    selectSavedChart,
    selectSorts,
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
import { Can } from '../../../providers/Ability';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import useApp from '../../../providers/App/useApp';
import AddTableCalculationButton from '../../AddTableCalculationButton';
import {
    COLLAPSABLE_CARD_ACTION_ICON_PROPS,
    COLLAPSABLE_CARD_POPOVER_PROPS,
} from '../../common/CollapsableCard/constants';
import MantineIcon from '../../common/MantineIcon';
import ExportSelector from '../../ExportSelector';
import SortButton from '../../SortButton';
import ExplorerPaneLayout from '../ResultsPane/ExplorerPaneLayout';
import { ExplorerResults } from './ExplorerResults';
import { ResultsViewMode } from './types';
import { useGroupedResultsAvailability } from './useGroupedResultsAvailability';

type Props = {
    tabs: ReactNode;
};

const ResultsCard: FC<Props> = memo(({ tabs }) => {
    const projectUuid = useProjectUuid();

    // View mode state for switching between results and grouped results
    const [viewMode, setViewMode] = useState<ResultsViewMode>(
        ResultsViewMode.RESULTS,
    );

    const isEditMode = useExplorerSelector(selectIsEditMode);
    const tableName = useExplorerSelector(selectTableName);
    const sorts = useExplorerSelector(selectSorts);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const parameters = useExplorerSelector(selectParameters);
    const columnOrder = useExplorerSelector(selectColumnOrder);

    // Check if grouped view is available
    const { isGroupedDisabled } = useGroupedResultsAvailability();
    const isGroupedView =
        viewMode === ResultsViewMode.GROUPED && !isGroupedDisabled;

    // Reset to results view when grouped becomes unavailable
    useEffect(() => {
        if (isGroupedDisabled && viewMode === ResultsViewMode.GROUPED) {
            setViewMode(ResultsViewMode.RESULTS);
        }
    }, [isGroupedDisabled, viewMode]);

    const { queryResults, getDownloadQueryUuid } = useExplorerQuery();
    const merge = useMergeSafe();
    const mergeResults = merge?.mergeResults;

    const mergedTotalResults =
        mergeResults?.unpivotedResults?.totalResults ??
        mergeResults?.results.totalResults;
    const totalResults = mergeResults
        ? (mergedTotalResults ?? mergeResults.metricQuery.limit)
        : queryResults.totalResults;

    const savedChart = useExplorerSelector(selectSavedChart);

    const disabled = useMemo(() => (totalResults ?? 0) <= 0, [totalResults]);

    const { user } = useApp();
    const ability = useAbilityContext();
    const { data: account } = useAccount();
    const isEmbedded = account?.isJwtUser() === true;
    const canEmbedExportCsv = useCanExportEmbeddedContent('csv');
    const canExportResultsCsv =
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
            return uploadGsheet({
                projectUuid,
                exploreId: tableName,
                metricQuery,
                columnOrder,
                showTableNames: true,
                parameters,
                // No pivotConfig - ResultsCard only shows raw table data
            });
        } else {
            throw new Error('Project UUID is missing');
        }
    };

    // ResultsCard always downloads raw unpivoted results
    const getResultsCardDownloadQueryUuid = useCallback(
        (limit: number | null) => {
            return mergeResults
                ? merge.getDownloadQueryUuid(limit, false)
                : getDownloadQueryUuid(limit, false);
        },
        [getDownloadQueryUuid, merge, mergeResults],
    );

    const exportColumnOrder = mergeResults
        ? resolveMergeColumnOrder(mergeResults.columnOrder, columnOrder)
        : columnOrder;

    return (
        <ExplorerPaneLayout
            tabs={tabs}
            tourProps={{
                'data-tour-scope': 'view:SavedChart',
                'data-tour-step': '1',
                'data-tour-route':
                    '/projects/:projectUuid/saved/:savedQueryUuid',
                'data-tour-label':
                    'A saved chart is there for everyone with access',
                'data-tour-docs':
                    'explore/share-charts.mdx#share-a-saved-chart:p2:1',
                'data-tour-return': 'none',
                'data-tour-resultdocs':
                    'explore/explore-view.mdx#explore-from-an-existing-chart:1',
            }}
            headerElement={
                // Hide header controls when in grouped view
                isGroupedView ? null : (
                    <Group wrap="nowrap" gap="xs">
                        {tableName && sorts.length > 0 && (
                            <SortButton isEditMode={isEditMode} sorts={sorts} />
                        )}
                    </Group>
                )
            }
            rightHeaderElement={
                projectUuid &&
                tableName && (
                    <Group gap="xs" wrap="nowrap">
                        {!isGroupedDisabled && (
                            <SegmentedControl
                                size="xs"
                                data={[
                                    {
                                        label: 'Results',
                                        value: ResultsViewMode.RESULTS,
                                    },
                                    {
                                        label: 'Chart results',
                                        value: ResultsViewMode.GROUPED,
                                    },
                                ]}
                                value={viewMode}
                                onChange={(value) =>
                                    setViewMode(value as ResultsViewMode)
                                }
                            />
                        )}

                        {/* Hide AddColumnButton when in grouped view */}
                        {!isGroupedView && (
                            <Can
                                I="manage"
                                this={subject('Explore', {
                                    organizationUuid:
                                        user.data?.organizationUuid,
                                    projectUuid,
                                })}
                            >
                                {isEditMode && <AddTableCalculationButton />}
                            </Can>
                        )}

                        {canExportResultsCsv && (
                            <Popover
                                {...COLLAPSABLE_CARD_POPOVER_PROPS}
                                disabled={disabled}
                                position="bottom-end"
                            >
                                <Popover.Target>
                                    <ActionIcon
                                        data-testid="export-csv-button"
                                        {...COLLAPSABLE_CARD_ACTION_ICON_PROPS}
                                        disabled={disabled}
                                        // Walkthrough action for
                                        // manage:ExportCsv: the export
                                        // dialog for the results table. See
                                        // scripts/scope-tours.
                                        data-tour-anchor="export-results"
                                        data-tour-hint="Open the export dialog"
                                        data-tour-scope="manage:ExportCsv"
                                        data-tour-step="2"
                                        data-tour-route="/projects/:projectUuid/saved/:savedQueryUuid"
                                        data-tour-label="Open the export dialog"
                                        data-tour-title="Download a chart's results"
                                        data-tour-interactive="true"
                                        data-tour-via='[data-tour-nav="browse"] >> [data-tour-nav="all-charts"] >> [data-tour-anchor="chart-row"][data-tour-value="Orders over time"] >> [data-tour-anchor="results-heading"]'
                                        // With Google Drive configured the
                                        // popover opens on a chooser first;
                                        // the `?` hop is taken only there.
                                        data-tour-then='[data-tour-anchor="export-choose-download"]? >> [data-tour-anchor="export-download"]'
                                        data-tour-docs="explore/share-charts.mdx#download-results-or-a-chart-image:p2:1"
                                    >
                                        <MantineIcon icon={IconShare2} />
                                    </ActionIcon>
                                </Popover.Target>

                                <Popover.Dropdown>
                                    <ExportSelector
                                        projectUuid={projectUuid}
                                        totalResults={totalResults}
                                        getDownloadQueryUuid={
                                            getResultsCardDownloadQueryUuid
                                        }
                                        getGsheetLink={
                                            mergeResults || isEmbedded
                                                ? undefined
                                                : getGsheetLink
                                        }
                                        columnOrder={exportColumnOrder}
                                        customLabels={undefined} // for results table download, don't override labels
                                        hiddenFields={undefined} // for results table download, don't hide columns
                                        chartName={savedChart?.name}
                                        showTableNames
                                    />
                                </Popover.Dropdown>
                            </Popover>
                        )}
                    </Group>
                )
            }
        >
            <ExplorerResults viewMode={viewMode} />
        </ExplorerPaneLayout>
    );
});

export default ResultsCard;
