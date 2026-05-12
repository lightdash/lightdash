import { ChartKind, type ChartContent } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    CloseButton,
    Group,
    Image,
    Loader,
    LoadingOverlay,
    Popover,
    ScrollArea,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconCamera,
    IconClick,
    IconDatabase,
    IconDatabaseOff,
    IconLayoutDashboard,
    IconPlus,
    IconSearch,
    IconX,
} from '@tabler/icons-react';
import uniqBy from 'lodash/uniqBy';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useParams } from 'react-router';
import MantineIcon from '../../components/common/MantineIcon';
import { ChartIcon, IconBox } from '../../components/common/ResourceIcon';
import { useDashboards } from '../../hooks/dashboard/useDashboards';
import { useChartSummariesV2 } from '../../hooks/useChartSummariesV2';
import classes from './AppResourcePicker.module.css';

export type SelectedChart = {
    uuid: string;
    name: string;
    chartKind?: ChartKind;
    /**
     * Opt-in: when true, the backend runs this chart's query and inlines up
     * to 10 sample rows alongside the metric query so the generator can see
     * actual values. Default false because rows can be sensitive.
     */
    includeSampleData: boolean;
};

export type SelectedDashboard = {
    uuid: string;
    name: string;
    /**
     * Opt-in: applies to every chart resolved from this dashboard's tiles.
     */
    includeSampleData: boolean;
};

const SAMPLE_DATA_TOOLTIP =
    'Include sample data - runs this query and shares up to 10 rows with the app generator so it can see actual values (date ranges, labels, magnitudes). Off by default because rows can be sensitive.';

/**
 * Button that triggers the file input for image upload.
 */
export const ImageButton: FC<{
    onClick: () => void;
    disabled: boolean;
}> = ({ onClick, disabled }) => (
    <Button
        variant="default"
        size="xs"
        leftSection={<MantineIcon icon={IconPlus} size={14} />}
        onClick={onClick}
        disabled={disabled}
        className={classes.resourceButton}
    >
        Images
    </Button>
);

/**
 * Button that captures a screenshot of the live preview and adds it as an
 * image attachment. Shows a loader while the capture is in flight.
 *
 * The caller is expected to render this only when a capture-capable preview
 * is mounted (i.e. gate on `screenshotAvailable`), mirroring `InspectButton`.
 */
export const ScreenshotButton: FC<{
    onClick: () => void;
    disabled: boolean;
    loading?: boolean;
}> = ({ onClick, disabled, loading }) => (
    <Button
        variant="default"
        size="xs"
        leftSection={<MantineIcon icon={IconCamera} size={14} />}
        onClick={onClick}
        disabled={disabled}
        loading={loading}
        className={classes.resourceButton}
    >
        Screenshot
    </Button>
);

/**
 * Toggle button that activates the iframe-side element inspector.
 * While enabled, clicks inside the preview iframe are intercepted and
 * inserted as bracketed references at the textarea cursor (e.g.
 * `[button "Total Revenue"]: `), so the user can compose targeted edits.
 *
 * The caller is expected to render this only when an inspector-capable
 * preview is mounted (i.e. gate on `inspectorAvailable`), so no `disabled`
 * prop is needed.
 */
export const InspectButton: FC<{
    enabled: boolean;
    onToggle: () => void;
}> = ({ enabled, onToggle }) => (
    <Button
        variant={enabled ? 'filled' : 'default'}
        color={enabled ? 'violet' : undefined}
        size="xs"
        leftSection={<MantineIcon icon={IconClick} size={14} />}
        onClick={onToggle}
        className={classes.resourceButton}
    >
        Inspect
    </Button>
);

/**
 * Button + popover that shows the chart list directly.
 * Selecting a chart removes it from the list and adds it to the parent.
 */
export const QueryButton: FC<{
    selectedCharts: SelectedChart[];
    onSelect: (chart: SelectedChart) => void;
    disabled: boolean;
}> = ({ selectedCharts, onSelect, disabled }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [opened, setOpened] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch] = useDebouncedValue(searchQuery, 300);

    const {
        data: chartPages,
        isInitialLoading,
        isFetching,
        hasNextPage,
        fetchNextPage,
    } = useChartSummariesV2(
        {
            projectUuid,
            page: 1,
            pageSize: 25,
            search: debouncedSearch,
        },
        { keepPreviousData: true, enabled: opened },
    );

    const allCharts = useMemo(
        () => uniqBy(chartPages?.pages.flatMap((p) => p.data) ?? [], 'uuid'),
        [chartPages?.pages],
    );

    const selectedUuids = useMemo(
        () => new Set(selectedCharts.map((c) => c.uuid)),
        [selectedCharts],
    );

    // Filter out already-selected charts
    const availableCharts = useMemo(
        () => allCharts.filter((c) => !selectedUuids.has(c.uuid)),
        [allCharts, selectedUuids],
    );

    // Group available charts by space
    const groupedCharts = useMemo(() => {
        const groups = new Map<string, ChartContent[]>();
        for (const chart of availableCharts) {
            const spaceName = chart.space.name;
            const group = groups.get(spaceName) ?? [];
            group.push(chart);
            groups.set(spaceName, group);
        }
        return groups;
    }, [availableCharts]);

    const handleSelect = useCallback(
        (chart: ChartContent) => {
            onSelect({
                uuid: chart.uuid,
                name: chart.name,
                chartKind: chart.chartKind ?? ChartKind.VERTICAL_BAR,
                includeSampleData: false,
            });
        },
        [onSelect],
    );

    return (
        <Popover
            opened={opened}
            onChange={setOpened}
            position="top-start"
            offset={8}
            shadow="md"
            trapFocus
        >
            <Popover.Target>
                <Button
                    variant="default"
                    size="xs"
                    leftSection={<MantineIcon icon={IconPlus} size={14} />}
                    onClick={() => setOpened((o) => !o)}
                    disabled={disabled}
                    className={classes.resourceButton}
                >
                    Queries
                </Button>
            </Popover.Target>
            <Popover.Dropdown className={classes.queryDropdown}>
                <Box p="xs" pb={0}>
                    <Text size="sm" fw={500}>
                        Add queries
                    </Text>
                    <Text size="xs" c="dimmed" mb="xs">
                        Select queries to include in the app
                    </Text>
                </Box>
                <Box px="xs" pb="xs">
                    <TextInput
                        size="xs"
                        placeholder="Search..."
                        leftSection={
                            <MantineIcon icon={IconSearch} size={14} />
                        }
                        rightSection={
                            isFetching && !isInitialLoading ? (
                                <Loader size={14} />
                            ) : undefined
                        }
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.currentTarget.value)}
                    />
                </Box>
                <ScrollArea.Autosize mah={350} px="xs" pb="xs">
                    {isInitialLoading ? (
                        <Group justify="center" p="sm">
                            <Loader size="sm" />
                        </Group>
                    ) : availableCharts.length === 0 ? (
                        <Text size="xs" c="dimmed" ta="center" p="sm">
                            {allCharts.length > 0
                                ? 'All matching charts selected'
                                : 'No charts found'}
                        </Text>
                    ) : (
                        <>
                            {Array.from(groupedCharts.entries()).map(
                                ([spaceName, charts]) => (
                                    <Box key={spaceName} mb={4}>
                                        <Box
                                            className={classes.spaceGroupLabel}
                                        >
                                            <Text size="xs" fw={500} c="dimmed">
                                                {spaceName}
                                            </Text>
                                        </Box>
                                        {charts.map((chart) => (
                                            <Box
                                                key={chart.uuid}
                                                className={classes.chartItem}
                                                onClick={() =>
                                                    handleSelect(chart)
                                                }
                                            >
                                                <ChartIcon
                                                    chartKind={
                                                        chart.chartKind ??
                                                        ChartKind.VERTICAL_BAR
                                                    }
                                                />
                                                <Text
                                                    size="xs"
                                                    fw={500}
                                                    truncate
                                                    flex={1}
                                                >
                                                    {chart.name}
                                                </Text>
                                            </Box>
                                        ))}
                                    </Box>
                                ),
                            )}
                            {hasNextPage && (
                                <Box ta="center" py={4}>
                                    <Button
                                        variant="subtle"
                                        size="xs"
                                        onClick={() => void fetchNextPage()}
                                        loading={isFetching}
                                    >
                                        Load more
                                    </Button>
                                </Box>
                            )}
                        </>
                    )}
                </ScrollArea.Autosize>
            </Popover.Dropdown>
        </Popover>
    );
};

/**
 * Renders selected images as rounded thumbnails with remove buttons.
 */
export const SelectedImageSection: FC<{
    images: Array<{ previewUrl: string }>;
    onRemove: (previewUrl: string) => void;
    disabled?: boolean;
    loading?: boolean;
}> = ({ images, onRemove, disabled, loading }) => {
    if (images.length === 0) return null;

    return (
        <Group gap="xs">
            {images.map((img) => (
                <Box key={img.previewUrl} className={classes.imageItem}>
                    <Image
                        src={img.previewUrl}
                        className={classes.imageThumb}
                        alt="Attached"
                    />
                    <LoadingOverlay
                        visible={loading ?? false}
                        loaderProps={{ size: 'xs' }}
                        overlayProps={{
                            radius: 'md',
                            backgroundOpacity: 0.5,
                        }}
                    />
                    {!loading && (
                        <CloseButton
                            size="xs"
                            className={classes.imageRemove}
                            onClick={() => onRemove(img.previewUrl)}
                            disabled={disabled}
                        />
                    )}
                </Box>
            ))}
        </Group>
    );
};

/**
 * Renders selected queries as a list using the same visual as the picker.
 * Each row carries a per-chart sample-data toggle; off by default because
 * sample rows can include sensitive values.
 */
export const SelectedQuerySection: FC<{
    charts: SelectedChart[];
    onRemove: (uuid: string) => void;
    onToggleSampleData: (uuid: string) => void;
    disabled?: boolean;
}> = ({ charts, onRemove, onToggleSampleData, disabled }) => {
    if (charts.length === 0) return null;

    return (
        <Box className={classes.selectedQueryList}>
            {charts.map((chart) => (
                <Box key={chart.uuid} className={classes.selectedQueryItem}>
                    <ChartIcon
                        chartKind={chart.chartKind ?? ChartKind.VERTICAL_BAR}
                    />
                    <Text size="xs" fw={500} truncate flex={1}>
                        {chart.name}
                    </Text>
                    <Tooltip
                        label={SAMPLE_DATA_TOOLTIP}
                        multiline
                        w={260}
                        withArrow
                    >
                        <ActionIcon
                            size="xs"
                            variant={
                                chart.includeSampleData ? 'filled' : 'default'
                            }
                            color={chart.includeSampleData ? 'blue' : 'gray'}
                            onClick={() => onToggleSampleData(chart.uuid)}
                            disabled={disabled}
                            aria-label={
                                chart.includeSampleData
                                    ? 'Sample data: on'
                                    : 'Sample data: off'
                            }
                        >
                            <MantineIcon
                                icon={
                                    chart.includeSampleData
                                        ? IconDatabase
                                        : IconDatabaseOff
                                }
                                size={12}
                            />
                        </ActionIcon>
                    </Tooltip>
                    <ActionIcon
                        size="xs"
                        variant="subtle"
                        color="gray"
                        onClick={() => onRemove(chart.uuid)}
                        disabled={disabled}
                    >
                        <MantineIcon icon={IconX} size={12} />
                    </ActionIcon>
                </Box>
            ))}
        </Box>
    );
};

/**
 * Button + popover for selecting a single dashboard.
 */
export const DashboardButton: FC<{
    selected: SelectedDashboard | null;
    onSelect: (dashboard: SelectedDashboard) => void;
    disabled: boolean;
}> = ({ selected, onSelect, disabled }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [opened, setOpened] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch] = useDebouncedValue(searchQuery, 300);

    const { data: dashboards, isInitialLoading } = useDashboards(projectUuid, {
        enabled: opened,
    });

    const filteredDashboards = useMemo(() => {
        if (!dashboards) return [];
        const term = debouncedSearch.toLowerCase();
        if (!term) return dashboards;
        return dashboards.filter((d) => d.name.toLowerCase().includes(term));
    }, [dashboards, debouncedSearch]);

    const handleSelect = useCallback(
        (dashboard: { uuid: string; name: string }) => {
            onSelect({
                uuid: dashboard.uuid,
                name: dashboard.name,
                includeSampleData: false,
            });
            setOpened(false);
            setSearchQuery('');
        },
        [onSelect],
    );

    return (
        <Popover
            opened={opened}
            onChange={setOpened}
            position="top-start"
            offset={8}
            shadow="md"
            trapFocus
        >
            <Popover.Target>
                <Button
                    variant="default"
                    size="xs"
                    leftSection={<MantineIcon icon={IconPlus} size={14} />}
                    onClick={() => setOpened((o) => !o)}
                    disabled={disabled || selected !== null}
                    className={classes.resourceButton}
                >
                    Dashboard
                </Button>
            </Popover.Target>
            <Popover.Dropdown className={classes.queryDropdown}>
                <Box p="xs" pb={0}>
                    <Text size="sm" fw={500}>
                        Add a dashboard
                    </Text>
                    <Text size="xs" c="dimmed" mb="xs">
                        All chart tiles will be included as references
                    </Text>
                </Box>
                <Box px="xs" pb="xs">
                    <TextInput
                        size="xs"
                        placeholder="Search..."
                        leftSection={
                            <MantineIcon icon={IconSearch} size={14} />
                        }
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.currentTarget.value)}
                    />
                </Box>
                <ScrollArea.Autosize mah={350} px="xs" pb="xs">
                    {isInitialLoading ? (
                        <Group justify="center" p="sm">
                            <Loader size="sm" />
                        </Group>
                    ) : filteredDashboards.length === 0 ? (
                        <Text size="xs" c="dimmed" ta="center" p="sm">
                            No dashboards found
                        </Text>
                    ) : (
                        filteredDashboards.map((dashboard) => (
                            <Box
                                key={dashboard.uuid}
                                className={classes.chartItem}
                                onClick={() => handleSelect(dashboard)}
                            >
                                <IconBox
                                    icon={IconLayoutDashboard}
                                    color="green.6"
                                />
                                <Text size="xs" fw={500} truncate flex={1}>
                                    {dashboard.name}
                                </Text>
                            </Box>
                        ))
                    )}
                </ScrollArea.Autosize>
            </Popover.Dropdown>
        </Popover>
    );
};

/**
 * Renders the selected dashboard with a remove button. The sample-data
 * toggle here applies to every chart resolved from this dashboard's tiles.
 */
export const SelectedDashboardSection: FC<{
    dashboard: SelectedDashboard;
    onRemove: () => void;
    onToggleSampleData: () => void;
    disabled?: boolean;
}> = ({ dashboard, onRemove, onToggleSampleData, disabled }) => (
    <Box className={classes.selectedQueryList}>
        <Box className={classes.selectedQueryItem}>
            <IconBox icon={IconLayoutDashboard} color="green.6" />
            <Text size="xs" fw={500} truncate flex={1}>
                {dashboard.name}
            </Text>
            <Tooltip
                label={`${SAMPLE_DATA_TOOLTIP} Applies to every chart in this dashboard.`}
                multiline
                w={260}
                withArrow
            >
                <ActionIcon
                    size="xs"
                    variant={dashboard.includeSampleData ? 'filled' : 'default'}
                    color={dashboard.includeSampleData ? 'blue' : 'gray'}
                    onClick={onToggleSampleData}
                    disabled={disabled}
                    aria-label={
                        dashboard.includeSampleData
                            ? 'Sample data: on'
                            : 'Sample data: off'
                    }
                >
                    <MantineIcon
                        icon={
                            dashboard.includeSampleData
                                ? IconDatabase
                                : IconDatabaseOff
                        }
                        size={12}
                    />
                </ActionIcon>
            </Tooltip>
            <ActionIcon
                size="xs"
                variant="subtle"
                color="gray"
                onClick={onRemove}
                disabled={disabled}
            >
                <MantineIcon icon={IconX} size={12} />
            </ActionIcon>
        </Box>
    </Box>
);
