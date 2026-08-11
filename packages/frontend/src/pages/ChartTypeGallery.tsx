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
    Title,
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
import ChartTypeDeleteModal from '../features/apps/components/ChartTypeDeleteModal';
import ChartTypeDetailModal from '../features/apps/components/ChartTypeDetailModal';
import ChartTypeGalleryCard from '../features/apps/components/ChartTypeGalleryCard';
import { useDataAppVisualizations } from '../features/apps/hooks/useDataAppVisualizations';
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
                    <Group justify="space-between" align="center">
                        <Group gap={6} align="baseline">
                            <Title order={4}>Chart types</Title>
                            {totalCount !== null && (
                                <Text fz="sm" c="ldGray.6">
                                    ({totalCount})
                                </Text>
                            )}
                        </Group>

                        <Group gap="sm">
                            <TextInput
                                w={260}
                                placeholder="Search chart types…"
                                leftSection={<MantineIcon icon={IconSearch} />}
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
                                    component={Link}
                                    to={`/projects/${projectUuid}/chart-types/new`}
                                    leftSection={
                                        <MantineIcon
                                            icon={IconPlus}
                                            size={18}
                                        />
                                    }
                                >
                                    New chart type
                                </Button>
                            </Can>
                        </Group>
                    </Group>
                    {isInitialLoading ? (
                        <EmptyStateLoader title="Loading chart types…" />
                    ) : error ? (
                        <InlineErrorState
                            message="Failed to load chart types"
                            onRetry={() => refetch()}
                        />
                    ) : dataAppVizs.length === 0 ? (
                        <Paper variant="dotted" p="xl">
                            <Text ta="center" fz="sm" c="ldGray.6">
                                {debouncedSearch
                                    ? `No chart types match “${debouncedSearch}”`
                                    : 'No chart types yet. Describe one in the builder to get started.'}
                            </Text>
                        </Paper>
                    ) : (
                        <>
                            <SimpleGrid
                                cols={{ base: 1, sm: 2, lg: 3 }}
                                spacing="lg"
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
