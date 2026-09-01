import { FeatureFlags, type DataAppViz } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Loader,
    ScrollArea,
    Stack,
    Text,
    TextInput,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconDots,
    IconFilePencil,
    IconPlus,
    IconSearch,
} from '@tabler/icons-react';
import clsx from 'clsx';
import { useEffect, useId, useMemo, useRef, useState, type FC } from 'react';
import { useCanCreateDataApp } from '../../../features/apps/hooks/useCanCreateDataApp';
import { useCanEditDataAppChecker } from '../../../features/apps/hooks/useCanEditDataApp';
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
import {
    projectChartTypeItem,
    useChartTypeOptions,
    type ChartTypeOption,
} from '../VisualizationCardOptions/useChartTypeOptions';
import classes from './ChartTypeGallery.module.css';

/** Grid slots the project section may fill before collapsing; when it does,
    the last slot becomes the "+N more" tile, so the collapse never trades a
    single hidden card for a tile. */
const MAX_UNCOLLAPSED_PROJECT_TYPES = 6;
const COLLAPSED_PROJECT_TYPES_SHOWN = MAX_UNCOLLAPSED_PROJECT_TYPES - 1;

export type ChartTypeGalleryItem = Omit<ChartTypeOption, 'id'> & {
    key: string;
    disabled: boolean;
    /** Shown as the card's tooltip; null shows none. */
    description: string | null;
    /** Opens the chart type builder for this item; null hides the action. */
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
        stroke={1.25}
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
};

const GalleryCard: FC<{ item: ChartTypeGalleryItem }> = ({ item }) => {
    // A clamped name has nowhere else to go: the card face is the only place
    // it appears, so the tooltip carries it whenever the card cannot.
    const labelRef = useRef<HTMLParagraphElement>(null);
    const [isLabelClamped, setIsLabelClamped] = useState(false);
    useEffect(() => {
        const label = labelRef.current;
        if (!label) return;
        const measure = () =>
            setIsLabelClamped(label.scrollHeight > label.clientHeight + 1);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(label);
        return () => observer.disconnect();
    }, [item.label]);

    const clampedLabel = isLabelClamped ? item.label : null;

    return (
        <Box className={classes.cardWrapper}>
            <Tooltip
                label={
                    <>
                        {clampedLabel !== null ? (
                            <Text fz="xs" fw={600}>
                                {clampedLabel}
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
                disabled={clampedLabel === null && item.description === null}
                maw={300}
            >
                <UnstyledButton
                    className={classes.card}
                    data-selected={item.selected}
                    aria-pressed={item.selected}
                    disabled={item.disabled}
                    onClick={item.select}
                >
                    <ChartTypeIcon
                        icon={item.icon}
                        rotatedIcon={item.rotatedIcon}
                    />
                    <Text
                        ref={labelRef}
                        fz="xs"
                        fw={500}
                        lh={1.2}
                        lineClamp={2}
                    >
                        {item.label}
                    </Text>
                </UnstyledButton>
            </Tooltip>
            {item.onEdit !== null ? (
                <ActionIcon
                    className={classes.cardEdit}
                    variant="default"
                    size="sm"
                    aria-label={`Edit ${item.label}`}
                    onClick={item.onEdit}
                >
                    <MantineIcon icon={IconFilePencil} size={14} />
                </ActionIcon>
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

    if (section.loading) {
        return (
            <Group gap="xs" role="status">
                <Loader size="xs" />
                <Text fz="xs" c="dimmed">
                    Loading chart types…
                </Text>
            </Group>
        );
    }
    // A transient refetch failure must not hide types already on screen.
    if (section.errorMessage !== null && section.items.length === 0) {
        return (
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
        );
    }
    if (section.items.length === 0 && section.onCreateNew === null) {
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
                        <Text fz="xs" fw={500} lh={1.2}>
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
                        <MantineIcon
                            className={classes.icon}
                            icon={IconPlus}
                            size="xl"
                            stroke={1.5}
                            color="dimmed"
                        />
                        <Text fz="xs" fw={500} lh={1.2}>
                            New chart type
                        </Text>
                    </UnstyledButton>
                ) : null}
            </Box>
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
    onSelected: () => void;
};

const ExplorerChartTypeGallery: FC<ExplorerChartTypeGalleryProps> = ({
    onSelected,
}) => {
    const projectUuid = useProjectUuid();
    const dispatch = useExplorerDispatch();
    const [search, setSearch] = useState('');
    const [debouncedSearch] = useDebouncedValue(search, 300);
    const [showAllProjectTypes, setShowAllProjectTypes] = useState(false);
    const dataAppsEnabled =
        useServerFeatureFlag(FeatureFlags.EnableDataApps).data?.enabled ===
        true;
    const {
        data,
        isInitialLoading,
        error,
        refetch,
        hasNextPage,
        fetchNextPage,
        isFetchingNextPage,
    } = useDataAppVisualizations(
        dataAppsEnabled ? projectUuid : undefined,
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
            onEdit: null,
            select: () => {
                option.select();
                onSelected();
            },
        }));
    const projectItems = projectTypes.map(
        (dataAppViz: DataAppViz): ChartTypeGalleryItem => {
            const { label, icon, rotatedIcon } =
                projectChartTypeItem(dataAppViz);
            return {
                key: dataAppViz.dataAppVizUuid,
                label,
                description:
                    dataAppViz.description ||
                    `${dataAppViz.schema?.fields.length ?? 0} fields`,
                icon,
                rotatedIcon,
                selected: selectedProjectUuid === dataAppViz.dataAppVizUuid,
                disabled,
                select: () => {
                    // Re-selecting the active type must not overwrite the
                    // chart's local bindings with a fresh automap.
                    if (selectedProjectUuid !== dataAppViz.dataAppVizUuid) {
                        selectProjectChartType(dataAppViz, itemsMap ?? {});
                    }
                    onSelected();
                },
                onEdit: canEditChartType(dataAppViz)
                    ? () =>
                          dispatch(
                              explorerActions.startChartTypeAuthoring({
                                  dataAppVizUuid: dataAppViz.dataAppVizUuid,
                              }),
                          )
                    : null,
            };
        },
    );

    // Cap the initial grid so built-ins stay in view; searching shows every
    // match, and a selection deeper in the list is never hidden.
    const selectedProjectIdx = projectItems.findIndex((item) => item.selected);
    const collapseProjectTypes =
        !showAllProjectTypes &&
        debouncedSearch === '' &&
        projectItems.length > MAX_UNCOLLAPSED_PROJECT_TYPES &&
        selectedProjectIdx < COLLAPSED_PROJECT_TYPES_SHOWN;
    const visibleProjectItems = collapseProjectTypes
        ? projectItems.slice(0, COLLAPSED_PROJECT_TYPES_SHOWN)
        : projectItems;
    // Server total for the current search, so the tile counts pages that are
    // not fetched yet.
    const totalProjectTypes =
        data?.pages.at(-1)?.pagination?.totalResults ?? projectItems.length;
    const hiddenProjectTypes = collapseProjectTypes
        ? totalProjectTypes - visibleProjectItems.length
        : hasNextPage
          ? Math.max(totalProjectTypes - projectItems.length, 1)
          : 0;

    const sections: ChartTypeGallerySection[] = [
        ...(dataAppsEnabled
            ? [
                  {
                      label: 'Project',
                      items: visibleProjectItems,
                      loading: isInitialLoading,
                      errorMessage: error
                          ? 'Failed to load project chart types'
                          : null,
                      emptyMessage: debouncedSearch
                          ? 'No project chart types match your search'
                          : 'No project chart types yet',
                      onRetry: error ? () => void refetch() : null,
                      onLoadMore: collapseProjectTypes
                          ? () => setShowAllProjectTypes(true)
                          : hasNextPage
                            ? () => void fetchNextPage()
                            : null,
                      moreCount: hiddenProjectTypes,
                      loadingMore: isFetchingNextPage,
                      onCreateNew: canCreateChartType
                          ? () =>
                                dispatch(
                                    explorerActions.startChartTypeAuthoring({
                                        dataAppVizUuid: null,
                                    }),
                                )
                          : null,
                  },
              ]
            : []),
        {
            label: 'Built in',
            items: builtInItems,
            emptyMessage: 'No built-in chart types match your search',
            loading: false,
            errorMessage: null,
            onRetry: null,
            onLoadMore: null,
            moreCount: 0,
            loadingMore: false,
            onCreateNew: null,
        },
    ];

    return (
        <ChartTypeGallery
            search={search}
            onSearchChange={setSearch}
            sections={sections}
            disabledReason={
                disabled ? 'Run your query to pick a chart type.' : null
            }
        />
    );
};

export default ExplorerChartTypeGallery;
