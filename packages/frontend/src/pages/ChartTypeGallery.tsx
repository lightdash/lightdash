import { subject } from '@casl/ability';
import {
    FeatureFlags,
    type DataAppViz,
    type RegistryChartTypeListItem,
} from '@lightdash/common';
import {
    Button,
    Group,
    Paper,
    SimpleGrid,
    Stack,
    Tabs,
    Text,
    TextInput,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import EmptyStateLoader from '../components/common/EmptyStateLoader';
import InlineErrorState from '../components/common/InlineErrorState';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import ChartTypeDeleteModal from '../features/chartTypes/components/ChartTypeDeleteModal';
import ChartTypeDetailModal from '../features/chartTypes/components/ChartTypeDetailModal';
import ChartTypeGalleryCard from '../features/chartTypes/components/ChartTypeGalleryCard';
import ChartTypeGalleryEmptyState from '../features/chartTypes/components/ChartTypeGalleryEmptyState';
import ChartTypeLibrarySection from '../features/chartTypes/components/ChartTypeLibrarySection';
import ChartTypePreviewTableModal from '../features/chartTypes/components/ChartTypePreviewTableModal';
import { useDataAppVisualizations } from '../features/chartTypes/hooks/useDataAppVisualizations';
import { useRegistryChartTypes } from '../features/chartTypes/hooks/useRegistryChartTypes';
import { chartTypeBuilderPath } from '../features/chartTypes/utils/chartTypeBuilderPath';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import { Can } from '../providers/Ability';
import useApp from '../providers/App/useApp';

const GalleryTab = {
    INSTALLED_CHARTS: 'installed-charts',
    CHART_LIBRARY: 'chart-library',
} as const;

const ChartTypeGallery = () => {
    const projectUuid = useProjectUuid();
    const { user } = useApp();
    const [searchParams, setSearchParams] = useSearchParams();
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const chartTypeRegistryFlag = useServerFeatureFlag(
        FeatureFlags.ChartTypeRegistry,
    );
    const isLibraryEnabled = chartTypeRegistryFlag.data?.enabled === true;

    const [search, setSearch] = useState('');
    const [debouncedSearch] = useDebouncedValue(search, 300);
    const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
    const [deleteUuid, setDeleteUuid] = useState<string | null>(null);
    const [previewUuid, setPreviewUuid] = useState<string | null>(null);

    const {
        data,
        isInitialLoading,
        error,
        refetch,
        hasNextPage,
        fetchNextPage,
        isFetchingNextPage,
    } = useDataAppVisualizations(projectUuid, debouncedSearch);

    const dataAppVizs: DataAppViz[] = useMemo(
        () => data?.pages.flatMap((page) => page.data) ?? [],
        [data?.pages],
    );
    // Registry context for installed official chart types: upgrade offers
    // and the registry (semver) version live here in the installed tab.
    const registryQuery = useRegistryChartTypes(projectUuid, isLibraryEnabled);
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
    const selected = dataAppVizs.find(
        (viz) => viz.dataAppVizUuid === selectedUuid,
    );
    const toDelete = dataAppVizs.find(
        (viz) => viz.dataAppVizUuid === deleteUuid,
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

    if (dataAppsFlag.isLoading) {
        return null;
    }

    if (!dataAppsFlag.data?.enabled) {
        return <Navigate to={`/projects/${projectUuid}/home`} replace />;
    }

    return (
        <Page
            title="Gallery"
            withCenteredRoot
            withCenteredContent
            withXLargePaddedContent
            withLargeContent
        >
            <Stack gap="xl" w="100%">
                <PageBreadcrumbs
                    items={[
                        { title: 'Home', to: '/home' },
                        { title: 'Gallery', active: true },
                    ]}
                />

                <Tabs
                    value={activeTab}
                    onChange={handleTabChange}
                    keepMounted={false}
                >
                    <Tabs.List>
                        <Tabs.Tab value={GalleryTab.INSTALLED_CHARTS}>
                            <Group gap={6} wrap="nowrap">
                                Installed charts
                                {!isEmptyGallery && totalCount !== null && (
                                    <Text span fz="xs" c="dimmed">
                                        ({totalCount})
                                    </Text>
                                )}
                            </Group>
                        </Tabs.Tab>
                        {isLibraryEnabled && (
                            <Tabs.Tab value={GalleryTab.CHART_LIBRARY}>
                                Chart library
                            </Tabs.Tab>
                        )}
                    </Tabs.List>

                    <Tabs.Panel value={GalleryTab.INSTALLED_CHARTS} pt="xl">
                        <Stack gap="md">
                            {!isEmptyGallery && (
                                <Group justify="flex-end" gap="xs">
                                    <TextInput
                                        size="xs"
                                        w={220}
                                        placeholder="Search by name or description"
                                        leftSection={
                                            <MantineIcon
                                                icon={IconSearch}
                                                size={15}
                                            />
                                        }
                                        value={search}
                                        onChange={(e) =>
                                            setSearch(e.currentTarget.value)
                                        }
                                    />
                                    <Can
                                        I="create"
                                        this={subject('DataApp', {
                                            organizationUuid:
                                                user.data?.organizationUuid,
                                            projectUuid,
                                        })}
                                    >
                                        <Button
                                            size="xs"
                                            component={Link}
                                            to={chartTypeBuilderPath(
                                                projectUuid,
                                            )}
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconPlus}
                                                    size={15}
                                                />
                                            }
                                        >
                                            New chart type
                                        </Button>
                                    </Can>
                                </Group>
                            )}

                            {isInitialLoading ? (
                                <EmptyStateLoader title="Loading chart types…" />
                            ) : error ? (
                                <InlineErrorState
                                    message="Failed to load chart types"
                                    onRetry={() => refetch()}
                                />
                            ) : dataAppVizs.length === 0 ? (
                                debouncedSearch ? (
                                    <Paper variant="dotted" p="xl">
                                        <Text ta="center" fz="xs" c="dimmed">
                                            No chart types match &ldquo;
                                            {debouncedSearch}&rdquo;
                                        </Text>
                                    </Paper>
                                ) : (
                                    <ChartTypeGalleryEmptyState
                                        projectUuid={projectUuid}
                                    />
                                )
                            ) : (
                                <>
                                    <SimpleGrid
                                        cols={{ base: 1, sm: 2, lg: 3 }}
                                        spacing="md"
                                    >
                                        {dataAppVizs.map((viz) => (
                                            <ChartTypeGalleryCard
                                                key={viz.dataAppVizUuid}
                                                dataAppViz={viz}
                                                hasRegistryUpdate={
                                                    registryEntryFor(viz)
                                                        ?.state ===
                                                    'update_available'
                                                }
                                                onClick={() =>
                                                    setSelectedUuid(
                                                        viz.dataAppVizUuid,
                                                    )
                                                }
                                                onPreview={() =>
                                                    setPreviewUuid(
                                                        viz.dataAppVizUuid,
                                                    )
                                                }
                                                onDelete={() =>
                                                    setDeleteUuid(
                                                        viz.dataAppVizUuid,
                                                    )
                                                }
                                            />
                                        ))}
                                    </SimpleGrid>
                                    {hasNextPage && (
                                        <Button
                                            variant="default"
                                            loading={isFetchingNextPage}
                                            onClick={() => fetchNextPage()}
                                            mx="auto"
                                        >
                                            Load more
                                        </Button>
                                    )}
                                </>
                            )}
                        </Stack>
                    </Tabs.Panel>

                    {isLibraryEnabled && (
                        <Tabs.Panel value={GalleryTab.CHART_LIBRARY} pt="xl">
                            <ChartTypeLibrarySection
                                projectUuid={projectUuid}
                                withHeader={false}
                            />
                        </Tabs.Panel>
                    )}
                </Tabs>
            </Stack>

            {selected && (
                <ChartTypeDetailModal
                    projectUuid={projectUuid}
                    dataAppViz={selected}
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
                    onClose={() => setPreviewUuid(null)}
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
