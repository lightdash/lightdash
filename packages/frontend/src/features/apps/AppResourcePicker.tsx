import { subject } from '@casl/ability';
import {
    ChartKind,
    ContentType,
    type ChartContent,
    type AiModelOption,
    type AppVersionExternalConnectionResource,
    type DataAppCodingAgent,
    type DataAppCodingAgentModel,
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
    Indicator,
    Loader,
    LoadingOverlay,
    Popover,
    ScrollArea,
    Stack,
    Text,
    TextInput,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconArrowLeft,
    IconCamera,
    IconChartBar,
    IconCheck,
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
import { type TFunction } from 'i18next';
import uniqBy from 'lodash/uniqBy';
import {
    useCallback,
    useMemo,
    useState,
    type ClipboardEvent,
    type FC,
} from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../components/common/MantineIcon';
import MantineModal from '../../components/common/MantineModal';
import { ModelSelector } from '../../components/common/ModelSelector/ModelSelector';
import { ChartIcon, IconBox } from '../../components/common/ResourceIcon';
import { getChartIcon } from '../../components/common/ResourceIcon/utils';
import { useChartSummariesV2 } from '../../hooks/useChartSummariesV2';
import { useInfiniteContent } from '../../hooks/useContent';
import { useProject } from '../../hooks/useProject';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import useApp from '../../providers/App/useApp';
import scrollAreaClasses from '../../styles/ScrollArea.module.css';
import { useAppExternalConnections } from '../externalConnections/hooks/useAppExternalConnections';
import { useExternalConnections } from '../externalConnections/hooks/useExternalConnections';
import { useUnlinkAppExternalConnection } from '../externalConnections/hooks/useUnlinkAppExternalConnection';
import { uniqueAliasFromName } from '../externalConnections/utils/aliasFromName';
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

export type SelectedConnection = AppVersionExternalConnectionResource;

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
}> = ({ onClick, disabled, loading }) => {
    const { t } = useTranslation('apps');
    return (
        <Tooltip label={t('resourcePicker.screenshot.tooltip')} position="top">
            <ActionIcon
                size="md"
                radius="xl"
                onClick={onClick}
                disabled={disabled}
                loading={loading}
                aria-label={t('resourcePicker.screenshot.ariaLabel')}
            >
                <MantineIcon icon={IconCamera} size={16} />
            </ActionIcon>
        </Tooltip>
    );
};

type ModelOption = {
    value: DataAppCodingAgentModel;
    label: string;
    // Translation key of the short advantage line shown in the popover.
    taglineKey: string;
    isDefault?: boolean;
};

// Order: capability descending — Opus (highest quality) → Sonnet (default) →
// Haiku (fastest). The "Default" tag on Sonnet anchors the recommendation
// without forcing it to position 0.
const CLAUDE_MODEL_OPTIONS: ModelOption[] = [
    {
        value: 'opus',
        label: 'Opus',
        taglineKey: 'models.opus',
    },
    {
        value: 'sonnet',
        label: 'Sonnet',
        taglineKey: 'models.sonnet',
        isDefault: true,
    },
    {
        value: 'haiku',
        label: 'Haiku',
        taglineKey: 'models.haiku',
    },
];

const CODEX_MODEL_OPTIONS: ModelOption[] = [
    {
        value: 'gpt-5.6-sol',
        label: 'Sol',
        taglineKey: 'models.sol',
    },
    {
        value: 'gpt-5.6-terra',
        label: 'Terra',
        taglineKey: 'models.terra',
        isDefault: true,
    },
    {
        value: 'gpt-5.6-luna',
        label: 'Luna',
        taglineKey: 'models.luna',
    },
];

// Lookup helper. The underlying value ultimately comes from JSONB version
// resources, so a stale or hand-edited row
// could land here as a string outside the union at runtime. Fall back to the
// default option rather than throw, so a corrupt row never crashes the
// AppGenerate page; the user can still pick a valid model from the popover.
const findModelOption = (
    value: DataAppCodingAgentModel,
    options: ModelOption[],
): ModelOption =>
    options.find((o) => o.value === value) ??
    options.find((o) => o.isDefault) ??
    options[0];

const toModelKey = (
    value: DataAppCodingAgentModel,
    provider: 'anthropic' | 'openai',
): string => `${provider}:${value}`;

const toModelOption = (
    opt: ModelOption,
    provider: 'anthropic' | 'openai',
    t: TFunction,
): AiModelOption => ({
    name: opt.value,
    modelId: opt.value,
    displayName: opt.label,
    description: t(opt.taglineKey),
    provider,
    default: opt.isDefault === true,
    supportsReasoning: false,
    deprecated: false,
    supersededBy: null,
});

/**
 * Picker for the configured coding agent's model.
 *
 * Inline next to the send button so the choice is visible at submit time;
 * also editable mid-iteration.
 *
 * Renders the shared `ModelSelector` so the data-app composer and the AI
 * agent chat offer the same control; the data-app model union is mapped onto
 * the provider-qualified model options that selector expects.
 */
export const ModelPicker: FC<{
    value: DataAppCodingAgentModel;
    onChange: (value: DataAppCodingAgentModel) => void;
    disabled?: boolean;
    /** Restrict the picker to these models (org admin visibility settings).
     *  Defaults to all models when omitted. */
    visibleModels?: DataAppCodingAgentModel[];
    codingAgent?: DataAppCodingAgent;
}> = ({ value, onChange, disabled, visibleModels, codingAgent = 'claude' }) => {
    const { t } = useTranslation('apps');
    const options =
        codingAgent === 'codex' ? CODEX_MODEL_OPTIONS : CLAUDE_MODEL_OPTIONS;
    const provider = codingAgent === 'codex' ? 'openai' : 'anthropic';
    const models = useMemo(
        () =>
            options
                .filter(
                    (opt) =>
                        !visibleModels || visibleModels.includes(opt.value),
                )
                .map((option) => toModelOption(option, provider, t)),
        [options, provider, visibleModels, t],
    );

    return (
        <ModelSelector
            models={models}
            value={toModelKey(findModelOption(value, options).value, provider)}
            onChange={(modelKey) => {
                const picked = options.find(
                    (opt) => toModelKey(opt.value, provider) === modelKey,
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
    const { t } = useTranslation('apps');
    const projectUuid = useProjectUuid();
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
                    placeholder={t('resourcePicker.searchOrPaste')}
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
            <ScrollArea.Autosize
                mah={350}
                px="xs"
                pb="xs"
                scrollbars="y"
                classNames={{ content: scrollAreaClasses.verticalContent }}
            >
                {isInitialLoading ? (
                    <Group justify="center" p="sm">
                        <Loader size="sm" />
                    </Group>
                ) : allCharts.length === 0 ? (
                    <Text size="xs" c="dimmed" ta="center" p="sm">
                        {t('resourcePicker.queries.empty')}
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
                                    {t('resourcePicker.loadMore')}
                                </Button>
                            </Box>
                        )}
                    </>
                )}
            </ScrollArea.Autosize>
            <Box className={classes.attachPickerFooter}>
                <Button size="compact-xs" onClick={onDone}>
                    {t('resourcePicker.done')}
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
    const { t } = useTranslation('apps');
    if (attachments.length === 0) return null;

    return (
        <Group gap="xs">
            {attachments.map((att) =>
                att.previewUrl ? (
                    <Box key={att.id} className={classes.imageItem}>
                        <Image
                            src={att.previewUrl}
                            className={classes.imageThumb}
                            alt={t('resourcePicker.attachedImageAlt')}
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
}> = ({ onClick, disabled, tooltipSuffix }) => {
    const { t } = useTranslation('apps');
    return (
        <Tooltip
            label={`${t('resourcePicker.sampleData.tooltip')}${tooltipSuffix ?? ''}`}
            w={260}
        >
            <UnstyledButton
                type="button"
                onClick={onClick}
                disabled={disabled}
                className={classes.addDataButton}
                aria-label={t('resourcePicker.sampleData.include')}
            >
                <MantineIcon icon={IconDatabasePlus} size={12} />
            </UnstyledButton>
        </Tooltip>
    );
};

/**
 * Inline database icon button inside the pill when sample data is on.
 * Click → disables sample data; the pill reverts to plain and the
 * `AddDataButton` reappears next to it.
 */
const InlineDataToggle: FC<{
    onClick: () => void;
    disabled?: boolean;
    tooltipSuffix?: string;
}> = ({ onClick, disabled, tooltipSuffix }) => {
    const { t } = useTranslation('apps');
    return (
        <Tooltip
            label={`${t('resourcePicker.sampleData.includedTooltip')}${tooltipSuffix ?? ''}`}
            w={260}
        >
            <UnstyledButton
                type="button"
                onClick={onClick}
                disabled={disabled}
                className={classes.inlineDataToggle}
                aria-label={t('resourcePicker.sampleData.on')}
            >
                <MantineIcon icon={IconDatabase} size={12} />
            </UnstyledButton>
        </Tooltip>
    );
};

const AddLinkButton: FC<{ onClick: () => void; disabled?: boolean }> = ({
    onClick,
    disabled,
}) => {
    const { t } = useTranslation('apps');
    return (
        <Tooltip label={t('resourcePicker.linkLive.tooltip')} w={260}>
            <UnstyledButton
                type="button"
                onClick={onClick}
                disabled={disabled}
                className={classes.addDataButton}
                aria-label={t('resourcePicker.linkLive.ariaLabel')}
            >
                <MantineIcon icon={IconLink} size={12} />
            </UnstyledButton>
        </Tooltip>
    );
};

const InlineLinkToggle: FC<{ onClick: () => void; disabled?: boolean }> = ({
    onClick,
    disabled,
}) => {
    const { t } = useTranslation('apps');
    return (
        <Tooltip label={t('resourcePicker.linkLive.linkedTooltip')} w={260}>
            <UnstyledButton
                type="button"
                onClick={onClick}
                disabled={disabled}
                className={classes.inlineDataToggle}
                aria-label={t('resourcePicker.linkLive.on')}
            >
                <MantineIcon icon={IconLink} size={12} />
            </UnstyledButton>
        </Tooltip>
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
    const { t } = useTranslation('apps');
    const projectUuid = useProjectUuid();
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch] = useDebouncedValue(searchQuery, 300);

    const {
        data: dashboardPages,
        isInitialLoading,
        isFetching,
        hasNextPage,
        fetchNextPage,
    } = useInfiniteContent(
        {
            projectUuids: projectUuid ? [projectUuid] : [],
            contentTypes: [ContentType.DASHBOARD],
            page: 1,
            pageSize: 25,
            search: debouncedSearch,
        },
        { keepPreviousData: true, enabled: enabled && !!projectUuid },
    );

    const allDashboards = useMemo(
        () =>
            uniqBy(
                dashboardPages?.pages.flatMap((page) => page.data) ?? [],
                'uuid',
            ),
        [dashboardPages?.pages],
    );

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
                    placeholder={t('resourcePicker.searchOrPaste')}
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
                ) : allDashboards.length === 0 ? (
                    <Text size="xs" c="dimmed" ta="center" p="sm">
                        {t('resourcePicker.dashboard.empty')}
                    </Text>
                ) : (
                    <>
                        {allDashboards.map((dashboard) => {
                            const isSelected =
                                selectedDashboard?.uuid === dashboard.uuid;
                            return (
                                <Box
                                    key={dashboard.uuid}
                                    className={`${classes.chartItem} ${
                                        isSelected
                                            ? classes.chartItemSelected
                                            : ''
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
                        })}
                        {hasNextPage && (
                            <Box ta="center" py={4}>
                                <Button
                                    variant="subtle"
                                    size="xs"
                                    onClick={() => void fetchNextPage()}
                                    loading={isFetching}
                                >
                                    {t('resourcePicker.loadMore')}
                                </Button>
                            </Box>
                        )}
                    </>
                )}
            </ScrollArea.Autosize>
            <Box className={classes.attachPickerFooter}>
                <Button size="compact-xs" onClick={onDone}>
                    {t('resourcePicker.done')}
                </Button>
            </Box>
        </>
    );
};

/**
 * External-connection list with search. Mirrors `QueryPickerView`.
 * Selecting a connection adds it to the parent and keeps the picker open so
 * multiple can be added in one flow.
 */
export const ConnectionPickerView: FC<{
    selectedConnections: SelectedConnection[];
    onSelect: (connection: SelectedConnection) => void;
    onDeselect: (uuid: string) => void;
    onDone: () => void;
    enabled: boolean;
    /** App whose existing links show as checked rows that unlink on click;
     *  omit before a first build, when nothing can be linked yet. */
    linkedAppUuid?: string;
    onUnlinkConfirmationChange?: (opened: boolean) => void;
}> = ({
    selectedConnections,
    onSelect,
    onDeselect,
    onDone,
    enabled,
    linkedAppUuid,
    onUnlinkConfirmationChange,
}) => {
    const { t } = useTranslation('apps');
    const projectUuid = useProjectUuid();
    const [searchQuery, setSearchQuery] = useState('');
    const [pendingUnlink, setPendingUnlink] = useState<{
        connection: ExternalConnection;
        alias: string;
    } | null>(null);
    const { data: connections, isInitialLoading } = useExternalConnections(
        enabled ? projectUuid : undefined,
    );
    const { data: existingLinks } = useAppExternalConnections(
        enabled ? projectUuid : undefined,
        linkedAppUuid,
    );
    const visibleConnections = useMemo(() => {
        const byUuid = new Map(
            (existingLinks ?? []).map((link) => [
                link.connection.externalConnectionUuid,
                link.connection,
            ]),
        );

        for (const connection of connections ?? []) {
            byUuid.set(connection.externalConnectionUuid, connection);
        }

        return [...byUuid.values()];
    }, [connections, existingLinks]);
    const linkedAliases = useMemo(
        () =>
            new Map(
                (existingLinks ?? []).map((link) => [
                    link.connection.externalConnectionUuid,
                    link.alias,
                ]),
            ),
        [existingLinks],
    );
    const { mutate: unlink } = useUnlinkAppExternalConnection();

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
        if (!q) return visibleConnections;
        return visibleConnections.filter(
            (c) =>
                c.name.toLowerCase().includes(q) ||
                c.origin.toLowerCase().includes(q),
        );
    }, [searchQuery, visibleConnections]);

    const hasConnections = visibleConnections.length > 0;
    let emptyMessage = t('resourcePicker.connections.noMatches');
    if (!hasConnections) {
        emptyMessage = canManageConnections
            ? t('resourcePicker.connections.noneYet')
            : t('resourcePicker.connections.noneAvailable');
    }

    const handleToggle = useCallback(
        (connection: ExternalConnection) => {
            const linkedAlias = linkedAliases.get(
                connection.externalConnectionUuid,
            );
            if (linkedAlias !== undefined && projectUuid && linkedAppUuid) {
                setPendingUnlink({ connection, alias: linkedAlias });
                onUnlinkConfirmationChange?.(true);
            } else if (selectedUuids.has(connection.externalConnectionUuid)) {
                onDeselect(connection.externalConnectionUuid);
            } else {
                onSelect({
                    externalConnectionUuid: connection.externalConnectionUuid,
                    name: connection.name,
                    alias: uniqueAliasFromName(
                        connection.name,
                        selectedConnections.map((selected) => selected.alias),
                    ),
                });
            }
        },
        [
            linkedAliases,
            linkedAppUuid,
            onDeselect,
            onSelect,
            onUnlinkConfirmationChange,
            projectUuid,
            selectedConnections,
            selectedUuids,
        ],
    );

    const handleConfirmUnlink = useCallback(() => {
        if (!pendingUnlink || !projectUuid || !linkedAppUuid) return;

        unlink({
            projectUuid,
            appUuid: linkedAppUuid,
            alias: pendingUnlink.alias,
            name: pendingUnlink.connection.name,
        });
        onDeselect(pendingUnlink.connection.externalConnectionUuid);
        setPendingUnlink(null);
        onUnlinkConfirmationChange?.(false);
    }, [
        linkedAppUuid,
        onDeselect,
        onUnlinkConfirmationChange,
        pendingUnlink,
        projectUuid,
        unlink,
    ]);

    const handleCancelUnlink = useCallback(() => {
        setPendingUnlink(null);
        onUnlinkConfirmationChange?.(false);
    }, [onUnlinkConfirmationChange]);

    return (
        <>
            <Box px="xs" pb="xs">
                <TextInput
                    size="xs"
                    placeholder={t('resourcePicker.connections.search')}
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
                            {emptyMessage}
                        </Text>
                        {!hasConnections && !canManageConnections && (
                            <Text size="xs" c="dimmed" ta="center">
                                {t('resourcePicker.connections.askAdmin')}
                            </Text>
                        )}
                    </Stack>
                ) : (
                    filtered.map((connection) => {
                        const isChecked =
                            selectedUuids.has(
                                connection.externalConnectionUuid,
                            ) ||
                            linkedAliases.has(
                                connection.externalConnectionUuid,
                            );
                        return (
                            <Box
                                key={connection.externalConnectionUuid}
                                className={`${classes.chartItem} ${
                                    isChecked ? classes.chartItemSelected : ''
                                }`}
                                aria-checked={isChecked}
                                role="checkbox"
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
                                {isChecked && (
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
                                {t('resourcePicker.connections.new')}
                            </Text>
                        </Group>
                    </Anchor>
                )}
                <Button size="compact-xs" onClick={onDone}>
                    {t('resourcePicker.done')}
                </Button>
            </Box>
            <MantineModal
                opened={pendingUnlink !== null}
                onClose={handleCancelUnlink}
                title={
                    pendingUnlink
                        ? t('resourcePicker.connections.unlink.title', {
                              name: pendingUnlink.connection.name,
                          })
                        : t('resourcePicker.connections.unlink.titleFallback')
                }
                variant="delete"
                size="md"
                description={t('resourcePicker.connections.unlink.description')}
                confirmLabel={t('resourcePicker.connections.unlink.confirm')}
                cancelLabel={t('resourcePicker.connections.unlink.cancel')}
                onConfirm={handleConfirmUnlink}
            />
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
    linkedAppUuid?: string;
    iconOnly?: boolean;
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
    linkedAppUuid,
    iconOnly = false,
}) => {
    const { t } = useTranslation('apps');
    const projectUuid = useProjectUuid();
    const [opened, setOpened] = useState(false);
    const [view, setView] = useState<AttachView>('menu');
    const [unlinkConfirmationOpen, setUnlinkConfirmationOpen] = useState(false);

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
            ? t('resourcePicker.header.queries.title')
            : view === 'connections'
              ? t('resourcePicker.header.connections.title')
              : t('resourcePicker.header.dashboard.title');
    const headerSubtitle =
        // eslint-disable-next-line no-nested-ternary
        view === 'queries'
            ? t('resourcePicker.header.queries.subtitle')
            : view === 'connections'
              ? t('resourcePicker.header.connections.subtitle')
              : t('resourcePicker.header.dashboard.subtitle');

    return (
        <Popover
            opened={opened}
            onChange={handleChange}
            position="top-start"
            offset={8}
            trapFocus
            closeOnClickOutside={!unlinkConfirmationOpen}
            closeOnEscape={!unlinkConfirmationOpen}
        >
            <Popover.Target>
                <Tooltip
                    label={t('resourcePicker.attach.tooltip')}
                    position="top"
                    disabled={opened}
                >
                    {iconOnly ? (
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            size={32}
                            radius="xl"
                            onClick={() => setOpened((o) => !o)}
                            disabled={disabled}
                            aria-label={t('resourcePicker.attach.ariaLabel')}
                            data-tour-scope="create:DataApp"
                            data-tour-look="2"
                            data-tour-after='[data-tour-anchor="app-prompt"]'
                            data-tour-label="Attach charts or a dashboard for context"
                            data-tour-docs="data-apps.mdx#adding-context:1"
                        >
                            <MantineIcon icon={IconPlus} size={16} />
                        </ActionIcon>
                    ) : (
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
                            aria-label={t('resourcePicker.attach.ariaLabel')}
                            // Walkthrough look for create:DataApp: context makes
                            // the agent's first version better.
                            data-tour-scope="create:DataApp"
                            data-tour-look="2"
                            data-tour-after='[data-tour-anchor="app-prompt"]'
                            data-tour-label="Attach charts or a dashboard for context"
                            data-tour-docs="data-apps.mdx#adding-context:1"
                            leftSection={
                                <MantineIcon icon={IconPlus} size={14} />
                            }
                        >
                            <Text span size="xs" fw={600} lh={1.2} c="inherit">
                                {t('resourcePicker.attach.button')}
                            </Text>
                        </Button>
                    )}
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
                                    {t('resourcePicker.menu.queries.title')}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {t(
                                        'resourcePicker.menu.queries.description',
                                    )}
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
                                    {t('resourcePicker.menu.dashboard.title')}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {t(
                                        'resourcePicker.menu.dashboard.description',
                                    )}
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
                                    {t('resourcePicker.menu.files.title')}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {filesDisabled
                                        ? t('resourcePicker.menu.files.limit')
                                        : t(
                                              'resourcePicker.menu.files.description',
                                          )}
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
                                    {t('resourcePicker.menu.connections.title')}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {t(
                                        'resourcePicker.menu.connections.description',
                                    )}
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
                                size="sm"
                                onClick={() => setView('menu')}
                                aria-label={t('resourcePicker.backToMenu')}
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
                                linkedAppUuid={linkedAppUuid}
                                onUnlinkConfirmationChange={
                                    setUnlinkConfirmationOpen
                                }
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
 * Opens the external-connection picker directly — used by surfaces that
 * attach connections without the rest of the data-app resource menu.
 */
export const ConnectionAttachButton: FC<{
    selectedConnections: SelectedConnection[];
    onSelect: (connection: SelectedConnection) => void;
    onDeselect: (uuid: string) => void;
    disabled: boolean;
    description: string;
    /** The built app whose links the picker marks as already linked; null
     *  until a first build exists. */
    linkedAppUuid: string | null;
}> = ({
    selectedConnections,
    onSelect,
    onDeselect,
    disabled,
    description,
    linkedAppUuid,
}) => {
    const { t } = useTranslation('apps');
    const projectUuid = useProjectUuid();
    const [opened, setOpened] = useState(false);
    const [unlinkConfirmationOpen, setUnlinkConfirmationOpen] = useState(false);
    const { data: existingLinks } = useAppExternalConnections(
        projectUuid,
        linkedAppUuid ?? undefined,
    );
    // Already-linked connections count as attached alongside the pending
    // selection; re-selecting a linked one does not count it twice.
    const attachedNames = useMemo(() => {
        const names = new Map<string, string>();
        (existingLinks ?? []).forEach((link) =>
            names.set(
                link.connection.externalConnectionUuid,
                link.connection.name,
            ),
        );
        selectedConnections.forEach((connection) =>
            names.set(connection.externalConnectionUuid, connection.name),
        );
        return [...names.values()];
    }, [existingLinks, selectedConnections]);
    const attachedCount = attachedNames.length;
    const triggerLabel =
        attachedCount > 0
            ? t('resourcePicker.connections.attachedCount', {
                  count: attachedCount,
              })
            : t('resourcePicker.header.connections.title');
    const tooltipLabel =
        attachedCount > 0
            ? t('resourcePicker.connections.attachedTooltip', {
                  label: triggerLabel,
                  names: attachedNames.join(', '),
              })
            : triggerLabel;

    return (
        <Popover
            opened={opened}
            onChange={setOpened}
            position="top-start"
            offset={8}
            trapFocus
            closeOnClickOutside={!unlinkConfirmationOpen}
            closeOnEscape={!unlinkConfirmationOpen}
        >
            <Popover.Target>
                <Tooltip
                    label={tooltipLabel}
                    position="top"
                    maw={280}
                    disabled={opened}
                >
                    <Indicator
                        inline
                        label={attachedCount}
                        size={12}
                        offset={3}
                        color="blue"
                        disabled={attachedCount === 0}
                        classNames={{
                            indicator: classes.connectionCountIndicator,
                        }}
                    >
                        <ActionIcon
                            color="ldGray"
                            size="sm"
                            aria-label={triggerLabel}
                            onClick={() => setOpened((value) => !value)}
                            disabled={disabled}
                        >
                            <MantineIcon icon={IconPlugConnected} />
                        </ActionIcon>
                    </Indicator>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown className={classes.queryDropdown} p={0}>
                <Box p="xs" pb={0} className={classes.attachPickerHeader}>
                    <Box>
                        <Text size="sm" fw={500}>
                            {t('resourcePicker.header.connections.title')}
                        </Text>
                        <Text size="xs" c="dimmed">
                            {description}
                        </Text>
                    </Box>
                </Box>
                <ConnectionPickerView
                    selectedConnections={selectedConnections}
                    onSelect={onSelect}
                    onDeselect={onDeselect}
                    onDone={() => setOpened(false)}
                    enabled={opened}
                    linkedAppUuid={linkedAppUuid ?? undefined}
                    onUnlinkConfirmationChange={setUnlinkConfirmationOpen}
                />
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
    const { t } = useTranslation('apps');
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
                            tooltipSuffix={` ${t('resourcePicker.sampleData.dashboardSuffix')}`}
                        />
                    )}
                    <ActionIcon
                        size="xs"
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
                        tooltipSuffix={` ${t('resourcePicker.sampleData.dashboardSuffix')}`}
                    />
                )}
            </Box>
        </Box>
    );
};
