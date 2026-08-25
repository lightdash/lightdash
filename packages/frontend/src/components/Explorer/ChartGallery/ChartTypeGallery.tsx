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
import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import { useCanCreateDataApp } from '../../../features/apps/hooks/useCanCreateDataApp';
import { useCanEditDataAppChecker } from '../../../features/apps/hooks/useCanEditDataApp';
import { useDataAppVisualizations } from '../../../features/chartTypes/hooks/useDataAppVisualizations';
import {
    explorerActions,
    useExplorerDispatch,
} from '../../../features/explorer/store';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
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

const GalleryCard: FC<{ item: ChartTypeGalleryItem }> = ({ item }) => (
    <Box className={classes.cardWrapper}>
        <Tooltip
            label={item.description}
            withinPortal
            position="top"
            withArrow
            openDelay={500}
            color="dark"
            events={{ hover: true, focus: true, touch: false }}
            disabled={item.description === null}
            maw={300}
            multiline
        >
            <UnstyledButton
                className={classes.card}
                data-selected={item.selected}
                disabled={item.disabled}
                onClick={item.select}
            >
                <ChartTypeIcon
                    icon={item.icon}
                    rotatedIcon={item.rotatedIcon}
                />
                <Text fz="xs" fw={500} lh={1.2} lineClamp={2}>
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
    // card so keyboard users are not dropped back to the body.
    useEffect(() => {
        const index = pendingFocusIndex.current;
        if (index === null || itemCount <= index) return;
        pendingFocusIndex.current = null;
        gridRef.current
            ?.querySelectorAll<HTMLButtonElement>(`.${classes.card}`)
            [index]?.focus();
    }, [itemCount]);

    if (section.loading) {
        return (
            <Group gap="xs">
                <Loader size="xs" />
                <Text fz="xs" c="dimmed">
                    Loading chart types…
                </Text>
            </Group>
        );
    }
    if (section.errorMessage !== null) {
        return (
            <Group justify="space-between" wrap="nowrap">
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
                                color="ldGray.6"
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
                            color="ldGray.6"
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

type GalleryProps = {
    search: string;
    onSearchChange: (search: string) => void;
    sections: ChartTypeGallerySection[];
};

export const ChartTypeGallery: FC<GalleryProps> = ({
    search,
    onSearchChange,
    sections,
}) => (
    <Stack className={classes.root} gap="md">
        <TextInput
            size="xs"
            value={search}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
            placeholder="Search the gallery"
            leftSection={<MantineIcon icon={IconSearch} />}
            aria-label="Search chart types"
        />

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
                    <Stack key={section.label} gap="xs">
                        <Text fz="xs" fw={600} c="dimmed">
                            {section.label}
                        </Text>

                        <SectionBody section={section} />
                    </Stack>
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
                    selectProjectChartType(dataAppViz, itemsMap ?? {});
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
        />
    );
};

export default ExplorerChartTypeGallery;
