import { subject } from '@casl/ability';
import { FeatureFlags, type DataAppViz } from '@lightdash/common';
import {
    Button,
    Group,
    Paper,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import EmptyStateLoader from '../components/common/EmptyStateLoader';
import InlineErrorState from '../components/common/InlineErrorState';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import ChartTypeDeleteModal from '../features/chartTypes/components/ChartTypeDeleteModal';
import ChartTypeDetailModal from '../features/chartTypes/components/ChartTypeDetailModal';
import ChartTypeGalleryCard from '../features/chartTypes/components/ChartTypeGalleryCard';
import ChartTypeGalleryEmptyState from '../features/chartTypes/components/ChartTypeGalleryEmptyState';
import { useDataAppVisualizations } from '../features/chartTypes/hooks/useDataAppVisualizations';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import { Can } from '../providers/Ability';
import useApp from '../providers/App/useApp';

const ChartTypeGallery = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { user } = useApp();
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);

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
            <Stack gap="xxl" w="100%">
                <PageBreadcrumbs
                    items={[
                        { title: 'Home', to: '/home' },
                        { title: 'Gallery', active: true },
                    ]}
                />

                <Stack gap="md">
                    {/* A section rather than the page title: the gallery holds
                        only chart types today, other kinds sit beside them. */}
                    <Group justify="space-between" align="center">
                        <Group gap={6} align="baseline">
                            <Text size="md" fw={600} c="ldGray.8">
                                Chart types
                            </Text>
                            {!isEmptyGallery && totalCount !== null && (
                                <Text fz="xs" c="dimmed">
                                    ({totalCount})
                                </Text>
                            )}
                        </Group>

                        {!isEmptyGallery && (
                            <Group gap="xs">
                                <TextInput
                                    size="xs"
                                    w={220}
                                    placeholder="Search by name"
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
                                        to={`/projects/${projectUuid}/chart-types/new`}
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
                    </Group>

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
                                            setSelectedUuid(viz.dataAppVizUuid)
                                        }
                                        onDelete={() =>
                                            setDeleteUuid(viz.dataAppVizUuid)
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
