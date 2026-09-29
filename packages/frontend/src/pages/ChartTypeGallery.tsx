import { subject } from '@casl/ability';
import {
    FeatureFlags,
    type DataAppViz,
    type RegistryChartTypeListItem,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Paper,
    SimpleGrid,
    Stack,
    Tabs,
    Text,
    TextInput,
} from '@mantine/core';
import { useDebouncedValue, useIntersection } from '@mantine/hooks';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { BetaBadge } from '../components/common/BetaBadge';
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
import OrganizationChartTypesSection from '../features/chartTypes/components/OrganizationChartTypesSection';
import { useChartTypesEnabled } from '../features/chartTypes/hooks/useChartTypesEnabled';
import { useDataAppVisualization } from '../features/chartTypes/hooks/useDataAppVisualization';
import {
    useDataAppVisualizations,
    useOrganizationDataAppVisualizations,
} from '../features/chartTypes/hooks/useDataAppVisualizations';
import { useOrganizationLibraryAccess } from '../features/chartTypes/hooks/useOrganizationLibraryAccess';
import { useRegistryChartTypes } from '../features/chartTypes/hooks/useRegistryChartTypes';
import { chartTypeBuilderPath } from '../features/chartTypes/utils/chartTypeBuilderPath';
import { useOptionalProjectRoute } from '../hooks/useProjectRoute';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import { Can } from '../providers/Ability';
import useApp from '../providers/App/useApp';

// Values are URL `tab` params, kept stable across label renames.
const GalleryTab = {
    PROJECT_LIBRARY: 'installed-charts',
    ORGANIZATION_LIBRARY: 'organization-library',
    LIGHTDASH_LIBRARY: 'chart-library',
} as const;

type GalleryTabValue = (typeof GalleryTab)[keyof typeof GalleryTab];

const ChartTypeGallery = () => {
    const projectUuid = useProjectUuid();
    const projectRoute = useOptionalProjectRoute();
    const projectUrlIdentifier =
        projectRoute?.projectUrlIdentifier ?? projectUuid;
    const { user } = useApp();
    const [searchParams, setSearchParams] = useSearchParams();
    const chartTypesEnabled = useChartTypesEnabled();
    const dataAppsEnabled =
        useServerFeatureFlag(FeatureFlags.EnableDataApps).data?.enabled ===
        true;
    const chartTypeRegistryFlag = useServerFeatureFlag(
        FeatureFlags.ChartTypeRegistry,
    );
    const isLibraryFlagEnabled = chartTypeRegistryFlag.data?.enabled === true;
    const organizationLibrary = useOrganizationLibraryAccess();
    // Unfiltered, so the tab count holds steady while a search narrows it.
    const organizationChartTypesQuery = useOrganizationDataAppVisualizations(
        '',
        organizationLibrary.isVisible,
    );
    const organizationCount =
        organizationChartTypesQuery.data?.pages[0]?.pagination?.totalResults ??
        null;

    const [search, setSearch] = useState('');
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
        isLibraryFlagEnabled,
    );
    const isLibraryEnabled =
        isLibraryFlagEnabled && registryQuery.data?.registryEnabled === true;
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
    const hasTabs = isLibraryEnabled || organizationLibrary.isVisible;
    const requestedTab = searchParams.get('tab');
    const activeTab: GalleryTabValue =
        isLibraryEnabled && requestedTab === GalleryTab.LIGHTDASH_LIBRARY
            ? GalleryTab.LIGHTDASH_LIBRARY
            : organizationLibrary.isVisible &&
                requestedTab === GalleryTab.ORGANIZATION_LIBRARY
              ? GalleryTab.ORGANIZATION_LIBRARY
              : GalleryTab.PROJECT_LIBRARY;

    useEffect(() => {
        if (
            activeTab === GalleryTab.PROJECT_LIBRARY &&
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
        if (
            value === GalleryTab.LIGHTDASH_LIBRARY ||
            value === GalleryTab.ORGANIZATION_LIBRARY
        ) {
            newParams.set('tab', value);
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

    const chartTypesContent = (
        <Stack gap="md">
            {!isEmptyGallery && (
                <Group justify="flex-end" gap="xs">
                    <TextInput
                        size="xs"
                        w={220}
                        placeholder="Search by name or description"
                        leftSection={
                            <MantineIcon icon={IconSearch} size={15} />
                        }
                        value={search}
                        onChange={(e) => setSearch(e.currentTarget.value)}
                    />
                    {dataAppsEnabled && (
                        <Can
                            I="create"
                            this={subject('DataApp', {
                                organizationUuid: user.data?.organizationUuid,
                                projectUuid,
                            })}
                        >
                            <Button
                                size="xs"
                                component={Link}
                                to={chartTypeBuilderPath(
                                    projectUrlIdentifier ?? projectUuid,
                                )}
                                leftSection={
                                    <MantineIcon icon={IconPlus} size={15} />
                                }
                            >
                                New chart type
                            </Button>
                        </Can>
                    )}
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
                    <ChartTypeGalleryEmptyState projectUuid={projectUuid} />
                )
            ) : (
                <>
                    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                        {dataAppVizs.map((viz) => (
                            <ChartTypeGalleryCard
                                key={viz.dataAppVizUuid}
                                dataAppViz={viz}
                                projectUuid={projectUuid}
                                hasRegistryUpdate={
                                    registryEntryFor(viz)?.state ===
                                    'update_available'
                                }
                                onClick={() =>
                                    setSelectedUuid(viz.dataAppVizUuid)
                                }
                                onPreview={() =>
                                    setPreviewUuid(viz.dataAppVizUuid)
                                }
                                onDelete={() =>
                                    setDeleteUuid(viz.dataAppVizUuid)
                                }
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
            )}
        </Stack>
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
                <PageBreadcrumbs
                    items={[
                        { title: 'Home', to: '/home' },
                        { title: 'Chart Studio', active: true },
                    ]}
                />

                {hasTabs ? (
                    <Tabs
                        value={activeTab}
                        onChange={handleTabChange}
                        keepMounted={false}
                    >
                        <Tabs.List>
                            <Tabs.Tab value={GalleryTab.PROJECT_LIBRARY}>
                                <Group gap={6} wrap="nowrap">
                                    Project library
                                    {!isEmptyGallery && totalCount !== null && (
                                        <Text span fz="xs" c="dimmed">
                                            ({totalCount})
                                        </Text>
                                    )}
                                </Group>
                            </Tabs.Tab>
                            {organizationLibrary.isVisible && (
                                <Tabs.Tab
                                    value={GalleryTab.ORGANIZATION_LIBRARY}
                                >
                                    <Group gap={6} wrap="nowrap">
                                        Organization library
                                        {organizationCount !== null && (
                                            <Text span fz="xs" c="dimmed">
                                                ({organizationCount})
                                            </Text>
                                        )}
                                    </Group>
                                </Tabs.Tab>
                            )}
                            {isLibraryEnabled && (
                                <Tabs.Tab
                                    value={GalleryTab.LIGHTDASH_LIBRARY}
                                    rightSection={<BetaBadge />}
                                >
                                    Lightdash library
                                </Tabs.Tab>
                            )}
                        </Tabs.List>

                        <Tabs.Panel value={GalleryTab.PROJECT_LIBRARY} pt="xl">
                            {chartTypesContent}
                        </Tabs.Panel>

                        {organizationLibrary.isVisible && (
                            <Tabs.Panel
                                value={GalleryTab.ORGANIZATION_LIBRARY}
                                pt="xl"
                            >
                                <OrganizationChartTypesSection
                                    projectUuid={projectUuid}
                                />
                            </Tabs.Panel>
                        )}

                        {isLibraryEnabled && (
                            <Tabs.Panel
                                value={GalleryTab.LIGHTDASH_LIBRARY}
                                pt="xl"
                            >
                                <ChartTypeLibrarySection
                                    projectUuid={projectUuid}
                                    withHeader={false}
                                    onShowInstalled={setSelectedUuid}
                                />
                            </Tabs.Panel>
                        )}
                    </Tabs>
                ) : (
                    chartTypesContent
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
