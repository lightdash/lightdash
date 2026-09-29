import { type OrganizationDataAppViz } from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconBuildingSkyscraper } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useOrganizationDataAppVisualizations } from '../hooks/useDataAppVisualizations';
import ChartTypeDeleteModal from './ChartTypeDeleteModal';
import ChartTypeDetailModal from './ChartTypeDetailModal';
import ChartTypeGalleryCard from './ChartTypeGalleryCard';
import ChartTypeListSection from './ChartTypeListSection';
import NewChartTypeButton from './NewChartTypeButton';

const OrganizationLibraryEmptyState: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => (
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
        <NewChartTypeButton
            projectUuid={projectUuid}
            owner="organization"
            size="sm"
            mt="xs"
        />
    </Stack>
);

type Props = {
    /** The project the gallery is viewed from */
    projectUuid: string;
};

/**
 * The organization library tab: the organization's chart types, the same
 * from every project. Organization chart type managers build, edit and
 * delete them.
 */
const OrganizationChartTypesSection: FC<Props> = ({ projectUuid }) => {
    const [search, setSearch] = useState('');
    const [debouncedSearch] = useDebouncedValue(search, 300);
    const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
    const [deleteUuid, setDeleteUuid] = useState<string | null>(null);

    const query = useOrganizationDataAppVisualizations(debouncedSearch, true);
    const { data, isInitialLoading, error } = query;

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

    return (
        <>
            <ChartTypeListSection
                query={query}
                items={chartTypes}
                search={search}
                onSearchChange={setSearch}
                debouncedSearch={debouncedSearch}
                isEmpty={isEmptyLibrary}
                headerActions={
                    <NewChartTypeButton
                        projectUuid={projectUuid}
                        owner="organization"
                        size="xs"
                    />
                }
                emptyState={
                    <OrganizationLibraryEmptyState projectUuid={projectUuid} />
                }
                errorMessage="Failed to load organization chart types"
                paginationTestId="organization-chart-types-pagination"
                renderItem={(viz) => (
                    <ChartTypeGalleryCard
                        dataAppViz={viz}
                        projectUuid={projectUuid}
                        hasRegistryUpdate={false}
                        onClick={() => setSelectedUuid(viz.dataAppVizUuid)}
                        onPreview={null}
                        onDelete={() => setDeleteUuid(viz.dataAppVizUuid)}
                    />
                )}
            />

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
