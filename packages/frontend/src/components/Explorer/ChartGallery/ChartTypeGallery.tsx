import {
    FeatureFlags,
    isOfficialChartType,
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
    IconPlus,
    IconPuzzle,
    IconSearch,
} from '@tabler/icons-react';
import clsx from 'clsx';
import { useEffect, useId, useMemo, useRef, useState, type FC } from 'react';
import { useCanCreateDataApp } from '../../../features/apps/hooks/useCanCreateDataApp';
import { useCanEditDataAppChecker } from '../../../features/apps/hooks/useCanEditDataApp';
import ChartTypeLibraryModal from '../../../features/chartTypes/components/ChartTypeLibraryModal';
import { useChartTypesEnabled } from '../../../features/chartTypes/hooks/useChartTypesEnabled';
import { useDataAppVisualizations } from '../../../features/chartTypes/hooks/useDataAppVisualizations';
import {
    explorerActions,
    useExplorerDispatch,
} from '../../../features/explorer/store';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { CHART_GALLERY_SEARCH_ID } from '../../common/ChartGallery/ChartGalleryContext';
import MantineIcon from '../../common/MantineIcon';
import { isDataAppVizVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { useSelectProjectChartType } from '../../VisualizationConfigs/CustomChartType/useSelectProjectChartType';
import classes from './ChartTypeGallery.module.css';
import {
    projectChartTypeItem,
    useChartTypeOptions,
    type ChartTypeOption,
} from './useChartTypeOptions';

/** Grid slots the custom section may fill before collapsing; when it does,
    the last slot becomes the "+N more" tile, so the collapse never trades a
    single hidden card for a tile. */
const MAX_UNCOLLAPSED_PROJECT_TYPES = 6;
const COLLAPSED_PROJECT_TYPES_SHOWN = MAX_UNCOLLAPSED_PROJECT_TYPES - 1;

export type ChartTypeGalleryItem = Omit<ChartTypeOption, 'id'> & {
    key: string;
    disabled: boolean;
    /** Shown as the card's tooltip; null shows none. */
    description: string | null;
    /** Installed from the chart type library; shows the provenance badge. */
    installed: boolean;
    onConfigure: (() => void) | null;
    /** Opens the builder directly; null hides the action. */
    onEdit: (() => void) | null;
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

export type ChartTypeGallerySection = {
    label: string;
    items: ChartTypeGalleryItem[];
    emptyMessage: string;
    /* Remote-list states; a static section passes them inert. */
    loading: boolean;
    errorMessage: string | null;
    onRetry: (() => void) | null;
    onLoadMore: (() => void) | null;
    /** Hidden items behind the "+N more" tile; 0 when onLoadMore is null. */
    moreCount: number;
    loadingMore: boolean;
    /** Opens the chart type builder; null hides the create tile. */
    onCreateNew: (() => void) | null;
    /** Opens the chart type library; null hides the discover tile. */
    onFindNew: (() => void) | null;
};

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
            {/* Official types are read-only, so the edit menu's corner is
                always free for the provenance badge. */}
            {item.installed ? (
                <Tooltip
                    label="Installed from the chart type library"
                    position="top"
                    openDelay={500}
                >
                    <Box
                        className={classes.installedBadge}
                        role="img"
                        aria-label="Installed from the chart type library"
                    >
                        <MantineIcon icon={IconPuzzle} size={12} stroke={1.5} />
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
            {item.onEdit !== null ? (
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
                        <Menu.Item
                            leftSection={
                                <MantineIcon icon={IconFilePencil} size={16} />
                            }
                            onClick={item.onEdit}
                        >
                            Edit chart type
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            ) : null}
        </Box>
    );
};

const SectionEmpty: FC<{ message: string }> = ({ message }) => (
    <Text fz="xs" c="dimmed">
        {message}
    </Text>
);

const SectionBody: FC<{ section: ChartTypeGallerySection }> = ({ section }) => {
    const gridRef = useRef<HTMLDivElement | null>(null);
    const pendingFocusIndex = useRef<number | null>(null);
    const itemCount = section.items.length;

    // The "+N more" tile can unmount on reveal; move focus to the first new
    // card so keyboard users are not dropped back to the body. The pending
    // index is consumed by whatever count change answers the click, so a
    // failed or shorter load cannot leave it armed for a later, unrelated
    // change.
    useEffect(() => {
        const index = pendingFocusIndex.current;
        if (index === null) return;
        pendingFocusIndex.current = null;
        if (itemCount === 0) return;
        gridRef.current
            ?.querySelectorAll<HTMLButtonElement>(`.${classes.card}`)
            [Math.min(index, itemCount - 1)]?.focus();
    }, [itemCount]);

    // Remote state must never hide types already on screen: the built-in
    // shelf keeps its cards while installed types load or fail, so the
    // loader replaces nothing and the failure renders after the grid.
    if (section.loading && section.items.length === 0) {
        return (
            <Group gap="xs" role="status">
                <Loader size="xs" />
                <Text fz="xs" c="dimmed">
                    Loading chart types…
                </Text>
            </Group>
        );
    }
    const errorNotice =
        section.errorMessage !== null ? (
            <Group justify="space-between" wrap="nowrap" role="alert">
                <Text fz="xs" c="red">
                    {section.errorMessage}
                </Text>
                {section.onRetry !== null ? (
                    <Button
                        variant="subtle"
                        size="compact-xs"
                        onClick={section.onRetry}
                    >
                        Retry
                    </Button>
                ) : null}
            </Group>
        ) : null;
    if (section.items.length === 0 && errorNotice !== null) {
        return errorNotice;
    }
    if (
        section.items.length === 0 &&
        section.onCreateNew === null &&
        section.onFindNew === null
    ) {
        return <SectionEmpty message={section.emptyMessage} />;
    }
    return (
        <>
            {section.items.length === 0 ? (
                <SectionEmpty message={section.emptyMessage} />
            ) : null}
            <Box ref={gridRef} className={classes.grid}>
                {section.items.map((item) => (
                    <GalleryCard key={item.key} item={item} />
                ))}
                {/* Stands in for the hidden cards, so it keeps the card
                    material; the count is the informative part. Covers both
                    revealing capped items and fetching the next page. */}
                {section.onLoadMore !== null ? (
                    <UnstyledButton
                        className={clsx(classes.card, classes.moreCard)}
                        aria-label={`Show ${section.moreCount} more chart types`}
                        disabled={section.loadingMore}
                        onClick={() => {
                            pendingFocusIndex.current = section.items.length;
                            section.onLoadMore?.();
                        }}
                    >
                        <Box className={classes.cardIcon}>
                            {section.loadingMore ? (
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
                            +{section.moreCount} more
                        </Text>
                    </UnstyledButton>
                ) : null}
                {/* An action, not a chart type; a tile so it lives where the
                    eye already is. */}
                {section.onCreateNew !== null ? (
                    <UnstyledButton
                        className={clsx(classes.card, classes.createCard)}
                        aria-label="Create new chart type"
                        onClick={section.onCreateNew}
                    >
                        <Box className={classes.cardIcon}>
                            <MantineIcon
                                className={classes.icon}
                                icon={IconPlus}
                                size="xl"
                                stroke={1.5}
                                color="dimmed"
                            />
                        </Box>
                        <Text
                            className={classes.cardLabel}
                            fz="xs"
                            fw={500}
                            lh={1.2}
                        >
                            New chart type
                        </Text>
                    </UnstyledButton>
                ) : null}
                {/* Leads out of the picker to the library, so it takes the
                    action-tile material rather than a chart type's. */}
                {section.onFindNew !== null ? (
                    <UnstyledButton
                        className={clsx(classes.card, classes.createCard)}
                        aria-label="Find new chart types"
                        onClick={section.onFindNew}
                    >
                        <Box className={classes.cardIcon}>
                            <MantineIcon
                                className={classes.icon}
                                icon={IconPlus}
                                size="xl"
                                stroke={1.5}
                                color="dimmed"
                            />
                        </Box>
                        <Text
                            className={classes.cardLabel}
                            fz="xs"
                            fw={500}
                            lh={1.2}
                        >
                            Find new chart types
                        </Text>
                    </UnstyledButton>
                ) : null}
            </Box>
            {errorNotice}
        </>
    );
};

/* Grouped and named after its own heading, like the builder's question
   sheet, so the shelves stay distinct rather than one flat run of cards. */
const GallerySection: FC<{ section: ChartTypeGallerySection }> = ({
    section,
}) => {
    const labelId = useId();
    return (
        <Stack gap="xs" role="group" aria-labelledby={labelId}>
            <Text id={labelId} fz="xs" fw={600} c="dimmed">
                {section.label}
            </Text>

            <SectionBody section={section} />
        </Stack>
    );
};

type GalleryProps = {
    search: string;
    onSearchChange: (search: string) => void;
    sections: ChartTypeGallerySection[];
    /** Why nothing here can be picked; null while the gallery is usable. */
    disabledReason: string | null;
};

export const ChartTypeGallery: FC<GalleryProps> = ({
    search,
    onSearchChange,
    sections,
    disabledReason,
}) => (
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
            <Stack gap="lg" pb="xs">
                {sections.map((section) => (
                    <GallerySection key={section.label} section={section} />
                ))}
            </Stack>
        </ScrollArea>
    </Stack>
);

type ExplorerChartTypeGalleryProps = {
    onConfigure: () => void;
};

const ExplorerChartTypeGallery: FC<ExplorerChartTypeGalleryProps> = ({
    onConfigure,
}) => {
    const projectUuid = useProjectUuid();
    const dispatch = useExplorerDispatch();
    const [search, setSearch] = useState('');
    const [debouncedSearch] = useDebouncedValue(search, 300);
    const [showAllProjectTypes, setShowAllProjectTypes] = useState(false);
    const [isLibraryOpen, setIsLibraryOpen] = useState(false);
    const dataAppsEnabled =
        useServerFeatureFlag(FeatureFlags.EnableDataApps).data?.enabled ===
        true;
    const libraryEnabled =
        useServerFeatureFlag(FeatureFlags.ChartTypeRegistry).data?.enabled ===
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
    );
    const canCreateChartType = useCanCreateDataApp(projectUuid);
    const canEditChartType = useCanEditDataAppChecker(projectUuid);
    const { visualizationConfig, itemsMap } = useVisualizationContext();
    const selectProjectChartType = useSelectProjectChartType();
    const { disabled, options, vegaOption } = useChartTypeOptions();

    const projectTypes = useMemo(
        () => data?.pages.flatMap((page) => page.data) ?? [],
        [data?.pages],
    );
    const selectedProjectUuid = isDataAppVizVisualizationConfig(
        visualizationConfig,
    )
        ? visualizationConfig.chartConfig.dataAppVizUuid
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
            installed: false,
            onEdit: null,
            select: option.select,
            onConfigure: option.selected ? onConfigure : null,
        }));
    const toProjectItem = (dataAppViz: DataAppViz): ChartTypeGalleryItem => {
        const { label, icon, rotatedIcon } = projectChartTypeItem(dataAppViz);
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
            installed: isOfficialChartType(dataAppViz),
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
                dataAppsEnabled &&
                canEditChartType(dataAppViz) &&
                !isOfficialChartType(dataAppViz)
                    ? () =>
                          dispatch(
                              explorerActions.startChartTypeAuthoring({
                                  dataAppVizUuid: dataAppViz.dataAppVizUuid,
                              }),
                          )
                    : null,
        };
    };
    const customItems = projectTypes
        .filter((viz) => !isOfficialChartType(viz))
        .map(toProjectItem);
    const installedItems = projectTypes
        .filter(isOfficialChartType)
        .map(toProjectItem);

    // Cap the initial custom grid so built-ins stay in view; searching shows
    // every match, and a selection deeper in the list is never hidden.
    // Installed types sit at the tail of the built-in shelf, so they never
    // collapse.
    const selectedCustomIdx = customItems.findIndex((item) => item.selected);
    const collapseCustomTypes =
        !showAllProjectTypes &&
        debouncedSearch === '' &&
        customItems.length > MAX_UNCOLLAPSED_PROJECT_TYPES &&
        selectedCustomIdx < COLLAPSED_PROJECT_TYPES_SHOWN;
    const visibleCustomItems = collapseCustomTypes
        ? customItems.slice(0, COLLAPSED_PROJECT_TYPES_SHOWN)
        : customItems;
    // Server total for the current search, so the tile counts pages that are
    // not fetched yet. The total spans both kinds, so the fetch tile lives on
    // the last project section on screen rather than once per section.
    const totalProjectTypes =
        data?.pages.at(-1)?.pagination?.totalResults ?? projectTypes.length;
    const unfetchedCount = hasNextPage
        ? Math.max(totalProjectTypes - projectTypes.length, 1)
        : 0;

    const onCreateNew =
        dataAppsEnabled && canCreateChartType
            ? () =>
                  dispatch(
                      explorerActions.startChartTypeAuthoring({
                          dataAppVizUuid: null,
                      }),
                  )
            : null;
    // Discovery needs the library, so the tile follows its flag alone; the
    // library section itself handles a registry that turns out unreachable.
    // Browsing happens in a modal so the explore context survives the detour.
    const onFindNew =
        libraryEnabled && projectUuid !== undefined
            ? () => setIsLibraryOpen(true)
            : null;
    // One query feeds the Custom shelf and the built-in shelf's installed
    // tail, so its loading/error notice renders once, on the shelf this
    // customer's types live in: Custom for data-apps customers, Built in for
    // library-only ones. An empty Custom shelf with nothing to offer stays
    // hidden.
    const remoteStateOnCustom = dataAppsEnabled;
    const hasRemoteState = isInitialLoading || Boolean(error);
    const showCustomSection =
        customItems.length > 0 ||
        onCreateNew !== null ||
        (remoteStateOnCustom && hasRemoteState);
    // Installed types render after the built-ins, so unfetched pages hang off
    // the built-in shelf whenever that tail is on screen.
    const showInstalledTail =
        installedItems.length > 0 || (!remoteStateOnCustom && hasRemoteState);
    const fetchMoreOnBuiltIn = showInstalledTail && hasNextPage === true;

    const customSection: ChartTypeGallerySection = {
        label: 'Custom',
        items: visibleCustomItems,
        loading: isInitialLoading && remoteStateOnCustom,
        errorMessage:
            error && remoteStateOnCustom
                ? 'Failed to load custom chart types'
                : null,
        emptyMessage: debouncedSearch
            ? 'No custom chart types match your search'
            : 'No custom chart types yet',
        onRetry: error && remoteStateOnCustom ? () => void refetch() : null,
        onLoadMore: collapseCustomTypes
            ? () => setShowAllProjectTypes(true)
            : hasNextPage && !fetchMoreOnBuiltIn
              ? () => void fetchNextPage()
              : null,
        moreCount: collapseCustomTypes
            ? customItems.length -
              visibleCustomItems.length +
              (fetchMoreOnBuiltIn ? 0 : unfetchedCount)
            : fetchMoreOnBuiltIn
              ? 0
              : unfetchedCount,
        loadingMore: isFetchingNextPage && !fetchMoreOnBuiltIn,
        onCreateNew,
        onFindNew: null,
    };

    const sections: ChartTypeGallerySection[] = [
        ...(chartTypesEnabled && showCustomSection ? [customSection] : []),
        {
            label: 'Built in',
            items: [...builtInItems, ...installedItems],
            emptyMessage: 'No chart types match your search',
            loading: isInitialLoading && !remoteStateOnCustom,
            errorMessage:
                error && !remoteStateOnCustom
                    ? 'Failed to load installed chart types'
                    : null,
            onRetry:
                error && !remoteStateOnCustom ? () => void refetch() : null,
            onLoadMore: fetchMoreOnBuiltIn ? () => void fetchNextPage() : null,
            moreCount: fetchMoreOnBuiltIn ? unfetchedCount : 0,
            loadingMore: isFetchingNextPage && fetchMoreOnBuiltIn,
            onCreateNew: null,
            onFindNew,
        },
    ];

    return (
        <>
            <ChartTypeGallery
                search={search}
                onSearchChange={setSearch}
                sections={sections}
                disabledReason={
                    disabled ? 'Run your query to pick a chart type.' : null
                }
            />
            {isLibraryOpen && projectUuid !== undefined ? (
                <ChartTypeLibraryModal
                    projectUuid={projectUuid}
                    onClose={() => setIsLibraryOpen(false)}
                />
            ) : null}
        </>
    );
};

export default ExplorerChartTypeGallery;
