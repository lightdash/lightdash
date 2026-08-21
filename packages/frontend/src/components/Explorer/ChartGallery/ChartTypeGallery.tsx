import { FeatureFlags, type DataAppViz } from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Loader,
    ScrollArea,
    Stack,
    Text,
    TextInput,
    UnstyledButton,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconChevronRight, IconPlus, IconSearch } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useCanCreateDataApp } from '../../../features/apps/hooks/useCanCreateDataApp';
import { useDataAppVisualizations } from '../../../features/chartTypes/hooks/useDataAppVisualizations';
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

export type ChartTypeGalleryItem = Omit<ChartTypeOption, 'id'> & {
    key: string;
    disabled: boolean;
};

type ThumbnailProps = Pick<ChartTypeOption, 'icon' | 'rotatedIcon'>;

export const ChartTypeThumbnail: FC<ThumbnailProps> = ({
    icon,
    rotatedIcon,
}) => (
    <Box className={classes.thumbnail}>
        <MantineIcon
            className={classes.icon}
            data-rotated={rotatedIcon}
            icon={icon}
            size="xl"
            color="blue"
        />
    </Box>
);

export type ChartTypeGallerySection = {
    label: string;
    items: ChartTypeGalleryItem[];
    loading: boolean;
    errorMessage: string | null;
    emptyMessage: string;
    onRetry: (() => void) | null;
    onLoadMore: (() => void) | null;
    loadingMore: boolean;
    /** Opens the chart type builder; null hides the create action. */
    onCreateNew: (() => void) | null;
};

type GalleryProps = {
    search: string;
    onSearchChange: (search: string) => void;
    sections: ChartTypeGallerySection[];
};

const ChartTypeGallery: FC<GalleryProps> = ({
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

                        {section.loading ? (
                            <Group gap="xs">
                                <Loader size="xs" />
                                <Text fz="xs" c="dimmed">
                                    Loading chart types…
                                </Text>
                            </Group>
                        ) : section.errorMessage !== null ? (
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
                        ) : section.items.length === 0 ? (
                            <Text fz="xs" c="dimmed">
                                {section.emptyMessage}
                            </Text>
                        ) : (
                            section.items.map((item) => (
                                <UnstyledButton
                                    key={item.key}
                                    className={classes.row}
                                    data-selected={item.selected}
                                    disabled={item.disabled}
                                    onClick={item.select}
                                >
                                    <Group wrap="nowrap" gap="sm">
                                        <ChartTypeThumbnail
                                            icon={item.icon}
                                            rotatedIcon={item.rotatedIcon}
                                        />
                                        <Stack gap={2} flex={1}>
                                            <Text size="sm" fw={500}>
                                                {item.label}
                                            </Text>
                                            <Text
                                                fz="xs"
                                                c="dimmed"
                                                lineClamp={2}
                                            >
                                                {item.description}
                                            </Text>
                                        </Stack>
                                        <MantineIcon
                                            icon={IconChevronRight}
                                            color="ldGray"
                                            size="sm"
                                        />
                                    </Group>
                                </UnstyledButton>
                            ))
                        )}

                        {section.onLoadMore !== null ? (
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
                        {section.onCreateNew !== null ? (
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
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const location = useLocation();
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [debouncedSearch] = useDebouncedValue(search, 300);
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
            };
        },
    );

    const sections: ChartTypeGallerySection[] = [
        ...(dataAppsEnabled
            ? [
                  {
                      label: 'Project',
                      items: projectItems,
                      loading: isInitialLoading,
                      errorMessage: error
                          ? 'Failed to load project chart types'
                          : null,
                      emptyMessage: debouncedSearch
                          ? 'No project chart types match your search'
                          : 'No project chart types yet',
                      onRetry: error ? () => void refetch() : null,
                      onLoadMore: hasNextPage
                          ? () => void fetchNextPage()
                          : null,
                      loadingMore: isFetchingNextPage,
                      onCreateNew: canCreateChartType
                          ? () =>
                                void navigate({
                                    pathname: `/projects/${projectUuid}/chart-types/new`,
                                    search: location.search,
                                })
                          : null,
                  },
              ]
            : []),
        {
            label: 'Built in',
            items: builtInItems,
            loading: false,
            errorMessage: null,
            emptyMessage: 'No built-in chart types match your search',
            onRetry: null,
            onLoadMore: null,
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
