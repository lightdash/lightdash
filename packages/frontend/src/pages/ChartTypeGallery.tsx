import { subject } from '@casl/ability';
import { FeatureFlags, type DataAppViz } from '@lightdash/common';
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
import { Link, Navigate } from 'react-router';
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
import { useDataAppVisualizations } from '../features/chartTypes/hooks/useDataAppVisualizations';
import { chartTypeBuilderPath } from '../features/chartTypes/utils/chartTypeBuilderPath';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import { Can } from '../providers/Ability';
import useApp from '../providers/App/useApp';

const ChartTypeGallery = () => {
    const projectUuid = useProjectUuid();
    const { user } = useApp();
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const chartTypeRegistryFlag = useServerFeatureFlag(
        FeatureFlags.ChartTypeRegistry,
    );

    const [search, setSearch] = useState('');
    const [debouncedSearch] = useDebouncedValue(search, 300);
    const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
    const [deleteUuid, setDeleteUuid] = useState<string | null>(null);

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
    const isLibraryEnabled = chartTypeRegistryFlag.data?.enabled === true;

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

                <Tabs defaultValue="chart-types" keepMounted={false}>
                    <Tabs.List>
                        <Tabs.Tab value="chart-types">
                            <Group gap={6} wrap="nowrap">
                                Chart types
                                {!isEmptyGallery && totalCount !== null && (
                                    <Text span fz="xs" c="dimmed">
                                        ({totalCount})
                                    </Text>
                                )}
                            </Group>
                        </Tabs.Tab>
                        {isLibraryEnabled && (
                            <Tabs.Tab value="library">Library</Tabs.Tab>
                        )}
                    </Tabs.List>

                    <Tabs.Panel value="chart-types" pt="xl">
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
                                                onClick={() =>
                                                    setSelectedUuid(
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
                        <Tabs.Panel value="library" pt="xl">
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
                    onClose={() => setSelectedUuid(null)}
                    onDelete={() => setDeleteUuid(selected.dataAppVizUuid)}
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
