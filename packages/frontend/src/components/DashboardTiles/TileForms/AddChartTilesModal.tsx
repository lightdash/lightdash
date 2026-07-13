import {
    assertUnreachable,
    ChartKind,
    ChartSourceType,
    DashboardTileTypes,
    defaultTileSize,
    type ChartContent,
    type Dashboard,
} from '@lightdash/common';
import {
    Button,
    getDefaultZIndex,
    Group,
    Loader,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { useDebouncedValue } from '@mantine/hooks';
import { IconChartAreaLine } from '@tabler/icons-react';
import uniqBy from 'lodash/uniqBy';
import React, {
    forwardRef,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { useParams } from 'react-router';
import { v4 as uuid4 } from 'uuid';
import { useChartSummariesV2 } from '../../../hooks/useChartSummariesV2';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import MantineModal from '../../common/MantineModal';
import { MultiSelectCombobox } from '../../common/MultiSelectCombobox/MultiSelectCombobox';
import { ChartIcon } from '../../common/ResourceIcon';

type Props = {
    onAddTiles: (
        tiles: Dashboard['tiles'][number][],
        // Map of new tile UUID → source tile UUID, so dashboard filter `tileTargets` are copied from the source.
        tileUuidMapping?: Record<string, string>,
    ) => void;
    onClose: () => void;
    spaceUuid?: string;
    maxSelectedValues?: number;
};

interface ItemProps extends React.ComponentPropsWithoutRef<'div'> {
    label: string;
    chartKind: ChartKind;
    tooltipLabel?: string;
    disabled?: boolean;
    selected?: boolean;
}

const SelectItem = forwardRef<HTMLDivElement, ItemProps>(
    (
        {
            label,
            tooltipLabel,
            chartKind,
            disabled,
            selected,
            ...others
        }: ItemProps,
        ref,
    ) => (
        <div ref={ref} {...others}>
            <Stack gap="1">
                <Tooltip
                    label={tooltipLabel}
                    disabled={!tooltipLabel}
                    position="top-start"
                    withinPortal
                >
                    <Group gap="xs">
                        <ChartIcon
                            chartKind={chartKind ?? ChartKind.VERTICAL_BAR}
                            color={disabled ? 'ldGray.5' : undefined}
                        />
                        <Text
                            c={
                                disabled
                                    ? 'dimmed'
                                    : selected
                                      ? 'ldGray.0'
                                      : 'ldGray.8'
                            }
                            fw={500}
                            fz="xs"
                        >
                            {label}
                        </Text>
                    </Group>
                </Tooltip>
            </Stack>
        </div>
    ),
);

const AddChartTilesModal: FC<Props> = ({
    onAddTiles,
    onClose,
    spaceUuid,
    maxSelectedValues,
}) => {
    const { projectUuid: projectUuidFromParams } = useParams<{
        projectUuid: string;
    }>();
    const projectUuidFromContext = useDashboardContext((c) => c.projectUuid);
    const projectUuid = projectUuidFromParams ?? projectUuidFromContext;
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [debouncedSearchQuery] = useDebouncedValue(searchQuery, 300);
    const {
        data: chartPages,
        isInitialLoading,
        isFetching,
        hasNextPage,
        fetchNextPage,
    } = useChartSummariesV2(
        {
            projectUuid,
            spaceUuid,
            page: 1,
            pageSize: 25,
            search: debouncedSearchQuery,
        },
        { keepPreviousData: true },
    );
    // Aggregates all fetched charts across pages and search queries into a unified list.
    // This ensures that previously fetched chart are preserved even when the search query changes.
    // Uses 'uuid' to remove duplicates and maintain a consistent set of unique charts.
    const [savedQueries, setSavedQueries] = useState<ChartContent[]>([]);
    useEffect(() => {
        const allPages = chartPages?.pages.map((p) => p.data).flat() ?? [];

        setSavedQueries((previousState) =>
            uniqBy([...previousState, ...allPages], 'uuid'),
        );
    }, [chartPages?.pages]);

    const dashboard = useDashboardContext((c) => c.dashboard);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);

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
                        tile.properties.savedSqlUuid === uuid)
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
        return allSavedCharts
            .filter(
                (chart) =>
                    selectedChartUuids.includes(chart.value) ||
                    chart.label.toLowerCase().includes(normalizedSearch),
            )
            .map((chart) => ({
                ...chart,
                disabled:
                    !selectedChartUuids.includes(chart.value) &&
                    maxSelectedValues !== undefined &&
                    selectedChartUuids.length >= maxSelectedValues,
            }));
    }, [allSavedCharts, maxSelectedValues, searchQuery, selectedChartUuids]);

    const handleSubmit = form.onSubmit(({ savedChartsUuids }) => {
        onAddTiles(
            savedChartsUuids.map((uuid) => {
                const chart = savedQueries?.find((c) => c.uuid === uuid);
                const sourceType = chart?.source;

                switch (sourceType) {
                    case ChartSourceType.SQL:
                        return {
                            uuid: uuid4(),
                            type: DashboardTileTypes.SQL_CHART,
                            properties: {
                                savedSqlUuid: uuid,
                                chartName: chart?.name ?? '',
                            },
                            tabUuid: undefined,
                            ...defaultTileSize,
                        };

                    case undefined:
                    case ChartSourceType.DBT_EXPLORE:
                        return {
                            uuid: uuid4(),
                            type: DashboardTileTypes.SAVED_CHART,
                            properties: {
                                savedChartUuid: uuid,
                                chartName: chart?.name ?? '',
                                // BigNumber charts default to hidden title for cleaner appearance
                                hideTitle:
                                    chart?.chartKind === ChartKind.BIG_NUMBER
                                        ? true
                                        : undefined,
                            },
                            tabUuid: undefined,
                            ...defaultTileSize,
                        };

                    default:
                        return assertUnreachable(
                            sourceType,
                            `Unknown chart source type: ${sourceType}`,
                        );
                }
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
                >
                    Add
                </Button>
            }
        >
            <form id="add-saved-charts-to-dashboard" onSubmit={handleSubmit}>
                <MultiSelectCombobox
                    radius="md"
                    maw={550}
                    id="saved-charts"
                    label={`Select the charts you want to add to this dashboard`}
                    options={filteredSavedCharts}
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
                        isFetching && <Loader size="xs" color="gray" />
                    }
                    rightSectionPointerEvents={isFetching ? 'none' : 'all'}
                    comboboxProps={{
                        withinPortal: true,
                        zIndex: getDefaultZIndex('modal'),
                        styles: {
                            groupLabel: {
                                position: 'sticky',
                                top: 0,
                                zIndex: getDefaultZIndex('modal'),
                                color: 'var(--mantine-color-ldGray-6)',
                                fontWeight: 500,
                                backgroundColor:
                                    'light-dark(var(--mantine-color-white), var(--mantine-color-dark-6))',
                            },
                            option: {
                                paddingTop: 4,
                                paddingBottom: 4,
                            },
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
                            <SelectItem
                                label={option.label}
                                chartKind={
                                    chart?.chartKind ?? ChartKind.VERTICAL_BAR
                                }
                                tooltipLabel={chart?.tooltipLabel}
                                disabled={option.disabled}
                                selected={selected}
                            />
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
                        } else if (
                            maxSelectedValues === undefined ||
                            selectedChartUuids.length < maxSelectedValues
                        ) {
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
