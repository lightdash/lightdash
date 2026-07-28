import { subject } from '@casl/ability';
import {
    ChartKind,
    type ChartContent,
    type AiModelOption,
    type DataAppClaudeModel,
    type ExternalConnection,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Button,
    CloseButton,
    Group,
    Image,
    Loader,
    LoadingOverlay,
    Popover,
    ScrollArea,
    Stack,
    Text,
    TextInput,
    Tooltip,
    UnstyledButton,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine-8/hooks';
import {
    IconArrowLeft,
    IconCamera,
    IconChartBar,
    IconCheck,
    IconClick,
    IconDatabase,
    IconDatabasePlus,
    IconFileDescription,
    IconLayoutDashboard,
    IconLink,
    IconPhoto,
    IconPlugConnected,
    IconPlus,
    IconSearch,
    IconX,
} from '@tabler/icons-react';
import uniqBy from 'lodash/uniqBy';
import {
    useCallback,
    useMemo,
    useState,
    type ClipboardEvent,
    type FC,
} from 'react';
import { useParams } from 'react-router';
import MantineIcon from '../../components/common/MantineIcon';
import { ModelSelector } from '../../components/common/ModelSelector/ModelSelector';
import { ChartIcon, IconBox } from '../../components/common/ResourceIcon';
import { getChartIcon } from '../../components/common/ResourceIcon/utils';
import { useDashboards } from '../../hooks/dashboard/useDashboards';
import { useChartSummariesV2 } from '../../hooks/useChartSummariesV2';
import { useProject } from '../../hooks/useProject';
import useApp from '../../providers/App/useApp';
import { useExternalConnections } from '../externalConnections/hooks/useExternalConnections';
import classes from './AppResourcePicker.module.css';
import {
    useAttachResourceLink,
    type AttachableResourceType,
    type AttachLinkOutcome,
} from './hooks/useAttachResourceLink';

type AttachFromLink = (
    input: string,
    accepts: AttachableResourceType,
) => Promise<AttachLinkOutcome>;

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
    /** When true the chart is linked (run live by uuid) rather than copied. */
    linkLive: boolean;
};

export type SelectedDashboard = {
    uuid: string;
    name: string;
    /**
     * Opt-in: applies to every chart resolved from this dashboard's tiles.
     */
    includeSampleData: boolean;
};

export type SelectedConnection = {
    externalConnectionUuid: string;
    name: string;
    /** Handle the generated app calls it by: client.externalFetch(alias, …). */
    alias: string;
};

/** Derive a stable, code-safe alias from a connection name. */
const aliasFromName = (name: string): string =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

const SAMPLE_DATA_TOOLTIP =
    'Include sample data - runs this query and shares up to 10 rows with the app generator so it can see actual values (date ranges, labels, magnitudes). Off by default because rows can be sensitive.';

/**
 * Button that captures a screenshot of the live preview and adds it as an
 * image attachment. Shows a loader while the capture is in flight.
 *
 * Rendered only once the preview is mounted and the iframe SDK has announced
 * screenshot support — an always-present but permanently dead control reads as
 * broken on the compose screen, where no app exists yet.
 */
export const ScreenshotButton: FC<{
    onClick: () => void;
    disabled: boolean;
    loading?: boolean;
}> = ({ onClick, disabled, loading }) => (
    <Tooltip
        label="Capture a screenshot of the preview and attach it"
        withArrow
        position="top"
    >
        <ActionIcon
            variant="subtle"
            color="gray"
            size="md"
            radius="xl"
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
 * Rendered only once the iframe SDK has announced inspector support, for the
 * same reason as the screenshot button.
 */
export const InspectButton: FC<{
    enabled: boolean;
    onToggle: () => void;
    disabled?: boolean;
}> = ({ enabled, onToggle, disabled }) => (
    <Tooltip
        label={
            enabled
                ? 'Inspect mode on - click any element in the preview'
                : 'Point at an element in the preview to reference it'
        }
        withArrow
        position="top"
    >
        <ActionIcon
            variant={enabled ? 'light' : 'subtle'}
            color={enabled ? 'indigo' : 'gray'}
            size="md"
            radius="xl"
            onClick={onToggle}
            disabled={disabled}
            aria-label="Toggle element inspector"
            aria-pressed={enabled}
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

// All data-app models are Anthropic's; the shared selector keys models by
// "provider:name".
const DATA_APP_MODEL_PROVIDER = 'anthropic';

const toModelKey = (value: DataAppClaudeModel): string =>
    `${DATA_APP_MODEL_PROVIDER}:${value}`;

const toModelOption = (opt: ModelOption): AiModelOption => ({
    name: opt.value,
    displayName: opt.label,
    description: opt.tagline,
    provider: DATA_APP_MODEL_PROVIDER,
    default: opt.isDefault === true,
    supportsReasoning: false,
});

/**
 * Picker for the Claude model the agent uses to build the data app.
 *
 * Inline next to the send button so the choice is visible at submit time;
 * also editable mid-iteration — `claude --continue` accepts a fresh
 * `--model` flag each turn while preserving the prior conversation context.
 *
 * Renders the shared `ModelSelector` so the data-app composer and the AI
 * agent chat offer the same control; the data-app model union is mapped onto
 * the provider-qualified model options that selector expects.
 */
export const ModelPicker: FC<{
    value: DataAppClaudeModel;
    onChange: (value: DataAppClaudeModel) => void;
    disabled?: boolean;
    /** Restrict the picker to these models (org admin visibility settings).
     *  Defaults to all models when omitted. */
    visibleModels?: DataAppClaudeModel[];
}> = ({ value, onChange, disabled, visibleModels }) => {
    const models = useMemo(
        () =>
            MODEL_OPTIONS.filter(
                (opt) => !visibleModels || visibleModels.includes(opt.value),
            ).map(toModelOption),
        [visibleModels],
    );

    return (
        <ModelSelector
            models={models}
            value={toModelKey(findModelOption(value).value)}
            onChange={(modelKey) => {
                const picked = MODEL_OPTIONS.find(
                    (opt) => toModelKey(opt.value) === modelKey,
                );
                if (picked) onChange(picked.value);
            }}
            disabled={disabled}
            variant="subtle"
            color="gray"
            size="xs"
        />
    );
};

/**
 * Bound to paste rather than to every keystroke: a half-typed URL is still a
 * syntactically valid link, so `onChange` would fire lookups for ids that
 * don't exist yet. Clears the box on success, leaves the text on failure.
 */
const useLinkPasteHandler = (
    attachFromLink: AttachFromLink,
    accepts: AttachableResourceType,
    setSearchQuery: (value: string) => void,
) =>
    useCallback(
        async (event: ClipboardEvent<HTMLInputElement>) => {
            const pasted = event.clipboardData.getData('text');
            if ((await attachFromLink(pasted, accepts)) === 'attached') {
                setSearchQuery('');
            }
        },
        [attachFromLink, accepts, setSearchQuery],
    );

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
    attachFromLink: AttachFromLink;
    isResolvingLink: boolean;
}> = ({
    selectedCharts,
    onSelect,
    onDeselect,
    onDone,
    enabled,
    attachFromLink,
    isResolvingLink,
}) => {
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
                    linkLive: false,
                });
            }
        },
        [onSelect, onDeselect, selectedUuids],
    );

    const handlePasteLink = useLinkPasteHandler(
        attachFromLink,
        'chart',
        setSearchQuery,
    );

    return (
        <>
            <Box px="xs" pb="xs">
                <TextInput
                    size="xs"
                    placeholder="Search or paste a link..."
                    leftSection={<MantineIcon icon={IconSearch} size={14} />}
                    rightSection={
                        (isFetching && !isInitialLoading) || isResolvingLink ? (
                            <Loader size={14} />
                        ) : undefined
                    }
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.currentTarget.value)}
                    onPaste={(e) => void handlePasteLink(e)}
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
 * Renders selected attachments with remove buttons: images as rounded
 * thumbnails, other files as filename pills matching the query-pill look.
 */
export const SelectedAttachmentSection: FC<{
    attachments: Array<{
        id: string;
        /** Object URL for image thumbnails; null renders a filename pill. */
        previewUrl: string | null;
        filename: string;
    }>;
    onRemove: (id: string) => void;
    disabled?: boolean;
    loading?: boolean;
}> = ({ attachments, onRemove, disabled, loading }) => {
    if (attachments.length === 0) return null;

    return (
        <Group gap="xs">
            {attachments.map((att) =>
                att.previewUrl ? (
                    <Box key={att.id} className={classes.imageItem}>
                        <Image
                            src={att.previewUrl}
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
                                onClick={() => onRemove(att.id)}
                                disabled={disabled}
                            />
                        )}
                    </Box>
                ) : (
                    <Box
                        key={att.id}
                        className={`${classes.selectedQueryItem} ${classes.fileItem}`}
                    >
                        <Box className={classes.selectedQueryItemIcon}>
                            <MantineIcon icon={IconFileDescription} size={12} />
                        </Box>
                        <Text
                            fw={500}
                            truncate
                            className={classes.selectedQueryItemName}
                        >
                            {att.filename}
                        </Text>
                        <ActionIcon
                            size="xs"
                            variant="subtle"
                            color="gray"
                            radius="xl"
                            onClick={() => onRemove(att.id)}
                            disabled={disabled || loading}
                        >
                            <MantineIcon icon={IconX} size={10} />
                        </ActionIcon>
                        <LoadingOverlay
                            visible={loading ?? false}
                            loaderProps={{ size: 'xs' }}
                            overlayProps={{
                                radius: 'xl',
                                backgroundOpacity: 0.5,
                            }}
                        />
                    </Box>
                ),
            )}
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

const AddLinkButton: FC<{ onClick: () => void; disabled?: boolean }> = ({
    onClick,
    disabled,
}) => (
    <Tooltip
        label="Link live — run this chart by reference so the app updates when the chart changes in Lightdash."
        multiline
        w={260}
        withArrow
    >
        <UnstyledButton
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={classes.addDataButton}
            aria-label="Link live"
        >
            <MantineIcon icon={IconLink} size={12} />
        </UnstyledButton>
    </Tooltip>
);

const InlineLinkToggle: FC<{ onClick: () => void; disabled?: boolean }> = ({
    onClick,
    disabled,
}) => (
    <Tooltip
        label="Linked live — click to unlink (revert to a copied query)."
        multiline
        w={260}
        withArrow
    >
        <UnstyledButton
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={classes.inlineDataToggle}
            aria-label="Linked: on"
        >
            <MantineIcon icon={IconLink} size={12} />
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
    onToggleLink: (uuid: string) => void;
    sampleDataEnabled: boolean;
    disabled?: boolean;
}> = ({
    charts,
    onRemove,
    onToggleSampleData,
    onToggleLink,
    sampleDataEnabled,
    disabled,
}) => {
    if (charts.length === 0) return null;

    return (
        <Box className={classes.selectedQueryList}>
            {charts.map((chart) => (
                <Box key={chart.uuid} className={classes.selectedQueryItemRow}>
                    <Box
                        className={`${classes.selectedQueryItem} ${
                            chart.includeSampleData || chart.linkLive
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
                        {chart.linkLive ? (
                            <InlineLinkToggle
                                onClick={() => onToggleLink(chart.uuid)}
                                disabled={disabled}
                            />
                        ) : (
                            sampleDataEnabled &&
                            chart.includeSampleData && (
                                <InlineDataToggle
                                    onClick={() =>
                                        onToggleSampleData(chart.uuid)
                                    }
                                    disabled={disabled}
                                />
                            )
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
                    {sampleDataEnabled &&
                        !chart.linkLive &&
                        !chart.includeSampleData && (
                            <AddDataButton
                                onClick={() => onToggleSampleData(chart.uuid)}
                                disabled={disabled}
                            />
                        )}
                    {!chart.linkLive && (
                        <AddLinkButton
                            onClick={() => onToggleLink(chart.uuid)}
                            disabled={disabled}
                        />
                    )}
                </Box>
            ))}
        </Box>
    );
};

/**
 * Internal: dashboard list with search. Interaction-identical to
 * `QueryPickerView`; only the selection model differs — single-select, so
 * picking a different dashboard replaces the current one.
 */
const DashboardPickerView: FC<{
    selectedDashboard: SelectedDashboard | null;
    onSelect: (dashboard: SelectedDashboard) => void;
    onDeselect: () => void;
    onDone: () => void;
    enabled: boolean;
    attachFromLink: AttachFromLink;
    isResolvingLink: boolean;
}> = ({
    selectedDashboard,
    onSelect,
    onDeselect,
    onDone,
    enabled,
    attachFromLink,
    isResolvingLink,
}) => {
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

    const handlePasteLink = useLinkPasteHandler(
        attachFromLink,
        'dashboard',
        setSearchQuery,
    );

    return (
        <>
            <Box px="xs" pb="xs">
                <TextInput
                    size="xs"
                    placeholder="Search or paste a link..."
                    leftSection={<MantineIcon icon={IconSearch} size={14} />}
                    rightSection={
                        isResolvingLink ? <Loader size={14} /> : undefined
                    }
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.currentTarget.value)}
                    onPaste={(e) => void handlePasteLink(e)}
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
            <Box className={classes.attachPickerFooter}>
                <Button size="compact-xs" radius="md" onClick={onDone}>
                    Done
                </Button>
            </Box>
        </>
    );
};

/**
 * Internal: external-connection list with search. Mirrors `QueryPickerView`.
 * Selecting a connection adds it to the parent and keeps the picker open so
 * multiple can be added in one flow.
 */
const ConnectionPickerView: FC<{
    selectedConnections: SelectedConnection[];
    onSelect: (connection: SelectedConnection) => void;
    onDeselect: (uuid: string) => void;
    onDone: () => void;
    enabled: boolean;
}> = ({ selectedConnections, onSelect, onDeselect, onDone, enabled }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [searchQuery, setSearchQuery] = useState('');
    const { data: connections, isInitialLoading } = useExternalConnections(
        enabled ? projectUuid : undefined,
    );

    // Only project/org admins can create connections; mirror the gate the
    // Project Settings → Data app connections page uses.
    const { user } = useApp();
    const { data: project } = useProject(projectUuid);
    const canManageConnections =
        !!project &&
        (user.data?.ability.can(
            'manage',
            subject('ExternalConnection', {
                organizationUuid: project.organizationUuid,
                projectUuid: project.projectUuid,
            }),
        ) ??
            false);
    const createConnectionUrl = projectUuid
        ? `/generalSettings/projectManagement/${projectUuid}/dataAppConnections?create=1`
        : undefined;

    const selectedUuids = useMemo(
        () => new Set(selectedConnections.map((c) => c.externalConnectionUuid)),
        [selectedConnections],
    );

    const filtered = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        const list = connections ?? [];
        if (!q) return list;
        return list.filter(
            (c) =>
                c.name.toLowerCase().includes(q) ||
                c.origin.toLowerCase().includes(q),
        );
    }, [connections, searchQuery]);

    const handleToggle = useCallback(
        (connection: ExternalConnection) => {
            if (selectedUuids.has(connection.externalConnectionUuid)) {
                onDeselect(connection.externalConnectionUuid);
            } else {
                onSelect({
                    externalConnectionUuid: connection.externalConnectionUuid,
                    name: connection.name,
                    alias: aliasFromName(connection.name),
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
                    placeholder="Search connections..."
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
                ) : filtered.length === 0 ? (
                    <Stack gap={4} align="center" p="sm">
                        <Text size="xs" c="dimmed" ta="center">
                            {(connections?.length ?? 0) === 0
                                ? 'No external connections yet'
                                : 'No connections match your search'}
                        </Text>
                        {(connections?.length ?? 0) === 0 &&
                            !canManageConnections && (
                                <Text size="xs" c="dimmed" ta="center">
                                    Ask a project admin to add one.
                                </Text>
                            )}
                    </Stack>
                ) : (
                    filtered.map((connection) => {
                        const isSelected = selectedUuids.has(
                            connection.externalConnectionUuid,
                        );
                        return (
                            <Box
                                key={connection.externalConnectionUuid}
                                className={`${classes.chartItem} ${
                                    isSelected ? classes.chartItemSelected : ''
                                }`}
                                onClick={() => handleToggle(connection)}
                            >
                                <MantineIcon icon={IconPlugConnected} />
                                <Box flex={1} miw={0}>
                                    <Text size="xs" fw={500} truncate>
                                        {connection.name}
                                    </Text>
                                    <Text size="xs" c="dimmed" truncate>
                                        {connection.origin}
                                    </Text>
                                </Box>
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
            <Box className={classes.attachPickerFooter}>
                {canManageConnections && createConnectionUrl && (
                    <Anchor
                        href={createConnectionUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        mr="auto"
                    >
                        <Group gap={4} wrap="nowrap">
                            <MantineIcon icon={IconPlus} size={14} />
                            <Text size="xs" fw={500}>
                                New connection
                            </Text>
                        </Group>
                    </Anchor>
                )}
                <Button size="compact-xs" radius="md" onClick={onDone}>
                    Done
                </Button>
            </Box>
        </>
    );
};

type AttachView = 'menu' | 'queries' | 'dashboard' | 'connections';

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
    selectedConnections: SelectedConnection[];
    onSelectConnection: (connection: SelectedConnection) => void;
    onDeselectConnection: (uuid: string) => void;
    onAddFiles: () => void;
    disabled: boolean;
    filesDisabled: boolean;
}> = ({
    selectedCharts,
    onSelectChart,
    onDeselectChart,
    selectedDashboard,
    onSelectDashboard,
    onDeselectDashboard,
    selectedConnections,
    onSelectConnection,
    onDeselectConnection,
    onAddFiles,
    disabled,
    filesDisabled,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [opened, setOpened] = useState(false);
    const [view, setView] = useState<AttachView>('menu');

    const handleChange = useCallback((isOpen: boolean) => {
        setOpened(isOpen);
        if (!isOpen) setView('menu');
    }, []);

    const { attachFromLink, isResolvingLink } = useAttachResourceLink({
        projectUuid,
        onSelectChart,
        onSelectDashboard,
    });

    const handleFilesClick = useCallback(() => {
        setOpened(false);
        setView('menu');
        onAddFiles();
    }, [onAddFiles]);

    const headerTitle =
        // eslint-disable-next-line no-nested-ternary
        view === 'queries'
            ? 'Add queries'
            : view === 'connections'
              ? 'Add external connections'
              : 'Add a dashboard';
    const headerSubtitle =
        // eslint-disable-next-line no-nested-ternary
        view === 'queries'
            ? 'Select queries to include in the app'
            : view === 'connections'
              ? 'Let the app fetch from these external APIs'
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
                <Tooltip
                    label="Add charts, dashboards, connections or files"
                    withArrow
                    position="top"
                >
                    <Button
                        variant="subtle"
                        color="gray"
                        size="xs"
                        radius="xl"
                        h="auto"
                        px={8}
                        py={6}
                        onClick={() => setOpened((o) => !o)}
                        disabled={disabled}
                        aria-label="Attach resources"
                        leftSection={<MantineIcon icon={IconPlus} size={14} />}
                    >
                        <Text span size="xs" fw={600} lh={1.2} c="inherit">
                            Attach
                        </Text>
                    </Button>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown className={classes.queryDropdown} p={0}>
                {view === 'menu' ? (
                    <Box py="xs">
                        <UnstyledButton
                            className={classes.attachMenuItem}
                            ff="inherit"
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
                            ff="inherit"
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
                            onClick={handleFilesClick}
                            disabled={filesDisabled}
                            ff="inherit"
                            data-disabled={filesDisabled || undefined}
                        >
                            <MantineIcon icon={IconPhoto} />
                            <Box flex={1}>
                                <Text size="sm" fw={500}>
                                    Files
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {filesDisabled
                                        ? 'Attachment limit reached'
                                        : 'Upload images, PDFs, or text files'}
                                </Text>
                            </Box>
                        </UnstyledButton>
                        <UnstyledButton
                            className={classes.attachMenuItem}
                            onClick={() => setView('connections')}
                            ff="inherit"
                        >
                            <MantineIcon icon={IconPlugConnected} />
                            <Box flex={1}>
                                <Text size="sm" fw={500}>
                                    External connections
                                </Text>
                                <Text size="xs" c="dimmed">
                                    Let the app fetch from external APIs
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
                                attachFromLink={attachFromLink}
                                isResolvingLink={isResolvingLink}
                            />
                        ) : view === 'connections' ? (
                            <ConnectionPickerView
                                selectedConnections={selectedConnections}
                                onSelect={onSelectConnection}
                                onDeselect={onDeselectConnection}
                                onDone={() => {
                                    setOpened(false);
                                    setView('menu');
                                }}
                                enabled={opened}
                            />
                        ) : (
                            <DashboardPickerView
                                selectedDashboard={selectedDashboard}
                                onSelect={onSelectDashboard}
                                onDeselect={onDeselectDashboard}
                                onDone={() => {
                                    setOpened(false);
                                    setView('menu');
                                }}
                                enabled={opened}
                                attachFromLink={attachFromLink}
                                isResolvingLink={isResolvingLink}
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
    sampleDataEnabled: boolean;
    disabled?: boolean;
}> = ({
    dashboard,
    onRemove,
    onToggleSampleData,
    sampleDataEnabled,
    disabled,
}) => {
    return (
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
                    {sampleDataEnabled && dashboard.includeSampleData && (
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
                {sampleDataEnabled && !dashboard.includeSampleData && (
                    <AddDataButton
                        onClick={onToggleSampleData}
                        disabled={disabled}
                        tooltipSuffix=" Applies to every chart in this dashboard."
                    />
                )}
            </Box>
        </Box>
    );
};
