import { subject } from '@casl/ability';
import {
    ActionIcon,
    Box,
    Group,
    Popover,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import {
    memo,
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type FC,
} from 'react';
import {
    explorerActions,
    selectIsEditMode,
    selectHasSelectedFields,
    selectIsResultsExpanded,
    selectIsVisualizationExpanded,
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
import ExportDataModal from '../../DashboardTiles/ExportDataModal';
import ExportSelector from '../../ExportSelector';
import SortButton from '../../SortButton';
import { useAddDroppedFieldToQuery, useFieldDrop } from '../fieldDrag';
import StaleResultsPrompt from '../StaleResultsPrompt';
import { useIsResultsStale } from '../useIsResultsStale';
import { ExplorerResults } from './ExplorerResults';
import resultsClasses from './ExplorerResults.module.css';
import { ResultsViewMode } from './types';
import { useGroupedResultsAvailability } from './useGroupedResultsAvailability';
import { useResultsExport } from './useResultsExport';

const VIEW_OPTIONS = [
    {
        value: ResultsViewMode.RESULTS,
        label: 'Rows',
        description: 'One row per result',
    },
    {
        value: ResultsViewMode.GROUPED,
        label: 'Pivoted',
        description: 'The rows as your chart groups them',
    },
];

const ResultsCard: FC = memo(() => {
    const projectUuid = useProjectUuid();

    // View mode state for switching between results and grouped results
    const [viewMode, setViewMode] = useState<ResultsViewMode>(
        ResultsViewMode.RESULTS,
    );

    const isEditMode = useExplorerSelector(selectIsEditMode);
    const resultsIsOpen = useExplorerSelector(selectIsResultsExpanded);
    const hasSelectedFields = useExplorerSelector(selectHasSelectedFields);
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
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
    const [isDownloadOpen, setIsDownloadOpen] = useState(false);
    const isStale = useIsResultsStale();
    const isChartOpen = useExplorerSelector(selectIsVisualizationExpanded);
    // A field dropped here joins the query, which then runs
    const fieldDrop = useFieldDrop(useAddDroppedFieldToQuery());
    const showEdgeColumn =
        isEditMode && !isGroupedView && (resultsExport.totalResults ?? 0) > 0;

    const canManageCustomFields = user.data?.ability?.can(
        'manage',
        subject('CustomFields', {
            organizationUuid: user.data.organizationUuid,
            projectUuid,
        }),
    );
    const handleAddCustomDimension = useCallback(() => {
        if (!tableName) return;
        dispatch(
            explorerActions.toggleCustomDimensionModal({
                isEditing: false,
                table: tableName,
                item: undefined,
            }),
        );
    }, [dispatch, tableName]);

    // The edge column's header cell tracks the table header's real box
    const edgeHostRef = useRef<HTMLDivElement>(null);
    const [headerBox, setHeaderBox] = useState({ top: 0, height: 37 });
    useLayoutEffect(() => {
        const host = edgeHostRef.current;
        if (!showEdgeColumn || !host) return;
        let observedHead: Element | null = null;
        // The table can be swapped for an empty state, so find its header anew
        const measure = () => {
            const thead = host.querySelector('thead');
            if (thead !== observedHead) {
                if (observedHead) observer.unobserve(observedHead);
                if (thead) observer.observe(thead);
                observedHead = thead;
            }
            if (!thead) return;
            const { top: headTop, height } = thead.getBoundingClientRect();
            const top = headTop - host.getBoundingClientRect().top;
            setHeaderBox((prev) =>
                prev.top === top && prev.height === height
                    ? prev
                    : { top, height },
            );
        };
        const observer = new ResizeObserver(measure);
        observer.observe(host);
        measure();
        return () => observer.disconnect();
    }, [showEdgeColumn, resultsIsOpen]);
    return (
        <CollapsableCard
            title="Results"
            dropProps={isEditMode ? fieldDrop.dropProps : undefined}
            isDropActive={fieldDrop.isOver}
            isOpen={resultsIsOpen}
            onToggle={toggleCard}
            disabled={!tableName || !hasSelectedFields}
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
                <Group wrap="nowrap" gap="xs">
                    {resultsIsOpen && !isGroupedDisabled && (
                        <Group gap={2} wrap="nowrap" role="tablist">
                            {VIEW_OPTIONS.map((option) => (
                                <Tooltip
                                    key={option.value}
                                    label={option.description}
                                    openDelay={400}
                                >
                                    <UnstyledButton
                                        role="tab"
                                        aria-selected={
                                            viewMode === option.value
                                        }
                                        className={resultsClasses.viewTab}
                                        onClick={() =>
                                            setViewMode(option.value)
                                        }
                                    >
                                        {option.label}
                                    </UnstyledButton>
                                </Tooltip>
                            ))}
                        </Group>
                    )}
                    {/* Row count and sort describe the flat rows only */}
                    {!isGroupedView &&
                        resultsExport.totalResults !== undefined &&
                        resultsExport.totalResults > 0 &&
                        !isStale && (
                            <Text fz="xs" c="dimmed">
                                {resultsExport.totalResults.toLocaleString()}{' '}
                                {resultsExport.totalResults === 1
                                    ? 'row'
                                    : 'rows'}
                            </Text>
                        )}
                    {/* One sort chip on screen: the open Chart shows it otherwise */}
                    {!isGroupedView &&
                        tableName &&
                        sorts.length > 0 &&
                        (resultsIsOpen || !isChartOpen) && (
                            <SortButton isEditMode={isEditMode} sorts={sorts} />
                        )}
                </Group>
            }
            rightHeaderElement={
                projectUuid &&
                resultsIsOpen &&
                tableName && (
                    <Group gap="xs" wrap="nowrap">
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
                                opened={isExportMenuOpen}
                                onChange={setIsExportMenuOpen}
                                disabled={resultsExport.disabled}
                                position="bottom-end"
                            >
                                <Popover.Target>
                                    <Tooltip label="Export results">
                                        <ActionIcon
                                            data-testid="export-results-button"
                                            aria-label="Export results"
                                            {...COLLAPSABLE_CARD_ACTION_ICON_PROPS}
                                            disabled={resultsExport.disabled}
                                            onClick={() =>
                                                setIsExportMenuOpen(
                                                    (open) => !open,
                                                )
                                            }
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
                                            data-tour-docs="explore/share-charts.mdx#download-results-or-a-chart-image:p5:1"
                                        >
                                            <MantineIcon icon={IconDownload} />
                                        </ActionIcon>
                                    </Tooltip>
                                </Popover.Target>

                                <Popover.Dropdown>
                                    <ExportSelector
                                        getGsheetLink={
                                            resultsExport.getGsheetLink
                                        }
                                        onDownloadData={() => {
                                            setIsExportMenuOpen(false);
                                            setIsDownloadOpen(true);
                                        }}
                                    />
                                </Popover.Dropdown>
                            </Popover>
                        )}
                        {resultsExport.canExport && (
                            <ExportDataModal
                                isOpen={isDownloadOpen}
                                onClose={() => setIsDownloadOpen(false)}
                                projectUuid={projectUuid}
                                totalResults={resultsExport.totalResults}
                                getDownloadQueryUuid={
                                    resultsExport.getDownloadQueryUuid
                                }
                                columnOrder={resultsExport.columnOrder}
                                chartName={resultsExport.chartName}
                                showTableNames
                            />
                        )}
                    </Group>
                )
            }
        >
            {isStale && !isChartOpen && (
                <Box py="sm">
                    <StaleResultsPrompt subject="your results" />
                </Box>
            )}
            <Box
                ref={edgeHostRef}
                className={resultsClasses.edgeHost}
                data-with-edge={showEdgeColumn || undefined}
            >
                <ExplorerResults viewMode={viewMode} />
                {showEdgeColumn && (
                    <Can
                        I="manage"
                        this={subject('Explore', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid,
                        })}
                    >
                        <Box
                            className={resultsClasses.edgeAction}
                            __vars={{
                                '--edge-top': `${headerBox.top}px`,
                                '--edge-height': `${headerBox.height}px`,
                            }}
                        >
                            <AddTableCalculationButton
                                tableEdge
                                onAddCustomDimension={
                                    canManageCustomFields && tableName
                                        ? handleAddCustomDimension
                                        : undefined
                                }
                                disabledReason={
                                    isTableCalculationRefused
                                        ? NOT_ON_LIVE_SOURCES
                                        : undefined
                                }
                            />
                        </Box>
                    </Can>
                )}
            </Box>
        </CollapsableCard>
    );
});

export default ResultsCard;
