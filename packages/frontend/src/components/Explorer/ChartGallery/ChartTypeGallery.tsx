import { FeatureFlags, type DataAppViz } from '@lightdash/common';
import {
    Anchor,
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
import { IconPlus, IconSearch } from '@tabler/icons-react';
import {
    useCallback,
    useMemo,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useCanCreateDataApp } from '../../../features/apps/hooks/useCanCreateDataApp';
import { useCanEditDataAppChecker } from '../../../features/apps/hooks/useCanEditDataApp';
import { useDataAppVisualizations } from '../../../features/chartTypes/hooks/useDataAppVisualizations';
import { chartTypeBuilderPath } from '../../../features/chartTypes/utils/chartTypeBuilderPath';
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

/** Rows shown before "Load more", keeping built-ins visible at first glance. */
const INITIAL_PROJECT_TYPES_SHOWN = 5;

export type ChartTypeGalleryItem = Omit<ChartTypeOption, 'id'> & {
    key: string;
    disabled: boolean;
};

/** Rows show per-item text and actions that grid cards deliberately drop. */
export type ChartTypeGalleryRowItem = ChartTypeGalleryItem & {
    description: string;
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
        color="blue"
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

type ChartTypeGallerySectionBase = {
    label: string;
    emptyMessage: string;
};

export type ChartTypeGallerySection =
    /** A static set of built-ins: a compact card grid, no remote-list states. */
    | (ChartTypeGallerySectionBase & {
          layout: 'grid';
          items: ChartTypeGalleryItem[];
      })
    /** A remote list of project chart types: richer rows with list states. */
    | (ChartTypeGallerySectionBase & {
          layout: 'rows';
          items: ChartTypeGalleryRowItem[];
          loading: boolean;
          errorMessage: string | null;
          onRetry: (() => void) | null;
          onLoadMore: (() => void) | null;
          loadingMore: boolean;
          /** Opens the chart type builder; null hides the create action. */
          onCreateNew: (() => void) | null;
      });

type GalleryItemButtonProps = {
    item: ChartTypeGalleryItem;
    className: string;
    children: ReactNode;
};

const GalleryItemButton: FC<GalleryItemButtonProps> = ({
    item,
    className,
    children,
}) => (
    <UnstyledButton
        className={className}
        data-selected={item.selected}
        disabled={item.disabled}
        onClick={item.select}
    >
        {children}
    </UnstyledButton>
);

// Observes the clamped description and reports whether it is actually cut
// off; ResizeObserver fires on observe and on any later size change.
const useIsClamped = () => {
    const [isClamped, setIsClamped] = useState(false);
    const observerRef = useRef<ResizeObserver | null>(null);
    const ref = useCallback((node: HTMLParagraphElement | null) => {
        observerRef.current?.disconnect();
        observerRef.current = null;
        if (!node) return;
        observerRef.current = new ResizeObserver(() => {
            setIsClamped(node.scrollHeight > node.clientHeight);
        });
        observerRef.current.observe(node);
    }, []);
    return { ref, isClamped };
};

const GalleryRow: FC<{ item: ChartTypeGalleryRowItem }> = ({ item }) => {
    // The description is clamped to two lines; surface the full text on hover
    // only when it is actually cut off.
    const { ref, isClamped } = useIsClamped();

    return (
        <Box className={classes.rowWrapper}>
            <Tooltip
                label={item.description}
                withinPortal
                position="left"
                withArrow
                openDelay={500}
                color="dark"
                events={{ hover: true, focus: true, touch: false }}
                disabled={!isClamped}
                maw={300}
                multiline
            >
                <UnstyledButton
                    className={classes.row}
                    data-selected={item.selected}
                    data-has-edit={item.onEdit !== null}
                    disabled={item.disabled}
                    onClick={item.select}
                >
                    <Group wrap="nowrap" gap="sm">
                        <ChartTypeThumbnail
                            icon={item.icon}
                            rotatedIcon={item.rotatedIcon}
                        />
                        <Stack gap={2} flex={1} miw={0}>
                            <Text size="sm" fw={500}>
                                {item.label}
                            </Text>
                            <Text ref={ref} fz="xs" c="dimmed" lineClamp={2}>
                                {item.description}
                            </Text>
                        </Stack>
                    </Group>
                </UnstyledButton>
            </Tooltip>
            {item.onEdit !== null ? (
                <Anchor
                    component="button"
                    type="button"
                    className={classes.rowEdit}
                    aria-label={`Edit ${item.label}`}
                    fz="xs"
                    fw={500}
                    onClick={item.onEdit}
                >
                    Edit
                </Anchor>
            ) : null}
        </Box>
    );
};

const SectionBody: FC<{ section: ChartTypeGallerySection }> = ({ section }) => {
    if (section.layout === 'rows' && section.loading) {
        return (
            <Group gap="xs">
                <Loader size="xs" />
                <Text fz="xs" c="dimmed">
                    Loading chart types…
                </Text>
            </Group>
        );
    }

    if (section.layout === 'rows' && section.errorMessage !== null) {
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

    if (section.items.length === 0) {
        return (
            <Text fz="xs" c="dimmed">
                {section.emptyMessage}
            </Text>
        );
    }

    if (section.layout === 'grid') {
        return (
            <Box className={classes.grid}>
                {section.items.map((item) => (
                    <GalleryItemButton
                        key={item.key}
                        item={item}
                        className={classes.card}
                    >
                        <ChartTypeIcon
                            icon={item.icon}
                            rotatedIcon={item.rotatedIcon}
                        />
                        <Text fz="xs" fw={500} lh={1.2}>
                            {item.label}
                        </Text>
                    </GalleryItemButton>
                ))}
            </Box>
        );
    }

    return (
        <>
            {section.items.map((item) => (
                <GalleryRow key={item.key} item={item} />
            ))}
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

                        {section.layout === 'rows' &&
                        section.onLoadMore !== null ? (
                            <Button
                                variant="subtle"
                                size="xs"
                                loading={section.loadingMore}
                                onClick={section.onLoadMore}
                            >
                                Load more
                            </Button>
                        ) : null}

                        {/* An action, not a chart type; wanted even when the
                            section is empty. */}
                        {section.layout === 'rows' &&
                        section.onCreateNew !== null ? (
                            <Button
                                variant="subtle"
                                size="xs"
                                px="xs"
                                leftSection={<MantineIcon icon={IconPlus} />}
                                onClick={section.onCreateNew}
                                justify="flex-start"
                            >
                                Create new chart type
                            </Button>
                        ) : null}
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
    const location = useLocation();
    const navigate = useNavigate();
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
            select: () => {
                option.select();
                onSelected();
            },
        }));
    const projectItems = projectTypes.map(
        (dataAppViz: DataAppViz): ChartTypeGalleryRowItem => {
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
                          void navigate({
                              pathname: chartTypeBuilderPath(
                                  projectUuid ?? '',
                                  dataAppViz.dataAppVizUuid,
                              ),
                              search: location.search,
                          })
                    : null,
            };
        },
    );

    // Cap the initial list so built-ins stay in view; searching shows every
    // match, and a selection deeper in the list is never hidden.
    const selectedProjectIdx = projectItems.findIndex((item) => item.selected);
    const collapseProjectTypes =
        !showAllProjectTypes &&
        debouncedSearch === '' &&
        projectItems.length > INITIAL_PROJECT_TYPES_SHOWN &&
        selectedProjectIdx < INITIAL_PROJECT_TYPES_SHOWN;
    const visibleProjectItems = collapseProjectTypes
        ? projectItems.slice(0, INITIAL_PROJECT_TYPES_SHOWN)
        : projectItems;

    const sections: ChartTypeGallerySection[] = [
        ...(dataAppsEnabled
            ? [
                  {
                      label: 'Project',
                      layout: 'rows' as const,
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
                      loadingMore: isFetchingNextPage,
                      onCreateNew: canCreateChartType
                          ? () =>
                                void navigate({
                                    pathname: chartTypeBuilderPath(
                                        projectUuid ?? '',
                                    ),
                                    search: location.search,
                                })
                          : null,
                  },
              ]
            : []),
        {
            label: 'Built in',
            layout: 'grid',
            items: builtInItems,
            emptyMessage: 'No built-in chart types match your search',
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
