import {
    assertUnreachable,
    ChartKind,
    ChartSourceType,
    ContentType,
    DashboardTileTypes,
    defaultTileSize,
    type ChartContent,
    type ComposerChartContent,
    type Dashboard,
    type SummaryContent,
} from '@lightdash/common';
import {
    Box,
    Button,
    getDefaultZIndex,
    Group,
    Loader,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDebouncedValue } from '@mantine/hooks';
import { IconChartAreaLine } from '@tabler/icons-react';
import { uniqBy } from 'es-toolkit/compat';
import React, {
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { v4 as uuid4 } from 'uuid';
import {
    selectDashboardTiles,
    useDashboardSelector,
} from '../../../features/dashboard/store';
import { useInfiniteContent } from '../../../hooks/useContent';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import MantineModal from '../../common/MantineModal';
import { MultiSelectCombobox } from '../../common/MultiSelectCombobox/MultiSelectCombobox';
import { ChartIcon } from '../../common/ResourceIcon';
import classes from './AddChartTilesModal.module.css';

type Props = {
    onAddTiles: (
        tiles: Dashboard['tiles'][number][],
        // Map of new tile UUID → source tile UUID, so dashboard filter `tileTargets` are copied from the source.
        tileUuidMapping?: Record<string, string>,
    ) => void;
    onClose: () => void;
    spaceUuids?: string[];
    /** Also offer space-owned composer charts; never dashboard-owned ones */
    includeComposerCharts: boolean;
};

type PickableChart = ChartContent | ComposerChartContent;

const isPickableChart = (item: SummaryContent): item is PickableChart =>
    item.contentType === ContentType.CHART ||
    item.contentType === ContentType.COMPOSER_CHART;

const toTile = (chart: PickableChart): Dashboard['tiles'][number] => {
    // BigNumber charts default to hidden title for cleaner appearance
    const hideTitle =
        chart.chartKind === ChartKind.BIG_NUMBER ? true : undefined;
    if (chart.contentType === ContentType.COMPOSER_CHART) {
        return {
            uuid: uuid4(),
            type: DashboardTileTypes.COMPOSER_CHART,
            properties: {
                composerChartUuid: chart.uuid,
                chartName: chart.name,
                hideTitle,
            },
            tabUuid: undefined,
            ...defaultTileSize,
        };
    }
    switch (chart.source) {
        case ChartSourceType.SQL:
            return {
                uuid: uuid4(),
                type: DashboardTileTypes.SQL_CHART,
                properties: {
                    savedSqlUuid: chart.uuid,
                    chartName: chart.name,
                },
                tabUuid: undefined,
                ...defaultTileSize,
            };
        case ChartSourceType.DBT_EXPLORE:
            return {
                uuid: uuid4(),
                type: DashboardTileTypes.SAVED_CHART,
                properties: {
                    savedChartUuid: chart.uuid,
                    chartName: chart.name,
                    hideTitle,
                },
                tabUuid: undefined,
                ...defaultTileSize,
            };
        default:
            return assertUnreachable(
                chart.source,
                `Unknown chart source type: ${chart.source}`,
            );
    }
};

type ItemProps = {
    label: string;
    chartKind: ChartKind;
    tooltipLabel?: string;
    selected?: boolean;
};

const SelectItem: FC<ItemProps> = ({
    label,
    tooltipLabel,
    chartKind,
    selected,
}) => (
    <Stack gap="1">
        <Tooltip
            label={tooltipLabel}
            disabled={!tooltipLabel}
            position="top-start"
        >
            <Group gap="xs">
                <ChartIcon chartKind={chartKind ?? ChartKind.VERTICAL_BAR} />
                <Text c={selected ? 'ldGray.9' : 'ldGray.8'} fw={500} fz="xs">
                    {label}
                </Text>
            </Group>
        </Tooltip>
    </Stack>
);

const AddChartTilesModal: FC<Props> = ({
    onAddTiles,
    onClose,
    spaceUuids,
    includeComposerCharts,
}) => {
    const projectUuid = useProjectUuid();
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [debouncedSearchQuery] = useDebouncedValue(searchQuery, 300);
    const {
        data: chartPages,
        isInitialLoading,
        isFetching,
        hasNextPage,
        fetchNextPage,
    } = useInfiniteContent(
        {
            projectUuids: projectUuid ? [projectUuid] : [],
            spaceUuids,
            contentTypes: includeComposerCharts
                ? [ContentType.CHART, ContentType.COMPOSER_CHART]
                : [ContentType.CHART],
            page: 1,
            pageSize: 25,
            search: debouncedSearchQuery,
        },
        { keepPreviousData: true, enabled: !!projectUuid },
    );
    // Aggregates all fetched charts across pages and search queries into a unified list.
    // This ensures that previously fetched chart are preserved even when the search query changes.
    // Uses 'uuid' to remove duplicates and maintain a consistent set of unique charts.
    const [savedQueries, setSavedQueries] = useState<PickableChart[]>([]);
    useEffect(() => {
        const allPages =
            chartPages?.pages.flatMap((p) => p.data.filter(isPickableChart)) ??
            [];

        setSavedQueries((previousState) =>
            uniqBy([...previousState, ...allPages], 'uuid'),
        );
    }, [chartPages?.pages]);

    const dashboard = useDashboardContext((c) => c.dashboard);
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);

    const form = useForm<{ savedChartsUuids: string[] }>({
        initialValues: {
            savedChartsUuids: [],
        },
    });

    const selectScrollRef = useRef<HTMLDivElement>(null);
    const pendingScrollToEndRef = useRef(false);

    // When user clicks "Load more", scroll to the bottom of the dropdown after
    // the new page has rendered so the new Load more button stays visible.
    useLayoutEffect(() => {
        if (pendingScrollToEndRef.current && selectScrollRef.current) {
            selectScrollRef.current.scrollTo({
                top: selectScrollRef.current.scrollHeight,
            });
            pendingScrollToEndRef.current = false;
        }
    }, [savedQueries]);

    const allSavedCharts = useMemo(() => {
        const reorderedCharts = [...savedQueries].sort((chartA, chartB) => {
            if (
                chartA.space.uuid === chartB.space.uuid &&
                !!chartA.lastUpdatedAt &&
                !!chartB.lastUpdatedAt
            ) {
                return chartA.lastUpdatedAt > chartB.lastUpdatedAt ? -1 : 1;
            } else if (chartA.space.uuid === dashboard?.spaceUuid) {
                return -1;
            } else if (chartB.space.uuid === dashboard?.spaceUuid) {
                return 1;
            } else {
                return 0;
            }
        });

        return reorderedCharts.map((chart) => {
            const { uuid, name, space, chartKind } = chart;
            const isAlreadyAdded = dashboardTiles?.find((tile) => {
                return (
                    (tile.type === DashboardTileTypes.SAVED_CHART &&
                        tile.properties.savedChartUuid === uuid) ||
                    (tile.type === DashboardTileTypes.SQL_CHART &&
                        tile.properties.savedSqlUuid === uuid) ||
                    (tile.type === DashboardTileTypes.COMPOSER_CHART &&
                        tile.properties.composerChartUuid === uuid)
                );
            });

            return {
                value: uuid,
                label: name,
                group: space.name,
                tooltipLabel: isAlreadyAdded
                    ? 'This chart has already been added to this dashboard'
                    : undefined,
                chartKind,
            };
        });
    }, [savedQueries, dashboard?.spaceUuid, dashboardTiles]);

    const selectedChartUuids = form.values.savedChartsUuids as string[];
    const filteredSavedCharts = useMemo(() => {
        const normalizedSearch = searchQuery.trim().toLowerCase();
        return allSavedCharts.filter(
            (chart) =>
                selectedChartUuids.includes(chart.value) ||
                chart.label.toLowerCase().includes(normalizedSearch),
        );
    }, [allSavedCharts, searchQuery, selectedChartUuids]);

    const handleSubmit = form.onSubmit(({ savedChartsUuids }) => {
        onAddTiles(
            savedChartsUuids.flatMap((uuid) => {
                const chart = savedQueries.find((c) => c.uuid === uuid);
                return chart ? [toTile(chart)] : [];
            }),
        );
        onClose();
    });

    if (!dashboardTiles || isInitialLoading) return null;

    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Add saved charts"
            icon={IconChartAreaLine}
            size="lg"
            modalRootProps={{ closeOnClickOutside: false }}
            actions={
                <Button
                    type="button"
                    onClick={() => handleSubmit()}
                    disabled={
                        isInitialLoading ||
                        form.values.savedChartsUuids.length === 0
                    }
                    data-tour-anchor="add-charts-submit"
                    data-tour-hint="Click Add"
                >
                    Add
                </Button>
            }
        >
            {/* Room for the open chart list, so it never covers Add. */}
            <form
                id="add-saved-charts-to-dashboard"
                onSubmit={handleSubmit}
                className={classes.form}
            >
                <MultiSelectCombobox
                    radius="md"
                    maw={550}
                    data-tour-anchor="chart-picker"
                    data-tour-hint="Open the chart list"
                    id="saved-charts"
                    label={`Select the charts you want to add to this dashboard`}
                    options={filteredSavedCharts}
                    filterOptions={false}
                    disabled={isInitialLoading}
                    placeholder="Search..."
                    required
                    name="savedChartsUuids"
                    nothingFoundMessage="No charts found"
                    searchValue={searchQuery}
                    onSearchChange={setSearchQuery}
                    maxDropdownHeight={300}
                    value={selectedChartUuids}
                    selectedValues={selectedChartUuids}
                    onClear={() => {
                        form.setFieldValue('savedChartsUuids', []);
                        setSearchQuery('');
                    }}
                    rightSection={
                        isFetching ? (
                            <Loader size="xs" color="gray" />
                        ) : undefined
                    }
                    rightSectionPointerEvents={isFetching ? 'none' : 'all'}
                    comboboxProps={{
                        withinPortal: true,
                        zIndex: getDefaultZIndex('modal'),
                        classNames: {
                            groupLabel: classes.comboboxGroupLabel,
                            option: classes.comboboxOption,
                        },
                    }}
                    scrollAreaProps={{ viewportRef: selectScrollRef }}
                    footer={
                        hasNextPage ? (
                            <Button
                                size="xs"
                                variant="subtle"
                                fullWidth
                                onClick={async () => {
                                    pendingScrollToEndRef.current = true;
                                    await fetchNextPage();
                                }}
                                disabled={isFetching}
                            >
                                Load more
                            </Button>
                        ) : null
                    }
                    renderOption={(option, selected) => {
                        const chart = allSavedCharts.find(
                            (item) => item.value === option.value,
                        );
                        return (
                            <Box
                                // Walkthrough anchor, one chart by name.
                                data-tour-anchor="chart-option"
                                data-tour-hint="Choose {value}"
                                data-tour-value={option.label}
                            >
                                <SelectItem
                                    label={option.label}
                                    chartKind={
                                        chart?.chartKind ??
                                        ChartKind.VERTICAL_BAR
                                    }
                                    tooltipLabel={chart?.tooltipLabel}
                                    selected={selected}
                                />
                            </Box>
                        );
                    }}
                    onValueRemove={(chartUuid) => {
                        form.setFieldValue(
                            'savedChartsUuids',
                            selectedChartUuids.filter(
                                (value) => value !== chartUuid,
                            ),
                        );
                    }}
                    onOptionSubmit={(chartUuid) => {
                        if (selectedChartUuids.includes(chartUuid)) {
                            form.setFieldValue(
                                'savedChartsUuids',
                                selectedChartUuids.filter(
                                    (value) => value !== chartUuid,
                                ),
                            );
                        } else {
                            form.setFieldValue('savedChartsUuids', [
                                ...selectedChartUuids,
                                chartUuid,
                            ]);
                        }
                    }}
                    onDropdownClose={() => setSearchQuery('')}
                />
            </form>
        </MantineModal>
    );
};

export default AddChartTilesModal;
