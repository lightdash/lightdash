import {
    FeatureFlags,
    type DataAppViz,
    type RegistryChartTypeListItem,
} from '@lightdash/common';
import { Group, Stack, Tabs, Text } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { BetaBadge } from '../components/common/BetaBadge';
import EmptyStateLoader from '../components/common/EmptyStateLoader';
import InlineErrorState from '../components/common/InlineErrorState';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import ChartTypeDeleteModal from '../features/chartTypes/components/ChartTypeDeleteModal';
import ChartTypeDetailModal from '../features/chartTypes/components/ChartTypeDetailModal';
import ChartTypeGalleryCard from '../features/chartTypes/components/ChartTypeGalleryCard';
import ChartTypeGalleryEmptyState from '../features/chartTypes/components/ChartTypeGalleryEmptyState';
import ChartTypeLibrarySection from '../features/chartTypes/components/ChartTypeLibrarySection';
import ChartTypeListSection from '../features/chartTypes/components/ChartTypeListSection';
import ChartTypePreviewTableModal from '../features/chartTypes/components/ChartTypePreviewTableModal';
import NewChartTypeButton from '../features/chartTypes/components/NewChartTypeButton';
import OrganizationChartTypesSection from '../features/chartTypes/components/OrganizationChartTypesSection';
import { useChartTypesEnabled } from '../features/chartTypes/hooks/useChartTypesEnabled';
import { useDataAppVisualization } from '../features/chartTypes/hooks/useDataAppVisualization';
import {
    useDataAppVisualizations,
    useOrganizationDataAppVisualizations,
} from '../features/chartTypes/hooks/useDataAppVisualizations';
import { useOrganizationLibraryAccess } from '../features/chartTypes/hooks/useOrganizationLibraryAccess';
import { useRegistryChartTypes } from '../features/chartTypes/hooks/useRegistryChartTypes';
import {
    GalleryTab,
    type GalleryTabValue,
} from '../features/chartTypes/utils/chartTypeBuilderPath';
import { useOptionalProjectRoute } from '../hooks/useProjectRoute';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';

const ChartTypeGallery = () => {
    const projectUuid = useProjectUuid();
    const projectRoute = useOptionalProjectRoute();
    const projectUrlIdentifier =
        projectRoute?.projectUrlIdentifier ?? projectUuid;
    const [searchParams, setSearchParams] = useSearchParams();
    const chartTypesEnabled = useChartTypesEnabled();
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

    const dataAppVizsQuery = useDataAppVisualizations(
        projectUuid,
        debouncedSearch,
    );
    const { data, isInitialLoading, error } = dataAppVizsQuery;

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
        <ChartTypeListSection
            query={dataAppVizsQuery}
            items={dataAppVizs}
            search={search}
            onSearchChange={setSearch}
            debouncedSearch={debouncedSearch}
            isEmpty={isEmptyGallery}
            headerActions={
                <NewChartTypeButton
                    projectUuid={projectUuid}
                    owner="project"
                    size="xs"
                />
            }
            emptyState={
                <ChartTypeGalleryEmptyState projectUuid={projectUuid} />
            }
            errorMessage="Failed to load chart types"
            paginationTestId="chart-types-pagination"
            renderItem={(viz) => (
                <ChartTypeGalleryCard
                    dataAppViz={viz}
                    projectUuid={projectUuid}
                    hasRegistryUpdate={
                        registryEntryFor(viz)?.state === 'update_available'
                    }
                    onClick={() => setSelectedUuid(viz.dataAppVizUuid)}
                    onPreview={() => setPreviewUuid(viz.dataAppVizUuid)}
                    onDelete={() => setDeleteUuid(viz.dataAppVizUuid)}
                />
            )}
        />
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
