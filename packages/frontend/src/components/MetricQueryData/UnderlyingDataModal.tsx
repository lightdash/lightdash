import { subject } from '@casl/ability';
import {
    ChartType,
    getDimensions,
    getFields,
    getItemId,
    isCustomBinDimension,
    isField,
    isMetric,
    QueryExecutionContext,
    type CreateSavedChartVersion,
    type Filters,
    type SortField,
} from '@lightdash/common';
import { Button, Divider, Group, Popover } from '@mantine/core';
import { IconShare2, IconStack, IconTelescope } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import { useOrganization } from '../../hooks/organization/useOrganization';
import { useExplore } from '../../hooks/useExplore';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../hooks/useExplorerRoute';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import { useCreateShareMutation } from '../../hooks/useShare';
import {
    getUnderlyingDataResults,
    useUnderlyingDataResults,
} from '../../hooks/useUnderlyingDataResults';
import { Can } from '../../providers/Ability';
import { useAbilityContext } from '../../providers/Ability/useAbilityContext';
import useApp from '../../providers/App/useApp';
import { convertDateFilters } from '../../utils/dateFilter';
import ErrorState from '../common/ErrorState';
import MantineIcon from '../common/MantineIcon';
import MantineModal from '../common/MantineModal';
import { type TableColumn } from '../common/Table/types';
import ExportResults from '../ExportResults';
import UnderlyingDataFilterBadges from './UnderlyingDataFilterBadges';
import {
    combineUnderlyingDataFilters,
    getUnderlyingDataFilterParts,
} from './underlyingDataFilters';
import UnderlyingDataResultsTable from './UnderlyingDataResultsTable';
import { useMetricQueryDataContext } from './useMetricQueryDataContext';

const UnderlyingDataModalContent: FC = () => {
    const projectUuid = useProjectUuid();
    const {
        isUnderlyingDataModalOpen,
        closeUnderlyingDataModal,
        tableName,
        metricQuery,
        underlyingDataConfig,
        queryUuid,
        parameters,
        resolvedTimezone,
    } = useMetricQueryDataContext();
    const source = underlyingDataConfig?.source;
    const effectiveTableName = source?.tableName ?? tableName;
    const effectiveMetricQuery = source?.metricQuery ?? metricQuery;
    const effectiveQueryUuid = source?.queryUuid ?? queryUuid;

    const [sorts, setSorts] = useState<SortField[]>([]);

    const { user } = useApp();
    const { data: organization } = useOrganization();

    const { data: explore } = useExplore(effectiveTableName, {
        refetchOnMount: false,
    });
    const ability = useAbilityContext();

    const underlyingDataItemId = useMemo(
        () =>
            underlyingDataConfig?.item !== undefined &&
            isField(underlyingDataConfig.item)
                ? getItemId(underlyingDataConfig.item)
                : undefined,
        [underlyingDataConfig?.item],
    );

    const nonBinCustomDimensions = useMemo(
        () =>
            effectiveMetricQuery?.customDimensions?.filter(
                (dimension) => !isCustomBinDimension(dimension),
            ) || [],
        [effectiveMetricQuery?.customDimensions],
    );

    const allFields = useMemo(
        () => [
            ...nonBinCustomDimensions,
            ...(explore ? getFields(explore) : []),
        ],
        [explore, nonBinCustomDimensions],
    );

    const allDimensions = useMemo(
        () => [
            ...nonBinCustomDimensions,
            ...(explore ? getDimensions(explore) : []),
        ],
        [explore, nonBinCustomDimensions],
    );

    const joinedTables = useMemo(
        () =>
            (explore?.joinedTables || []).map(
                (joinedTable) => joinedTable.table,
            ),
        [explore],
    );

    const showUnderlyingValues: string[] | undefined = useMemo(() => {
        if (
            underlyingDataConfig?.item !== undefined &&
            isField(underlyingDataConfig.item) &&
            isMetric(underlyingDataConfig.item) &&
            underlyingDataConfig.item.showUnderlyingValues !== undefined
        ) {
            return underlyingDataConfig.item.showUnderlyingValues;
        }
        // Fallback to base table's default for table calculations and custom metrics
        return explore?.tables[explore.baseTable]?.defaultShowUnderlyingValues;
    }, [underlyingDataConfig?.item, explore]);

    const sortByUnderlyingValues = useCallback(
        (columnA: TableColumn, columnB: TableColumn) => {
            if (showUnderlyingValues === undefined) return 0;

            const indexOfUnderlyingValue = (column: TableColumn): number => {
                const columnDimension = allFields.find(
                    (dimension) => getItemId(dimension) === column.id,
                );
                if (columnDimension === undefined) return -1;
                return showUnderlyingValues?.indexOf(columnDimension.name) !==
                    -1
                    ? showUnderlyingValues?.indexOf(columnDimension.name)
                    : showUnderlyingValues?.indexOf(
                          `${columnDimension.table}.${columnDimension.name}`,
                      );
            };

            return (
                indexOfUnderlyingValue(columnA) -
                indexOfUnderlyingValue(columnB)
            );
        },
        [showUnderlyingValues, allFields],
    );

    // Flat rules scoping the results to the clicked chart segment/cell, kept
    // separate from the grouped explore filters so they can be surfaced in the
    // header filter summary
    const filterParts = useMemo(() => {
        if (!underlyingDataConfig) return null;
        const { item, fieldValues, pivotReference, value, dateZoom } =
            underlyingDataConfig;

        if (item === undefined) return null;

        return getUnderlyingDataFilterParts({
            item,
            value,
            fieldValues,
            pivotReference,
            dateZoom,
            allDimensions,
            resolvedTimezone,
        });
    }, [underlyingDataConfig, allDimensions, resolvedTimezone]);

    const filters = useMemo<Filters>(() => {
        if (!filterParts) return {};

        return combineUnderlyingDataFilters({
            filterParts,
            exploreDimensionFilters: effectiveMetricQuery?.filters?.dimensions,
            allFields,
        });
    }, [filterParts, effectiveMetricQuery, allFields]);

    const {
        error,
        data: resultsData,
        isInitialLoading,
    } = useUnderlyingDataResults(
        filters,
        effectiveQueryUuid,
        underlyingDataItemId,
        underlyingDataConfig?.dateZoom,
        parameters,
        sorts,
    );

    const exploreFromHereUrl = useMemo(() => {
        if (!resultsData) {
            return undefined;
        }
        const createSavedChartVersion: CreateSavedChartVersion = {
            tableName: resultsData.metricQuery.exploreName,
            metricQuery: resultsData.metricQuery,
            pivotConfig: undefined,
            tableConfig: {
                columnOrder: [],
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: { layout: {}, eChartsConfig: {} },
            },
        };
        return getExplorerUrlFromCreateSavedChartVersion(
            projectUuid,
            createSavedChartVersion,
            true,
        );
    }, [resultsData, projectUuid]);

    const navigate = useNavigate();
    const { mutateAsync: createShareUrl, isLoading: isCreatingShareUrl } =
        useCreateShareMutation();

    const handleExploreFromHere = useCallback(async () => {
        if (!exploreFromHereUrl) return;
        const shareUrl = await createShareUrl({
            path: exploreFromHereUrl.pathname,
            params: `?${exploreFromHereUrl.search}`,
        });
        void navigate(`/share/${shareUrl.nanoid}`);
    }, [createShareUrl, exploreFromHereUrl, navigate]);

    const getDownloadQueryUuid = useCallback(
        async (limit: number | null) => {
            if (limit === null || limit !== resultsData?.rows.length) {
                // Get new query uuid with new limit
                const newQuery = await getUnderlyingDataResults(
                    projectUuid!,
                    {
                        context: QueryExecutionContext.VIEW_UNDERLYING_DATA,
                        underlyingDataSourceQueryUuid: effectiveQueryUuid!,
                        underlyingDataItemId,
                        filters: convertDateFilters(filters),
                        dateZoom: underlyingDataConfig?.dateZoom,
                        limit,
                        sorts,
                    },
                    undefined,
                    parameters,
                );
                return newQuery.queryUuid;
            }
            if (!resultsData) {
                throw new Error('No results data');
            }
            // Use existing query uuid
            return resultsData.queryUuid;
        },
        [
            filters,
            projectUuid,
            effectiveQueryUuid,
            resultsData,
            underlyingDataConfig?.dateZoom,
            underlyingDataItemId,
            parameters,
            sorts,
        ],
    );

    const canExportCsv =
        ability.can(
            'manage',
            subject('ExportCsv', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid: projectUuid,
            }),
        ) ||
        ability.can(
            'export',
            subject('Dashboard', {
                type: 'csv',
                organizationUuid: organization?.organizationUuid,
            }),
        );

    const modalTitle = (
        <>
            View underlying data
            <UnderlyingDataFilterBadges
                filterRules={
                    filterParts
                        ? [
                              ...filterParts.pointFilterRules,
                              ...filterParts.metricFilterRules,
                          ]
                        : []
                }
                fields={allFields}
            />
        </>
    );

    const headerActions = (
        <Group gap="sm">
            {canExportCsv && (
                <Popover
                    disabled={!resultsData}
                    position="bottom-end"
                    withArrow
                >
                    <Popover.Target>
                        <Button
                            leftSection={<MantineIcon icon={IconShare2} />}
                            variant="light"
                            color="foreground.9"
                            size="compact-sm"
                            disabled={!resultsData}
                        >
                            Export CSV
                        </Button>
                    </Popover.Target>
                    <Popover.Dropdown>
                        {!!projectUuid && (
                            <ExportResults
                                projectUuid={projectUuid}
                                showTableNames
                                totalResults={resultsData?.rows.length}
                                getDownloadQueryUuid={getDownloadQueryUuid}
                                forceShowLimitSelection
                            />
                        )}
                    </Popover.Dropdown>
                </Popover>
            )}
            <Can
                I="manage"
                this={subject('Explore', {
                    organizationUuid: user.data?.organizationUuid,
                    projectUuid: projectUuid,
                })}
            >
                <Divider orientation="vertical" />
                <Button
                    leftSection={<MantineIcon icon={IconTelescope} />}
                    onClick={handleExploreFromHere}
                    disabled={!exploreFromHereUrl}
                    loading={isCreatingShareUrl}
                    variant="light"
                    size="compact-sm"
                >
                    Explore from here
                </Button>
            </Can>
        </Group>
    );

    return (
        <MantineModal
            opened={isUnderlyingDataModalOpen}
            icon={IconStack}
            onClose={closeUnderlyingDataModal}
            title={modalTitle}
            fullScreen
            headerActions={headerActions}
            cancelLabel={false}
            modalBodyProps={{ px: 'md', py: 'sm' }}
        >
            {error ? (
                <ErrorState error={error.error} hasMarginTop={false} />
            ) : (
                <UnderlyingDataResultsTable
                    isLoading={isInitialLoading}
                    resultsData={resultsData}
                    fieldsMap={resultsData?.fields || {}}
                    hasJoins={joinedTables.length > 0}
                    sortByUnderlyingValues={sortByUnderlyingValues}
                    sorts={sorts}
                    onSortChange={setSorts}
                />
            )}
        </MantineModal>
    );
};

// Only mounts the content when the modal is open
// This prevents the underlying data query from running on every mount
const UnderlyingDataModal: FC = () => {
    const { isUnderlyingDataModalOpen } = useMetricQueryDataContext();

    if (!isUnderlyingDataModalOpen) {
        return null;
    }

    return <UnderlyingDataModalContent />;
};

export default UnderlyingDataModal;
