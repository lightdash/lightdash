import { getAppDisplayName, type DataAppViz } from '@lightdash/common';
import { Box, Loader, Select, Text, type ComboboxItem } from '@mantine-8/core';
import { useDebouncedValue } from '@mantine-8/hooks';
import { IconPuzzle } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useDataAppVisualizations } from '../hooks/useDataAppVisualizations';

type Props = {
    projectUuid: string;
    selectedDataAppVizUuid: string | null;
    selectedDataAppViz: DataAppViz | null;
    /** Receives the whole viz so the caller can bind its contract straight
     *  away, without waiting on a fetch for the newly selected uuid, or null
     *  when the selection is cleared. */
    onSelect: (dataAppViz: DataAppViz | null) => void;
};

interface DataAppVizItem extends ComboboxItem {
    description: string;
}

const fieldSummary = (dataAppViz: DataAppViz): string => {
    const count = dataAppViz.schema?.fields.length ?? 0;
    return `${count} field${count === 1 ? '' : 's'}`;
};

const toItem = (dataAppViz: DataAppViz): DataAppVizItem => ({
    value: dataAppViz.dataAppVizUuid,
    label: getAppDisplayName(dataAppViz.name, dataAppViz.dataAppVizUuid),
    description: dataAppViz.description || fieldSummary(dataAppViz),
});

// Library picker: a searchable Select of the project's saved data app vizs.
// Search is server-side (debounced) so it scales past the first page; selecting
// an option calls `onSelect` with its uuid.
const DataAppVizLibraryPicker: FC<Props> = ({
    projectUuid,
    selectedDataAppVizUuid,
    selectedDataAppViz,
    onSelect,
}) => {
    const [search, setSearch] = useState('');
    const selectedLabel = selectedDataAppViz
        ? getAppDisplayName(
              selectedDataAppViz.name,
              selectedDataAppViz.dataAppVizUuid,
          )
        : null;
    // Mantine puts the selected option's label in the input, which is not a
    // query the user typed. Mirror Mantine's own `filterOptions` rule so the
    // whole library stays listed until they actually type something else.
    const [debouncedSearch] = useDebouncedValue(
        search === selectedLabel ? '' : search,
        300,
    );

    const { data, isInitialLoading, isFetching, error } =
        useDataAppVisualizations(projectUuid, debouncedSearch);

    // Keep the fetched rows addressable by uuid so `onChange` can hand the
    // caller the whole viz (contract included), not just its uuid.
    const dataAppVizsByUuid = useMemo(() => {
        const byUuid = new Map<string, DataAppViz>();
        if (selectedDataAppViz) {
            byUuid.set(selectedDataAppViz.dataAppVizUuid, selectedDataAppViz);
        }
        for (const page of data?.pages ?? []) {
            for (const viz of page.data) byUuid.set(viz.dataAppVizUuid, viz);
        }
        return byUuid;
    }, [data?.pages, selectedDataAppViz]);

    const selectData = useMemo(() => {
        const dataAppVizs = data?.pages.flatMap((page) => page.data) ?? [];
        const items = dataAppVizs.map(toItem);
        // Keep the current selection displayable even when it is not in the
        // active (filtered) page.
        if (
            selectedDataAppViz &&
            !items.some((i) => i.value === selectedDataAppViz.dataAppVizUuid)
        ) {
            items.unshift(toItem(selectedDataAppViz));
        }
        return items;
    }, [data?.pages, selectedDataAppViz]);

    return (
        <Select
            searchable
            value={selectedDataAppVizUuid}
            data={selectData}
            searchValue={search}
            onSearchChange={setSearch}
            // Search is done server-side, so keep every returned option.
            filter={({ options }) => options}
            onChange={(value) =>
                onSelect(value ? (dataAppVizsByUuid.get(value) ?? null) : null)
            }
            allowDeselect={false}
            clearable
            placeholder="Select a visualization"
            nothingFoundMessage={
                error
                    ? 'Failed to load visualizations'
                    : debouncedSearch
                      ? 'No visualizations match your search'
                      : 'No data app visualizations yet'
            }
            leftSection={<MantineIcon icon={IconPuzzle} />}
            rightSection={
                isFetching && !isInitialLoading ? (
                    <Loader size={14} />
                ) : undefined
            }
            renderOption={({ option }) => {
                const item = option as DataAppVizItem;
                return (
                    <Box>
                        <Text size="sm">{item.label}</Text>
                        <Text size="xs" c="dimmed" lineClamp={2}>
                            {item.description}
                        </Text>
                    </Box>
                );
            }}
        />
    );
};

export default DataAppVizLibraryPicker;
