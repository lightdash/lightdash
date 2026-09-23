import {
    FeatureFlags,
    isOfficialChartType,
    type ApiError,
    type DataAppViz,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Loader,
    Menu,
    ScrollArea,
    Stack,
    Text,
    TextInput,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconArrowRight,
    IconDots,
    IconFilePencil,
    IconGitFork,
    IconHammer,
    IconPackage,
    IconSearch,
    type Icon as TablerIcon,
} from '@tabler/icons-react';
import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import { useCanCreateDataApp } from '../../../features/apps/hooks/useCanCreateDataApp';
import { useCanEditDataAppChecker } from '../../../features/apps/hooks/useCanEditDataApp';
import ChartTypeForkModal from '../../../features/chartTypes/components/ChartTypeForkModal';
import { useChartTypesEnabled } from '../../../features/chartTypes/hooks/useChartTypesEnabled';
import { useDataAppVisualizations } from '../../../features/chartTypes/hooks/useDataAppVisualizations';
import {
    explorerActions,
    useExplorerDispatch,
} from '../../../features/explorer/store';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { CHART_GALLERY_SEARCH_ID } from '../../common/ChartGallery/ChartGalleryContext';
import InlineErrorState from '../../common/InlineErrorState';
import MantineIcon from '../../common/MantineIcon';
import { isDataAppVizVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { useSelectProjectChartType } from '../../VisualizationConfigs/CustomChartType/useSelectProjectChartType';
import classes from './ChartTypeGallery.module.css';
import { PICKER_SORT } from './pickerSort';
import {
    projectChartTypeItem,
    useChartTypeOptions,
    type ChartTypeOption,
} from './useChartTypeOptions';

/** Where a project chart type came from; built-ins carry none. */
export type ChartTypeProvenance = 'official' | 'custom';

const PROVENANCE: Record<
    ChartTypeProvenance,
    { icon: TablerIcon; description: string }
> = {
    official: { icon: IconPackage, description: 'Built by Lightdash' },
    custom: {
        icon: IconHammer,
        description: 'Custom chart type, built by your team',
    },
};

/** The provenance icon in its colour, shared by the tile mark and the Add menu. */
export const ProvenanceGlyph: FC<{
    provenance: ChartTypeProvenance;
    size: number;
}> = ({ provenance, size }) => (
    <Box
        component="span"
        className={classes.provenanceGlyph}
        data-provenance={provenance}
    >
        <MantineIcon
            icon={PROVENANCE[provenance].icon}
            size={size}
            stroke={1.5}
        />
    </Box>
);

export type ChartTypeGalleryItem = Omit<ChartTypeOption, 'id'> & {
    key: string;
    disabled: boolean;
    /** Shown as the card's tooltip; null shows none. */
    description: string | null;
    /** Marks the card's origin; null leaves it unmarked. */
    provenance: ChartTypeProvenance | null;
    onConfigure: (() => void) | null;
    /** Opens the builder directly; null hides the action. */
    onEdit: (() => void) | null;
    /** Forks an official chart type into an editable copy; null hides the action. */
    onFork: (() => void) | null;
};

type ChartTypeIconProps = Pick<ChartTypeOption, 'icon' | 'rotatedIcon'> & {
    small?: boolean;
};

const ChartTypeIcon: FC<ChartTypeIconProps> = ({
    icon,
    rotatedIcon,
    small,
}) => (
    <MantineIcon
        className={classes.icon}
        data-rotated={rotatedIcon}
        icon={icon}
        size={small ? 'md' : 'xl'}
        stroke={1.5}
    />
);

export const ChartTypeThumbnail: FC<ChartTypeIconProps> = ({
    small,
    ...props
}) => (
    <Box className={classes.thumbnail} data-small={small}>
        <ChartTypeIcon small={small} {...props} />
    </Box>
);

const GalleryCard: FC<{ item: ChartTypeGalleryItem }> = ({ item }) => {
    // Keep the full name available when the card label is clamped.
    const labelRef = useRef<HTMLParagraphElement>(null);
    const [isLabelClamped, setIsLabelClamped] = useState(false);
    const [isMenuOpened, setIsMenuOpened] = useState(false);
    useEffect(() => {
        const label = labelRef.current;
        if (!label) return;
        const measure = () =>
            setIsLabelClamped(
                label.scrollHeight > label.clientHeight + 1 ||
                    label.scrollWidth > label.clientWidth + 1,
            );
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(label);
        return () => observer.disconnect();
    }, [item.label]);

    const tooltipLabel = isLabelClamped ? item.label : null;
    const showsConfigure = item.selected && item.onConfigure !== null;
    const provenance =
        item.provenance !== null
            ? { ...PROVENANCE[item.provenance], kind: item.provenance }
            : null;

    return (
        <Box className={classes.cardWrapper} data-menu-open={isMenuOpened}>
            <Tooltip
                label={
                    <>
                        {tooltipLabel !== null ? (
                            <Text fz="xs" fw={600}>
                                {tooltipLabel}
                            </Text>
                        ) : null}
                        {item.description !== null ? (
                            <Text fz="xs">{item.description}</Text>
                        ) : null}
                    </>
                }
                position="top"
                openDelay={500}
                color="dark"
                events={{ hover: true, focus: true, touch: false }}
                disabled={tooltipLabel === null && item.description === null}
                maw={300}
            >
                <UnstyledButton
                    className={classes.card}
                    data-selected={item.selected}
                    aria-pressed={item.selected}
                    disabled={item.disabled}
                    onClick={
                        showsConfigure && item.onConfigure !== null
                            ? item.onConfigure
                            : item.select
                    }
                >
                    <Box className={classes.cardIcon}>
                        <ChartTypeIcon
                            icon={item.icon}
                            rotatedIcon={item.rotatedIcon}
                        />
                    </Box>
                    {/* The slot always holds two lines; a selected card gives
                        its second one to the Configure action. */}
                    <Box className={classes.cardLabelSlot}>
                        <Text
                            ref={labelRef}
                            fz="xs"
                            fw={500}
                            lh={1.2}
                            lineClamp={showsConfigure ? undefined : 2}
                            truncate={showsConfigure ? 'end' : undefined}
                        >
                            {item.label}
                        </Text>
                    </Box>
                </UnstyledButton>
            </Tooltip>
            {/* A sibling of the card button with its own tooltip, so the
                provenance stays out of the card's name and description. */}
            {provenance !== null ? (
                <Tooltip
                    label={provenance.description}
                    position="top"
                    openDelay={500}
                >
                    <Box
                        className={classes.provenanceMark}
                        role="img"
                        aria-label={provenance.description}
                    >
                        <ProvenanceGlyph
                            provenance={provenance.kind}
                            size={12}
                        />
                    </Box>
                </Tooltip>
            ) : null}
            {showsConfigure && item.onConfigure !== null ? (
                <Button
                    className={classes.cardConfigureAction}
                    variant="default"
                    size="compact-xs"
                    rightSection={
                        <MantineIcon icon={IconArrowRight} size={14} />
                    }
                    aria-label={`Configure ${item.label}`}
                    disabled={item.disabled}
                    onClick={item.onConfigure}
                >
                    Configure
                </Button>
            ) : null}
            {item.onEdit !== null || item.onFork !== null ? (
                <Menu
                    opened={isMenuOpened}
                    onChange={setIsMenuOpened}
                    position="bottom-start"
                    withArrow
                    arrowPosition="center"
                    offset={-4}
                    closeOnItemClick
                >
                    <Menu.Target>
                        <Tooltip
                            label={`More actions for ${item.label}`}
                            position="top"
                            openDelay={500}
                        >
                            <ActionIcon
                                className={classes.cardMoreActions}
                                size={24}
                                aria-label={`More actions for ${item.label}`}
                                disabled={item.disabled}
                            >
                                <MantineIcon icon={IconDots} size={16} />
                            </ActionIcon>
                        </Tooltip>
                    </Menu.Target>
                    <Menu.Dropdown>
                        {item.onEdit !== null ? (
                            <Menu.Item
                                leftSection={
                                    <MantineIcon
                                        icon={IconFilePencil}
                                        size={16}
                                    />
                                }
                                onClick={item.onEdit}
                            >
                                Edit chart type
                            </Menu.Item>
                        ) : null}
                        {item.onFork !== null ? (
                            <Menu.Item
                                leftSection={
                                    <MantineIcon icon={IconGitFork} size={16} />
                                }
                                onClick={item.onFork}
                            >
                                Fork to customize
                            </Menu.Item>
                        ) : null}
                    </Menu.Dropdown>
                </Menu>
            ) : null}
        </Box>
    );
};

type GalleryProps = {
    search: string;
    onSearchChange: (search: string) => void;
    items: ChartTypeGalleryItem[];
    /** Shown in place of the cards when nothing matches; null shows none. */
    emptyMessage: string | null;
    /** Remote-list states; the cards on screen survive both. */
    loading: boolean;
    errorMessage: string | null;
    onRetry: (() => void) | null;
    /** Fetches the next server page; null when every page is loaded. */
    onLoadMore: (() => void) | null;
    /** Null when remaining results may include the appended selection. */
    moreCount: number | null;
    loadingMore: boolean;
    /** Why nothing here can be picked; null while the gallery is usable. */
    disabledReason: string | null;
};

export const ChartTypeGallery: FC<GalleryProps> = ({
    search,
    onSearchChange,
    items,
    emptyMessage,
    loading,
    errorMessage,
    onRetry,
    onLoadMore,
    moreCount,
    loadingMore,
    disabledReason,
}) => {
    const gridRef = useRef<HTMLDivElement | null>(null);
    const pendingFocusKeys = useRef<Set<string> | null>(null);
    const hasScrolledToSelection = useRef(false);
    const itemCount = items.length;
    const hasMore = onLoadMore !== null;

    // Follow new cards by key: an appended selection can move into a loaded page.
    // If no new card appears, keep focus in the gallery when Load more disappears.
    useEffect(() => {
        const previousKeys = pendingFocusKeys.current;
        if (previousKeys === null || loadingMore) return;
        pendingFocusKeys.current = null;
        const firstNewIndex = items.findIndex(
            ({ key }) => !previousKeys.has(key),
        );
        const index = firstNewIndex === -1 ? itemCount - 1 : firstNewIndex;
        if (itemCount === 0) {
            document.getElementById(CHART_GALLERY_SEARCH_ID)?.focus();
            return;
        }
        gridRef.current
            ?.querySelectorAll<HTMLButtonElement>(`.${classes.card}`)
            [Math.min(index, itemCount - 1)]?.focus();
    }, [items, itemCount, loadingMore, hasMore, errorMessage]);

    // The picker opens on whatever is already selected, which can sit below
    // the fold once project types arrive.
    useEffect(() => {
        if (hasScrolledToSelection.current) return;
        const selected = gridRef.current?.querySelector<HTMLElement>(
            `.${classes.card}[data-selected='true']`,
        );
        if (!selected) return;
        hasScrolledToSelection.current = true;
        selected.scrollIntoView?.({ block: 'nearest' });
    }, [items]);

    return (
        <Stack className={classes.root} gap="md">
            <TextInput
                id={CHART_GALLERY_SEARCH_ID}
                size="xs"
                value={search}
                onChange={(event) => onSearchChange(event.currentTarget.value)}
                placeholder="Search the gallery"
                leftSection={<MantineIcon icon={IconSearch} />}
                aria-label="Search chart types"
            />

            {/* Disabled cards drop out of the tab order, so the reason has to
                live outside the grid. */}
            {disabledReason !== null ? (
                <Text fz="xs" c="dimmed" role="status">
                    {disabledReason}
                </Text>
            ) : null}

            <ScrollArea
                className={classes.scrollArea}
                offsetScrollbars
                scrollbars="y"
                type="hover"
                scrollbarSize={8}
                classNames={{ content: classes.scrollContent }}
            >
                <Stack gap="xs" pb="xs">
                    {items.length === 0 && emptyMessage !== null ? (
                        <Text fz="xs" c="dimmed">
                            {emptyMessage}
                        </Text>
                    ) : null}

                    <Box
                        ref={gridRef}
                        className={classes.grid}
                        role="group"
                        aria-label="Chart types"
                    >
                        {items.map((item) => (
                            <GalleryCard key={item.key} item={item} />
                        ))}
                        {/* Stands in for the pages not fetched yet, so it keeps
                            the card material; the count is the informative
                            part. */}
                        {onLoadMore !== null ? (
                            <UnstyledButton
                                className={clsx(classes.card, classes.moreCard)}
                                aria-label={
                                    moreCount === null
                                        ? 'Load more chart types'
                                        : `Show ${moreCount} more chart types`
                                }
                                disabled={loadingMore}
                                onClick={() => {
                                    pendingFocusKeys.current = new Set(
                                        items.map(({ key }) => key),
                                    );
                                    onLoadMore();
                                }}
                            >
                                <Box className={classes.cardIcon}>
                                    {loadingMore ? (
                                        <Loader size="sm" color="ldGray.6" />
                                    ) : (
                                        <MantineIcon
                                            className={classes.icon}
                                            icon={IconDots}
                                            size="xl"
                                            stroke={1.5}
                                            color="dimmed"
                                        />
                                    )}
                                </Box>
                                <Text
                                    className={classes.cardLabel}
                                    fz="xs"
                                    fw={500}
                                    lh={1.2}
                                >
                                    {moreCount === null
                                        ? 'Load more'
                                        : `+${moreCount} more`}
                                </Text>
                            </UnstyledButton>
                        ) : null}
                    </Box>

                    {loading ? (
                        <Group gap="xs" role="status">
                            <Loader size="xs" />
                            <Text fz="xs" c="dimmed">
                                Loading chart types…
                            </Text>
                        </Group>
                    ) : null}
                    {errorMessage !== null ? (
                        <Group
                            justify="space-between"
                            wrap="nowrap"
                            role="alert"
                        >
                            <Text fz="xs" c="red">
                                {errorMessage}
                            </Text>
                            {onRetry !== null ? (
                                <Button
                                    variant="subtle"
                                    size="compact-xs"
                                    onClick={onRetry}
                                >
                                    Retry
                                </Button>
                            ) : null}
                        </Group>
                    ) : null}
                </Stack>
            </ScrollArea>
        </Stack>
    );
};

type ExplorerChartTypeGalleryProps = {
    selectedProjectType: DataAppViz | null;
    selectedProjectTypeError: ApiError | null;
    onRetrySelectedProjectType: () => void;
    onConfigure: () => void;
};

const ExplorerChartTypeGallery: FC<ExplorerChartTypeGalleryProps> = ({
    selectedProjectType,
    selectedProjectTypeError,
    onRetrySelectedProjectType,
    onConfigure,
}) => {
    const projectUuid = useProjectUuid();
    const dispatch = useExplorerDispatch();
    const [search, setSearch] = useState('');
    const [debouncedSearch] = useDebouncedValue(search, 300);
    const dataAppsEnabled =
        useServerFeatureFlag(FeatureFlags.EnableDataApps).data?.enabled ===
        true;
    const { enabled: chartTypesEnabled } = useChartTypesEnabled();
    const {
        data,
        isInitialLoading,
        error,
        refetch,
        hasNextPage,
        fetchNextPage,
        isFetchingNextPage,
    } = useDataAppVisualizations(
        chartTypesEnabled ? projectUuid : undefined,
        debouncedSearch,
        PICKER_SORT,
        6,
    );
    const canEditChartType = useCanEditDataAppChecker(projectUuid);
    const canFork = useCanCreateDataApp(projectUuid);
    const { track } = useTracking();
    const { visualizationConfig, itemsMap } = useVisualizationContext();
    const selectProjectChartType = useSelectProjectChartType();
    const { disabled, options, vegaOption } = useChartTypeOptions();
    const [forkTarget, setForkTarget] = useState<DataAppViz | null>(null);

    const projectTypes = useMemo(
        () => data?.pages.flatMap((page) => page.data) ?? [],
        [data?.pages],
    );
    const selectedProjectUuid = isDataAppVizVisualizationConfig(
        visualizationConfig,
    )
        ? visualizationConfig.chartConfig.dataAppVizUuid
        : null;

    const selectedType =
        selectedProjectType?.dataAppVizUuid === selectedProjectUuid &&
        selectedProjectType?.projectUuid === projectUuid
            ? selectedProjectType
            : null;

    const matchesBuiltInSearch = (option: ChartTypeOption) =>
        option.label.toLowerCase().includes(debouncedSearch.toLowerCase());

    const builtInItems: ChartTypeGalleryItem[] = [...options, vegaOption]
        .filter(matchesBuiltInSearch)
        .map(({ id, ...option }) => ({
            ...option,
            key: id,
            disabled,
            description: null,
            provenance: null,
            onEdit: null,
            onFork: null,
            select: option.select,
            onConfigure: option.selected ? onConfigure : null,
        }));
    const toProjectItem = (dataAppViz: DataAppViz): ChartTypeGalleryItem => {
        const { label, icon, rotatedIcon } = projectChartTypeItem(dataAppViz);
        const isOfficial = isOfficialChartType(dataAppViz);
        const select = () => {
            // Re-selecting the active type must not overwrite the
            // chart's local bindings with a fresh automap.
            if (selectedProjectUuid !== dataAppViz.dataAppVizUuid) {
                selectProjectChartType(dataAppViz, itemsMap ?? {});
            }
        };
        return {
            key: dataAppViz.dataAppVizUuid,
            label,
            description:
                dataAppViz.description ||
                `${dataAppViz.schema?.fields.length ?? 0} fields`,
            provenance: isOfficial ? 'official' : 'custom',
            icon,
            rotatedIcon,
            selected: selectedProjectUuid === dataAppViz.dataAppVizUuid,
            disabled,
            select,
            onConfigure:
                selectedProjectUuid === dataAppViz.dataAppVizUuid
                    ? onConfigure
                    : null,
            onEdit:
                dataAppsEnabled && canEditChartType(dataAppViz) && !isOfficial
                    ? () =>
                          dispatch(
                              explorerActions.startChartTypeAuthoring({
                                  dataAppVizUuid: dataAppViz.dataAppVizUuid,
                              }),
                          )
                    : null,
            // Forking is authoring, so it needs data apps on, like editing.
            onFork:
                dataAppsEnabled &&
                isOfficial &&
                canFork &&
                projectUuid !== undefined
                    ? () => {
                          track({
                              name: EventName.CHART_TYPE_FORK_MODAL_OPENED,
                              properties: {
                                  projectUuid,
                                  registrySlug: dataAppViz.registrySlug,
                              },
                          });
                          setForkTarget(dataAppViz);
                      }
                    : null,
        };
    };
    // One grid: the built-ins in their familiar order, then everything the
    // project has in the server's name order, wherever it came from.
    const selectedTypeIsLoaded = projectTypes.some(
        ({ dataAppVizUuid }) => dataAppVizUuid === selectedProjectUuid,
    );
    const appendSelectedType =
        selectedType !== null &&
        selectedProjectTypeError === null &&
        !selectedTypeIsLoaded;
    const projectItems = chartTypesEnabled
        ? [...projectTypes, ...(appendSelectedType ? [selectedType] : [])].map(
              toProjectItem,
          )
        : [];
    const items = [...builtInItems, ...projectItems];

    // Server total for the current search, so the tile counts pages that are
    // not fetched yet.
    const totalProjectTypes =
        data?.pages.at(-1)?.pagination?.totalResults ?? projectTypes.length;
    const unfetchedCount = hasNextPage
        ? Math.max(totalProjectTypes - projectTypes.length, 1)
        : 0;

    return (
        <>
            <Stack className={classes.root} gap="md">
                <ChartTypeGallery
                    search={search}
                    onSearchChange={setSearch}
                    items={items}
                    emptyMessage={
                        items.length === 0 && debouncedSearch !== ''
                            ? 'No chart types match your search'
                            : null
                    }
                    loading={isInitialLoading}
                    errorMessage={error ? 'Failed to load chart types' : null}
                    onRetry={error ? () => void refetch() : null}
                    onLoadMore={
                        hasNextPage === true ? () => void fetchNextPage() : null
                    }
                    moreCount={appendSelectedType ? null : unfetchedCount}
                    loadingMore={isFetchingNextPage}
                    disabledReason={
                        disabled ? 'Run your query to pick a chart type.' : null
                    }
                />
                {chartTypesEnabled &&
                selectedProjectUuid !== null &&
                !selectedTypeIsLoaded &&
                !appendSelectedType ? (
                    <Box>
                        {selectedProjectTypeError !== null ? (
                            <Box role="alert">
                                <InlineErrorState
                                    message="Selected chart type is unavailable"
                                    onRetry={onRetrySelectedProjectType}
                                />
                            </Box>
                        ) : (
                            <Group gap="xs" role="status">
                                <Loader size="xs" />
                                <Text fz="xs" c="dimmed">
                                    Loading selected chart type…
                                </Text>
                            </Group>
                        )}
                    </Box>
                ) : null}
            </Stack>
            {forkTarget !== null && projectUuid !== undefined ? (
                <ChartTypeForkModal
                    opened
                    onClose={() => setForkTarget(null)}
                    projectUuid={projectUuid}
                    appUuid={forkTarget.dataAppVizUuid}
                    defaultName={`${forkTarget.name} (custom)`}
                    onForked={(result) => {
                        setForkTarget(null);
                        dispatch(
                            explorerActions.startChartTypeAuthoring({
                                dataAppVizUuid: result.appUuid,
                            }),
                        );
                    }}
                />
            ) : null}
        </>
    );
};

export default ExplorerChartTypeGallery;
