import {
    ChartKind,
    type ChartContent,
    type DataAppClaudeModel,
} from '@lightdash/common';
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
    UnstyledButton,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconArrowLeft,
    IconCamera,
    IconChartBar,
    IconCheck,
    IconClick,
    IconDatabase,
    IconDatabasePlus,
    IconLayoutDashboard,
    IconPhoto,
    IconPlus,
    IconSearch,
    IconSparkles,
    IconX,
} from '@tabler/icons-react';
import uniqBy from 'lodash/uniqBy';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useParams } from 'react-router';
import MantineIcon from '../../components/common/MantineIcon';
import { ChartIcon, IconBox } from '../../components/common/ResourceIcon';
import { getChartIcon } from '../../components/common/ResourceIcon/utils';
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
 * Button that captures a screenshot of the live preview and adds it as an
 * image attachment. Shows a loader while the capture is in flight.
 *
 * Always rendered so the toolbar shape is stable; pass `disabled` when the
 * preview isn't mounted or the iframe SDK hasn't announced screenshot support.
 */
export const ScreenshotButton: FC<{
    onClick: () => void;
    disabled: boolean;
    loading?: boolean;
}> = ({ onClick, disabled, loading }) => (
    <Tooltip label="Capture screenshot" withArrow position="top">
        <ActionIcon
            variant="default"
            size="lg"
            radius="md"
            onClick={onClick}
            disabled={disabled}
            loading={loading}
            aria-label="Capture screenshot"
        >
            <MantineIcon icon={IconCamera} size={16} />
        </ActionIcon>
    </Tooltip>
);

/**
 * Toggle button that activates the iframe-side element inspector.
 * While enabled, clicks inside the preview iframe are intercepted and
 * inserted as bracketed references at the textarea cursor (e.g.
 * `[button "Total Revenue"]: `), so the user can compose targeted edits.
 *
 * Always rendered so the toolbar shape is stable; pass `disabled` when the
 * preview isn't mounted or the iframe SDK hasn't announced inspector support.
 */
export const InspectButton: FC<{
    enabled: boolean;
    onToggle: () => void;
    disabled?: boolean;
}> = ({ enabled, onToggle, disabled }) => (
    <Tooltip
        label={enabled ? 'Inspect mode: on' : 'Inspect element'}
        withArrow
        position="top"
    >
        <ActionIcon
            variant={enabled ? 'filled' : 'default'}
            color={enabled ? 'violet' : undefined}
            size="lg"
            radius="md"
            onClick={onToggle}
            disabled={disabled}
            aria-label="Toggle element inspector"
        >
            <MantineIcon icon={IconClick} size={16} />
        </ActionIcon>
    </Tooltip>
);

type ModelOption = {
    value: DataAppClaudeModel;
    label: string;
    // Short advantage line shown in the popover. Together with the order
    // below, these form a capability spectrum (premium → balanced → budget)
    // so the trade-off is legible at a glance.
    tagline: string;
    isDefault?: boolean;
};

// Order: capability descending — Opus (highest quality) → Sonnet (default) →
// Haiku (fastest). The "Default" tag on Sonnet anchors the recommendation
// without forcing it to position 0.
const MODEL_OPTIONS: ModelOption[] = [
    {
        value: 'opus',
        label: 'Opus',
        tagline: 'Highest quality. Best for complex apps. Slowest.',
    },
    {
        value: 'sonnet',
        label: 'Sonnet',
        tagline: 'Balanced quality and speed. Good fit for most apps.',
        isDefault: true,
    },
    {
        value: 'haiku',
        label: 'Haiku',
        tagline: 'Fastest. Best for quick iterations and simple tweaks.',
    },
];

// Lookup helper. The type union and MODEL_OPTIONS are kept in sync via
// DATA_APP_CLAUDE_MODELS, but the underlying value can ultimately come from
// the JSONB `resources.claudeModel` column — so a stale or hand-edited row
// could land here as a string outside the union at runtime. Fall back to the
// default option rather than throw, so a corrupt row never crashes the
// AppGenerate page; the user can still pick a valid model from the popover.
const findModelOption = (value: DataAppClaudeModel): ModelOption =>
    MODEL_OPTIONS.find((o) => o.value === value) ??
    MODEL_OPTIONS.find((o) => o.isDefault) ??
    MODEL_OPTIONS[0];

/**
 * Picker for the Claude model the agent uses to build the data app.
 *
 * Inline next to the send button so the choice is visible at submit time;
 * also editable mid-iteration — `claude --continue` accepts a fresh
 * `--model` flag each turn while preserving the prior conversation context.
 *
 * The label of the current choice ("Sonnet" / "Haiku") is shown on the
 * trigger so the user doesn't have to open the popover to confirm what
 * they're about to run with. The advantages are summarised in the popover
 * itself rather than a tooltip, so both options are visible at the same time.
 */
export const ModelPicker: FC<{
    value: DataAppClaudeModel;
    onChange: (value: DataAppClaudeModel) => void;
    disabled?: boolean;
}> = ({ value, onChange, disabled }) => {
    const [opened, setOpened] = useState(false);
    const current = findModelOption(value);

    return (
        <Popover
            opened={opened}
            onChange={setOpened}
            position="top-end"
            offset={8}
            shadow="md"
            trapFocus
        >
            <Popover.Target>
                <Tooltip
                    label={`Claude model: ${current.label}`}
                    withArrow
                    position="top"
                >
                    <ActionIcon
                        variant="default"
                        size="lg"
                        radius="md"
                        onClick={() => setOpened((o) => !o)}
                        disabled={disabled}
                        aria-label={`Claude model: ${current.label}`}
                    >
                        <MantineIcon icon={IconSparkles} size={16} />
                    </ActionIcon>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown className={classes.queryDropdown} p={0}>
                <Box py="xs">
                    {MODEL_OPTIONS.map((opt) => {
                        const isActive = opt.value === value;
                        return (
                            <UnstyledButton
                                key={opt.value}
                                className={classes.attachMenuItem}
                                onClick={() => {
                                    onChange(opt.value);
                                    setOpened(false);
                                }}
                                aria-pressed={isActive}
                            >
                                <Box flex={1}>
                                    <Group gap="xs" align="center">
                                        <Text size="sm" fw={500}>
                                            {opt.label}
                                        </Text>
                                        {opt.isDefault && (
                                            <Text size="xs" c="dimmed">
                                                Default
                                            </Text>
                                        )}
                                        {isActive && (
                                            <MantineIcon
                                                icon={IconCheck}
                                                size={14}
                                                color="indigo.6"
                                            />
                                        )}
                                    </Group>
                                    <Text size="xs" c="dimmed">
                                        {opt.tagline}
                                    </Text>
                                </Box>
                            </UnstyledButton>
                        );
                    })}
                </Box>
            </Popover.Dropdown>
        </Popover>
    );
};

/**
 * Internal: chart list with search. Used inside `AttachButton`'s popover.
 * Selecting a chart adds it to the parent and keeps the picker open so
 * multiple can be added in one flow.
 */
const QueryPickerView: FC<{
    selectedCharts: SelectedChart[];
    onSelect: (chart: SelectedChart) => void;
    onDeselect: (uuid: string) => void;
    onDone: () => void;
    enabled: boolean;
}> = ({ selectedCharts, onSelect, onDeselect, onDone, enabled }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
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
        { keepPreviousData: true, enabled },
    );

    const allCharts = useMemo(
        () => uniqBy(chartPages?.pages.flatMap((p) => p.data) ?? [], 'uuid'),
        [chartPages?.pages],
    );

    const selectedUuids = useMemo(
        () => new Set(selectedCharts.map((c) => c.uuid)),
        [selectedCharts],
    );

    const groupedCharts = useMemo(() => {
        const groups = new Map<string, ChartContent[]>();
        for (const chart of allCharts) {
            const spaceName = chart.space.name;
            const group = groups.get(spaceName) ?? [];
            group.push(chart);
            groups.set(spaceName, group);
        }
        return groups;
    }, [allCharts]);

    const handleToggle = useCallback(
        (chart: ChartContent) => {
            if (selectedUuids.has(chart.uuid)) {
                onDeselect(chart.uuid);
            } else {
                onSelect({
                    uuid: chart.uuid,
                    name: chart.name,
                    chartKind: chart.chartKind ?? ChartKind.VERTICAL_BAR,
                    includeSampleData: false,
                });
            }
        },
        [onSelect, onDeselect, selectedUuids],
    );

    return (
        <>
            <Box px="xs" pb="xs">
                <TextInput
                    size="xs"
                    placeholder="Search queries..."
                    leftSection={<MantineIcon icon={IconSearch} size={14} />}
                    rightSection={
                        isFetching && !isInitialLoading ? (
                            <Loader size={14} />
                        ) : undefined
                    }
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.currentTarget.value)}
                    autoFocus
                />
            </Box>
            <ScrollArea.Autosize mah={350} px="xs" pb="xs">
                {isInitialLoading ? (
                    <Group justify="center" p="sm">
                        <Loader size="sm" />
                    </Group>
                ) : allCharts.length === 0 ? (
                    <Text size="xs" c="dimmed" ta="center" p="sm">
                        No charts found
                    </Text>
                ) : (
                    <>
                        {Array.from(groupedCharts.entries()).map(
                            ([spaceName, charts]) => (
                                <Box key={spaceName} mb={4}>
                                    <Box className={classes.spaceGroupLabel}>
                                        <Text size="xs" fw={500} c="dimmed">
                                            {spaceName}
                                        </Text>
                                    </Box>
                                    {charts.map((chart) => {
                                        const isSelected = selectedUuids.has(
                                            chart.uuid,
                                        );
                                        return (
                                            <Box
                                                key={chart.uuid}
                                                className={`${classes.chartItem} ${
                                                    isSelected
                                                        ? classes.chartItemSelected
                                                        : ''
                                                }`}
                                                onClick={() =>
                                                    handleToggle(chart)
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
                                                {isSelected && (
                                                    <Box
                                                        className={
                                                            classes.chartItemSelectedIcon
                                                        }
                                                    >
                                                        <MantineIcon
                                                            icon={IconCheck}
                                                            size={14}
                                                        />
                                                    </Box>
                                                )}
                                            </Box>
                                        );
                                    })}
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
            <Box className={classes.attachPickerFooter}>
                <Button size="compact-xs" radius="md" onClick={onDone}>
                    Done
                </Button>
            </Box>
        </>
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
 * Dashed circular button rendered after a pill when sample data is off.
 * Click → enables sample data; the pill then shows an inline database icon
 * (via `InlineDataToggle`) and this button disappears.
 */
const AddDataButton: FC<{
    onClick: () => void;
    disabled?: boolean;
    tooltipSuffix?: string;
}> = ({ onClick, disabled, tooltipSuffix }) => (
    <Tooltip
        label={`${SAMPLE_DATA_TOOLTIP}${tooltipSuffix ?? ''}`}
        multiline
        w={260}
        withArrow
    >
        <UnstyledButton
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={classes.addDataButton}
            aria-label="Include sample data"
        >
            <MantineIcon icon={IconDatabasePlus} size={12} />
        </UnstyledButton>
    </Tooltip>
);

/**
 * Inline database icon button inside the pill when sample data is on.
 * Click → disables sample data; the pill reverts to plain and the
 * `AddDataButton` reappears next to it.
 */
const InlineDataToggle: FC<{
    onClick: () => void;
    disabled?: boolean;
    tooltipSuffix?: string;
}> = ({ onClick, disabled, tooltipSuffix }) => (
    <Tooltip
        label={`Sample data included — click to remove.${tooltipSuffix ?? ''}`}
        multiline
        w={260}
        withArrow
    >
        <UnstyledButton
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={classes.inlineDataToggle}
            aria-label="Sample data: on"
        >
            <MantineIcon icon={IconDatabase} size={12} />
        </UnstyledButton>
    </Tooltip>
);

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
                <Box key={chart.uuid} className={classes.selectedQueryItemRow}>
                    <Box
                        className={`${classes.selectedQueryItem} ${
                            chart.includeSampleData
                                ? classes.selectedQueryItemActive
                                : ''
                        }`}
                    >
                        <Box className={classes.selectedQueryItemIcon}>
                            <MantineIcon
                                icon={getChartIcon(
                                    chart.chartKind ?? ChartKind.VERTICAL_BAR,
                                )}
                                size={12}
                                color="blue.6"
                            />
                        </Box>
                        <Text
                            fw={500}
                            truncate
                            className={classes.selectedQueryItemName}
                        >
                            {chart.name}
                        </Text>
                        {chart.includeSampleData && (
                            <InlineDataToggle
                                onClick={() => onToggleSampleData(chart.uuid)}
                                disabled={disabled}
                            />
                        )}
                        <ActionIcon
                            size="xs"
                            variant="subtle"
                            color="gray"
                            radius="xl"
                            onClick={() => onRemove(chart.uuid)}
                            disabled={disabled}
                        >
                            <MantineIcon icon={IconX} size={10} />
                        </ActionIcon>
                    </Box>
                    {!chart.includeSampleData && (
                        <AddDataButton
                            onClick={() => onToggleSampleData(chart.uuid)}
                            disabled={disabled}
                        />
                    )}
                </Box>
            ))}
        </Box>
    );
};

/**
 * Internal: dashboard list with search. Used inside `AttachButton`'s
 * popover. Single-select: clicking a different dashboard replaces the
 * current one (and tells the parent to close the popover); clicking the
 * already-selected dashboard deselects and keeps the popover open.
 */
const DashboardPickerView: FC<{
    selectedDashboard: SelectedDashboard | null;
    onSelect: (dashboard: SelectedDashboard) => void;
    onDeselect: () => void;
    enabled: boolean;
}> = ({ selectedDashboard, onSelect, onDeselect, enabled }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch] = useDebouncedValue(searchQuery, 300);

    const { data: dashboards, isInitialLoading } = useDashboards(projectUuid, {
        enabled,
    });

    const filteredDashboards = useMemo(() => {
        if (!dashboards) return [];
        const term = debouncedSearch.toLowerCase();
        if (!term) return dashboards;
        return dashboards.filter((d) => d.name.toLowerCase().includes(term));
    }, [dashboards, debouncedSearch]);

    const handleToggle = useCallback(
        (dashboard: { uuid: string; name: string }) => {
            if (selectedDashboard?.uuid === dashboard.uuid) {
                onDeselect();
            } else {
                onSelect({
                    uuid: dashboard.uuid,
                    name: dashboard.name,
                    includeSampleData: false,
                });
            }
        },
        [onSelect, onDeselect, selectedDashboard],
    );

    return (
        <>
            <Box px="xs" pb="xs">
                <TextInput
                    size="xs"
                    placeholder="Search dashboards..."
                    leftSection={<MantineIcon icon={IconSearch} size={14} />}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.currentTarget.value)}
                    autoFocus
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
                    filteredDashboards.map((dashboard) => {
                        const isSelected =
                            selectedDashboard?.uuid === dashboard.uuid;
                        return (
                            <Box
                                key={dashboard.uuid}
                                className={`${classes.chartItem} ${
                                    isSelected ? classes.chartItemSelected : ''
                                }`}
                                onClick={() => handleToggle(dashboard)}
                            >
                                <IconBox
                                    icon={IconLayoutDashboard}
                                    color="green.6"
                                />
                                <Text size="xs" fw={500} truncate flex={1}>
                                    {dashboard.name}
                                </Text>
                                {isSelected && (
                                    <Box
                                        className={
                                            classes.chartItemSelectedIcon
                                        }
                                    >
                                        <MantineIcon
                                            icon={IconCheck}
                                            size={14}
                                        />
                                    </Box>
                                )}
                            </Box>
                        );
                    })
                )}
            </ScrollArea.Autosize>
        </>
    );
};

type AttachView = 'menu' | 'queries' | 'dashboard';

/**
 * Compact `+` trigger that opens a single Popover whose contents switch
 * between a top-level menu (Queries / Dashboard / Images) and the
 * matching picker view. Replaces the previous trio of side-by-side
 * Queries/Dashboard/Images buttons so the input area can match the
 * `+`-menu pattern used by other chat composers.
 */
export const AttachButton: FC<{
    selectedCharts: SelectedChart[];
    onSelectChart: (chart: SelectedChart) => void;
    onDeselectChart: (uuid: string) => void;
    selectedDashboard: SelectedDashboard | null;
    onSelectDashboard: (dashboard: SelectedDashboard) => void;
    onDeselectDashboard: () => void;
    onAddImages: () => void;
    disabled: boolean;
    imagesDisabled: boolean;
}> = ({
    selectedCharts,
    onSelectChart,
    onDeselectChart,
    selectedDashboard,
    onSelectDashboard,
    onDeselectDashboard,
    onAddImages,
    disabled,
    imagesDisabled,
}) => {
    const [opened, setOpened] = useState(false);
    const [view, setView] = useState<AttachView>('menu');

    const handleChange = useCallback((isOpen: boolean) => {
        setOpened(isOpen);
        if (!isOpen) setView('menu');
    }, []);

    const handleSelectDashboard = useCallback(
        (dashboard: SelectedDashboard) => {
            onSelectDashboard(dashboard);
            setOpened(false);
            setView('menu');
        },
        [onSelectDashboard],
    );

    const handleImagesClick = useCallback(() => {
        setOpened(false);
        setView('menu');
        onAddImages();
    }, [onAddImages]);

    const headerTitle = view === 'queries' ? 'Add queries' : 'Add a dashboard';
    const headerSubtitle =
        view === 'queries'
            ? 'Select queries to include in the app'
            : 'All chart tiles will be included as references';

    return (
        <Popover
            opened={opened}
            onChange={handleChange}
            position="top-start"
            offset={8}
            shadow="md"
            trapFocus
        >
            <Popover.Target>
                <Tooltip label="Add resources" withArrow position="top">
                    <ActionIcon
                        variant="default"
                        size="lg"
                        radius="md"
                        onClick={() => setOpened((o) => !o)}
                        disabled={disabled}
                        aria-label="Attach resources"
                    >
                        <MantineIcon icon={IconPlus} size={16} />
                    </ActionIcon>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown className={classes.queryDropdown} p={0}>
                {view === 'menu' ? (
                    <Box py="xs">
                        <UnstyledButton
                            className={classes.attachMenuItem}
                            onClick={() => setView('queries')}
                        >
                            <MantineIcon icon={IconChartBar} />
                            <Box flex={1}>
                                <Text size="sm" fw={500}>
                                    Queries
                                </Text>
                                <Text size="xs" c="dimmed">
                                    Attach saved charts
                                </Text>
                            </Box>
                        </UnstyledButton>
                        <UnstyledButton
                            className={classes.attachMenuItem}
                            onClick={() => setView('dashboard')}
                        >
                            <MantineIcon icon={IconLayoutDashboard} />
                            <Box flex={1}>
                                <Text size="sm" fw={500}>
                                    Dashboard
                                </Text>
                                <Text size="xs" c="dimmed">
                                    Attach all tiles from a dashboard
                                </Text>
                            </Box>
                        </UnstyledButton>
                        <UnstyledButton
                            className={classes.attachMenuItem}
                            onClick={handleImagesClick}
                            disabled={imagesDisabled}
                            data-disabled={imagesDisabled || undefined}
                        >
                            <MantineIcon icon={IconPhoto} />
                            <Box flex={1}>
                                <Text size="sm" fw={500}>
                                    Images
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {imagesDisabled
                                        ? 'Image limit reached'
                                        : 'Upload reference images'}
                                </Text>
                            </Box>
                        </UnstyledButton>
                    </Box>
                ) : (
                    <>
                        <Box
                            p="xs"
                            pb={0}
                            className={classes.attachPickerHeader}
                        >
                            <ActionIcon
                                variant="subtle"
                                size="sm"
                                onClick={() => setView('menu')}
                                aria-label="Back to attach menu"
                            >
                                <MantineIcon icon={IconArrowLeft} size={14} />
                            </ActionIcon>
                            <Box>
                                <Text size="sm" fw={500}>
                                    {headerTitle}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {headerSubtitle}
                                </Text>
                            </Box>
                        </Box>
                        {view === 'queries' ? (
                            <QueryPickerView
                                selectedCharts={selectedCharts}
                                onSelect={onSelectChart}
                                onDeselect={onDeselectChart}
                                onDone={() => {
                                    setOpened(false);
                                    setView('menu');
                                }}
                                enabled={opened}
                            />
                        ) : (
                            <DashboardPickerView
                                selectedDashboard={selectedDashboard}
                                onSelect={handleSelectDashboard}
                                onDeselect={onDeselectDashboard}
                                enabled={opened}
                            />
                        )}
                    </>
                )}
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
        <Box className={classes.selectedQueryItemRow}>
            <Box
                className={`${classes.selectedQueryItem} ${
                    dashboard.includeSampleData
                        ? classes.selectedQueryItemActive
                        : ''
                }`}
            >
                <Box className={classes.selectedQueryItemIcon}>
                    <MantineIcon
                        icon={IconLayoutDashboard}
                        size={12}
                        color="green.6"
                    />
                </Box>
                <Text
                    fw={500}
                    truncate
                    className={classes.selectedQueryItemName}
                >
                    {dashboard.name}
                </Text>
                {dashboard.includeSampleData && (
                    <InlineDataToggle
                        onClick={onToggleSampleData}
                        disabled={disabled}
                        tooltipSuffix=" Applies to every chart in this dashboard."
                    />
                )}
                <ActionIcon
                    size="xs"
                    variant="subtle"
                    color="gray"
                    radius="xl"
                    onClick={onRemove}
                    disabled={disabled}
                >
                    <MantineIcon icon={IconX} size={10} />
                </ActionIcon>
            </Box>
            {!dashboard.includeSampleData && (
                <AddDataButton
                    onClick={onToggleSampleData}
                    disabled={disabled}
                    tooltipSuffix=" Applies to every chart in this dashboard."
                />
            )}
        </Box>
    </Box>
);
