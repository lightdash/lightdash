import {
    DimensionType,
    friendlyName,
    getFilterTypeFromItemType,
    isDashboardChartTileType,
    isDashboardHeadingTileType,
    isDashboardDataAppTileType,
    isDashboardLoomTileType,
    isDashboardMarkdownTileType,
    isDashboardSqlChartTile,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import {
    Badge,
    Collapse,
    Flex,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    TextInput,
    Title,
    UnstyledButton,
    useMantineTheme,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import {
    IconChartBar,
    IconChevronDown,
    IconChevronRight,
    IconFilter,
    IconLayoutDashboard,
    IconSearch,
} from '@tabler/icons-react';
import {
    MantineReactTable,
    useMantineReactTable,
    type MRT_ColumnDef,
} from 'mantine-react-table';
import { useMemo, useRef, useState } from 'react';
import { EmptyState } from '../components/common/EmptyState';
import { getConditionalRuleLabel } from '../components/common/Filters/FilterInputs/utils';
import MantineIcon from '../components/common/MantineIcon';
import {
    useDashboardQuery,
    useDashboardVersion,
} from '../hooks/dashboard/useDashboard';
import NoTableIcon from '../svgs/emptystate-no-table.svg?react';

interface DashboardVersionComparisonProps {
    dashboardUuid: string | undefined;
    projectUuid: string | undefined;
    versionUuid: string | undefined;
}

interface ExpandableSectionProps {
    title: string;
    icon: typeof IconChevronDown;
    color: string;
    badge?: React.ReactNode;
    children: React.ReactNode;
}

const ExpandableSection = ({
    title,
    icon: Icon,
    color,
    badge,
    children,
}: ExpandableSectionProps) => {
    const [opened, { toggle }] = useDisclosure(false);

    return (
        <Paper p="md" withBorder>
            <UnstyledButton onClick={toggle} style={{ width: '100%' }}>
                <Group
                    gap="xs"
                    mb={opened ? 'sm' : undefined}
                    justify="space-between"
                >
                    <Group gap="xs">
                        <MantineIcon
                            icon={opened ? IconChevronDown : IconChevronRight}
                            size="sm"
                        />
                        <MantineIcon icon={Icon} color={color} size="lg" />
                        <Text fw={600}>{title}</Text>
                    </Group>
                    {!opened && badge}
                </Group>
            </UnstyledButton>
            <Collapse in={opened}>{children}</Collapse>
        </Paper>
    );
};

// Toolbar component for tables
const TableToolbar = ({
    search,
    setSearch,
    placeholder,
}: {
    search: string;
    setSearch: (value: string) => void;
    placeholder: string;
}) => {
    const theme = useMantineTheme();
    return (
        <Group pb={`${theme.spacing.sm}`} wrap="nowrap">
            <TextInput
                size="xs"
                radius="md"
                type="search"
                variant="default"
                placeholder={placeholder}
                value={search}
                leftSection={
                    <MantineIcon size="md" color="ldGray.6" icon={IconSearch} />
                }
                onChange={(e) => setSearch(e.target.value)}
                style={{ flex: 1 }}
            />
        </Group>
    );
};

const DifferenceBadge = ({ diff }: { diff: number }) => {
    if (diff === 0) {
        return (
            <Badge color="gray" variant="light" size="sm">
                0
            </Badge>
        );
    }
    return (
        <Badge color={diff > 0 ? 'green' : 'red'} variant="light" size="sm">
            {diff > 0 ? '+' : ''}
            {diff}
        </Badge>
    );
};

const getFilterLabel = (rule: DashboardFilterRule): string => {
    // Use the actual filter rendering utility from the codebase
    const filterType = getFilterTypeFromItemType(
        rule.target.fallbackType ?? DimensionType.STRING,
    );
    const labels = getConditionalRuleLabel(
        rule,
        filterType,
        friendlyName(rule.target.fieldId),
    );

    // Format as a readable string
    if (labels.value) {
        return `${labels.field} ${labels.operator} ${labels.value}`;
    } else {
        return `${labels.field} ${labels.operator}`;
    }
};

interface FilterDetail {
    id: string;
    fieldId: string;
    label: string;
}

const getFilterDetails = (filters?: DashboardFilters): FilterDetail[] => {
    const details: FilterDetail[] = [];

    if (filters?.dimensions) {
        filters.dimensions.forEach((rule) => {
            details.push({
                id: rule.id,
                fieldId: rule.target.fieldId,
                label: getFilterLabel(rule),
            });
        });
    }

    if (filters?.metrics) {
        filters.metrics.forEach((rule) => {
            details.push({
                id: rule.id,
                fieldId: rule.target.fieldId,
                label: getFilterLabel(rule),
            });
        });
    }

    return details;
};

interface AlignedFilter {
    fieldId: string;
    currentFilter?: FilterDetail;
    versionFilter?: FilterDetail;
    hasChanged: boolean;
}

const alignFiltersByFieldId = (
    currentFilters: FilterDetail[],
    versionFilters: FilterDetail[],
): AlignedFilter[] => {
    const aligned: AlignedFilter[] = [];
    const fieldIds = new Set<string>();

    // Collect all unique field IDs
    currentFilters.forEach((f) => fieldIds.add(f.fieldId));
    versionFilters.forEach((f) => fieldIds.add(f.fieldId));

    // Create aligned rows for each field ID
    fieldIds.forEach((fieldId) => {
        const currentFilter = currentFilters.find((f) => f.fieldId === fieldId);
        const versionFilter = versionFilters.find((f) => f.fieldId === fieldId);

        // Check if the filter has changed by comparing labels
        // If one exists and the other doesn't, it's a change
        // If both exist but have different labels, it's a change
        const hasChanged = Boolean(
            (!currentFilter && versionFilter) ||
            (currentFilter && !versionFilter) ||
            (currentFilter &&
                versionFilter &&
                currentFilter.label !== versionFilter.label),
        );

        aligned.push({
            fieldId,
            currentFilter,
            versionFilter,
            hasChanged,
        });
    });

    // Sort by field name for consistent ordering
    return aligned.sort((a, b) =>
        friendlyName(a.fieldId).localeCompare(friendlyName(b.fieldId)),
    );
};

const compareFilters = (
    current?: DashboardFilters,
    version?: DashboardFilters,
): boolean => {
    // Quick check if both are undefined or empty
    if (!current && !version) return false;
    if (!current || !version) return true;

    // Get filter details for both versions
    const currentDetails = getFilterDetails(current);
    const versionDetails = getFilterDetails(version);

    // Different number of filters
    if (currentDetails.length !== versionDetails.length) return true;

    // Compare each filter
    const aligned = alignFiltersByFieldId(currentDetails, versionDetails);
    return aligned.some((a) => a.hasChanged);
};

// Tiles Table Component
const TilesTable = ({ data }: { data: any[] }) => {
    const theme = useMantineTheme();
    const [search, setSearch] = useState('');
    const tableContainerRef = useRef<HTMLDivElement>(null);

    // Calculate totals from original data (not filtered)
    const totals = useMemo(() => {
        const totalRow = data.find((row) => row.tileType === 'Total');
        if (totalRow) {
            return totalRow;
        }
        return null;
    }, [data]);

    // Filter out the Total row from table data
    const dataWithoutTotal = useMemo(() => {
        return data.filter((row) => row.tileType !== 'Total');
    }, [data]);

    const columns = useMemo<MRT_ColumnDef<any>[]>(
        () => [
            {
                accessorKey: 'tileType',
                header: 'Tile Type',
                size: 150,
                Footer: () => (
                    <Text size="xs" fw={700}>
                        Total
                    </Text>
                ),
            },
            {
                accessorKey: 'current',
                header: 'Current',
                size: 100,
                Cell: ({ cell }) => (
                    <Text size="xs" ta="right">
                        {cell.getValue<number>()}
                    </Text>
                ),
                Footer: () =>
                    totals ? (
                        <Text size="xs" ta="right" fw={700}>
                            {totals.current}
                        </Text>
                    ) : null,
            },
            {
                accessorKey: 'selected',
                header: 'Selected',
                size: 100,
                Cell: ({ cell }) => (
                    <Text size="xs" ta="right">
                        {cell.getValue<number>()}
                    </Text>
                ),
                Footer: () =>
                    totals ? (
                        <Text size="xs" ta="right" fw={700}>
                            {totals.selected}
                        </Text>
                    ) : null,
            },
            {
                accessorKey: 'difference',
                header: 'Difference',
                size: 120,
                Cell: ({ cell }) => (
                    <div style={{ textAlign: 'right' }}>
                        <DifferenceBadge diff={cell.getValue<number>()} />
                    </div>
                ),
                Footer: () =>
                    totals ? (
                        <div style={{ textAlign: 'right' }}>
                            <DifferenceBadge diff={totals.difference} />
                        </div>
                    ) : null,
            },
        ],
        [totals],
    );

    const filteredData = useMemo(() => {
        if (!search) return dataWithoutTotal;
        return dataWithoutTotal.filter((row) =>
            row.tileType.toLowerCase().includes(search.toLowerCase()),
        );
    }, [dataWithoutTotal, search]);

    const table = useMantineReactTable({
        columns,
        data: filteredData,
        enableRowVirtualization: true,
        enableStickyHeader: true,
        enableColumnResizing: false,
        enablePagination: false,
        enableFilters: false,
        enableFullScreenToggle: false,
        enableDensityToggle: false,
        enableColumnActions: false,
        enableColumnFilters: false,
        enableHiding: false,
        enableGlobalFilterModes: false,
        enableTopToolbar: true,
        enableBottomToolbar: false,
        initialState: {
            density: 'xs',
        },
        mantinePaperProps: {
            shadow: 'none',
            withBorder: false,
            style: {
                backgroundColor: 'transparent',
                padding: 0,
            },
        },
        mantineTableContainerProps: {
            ref: tableContainerRef,
            style: {
                maxHeight: '400px',
                border: `1px solid ${theme.colors.ldGray[2]}`,
                borderRadius: theme.spacing.sm,
            },
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: false,
        },
        mantineTableHeadCellProps: {
            style: {
                backgroundColor: theme.colors.ldGray[0],
                borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
                fontSize: theme.fontSizes.xs,
                fontWeight: 600,
                color: theme.colors.ldGray[7],
                padding: `${theme.spacing.xs} ${theme.spacing.md}`,
            },
        },
        mantineTableBodyCellProps: {
            style: {
                fontSize: theme.fontSizes.xs,
                color: theme.colors.ldGray[7],
                padding: `${theme.spacing.xs} ${theme.spacing.md}`,
            },
        },
        mantineTableFooterCellProps: {
            style: {
                backgroundColor: theme.colors.ldGray[0],
                borderTop: `1px solid ${theme.colors.ldGray[2]}`,
                fontSize: theme.fontSizes.xs,
                color: theme.colors.ldGray[7],
                padding: `${theme.spacing.xs} ${theme.spacing.md}`,
            },
        },
        renderTopToolbar: () => (
            <TableToolbar
                search={search}
                setSearch={setSearch}
                placeholder="Search tile types..."
            />
        ),
    });

    return <MantineReactTable table={table} />;
};

// Charts Table Component
const ChartsTable = ({
    data,
    projectUuid,
}: {
    data: any[];
    projectUuid: string | undefined;
}) => {
    const theme = useMantineTheme();
    const [search, setSearch] = useState('');
    const tableContainerRef = useRef<HTMLDivElement>(null);

    const columns = useMemo<MRT_ColumnDef<any>[]>(
        () => [
            {
                accessorKey: 'chartName',
                header: 'Chart Name',
                size: 250,
                Cell: ({ row }) => {
                    const { chartUuid, chartName } = row.original;
                    if (projectUuid && chartUuid) {
                        return (
                            <Text
                                component="a"
                                href={`/projects/${projectUuid}/saved/${chartUuid}/history`}
                                target="_blank"
                                rel="noopener noreferrer"
                                size="xs"
                                c="blue"
                                td="none"
                                style={{ cursor: 'pointer' }}
                            >
                                {chartName}
                            </Text>
                        );
                    }
                    return <Text size="xs">{chartName}</Text>;
                },
            },
            {
                accessorFn: (row) => row.currentVersion?.createdAt,
                header: 'Current Version',
                size: 200,
                Cell: ({ row }) => (
                    <Text
                        size="xs"
                        ta="right"
                        c={
                            row.original.currentVersion?.createdAt
                                ? 'ldGray.6'
                                : 'ldGray.4'
                        }
                    >
                        {row.original.currentVersion?.createdAt
                            ? new Date(
                                  row.original.currentVersion.createdAt,
                              ).toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                              })
                            : '-'}
                    </Text>
                ),
            },
            {
                accessorFn: (row) => row.selectedVersion?.createdAt,
                header: 'Selected Version',
                size: 200,
                Cell: ({ row }) => (
                    <Text
                        size="xs"
                        ta="right"
                        c={
                            row.original.selectedVersion?.createdAt
                                ? 'ldGray.6'
                                : 'ldGray.4'
                        }
                    >
                        {row.original.selectedVersion?.createdAt
                            ? new Date(
                                  row.original.selectedVersion.createdAt,
                              ).toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                              })
                            : '-'}
                    </Text>
                ),
            },
            {
                accessorFn: (row) => {
                    // Return a sortable value based on the rollback action
                    if (!row.inCurrent && row.inVersion) return 'Add';
                    if (row.inCurrent && !row.inVersion) return 'Remove';
                    if (
                        row.inCurrent &&
                        row.inVersion &&
                        row.hasDifferentVersion
                    )
                        return 'Version update';
                    return 'No change';
                },
                id: 'rollbackAction',
                header: 'Rollback Action',
                size: 150,
                Cell: ({ row }) => (
                    <div style={{ textAlign: 'center' }}>
                        {!row.original.inCurrent && row.original.inVersion && (
                            <Badge color="green" variant="light" size="sm">
                                Add
                            </Badge>
                        )}
                        {row.original.inCurrent && !row.original.inVersion && (
                            <Badge color="red" variant="light" size="sm">
                                Remove
                            </Badge>
                        )}
                        {row.original.inCurrent &&
                            row.original.inVersion &&
                            row.original.hasDifferentVersion && (
                                <Badge color="yellow" variant="light" size="sm">
                                    Version update
                                </Badge>
                            )}
                        {row.original.inCurrent &&
                            row.original.inVersion &&
                            !row.original.hasDifferentVersion && (
                                <Badge color="gray" variant="light" size="sm">
                                    No change
                                </Badge>
                            )}
                    </div>
                ),
                enableSorting: true,
            },
        ],
        [projectUuid],
    );

    const filteredData = useMemo(() => {
        if (!search) return data;
        return data.filter((row) =>
            row.chartName.toLowerCase().includes(search.toLowerCase()),
        );
    }, [data, search]);

    const table = useMantineReactTable({
        columns,
        data: filteredData,
        enableRowVirtualization: false,
        enableStickyHeader: true,
        enableColumnResizing: false,
        enablePagination: false,
        enableFilters: false,
        enableFullScreenToggle: false,
        enableDensityToggle: false,
        enableColumnActions: false,
        enableColumnFilters: false,
        enableHiding: false,
        enableGlobalFilterModes: false,
        enableTopToolbar: true,
        enableBottomToolbar: false,
        initialState: {
            density: 'xs',
            sorting: [{ id: 'chartName', desc: false }],
        },
        mantinePaperProps: {
            shadow: 'none',
            withBorder: false,
            style: {
                backgroundColor: 'transparent',
                padding: 0,
            },
        },
        mantineTableContainerProps: {
            ref: tableContainerRef,
            style: {
                maxHeight: '400px',
                border: `1px solid ${theme.colors.ldGray[2]}`,
                borderRadius: theme.spacing.sm,
            },
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: false,
        },
        mantineTableHeadCellProps: {
            style: {
                backgroundColor: theme.colors.ldGray[0],
                borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
                fontSize: theme.fontSizes.xs,
                fontWeight: 600,
                color: theme.colors.ldGray[7],
                padding: `${theme.spacing.xs} ${theme.spacing.md}`,
            },
        },
        mantineTableBodyCellProps: {
            style: {
                fontSize: theme.fontSizes.xs,
                color: theme.colors.ldGray[7],
                padding: `${theme.spacing.xs} ${theme.spacing.md}`,
            },
        },
        renderTopToolbar: () => (
            <TableToolbar
                search={search}
                setSearch={setSearch}
                placeholder="Search charts by name..."
            />
        ),
    });

    return <MantineReactTable table={table} />;
};

// Filters Table Component
const FiltersTable = ({ data }: { data: any[] }) => {
    const theme = useMantineTheme();
    const [search, setSearch] = useState('');
    const tableContainerRef = useRef<HTMLDivElement>(null);

    const columns = useMemo<MRT_ColumnDef<any>[]>(
        () => [
            {
                accessorFn: (row) => row.currentFilter?.label || '-',
                header: 'Current Version',
                size: 300,
                Cell: ({ row }) => (
                    <Text
                        size="xs"
                        c={row.original.currentFilter ? 'ldGray.7' : 'ldGray.4'}
                    >
                        {row.original.currentFilter?.label || '-'}
                    </Text>
                ),
            },
            {
                accessorFn: (row) => row.versionFilter?.label || '-',
                header: 'Selected Version',
                size: 300,
                Cell: ({ row }) => (
                    <Text
                        size="xs"
                        c={row.original.versionFilter ? 'ldGray.7' : 'ldGray.4'}
                    >
                        {row.original.versionFilter?.label || '-'}
                    </Text>
                ),
            },
            {
                accessorFn: (row) => {
                    // Return a sortable value based on the rollback action
                    if (!row.currentFilter && row.versionFilter) return 'Add';
                    if (row.currentFilter && !row.versionFilter)
                        return 'Remove';
                    if (
                        row.currentFilter &&
                        row.versionFilter &&
                        row.hasChanged
                    )
                        return 'Update';
                    return 'No change';
                },
                id: 'rollbackAction',
                header: 'Rollback Action',
                size: 150,
                Cell: ({ row }) => (
                    <div style={{ textAlign: 'center' }}>
                        {!row.original.currentFilter &&
                            row.original.versionFilter && (
                                <Badge color="green" variant="light" size="sm">
                                    Add
                                </Badge>
                            )}
                        {row.original.currentFilter &&
                            !row.original.versionFilter && (
                                <Badge color="red" variant="light" size="sm">
                                    Remove
                                </Badge>
                            )}
                        {row.original.currentFilter &&
                            row.original.versionFilter &&
                            row.original.hasChanged && (
                                <Badge color="yellow" variant="light" size="sm">
                                    Update
                                </Badge>
                            )}
                        {row.original.currentFilter &&
                            row.original.versionFilter &&
                            !row.original.hasChanged && (
                                <Badge color="gray" variant="light" size="sm">
                                    No change
                                </Badge>
                            )}
                    </div>
                ),
                enableSorting: true,
            },
        ],
        [],
    );

    const filteredData = useMemo(() => {
        if (!search) return data;
        return data.filter((row) => {
            const currentLabel = row.currentFilter?.label || '';
            const versionLabel = row.versionFilter?.label || '';
            const searchLower = search.toLowerCase();
            return (
                currentLabel.toLowerCase().includes(searchLower) ||
                versionLabel.toLowerCase().includes(searchLower)
            );
        });
    }, [data, search]);

    const table = useMantineReactTable({
        columns,
        data: filteredData,
        enableRowVirtualization: true,
        enableStickyHeader: true,
        enableColumnResizing: false,
        enablePagination: false,
        enableFilters: false,
        enableFullScreenToggle: false,
        enableDensityToggle: false,
        enableColumnActions: false,
        enableColumnFilters: false,
        enableHiding: false,
        enableGlobalFilterModes: false,
        enableTopToolbar: true,
        enableBottomToolbar: false,
        initialState: {
            density: 'xs',
        },
        mantinePaperProps: {
            shadow: 'none',
            withBorder: false,
            style: {
                backgroundColor: 'transparent',
                padding: 0,
            },
        },
        mantineTableContainerProps: {
            ref: tableContainerRef,
            style: {
                maxHeight: '400px',
                border: `1px solid ${theme.colors.ldGray[2]}`,
                borderRadius: theme.spacing.sm,
            },
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: false,
        },
        mantineTableHeadCellProps: {
            style: {
                backgroundColor: theme.colors.ldGray[0],
                borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
                fontSize: theme.fontSizes.xs,
                fontWeight: 600,
                color: theme.colors.ldGray[7],
                padding: `${theme.spacing.xs} ${theme.spacing.md}`,
            },
        },
        mantineTableBodyCellProps: {
            style: {
                fontSize: theme.fontSizes.xs,
                color: theme.colors.ldGray[7],
                padding: `${theme.spacing.xs} ${theme.spacing.md}`,
            },
        },
        renderTopToolbar: () => (
            <TableToolbar
                search={search}
                setSearch={setSearch}
                placeholder="Search filters..."
            />
        ),
    });

    return <MantineReactTable table={table} />;
};

const DashboardVersionComparison = ({
    dashboardUuid,
    projectUuid,
    versionUuid,
}: DashboardVersionComparisonProps) => {
    const dashboardQuery = useDashboardQuery({
        uuidOrSlug: dashboardUuid,
        projectUuid,
    });

    const versionQuery = useDashboardVersion(dashboardUuid, versionUuid);

    const comparison = useMemo(() => {
        if (!dashboardQuery.data || !versionQuery.data?.dashboard) {
            return null;
        }

        const current = dashboardQuery.data;
        const version = versionQuery.data.dashboard;

        // Count tiles - diff should be version - current (to show what the selected version has)
        const currentTileCount = current.tiles.length;
        const versionTileCount = version.tiles.length;
        const tileDiff = versionTileCount - currentTileCount;

        // Count only dashboard-owned charts (only these are affected by rollback)
        const currentCharts = current.tiles.filter(
            (tile) =>
                isDashboardChartTileType(tile) &&
                tile.properties.savedChartUuid &&
                tile.properties.belongsToDashboard,
        );
        const versionCharts = version.tiles.filter(
            (tile) =>
                isDashboardChartTileType(tile) &&
                tile.properties.savedChartUuid &&
                tile.properties.belongsToDashboard,
        );

        // Count SQL charts
        const currentSqlCharts = current.tiles.filter(isDashboardSqlChartTile);
        const versionSqlCharts = version.tiles.filter(isDashboardSqlChartTile);

        // Compare filters
        const currentDimensionFilters =
            current.filters?.dimensions?.length || 0;
        const currentMetricFilters = current.filters?.metrics?.length || 0;
        const currentFilterCount =
            currentDimensionFilters + currentMetricFilters;

        const versionDimensionFilters =
            version.filters?.dimensions?.length || 0;
        const versionMetricFilters = version.filters?.metrics?.length || 0;
        const versionFilterCount =
            versionDimensionFilters + versionMetricFilters;

        const filterDiff = versionFilterCount - currentFilterCount;
        const hasFilterChanges = compareFilters(
            current.filters,
            version.filters,
        );

        // Count how many filters are different (added, removed, or modified)
        const alignedFiltersData = alignFiltersByFieldId(
            getFilterDetails(current.filters),
            getFilterDetails(version.filters),
        );
        const changedFilterCount = alignedFiltersData.filter(
            (f) => f.hasChanged,
        ).length;

        // Use the chart version differences from the API if available
        // Combine all dashboard-owned chart UUIDs from both versions
        const allChartUuids = new Set<string>();
        currentCharts.forEach((tile) => {
            if (
                isDashboardChartTileType(tile) &&
                tile.properties.savedChartUuid
            ) {
                allChartUuids.add(tile.properties.savedChartUuid);
            }
        });
        versionCharts.forEach((tile) => {
            if (
                isDashboardChartTileType(tile) &&
                tile.properties.savedChartUuid
            ) {
                allChartUuids.add(tile.properties.savedChartUuid);
            }
        });

        const allChartVersionDiffs =
            versionQuery.data.chartVersionDifferences || [];
        const chartsWithDifferentVersions = allChartVersionDiffs.filter(
            (diff) =>
                diff.currentVersion &&
                diff.selectedVersion &&
                diff.currentVersion.versionUuid !==
                    diff.selectedVersion.versionUuid &&
                allChartUuids.has(diff.chartUuid),
        );

        // Create a map for quick lookup
        const chartVersionMap = new Map(
            allChartVersionDiffs.map((c) => [c.chartUuid, c]),
        );

        // Create aligned chart comparison data
        const alignedCharts = Array.from(allChartUuids)
            .map((uuid) => {
                const currentChart = currentCharts.find(
                    (c) =>
                        isDashboardChartTileType(c) &&
                        c.properties.savedChartUuid === uuid,
                );
                const versionChart = versionCharts.find(
                    (c) =>
                        isDashboardChartTileType(c) &&
                        c.properties.savedChartUuid === uuid,
                );
                const versionDiff = chartVersionMap.get(uuid);

                const chartName =
                    versionDiff?.chartName ||
                    (currentChart && isDashboardChartTileType(currentChart)
                        ? currentChart.properties.chartName
                        : null) ||
                    (versionChart && isDashboardChartTileType(versionChart)
                        ? versionChart.properties.chartName
                        : null) ||
                    'Unnamed Chart';

                // Use version data from the API when available
                let currentVersionData = versionDiff?.currentVersion ?? null;
                let selectedVersionData = versionDiff?.selectedVersion ?? null;

                // For added charts (only in version, not in chartVersionDifferences),
                // use the selected dashboard version timestamp
                if (!versionDiff && versionChart) {
                    selectedVersionData = {
                        chartUuid: uuid,
                        versionUuid: versionQuery.data?.versionUuid || '',
                        createdAt: versionQuery.data?.createdAt || new Date(),
                        createdBy: versionQuery.data?.createdBy || null,
                    };
                }

                // For removed charts (only in current, not in chartVersionDifferences),
                // use the current dashboard version timestamp
                if (!versionDiff && currentChart) {
                    currentVersionData = {
                        chartUuid: uuid,
                        versionUuid: dashboardQuery.data?.versionUuid || '',
                        createdAt: new Date(),
                        createdBy: null,
                    };
                }

                // A chart has a different version only if the API explicitly reports
                // different version UUIDs between current and selected
                const hasDifferentVersion = chartsWithDifferentVersions.some(
                    (diff) => diff.chartUuid === uuid,
                );

                return {
                    chartUuid: uuid,
                    chartName: chartName || 'Unnamed Chart',
                    inCurrent: !!currentChart,
                    inVersion: !!versionChart,
                    hasDifferentVersion,
                    currentVersion: currentVersionData,
                    selectedVersion: selectedVersionData,
                };
            })
            .sort((a, b) => a.chartName.localeCompare(b.chartName));

        // Count other tile types
        const currentMarkdownTiles = current.tiles.filter(
            isDashboardMarkdownTileType,
        );
        const versionMarkdownTiles = version.tiles.filter(
            isDashboardMarkdownTileType,
        );
        const currentLoomTiles = current.tiles.filter(isDashboardLoomTileType);
        const versionLoomTiles = version.tiles.filter(isDashboardLoomTileType);
        const currentHeadingTiles = current.tiles.filter(
            isDashboardHeadingTileType,
        );
        const versionHeadingTiles = version.tiles.filter(
            isDashboardHeadingTileType,
        );
        const currentDataAppTiles = current.tiles.filter(
            isDashboardDataAppTileType,
        );
        const versionDataAppTiles = version.tiles.filter(
            isDashboardDataAppTileType,
        );

        // Prepare tiles data for table
        const tilesData = [
            {
                tileType: 'Charts',
                current: currentCharts.length,
                selected: versionCharts.length,
                difference: versionCharts.length - currentCharts.length,
            },
            {
                tileType: 'SQL Charts',
                current: currentSqlCharts.length,
                selected: versionSqlCharts.length,
                difference: versionSqlCharts.length - currentSqlCharts.length,
            },
            {
                tileType: 'Markdown',
                current: currentMarkdownTiles.length,
                selected: versionMarkdownTiles.length,
                difference:
                    versionMarkdownTiles.length - currentMarkdownTiles.length,
            },
            {
                tileType: 'Loom',
                current: currentLoomTiles.length,
                selected: versionLoomTiles.length,
                difference: versionLoomTiles.length - currentLoomTiles.length,
            },
            {
                tileType: 'Heading',
                current: currentHeadingTiles.length,
                selected: versionHeadingTiles.length,
                difference:
                    versionHeadingTiles.length - currentHeadingTiles.length,
            },
            {
                tileType: 'Data App',
                current: currentDataAppTiles.length,
                selected: versionDataAppTiles.length,
                difference:
                    versionDataAppTiles.length - currentDataAppTiles.length,
            },
            {
                tileType: 'Total',
                current: currentTileCount,
                selected: versionTileCount,
                difference: tileDiff,
            },
        ];

        return {
            currentTileCount,
            versionTileCount,
            tileDiff,
            currentChartCount: currentCharts.length,
            versionChartCount: versionCharts.length,
            chartDiff: versionCharts.length - currentCharts.length,
            currentSqlChartCount: currentSqlCharts.length,
            versionSqlChartCount: versionSqlCharts.length,
            sqlChartDiff: versionSqlCharts.length - currentSqlCharts.length,
            currentMarkdownCount: currentMarkdownTiles.length,
            versionMarkdownCount: versionMarkdownTiles.length,
            currentLoomCount: currentLoomTiles.length,
            versionLoomCount: versionLoomTiles.length,
            currentHeadingCount: currentHeadingTiles.length,
            versionHeadingCount: versionHeadingTiles.length,
            currentFilterCount,
            versionFilterCount,
            currentDimensionFilters,
            versionDimensionFilters,
            currentMetricFilters,
            versionMetricFilters,
            filterDiff,
            chartsWithDifferentVersions,
            currentCharts,
            versionCharts,
            currentFilters: current.filters,
            versionFilters: version.filters,
            currentFilterDetails: getFilterDetails(current.filters),
            versionFilterDetails: getFilterDetails(version.filters),
            alignedFilters: alignedFiltersData,
            hasFilterChanges,
            changedFilterCount,
            alignedCharts,
            tilesData,
        };
    }, [dashboardQuery.data, versionQuery.data]);

    if (!versionUuid) {
        return null;
    }

    if (versionQuery.isLoading) {
        return (
            <Flex
                direction="column"
                align="center"
                justify="center"
                h={300}
                gap="md"
            >
                <Loader size="md" />
                <Text c="dimmed">Loading version details...</Text>
            </Flex>
        );
    }

    if (versionQuery.error || !comparison) {
        return (
            <Flex direction="column" align="center" justify="center" h={300}>
                <Text c="dimmed">Unable to load version comparison</Text>
            </Flex>
        );
    }

    // Check if the selected version is the current version
    // The versionUuid from versionQuery.data is the selected version
    // The versionUuid from dashboardQuery.data is the current/latest version
    const isCurrentVersionSelected =
        versionUuid === dashboardQuery.data?.versionUuid;

    if (isCurrentVersionSelected) {
        return (
            <EmptyState
                maw={500}
                icon={<NoTableIcon />}
                title="Select a version to compare"
            />
        );
    }

    return (
        <Stack gap="lg">
            <Title order={4}>Version Comparison</Title>

            <Stack gap="md">
                <ExpandableSection
                    title="Tiles"
                    icon={IconLayoutDashboard}
                    color="blue"
                    badge={
                        comparison.tileDiff !== 0 ? (
                            <Badge color="yellow" variant="light" size="lg">
                                {Math.abs(comparison.tileDiff)}{' '}
                                {Math.abs(comparison.tileDiff) === 1
                                    ? 'change'
                                    : 'changes'}
                            </Badge>
                        ) : (
                            <Badge color="gray" variant="light" size="lg">
                                No change
                            </Badge>
                        )
                    }
                >
                    <TilesTable data={comparison.tilesData} />
                </ExpandableSection>

                <ExpandableSection
                    title="Charts"
                    icon={IconChartBar}
                    color="violet"
                    badge={(() => {
                        const totalChanges = comparison.alignedCharts.filter(
                            (c) =>
                                c.hasDifferentVersion ||
                                !c.inCurrent ||
                                !c.inVersion,
                        ).length;
                        if (totalChanges === 0) {
                            return (
                                <Badge color="gray" variant="light" size="lg">
                                    No change
                                </Badge>
                            );
                        }
                        return (
                            <Badge color="yellow" variant="light" size="lg">
                                {totalChanges}{' '}
                                {totalChanges === 1 ? 'change' : 'changes'}
                            </Badge>
                        );
                    })()}
                >
                    <Text size="xs" c="dimmed" mb="sm">
                        Only charts created within this dashboard are affected
                        by a rollback. Charts added from the space will keep
                        their current version.
                    </Text>
                    <ChartsTable
                        data={comparison.alignedCharts}
                        projectUuid={projectUuid}
                    />
                </ExpandableSection>

                <ExpandableSection
                    title="Filters"
                    icon={IconFilter}
                    color="teal"
                    badge={
                        comparison.hasFilterChanges ? (
                            <Badge color="yellow" variant="light" size="lg">
                                {comparison.changedFilterCount}{' '}
                                {comparison.changedFilterCount === 1
                                    ? 'change'
                                    : 'changes'}
                            </Badge>
                        ) : (
                            <Badge color="gray" variant="light" size="lg">
                                No change
                            </Badge>
                        )
                    }
                >
                    {comparison.alignedFilters &&
                    comparison.alignedFilters.length > 0 ? (
                        <FiltersTable data={comparison.alignedFilters} />
                    ) : (
                        <Text size="sm" c="dimmed" ta="center">
                            No filters configured
                        </Text>
                    )}
                </ExpandableSection>

                {versionQuery.data?.dashboard.description && (
                    <Paper p="md" withBorder>
                        <Text fw={600} mb="xs">
                            Description
                        </Text>
                        <Text size="sm" c="dimmed">
                            {versionQuery.data.dashboard.description}
                        </Text>
                    </Paper>
                )}
            </Stack>
        </Stack>
    );
};

export default DashboardVersionComparison;
