import { subject } from '@casl/ability';
import {
    ActionIcon,
    Group,
    Popover,
    SegmentedControl,
    Tooltip,
} from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { memo, useCallback, useEffect, useState, type FC } from 'react';
import {
    explorerActions,
    selectIsEditMode,
    selectIsResultsExpanded,
    selectSorts,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import {
    NOT_ON_LIVE_SOURCES,
    useIsRefusedOnLiveSource,
} from '../../../features/externalConnections/liveSources/apiSourceExplore';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { Can } from '../../../providers/Ability';
import useApp from '../../../providers/App/useApp';
import { ExplorerSection } from '../../../providers/Explorer/types';
import AddTableCalculationButton from '../../AddTableCalculationButton';
import CollapsableCard from '../../common/CollapsableCard/CollapsableCard';
import {
    COLLAPSABLE_CARD_ACTION_ICON_PROPS,
    COLLAPSABLE_CARD_POPOVER_PROPS,
} from '../../common/CollapsableCard/constants';
import MantineIcon from '../../common/MantineIcon';
import ExportSelector from '../../ExportSelector';
import SortButton from '../../SortButton';
import { ExplorerResults } from './ExplorerResults';
import { ResultsViewMode } from './types';
import { useGroupedResultsAvailability } from './useGroupedResultsAvailability';
import { useResultsExport } from './useResultsExport';

const ResultsCard: FC = memo(() => {
    const projectUuid = useProjectUuid();

    // View mode state for switching between results and grouped results
    const [viewMode, setViewMode] = useState<ResultsViewMode>(
        ResultsViewMode.RESULTS,
    );

    const isEditMode = useExplorerSelector(selectIsEditMode);
    const resultsIsOpen = useExplorerSelector(selectIsResultsExpanded);
    const dispatch = useExplorerDispatch();
    const tableName = useExplorerSelector(selectTableName);
    const isTableCalculationRefused = useIsRefusedOnLiveSource(
        tableName,
        'tableCalculations',
    );
    const sorts = useExplorerSelector(selectSorts);

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

    const toggleExpandedSection = useCallback(
        (section: ExplorerSection) => {
            dispatch(explorerActions.toggleExpandedSection(section));
        },
        [dispatch],
    );

    const toggleCard = useCallback(
        () => toggleExpandedSection(ExplorerSection.RESULTS),
        [toggleExpandedSection],
    );
    const { user } = useApp();
    const resultsExport = useResultsExport();
    return (
        <CollapsableCard
            title="Results"
            isOpen={resultsIsOpen}
            onToggle={toggleCard}
            disabled={!tableName}
            // Walkthrough markers for view:SavedChart: reading a chart means
            // opening it from Browse and unfolding the rows behind it. The
            // heading's click is the action; the card is the result. See
            // scripts/scope-tours.
            headingTourProps={{
                'data-tour-anchor': 'results-heading',
                'data-tour-hint': 'Open the results',
                'data-tour-scope': 'view:SavedChart',
                'data-tour-step': '2',
                'data-tour-route':
                    '/projects/:projectUuid/saved/:savedQueryUuid',
                'data-tour-label': 'Open the results',
                'data-tour-title': 'Open and read a chart',
                'data-tour-interactive': 'true',
                'data-tour-via':
                    '[data-tour-nav="browse"] >> [data-tour-nav="all-charts"] >> [data-tour-anchor="chart-row"][data-tour-value="Orders over time"]',
                'data-tour-docs':
                    'explore/explore-view.mdx#the-explore-page:li4',
            }}
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
                resultsIsOpen &&
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
                                {isEditMode && (
                                    <AddTableCalculationButton
                                        disabledReason={
                                            isTableCalculationRefused
                                                ? NOT_ON_LIVE_SOURCES
                                                : undefined
                                        }
                                    />
                                )}
                            </Can>
                        )}

                        {resultsExport.canExport && (
                            <Popover
                                {...COLLAPSABLE_CARD_POPOVER_PROPS}
                                disabled={resultsExport.disabled}
                                position="bottom-end"
                            >
                                <Popover.Target>
                                    <Tooltip label="Export results">
                                        <ActionIcon
                                            data-testid="export-csv-button"
                                            aria-label="Export results"
                                            {...COLLAPSABLE_CARD_ACTION_ICON_PROPS}
                                            disabled={resultsExport.disabled}
                                            // Walkthrough action for
                                            // manage:ExportCsv. See
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
                                            data-tour-docs="explore/share-charts.mdx#download-results-or-a-chart-image:p3:1"
                                        >
                                            <MantineIcon icon={IconDownload} />
                                        </ActionIcon>
                                    </Tooltip>
                                </Popover.Target>

                                <Popover.Dropdown>
                                    <ExportSelector
                                        projectUuid={projectUuid}
                                        totalResults={
                                            resultsExport.totalResults
                                        }
                                        getDownloadQueryUuid={
                                            resultsExport.getDownloadQueryUuid
                                        }
                                        getGsheetLink={
                                            resultsExport.getGsheetLink
                                        }
                                        columnOrder={resultsExport.columnOrder}
                                        chartName={resultsExport.chartName}
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
        </CollapsableCard>
    );
});

export default ResultsCard;
