import { type OrganizationDataAppViz } from '@lightdash/common';
import {
    Box,
    Group,
    Paper,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { useDebouncedValue, useIntersection } from '@mantine/hooks';
import { IconBuildingSkyscraper, IconSearch } from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FC } from 'react';
import EmptyStateLoader from '../../../components/common/EmptyStateLoader';
import InlineErrorState from '../../../components/common/InlineErrorState';
import MantineIcon from '../../../components/common/MantineIcon';
import { useOrganizationDataAppVisualizations } from '../hooks/useDataAppVisualizations';
import ChartTypeDeleteModal from './ChartTypeDeleteModal';
import ChartTypeDetailModal from './ChartTypeDetailModal';
import ChartTypeGalleryCard from './ChartTypeGalleryCard';

const OrganizationLibraryEmptyState: FC = () => (
    <Stack align="center" gap="sm" py="7xl">
        <MantineIcon
            icon={IconBuildingSkyscraper}
            color="ldGray.5"
            stroke={1.5}
            size="lg"
        />
        <Text size="md" fw={600} c="ldGray.8">
            No organization chart types yet
        </Text>
        <Text ta="center" fz="xs" c="dimmed" maw={400} lh={1.5}>
            Chart types built in the organization library can be used in every
            project of your organization.
        </Text>
    </Stack>
);

type Props = {
    /** The project the gallery is viewed from */
    projectUuid: string;
};

/**
 * The organization library tab: the organization's chart types, the same
 * from every project and read-only apart from deletion by managers.
 */
const OrganizationChartTypesSection: FC<Props> = ({ projectUuid }) => {
    const [search, setSearch] = useState('');
    const [debouncedSearch] = useDebouncedValue(search, 300);
    const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
    const [deleteUuid, setDeleteUuid] = useState<string | null>(null);

    const {
        data,
        isInitialLoading,
        isFetching,
        error,
        refetch,
        hasNextPage,
        fetchNextPage,
        isFetchingNextPage,
    } = useOrganizationDataAppVisualizations(debouncedSearch, true);
    const { ref: paginationRef, entry: paginationEntry } = useIntersection({
        rootMargin: '200px',
    });

    const chartTypes: OrganizationDataAppViz[] = useMemo(
        () => data?.pages.flatMap((page) => page.data) ?? [],
        [data?.pages],
    );
    const selected = chartTypes.find(
        (viz) => viz.dataAppVizUuid === selectedUuid,
    );
    const toDelete = chartTypes.find(
        (viz) => viz.dataAppVizUuid === deleteUuid,
    );
    const totalCount =
        !debouncedSearch && data?.pages[0]?.pagination
            ? data.pages[0].pagination.totalResults
            : null;
    const isEmptyLibrary =
        !isInitialLoading && !error && !debouncedSearch && totalCount === 0;

    useEffect(() => {
        if (
            paginationEntry?.isIntersecting &&
            hasNextPage &&
            !isFetching &&
            !error
        ) {
            void fetchNextPage();
        }
    }, [paginationEntry, hasNextPage, isFetching, error, fetchNextPage]);

    return (
        <>
            <Stack gap="md">
                {!isEmptyLibrary && (
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
                    </Group>
                )}

                {isInitialLoading ? (
                    <EmptyStateLoader title="Loading chart types…" />
                ) : error ? (
                    <InlineErrorState
                        message="Failed to load organization chart types"
                        onRetry={() => refetch()}
                    />
                ) : chartTypes.length === 0 ? (
                    debouncedSearch ? (
                        <Paper variant="dotted" p="xl">
                            <Text ta="center" fz="xs" c="dimmed">
                                No chart types match &ldquo;
                                {debouncedSearch}&rdquo;
                            </Text>
                        </Paper>
                    ) : (
                        <OrganizationLibraryEmptyState />
                    )
                ) : (
                    <>
                        <SimpleGrid
                            cols={{ base: 1, sm: 2, lg: 3 }}
                            spacing="md"
                        >
                            {chartTypes.map((viz) => (
                                <ChartTypeGalleryCard
                                    key={viz.dataAppVizUuid}
                                    dataAppViz={viz}
                                    projectUuid={projectUuid}
                                    hasRegistryUpdate={false}
                                    onClick={() =>
                                        setSelectedUuid(viz.dataAppVizUuid)
                                    }
                                    onPreview={null}
                                    onDelete={() =>
                                        setDeleteUuid(viz.dataAppVizUuid)
                                    }
                                />
                            ))}
                        </SimpleGrid>
                        {hasNextPage && (
                            <Box
                                ref={paginationRef}
                                data-testid="organization-chart-types-pagination"
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

            {selected && (
                <ChartTypeDetailModal
                    opened
                    projectUuid={projectUuid}
                    dataAppViz={selected}
                    isActive={deleteUuid === null}
                    registryEntry={null}
                    onClose={() => setSelectedUuid(null)}
                    onPreview={null}
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
        </>
    );
};

export default OrganizationChartTypesSection;
