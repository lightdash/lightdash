import { getAppDisplayName, type DataAppViz } from '@lightdash/common';
import { Button, Center, Loader, NavLink, Stack, Text } from '@mantine-8/core';
import { IconPuzzle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useDataAppVisualizations } from '../hooks/useDataAppVisualizations';

type Props = {
    projectUuid: string;
    selectedDataAppVizUuid: string | null;
    onSelect: (dataAppVizUuid: string) => void;
};

const fieldSummary = (dataAppViz: DataAppViz): string => {
    const count = dataAppViz.schema?.fields.length ?? 0;
    return `${count} field${count === 1 ? '' : 's'}`;
};

// Library picker: lists the project's saved data app vizs; selecting one calls
// `onSelect` with its uuid.
const DataAppVizLibraryPicker: FC<Props> = ({
    projectUuid,
    selectedDataAppVizUuid,
    onSelect,
}) => {
    const {
        data,
        isInitialLoading,
        error,
        hasNextPage,
        fetchNextPage,
        isFetchingNextPage,
    } = useDataAppVisualizations(projectUuid);

    if (isInitialLoading) {
        return (
            <Center p="md">
                <Loader size="sm" />
            </Center>
        );
    }

    if (error) {
        console.error('Failed to load data app visualizations:', error);
        return (
            <Text c="red" size="sm" p="md">
                Failed to load data app visualizations. Please try again.
            </Text>
        );
    }

    const dataAppVizs = data?.pages.flatMap((page) => page.data) ?? [];

    if (dataAppVizs.length === 0) {
        return (
            <Text c="dimmed" size="sm" p="md">
                No data app visualizations yet. Generate one to reuse it here.
            </Text>
        );
    }

    return (
        <Stack gap={0}>
            {dataAppVizs.map((dataAppViz) => (
                <NavLink
                    key={dataAppViz.dataAppVizUuid}
                    active={
                        dataAppViz.dataAppVizUuid === selectedDataAppVizUuid
                    }
                    label={getAppDisplayName(
                        dataAppViz.name,
                        dataAppViz.dataAppVizUuid,
                    )}
                    description={
                        dataAppViz.description || fieldSummary(dataAppViz)
                    }
                    leftSection={<MantineIcon icon={IconPuzzle} />}
                    onClick={() => onSelect(dataAppViz.dataAppVizUuid)}
                />
            ))}
            {hasNextPage && (
                <Button
                    variant="subtle"
                    size="xs"
                    loading={isFetchingNextPage}
                    onClick={() => void fetchNextPage()}
                >
                    Load more
                </Button>
            )}
        </Stack>
    );
};

export default DataAppVizLibraryPicker;
