import { subject } from '@casl/ability';
import {
    type DataAppViz,
    type RegistryChartTypeListItem,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Paper,
    SimpleGrid,
    Stack,
    Tabs,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { useDebouncedValue, useIntersection } from '@mantine/hooks';
import { IconInfoCircle, IconPlus, IconSearch } from '@tabler/icons-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import EmptyStateLoader from '../components/common/EmptyStateLoader';
import InlineErrorState from '../components/common/InlineErrorState';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import ChartTypeCardSkeletons from '../features/chartTypes/components/ChartTypeCardSkeletons';
import ChartTypeDeleteModal from '../features/chartTypes/components/ChartTypeDeleteModal';
import ChartTypeDetailModal from '../features/chartTypes/components/ChartTypeDetailModal';
import ChartTypeGalleryCard from '../features/chartTypes/components/ChartTypeGalleryCard';
import ChartTypeGalleryEmptyState from '../features/chartTypes/components/ChartTypeGalleryEmptyState';
import ChartTypeLibrarySection from '../features/chartTypes/components/ChartTypeLibrarySection';
import ChartTypePreviewTableModal from '../features/chartTypes/components/ChartTypePreviewTableModal';
import { useChartStudioAvailable } from '../features/chartTypes/hooks/useChartStudioAvailable';
import { useChartTypesEnabled } from '../features/chartTypes/hooks/useChartTypesEnabled';
import { useDataAppVisualization } from '../features/chartTypes/hooks/useDataAppVisualization';
import { useDataAppVisualizations } from '../features/chartTypes/hooks/useDataAppVisualizations';
import { useRegistryChartTypes } from '../features/chartTypes/hooks/useRegistryChartTypes';
import { chartTypeBuilderPath } from '../features/chartTypes/utils/chartTypeBuilderPath';
import { useOptionalProjectRoute } from '../hooks/useProjectRoute';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { Can } from '../providers/Ability';
import useApp from '../providers/App/useApp';
import classes from './ChartTypeGallery.module.css';

const GalleryTab = {
    INSTALLED_CHARTS: 'installed-charts',
    CHART_LIBRARY: 'chart-library',
} as const;

const SEARCH_MIN_COUNT = 9;

const ChartTypeGallery = () => {
    const projectUuid = useProjectUuid();
    const projectRoute = useOptionalProjectRoute();
    const projectUrlIdentifier =
        projectRoute?.projectUrlIdentifier ?? projectUuid;
    const { user } = useApp();
    const [searchParams, setSearchParams] = useSearchParams();
    const chartTypesEnabled = useChartTypesEnabled();
    const chartStudioAvailable = useChartStudioAvailable();

    const [search, setSearch] = useState('');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [debouncedSearch] = useDebouncedValue(search, 300);
    const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
    const [deleteUuid, setDeleteUuid] = useState<string | null>(null);
    const [previewUuid, setPreviewUuid] = useState<string | null>(null);

    const {
        data,
        isInitialLoading,
        isFetching,
        error,
        refetch,
        hasNextPage,
        fetchNextPage,
        isFetchingNextPage,
    } = useDataAppVisualizations(projectUuid, debouncedSearch);
    const { ref: paginationRef, entry: paginationEntry } = useIntersection({
        rootMargin: '200px',
    });

    const dataAppVizs: DataAppViz[] = useMemo(
        () => data?.pages.flatMap((page) => page.data) ?? [],
        [data?.pages],
    );
    // Registry context for installed official chart types: upgrade offers
    // and the registry (semver) version live here in the installed tab.
    const registryQuery = useRegistryChartTypes(
        projectUuid,
        chartTypesEnabled.enabled,
    );
    const isLibraryEnabled =
        chartTypesEnabled.enabled &&
        registryQuery.data?.registryEnabled === true;
    const registryEntriesBySlug = useMemo(() => {
        const entries = new Map<string, RegistryChartTypeListItem>();
        for (const chart of registryQuery.data?.charts ?? []) {
            entries.set(chart.slug, chart);
        }
        return entries;
    }, [registryQuery.data?.charts]);
    const registryEntryFor = (viz: DataAppViz) =>
        viz.registrySlug
            ? (registryEntriesBySlug.get(viz.registrySlug) ?? null)
            : null;
    const selectedFromGallery = dataAppVizs.find(
        (viz) => viz.dataAppVizUuid === selectedUuid,
    );
    const selectedQuery = useDataAppVisualization(
        projectUuid,
        selectedFromGallery ? null : selectedUuid,
        null,
    );
    const selected =
        selectedFromGallery ??
        (selectedQuery.data?.dataAppVizUuid === selectedUuid
            ? selectedQuery.data
            : undefined);
    const toDelete = [selected, ...dataAppVizs].find(
        (viz) => viz?.dataAppVizUuid === deleteUuid,
    );
    const toPreview = [selected, ...dataAppVizs].find(
        (viz) => viz?.dataAppVizUuid === previewUuid,
    );
    // Unfiltered total, so the count holds steady while a search narrows the grid.
    const totalCount =
        !debouncedSearch && data?.pages[0]?.pagination
            ? data.pages[0].pagination.totalResults
            : null;
    // Nothing to search or create-from-header when the project has no chart
    // types at all yet: the empty state below carries its own CTA.
    const isEmptyGallery =
        !isInitialLoading && !error && !debouncedSearch && totalCount === 0;
    const activeTab =
        isLibraryEnabled && searchParams.get('tab') === GalleryTab.CHART_LIBRARY
            ? GalleryTab.CHART_LIBRARY
            : GalleryTab.INSTALLED_CHARTS;

    useEffect(() => {
        if (
            activeTab === GalleryTab.INSTALLED_CHARTS &&
            paginationEntry?.isIntersecting &&
            hasNextPage &&
            !isFetching &&
            !error
        ) {
            void fetchNextPage();
        }
    }, [
        activeTab,
        paginationEntry,
        hasNextPage,
        isFetching,
        error,
        fetchNextPage,
    ]);

    const handleTabChange = (value: string | null) => {
        const newParams = new URLSearchParams(searchParams);
        if (value === GalleryTab.CHART_LIBRARY) {
            newParams.set('tab', GalleryTab.CHART_LIBRARY);
        } else {
            newParams.delete('tab');
        }
        setSearchParams(newParams);
    };

    if (!projectUuid) {
        return null;
    }

    if (chartTypesEnabled.isLoading) {
        return null;
    }

    if (!chartTypesEnabled.enabled) {
        return (
            <Navigate to={`/projects/${projectUrlIdentifier}/home`} replace />
        );
    }

    // A handful of chart types fit on screen; search only earns its place past that.
    const showSearch =
        activeTab === GalleryTab.INSTALLED_CHARTS &&
        (search !== '' || (totalCount ?? 0) >= SEARCH_MIN_COUNT);

    const newChartTypeButton = chartStudioAvailable && (
        <Can
            I="create"
            this={subject('DataApp', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
            })}
        >
            <Button
                size="sm"
                component={Link}
                to={chartTypeBuilderPath(projectUrlIdentifier ?? projectUuid)}
                leftSection={<MantineIcon icon={IconPlus} size={16} />}
            >
                New chart type
            </Button>
        </Can>
    );

    const toolbar = (tabsList: ReactNode) =>
        (tabsList || showSearch) && (
            <Group justify="space-between" gap="sm">
                {tabsList ?? <span />}
                {showSearch &&
                    (isSearchOpen || search ? (
                        <TextInput
                            size="sm"
                            autoFocus
                            className={classes.search}
                            placeholder="Search chart types"
                            aria-label="Search chart types"
                            leftSection={
                                <MantineIcon icon={IconSearch} size={15} />
                            }
                            value={search}
                            onChange={(e) => setSearch(e.currentTarget.value)}
                            onBlur={() => setIsSearchOpen(false)}
                            onKeyDown={(e) => {
                                if (e.key !== 'Escape') return;
                                setSearch('');
                                setIsSearchOpen(false);
                            }}
                        />
                    ) : (
                        <ActionIcon
                            variant="default"
                            size={32}
                            aria-label="Search chart types"
                            onClick={() => setIsSearchOpen(true)}
                        >
                            <MantineIcon icon={IconSearch} size={15} />
                        </ActionIcon>
                    ))}
            </Group>
        );

    const chartTypesContent = isInitialLoading ? (
        <ChartTypeCardSkeletons label="Loading chart types" />
    ) : error ? (
        <InlineErrorState
            message="We couldn't load your chart types. Give it another try in a moment."
            onRetry={() => refetch()}
        />
    ) : dataAppVizs.length === 0 ? (
        debouncedSearch ? (
            <Paper variant="dotted" p="xl">
                <Stack align="center" gap="xs">
                    <Text ta="center" fz="sm" c="dimmed">
                        No chart types match &ldquo;{debouncedSearch}&rdquo;
                    </Text>
                    <Button
                        variant="subtle"
                        size="compact-xs"
                        onClick={() => setSearch('')}
                    >
                        Clear search
                    </Button>
                </Stack>
            </Paper>
        ) : (
            <ChartTypeGalleryEmptyState
                projectUuid={projectUuid}
                onBrowseLibrary={
                    isLibraryEnabled
                        ? () => handleTabChange(GalleryTab.CHART_LIBRARY)
                        : null
                }
            />
        )
    ) : (
        <>
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                {dataAppVizs.map((viz) => (
                    <ChartTypeGalleryCard
                        key={viz.dataAppVizUuid}
                        dataAppViz={viz}
                        hasRegistryUpdate={
                            registryEntryFor(viz)?.state === 'update_available'
                        }
                        onClick={() => setSelectedUuid(viz.dataAppVizUuid)}
                        onPreview={() => setPreviewUuid(viz.dataAppVizUuid)}
                        onDelete={() => setDeleteUuid(viz.dataAppVizUuid)}
                    />
                ))}
            </SimpleGrid>
            {hasNextPage && (
                <Box
                    ref={paginationRef}
                    data-testid="chart-types-pagination"
                    mih="xl"
                    role="status"
                >
                    {isFetchingNextPage && (
                        <EmptyStateLoader description="Loading more chart types…" />
                    )}
                </Box>
            )}
        </>
    );

    return (
        <Page
            title="Chart Studio"
            withCenteredRoot
            withCenteredContent
            withXLargePaddedContent
            withLargeContent
        >
            <Stack gap="xl" w="100%">
                <Group justify="space-between" align="flex-start" gap="md">
                    <Stack gap={4}>
                        <Title order={3} fw={600}>
                            Chart Studio
                        </Title>
                        <Text fz="sm" c="dimmed" maw={560}>
                            Chart types added here show up in the explorer's
                            chart picker for everyone in this project.
                        </Text>
                    </Stack>
                    {/* The empty state carries its own CTAs. */}
                    {!isEmptyGallery && newChartTypeButton}
                </Group>

                {isLibraryEnabled ? (
                    <Tabs
                        value={activeTab}
                        onChange={handleTabChange}
                        keepMounted={false}
                        variant="unstyled"
                    >
                        <Stack gap="md">
                            {toolbar(
                                <Tabs.List className={classes.tabList}>
                                    <Tabs.Tab
                                        value={GalleryTab.INSTALLED_CHARTS}
                                        className={classes.tab}
                                    >
                                        Installed
                                        {!isEmptyGallery &&
                                            totalCount !== null &&
                                            ` (${totalCount})`}
                                    </Tabs.Tab>
                                    <Tabs.Tab
                                        value={GalleryTab.CHART_LIBRARY}
                                        className={classes.tab}
                                    >
                                        <Group gap={4} wrap="nowrap">
                                            Library
                                            <Tooltip
                                                withinPortal
                                                maw={240}
                                                multiline
                                                label="Ready-made chart types, kept up to date for you. Install one and anyone in this project can use it."
                                            >
                                                <MantineIcon
                                                    icon={IconInfoCircle}
                                                    size={13}
                                                    color="dimmed"
                                                />
                                            </Tooltip>
                                        </Group>
                                    </Tabs.Tab>
                                </Tabs.List>,
                            )}

                            <Tabs.Panel value={GalleryTab.INSTALLED_CHARTS}>
                                {chartTypesContent}
                            </Tabs.Panel>

                            <Tabs.Panel value={GalleryTab.CHART_LIBRARY}>
                                <ChartTypeLibrarySection
                                    projectUuid={projectUuid}
                                    withHeader={false}
                                    withIntro={false}
                                    onShowInstalled={setSelectedUuid}
                                />
                            </Tabs.Panel>
                        </Stack>
                    </Tabs>
                ) : (
                    <Stack gap="md">
                        {toolbar(null)}
                        {chartTypesContent}
                    </Stack>
                )}
            </Stack>

            {selectedUuid &&
                !selected &&
                (selectedQuery.error ? (
                    <InlineErrorState
                        message="Failed to load chart type details"
                        onRetry={() => void selectedQuery.refetch()}
                    />
                ) : (
                    <EmptyStateLoader title="Loading chart type details…" />
                ))}
            {selected && (
                <ChartTypeDetailModal
                    opened={previewUuid === null}
                    projectUuid={projectUuid}
                    dataAppViz={selected}
                    isActive={previewUuid === null && deleteUuid === null}
                    registryEntry={registryEntryFor(selected)}
                    onClose={() => setSelectedUuid(null)}
                    onPreview={() => setPreviewUuid(selected.dataAppVizUuid)}
                    onDelete={() => setDeleteUuid(selected.dataAppVizUuid)}
                />
            )}
            {previewUuid !== null && (
                <ChartTypePreviewTableModal
                    projectUuid={projectUuid}
                    dataAppVizUuid={previewUuid}
                    registrySlug={toPreview?.registrySlug ?? null}
                    onClose={() => {
                        setPreviewUuid(null);
                        setSelectedUuid(null);
                    }}
                />
            )}
            {toDelete && (
                <ChartTypeDeleteModal
                    projectUuid={projectUuid}
                    dataAppViz={toDelete}
                    onClose={() => setDeleteUuid(null)}
                    onDeleted={() => {
                        setDeleteUuid(null);
                        setSelectedUuid(null);
                    }}
                />
            )}
        </Page>
    );
};

export default ChartTypeGallery;
