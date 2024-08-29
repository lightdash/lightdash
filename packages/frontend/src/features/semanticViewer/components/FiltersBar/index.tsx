import { SemanticLayerStringFilterOperator } from '@lightdash/common';
import { ActionIcon, Button, Group, Select, Stack } from '@mantine/core';
import { IconPlus, IconX } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useSemanticLayerViewFields } from '../../api/hooks';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
    selectAllSelectedFieldsByKind,
    selectSemanticLayerInfo,
} from '../../store/selectors';
import {
    addFilter,
    removeFilter,
    updateFilter,
} from '../../store/semanticViewerSlice';
import Filter from './Filter';

const FiltersBar: FC = () => {
    const [canAddFilter, setCanAddFilter] = useState(true);
    const { projectUuid } = useAppSelector(selectSemanticLayerInfo);
    const { view, filters } = useAppSelector((state) => state.semanticViewer);
    const allSelectedFieldsBykind = useAppSelector(
        selectAllSelectedFieldsByKind,
    );

    const dispatch = useAppDispatch();

    if (!view) {
        throw new Error('View not set');
    }

    const { data: fields } = useSemanticLayerViewFields(
        {
            projectUuid,
            view,
            selectedFields: allSelectedFieldsBykind,
        },
        {
            keepPreviousData: true,
        },
    );

    const availableFieldOptions = useMemo(() => {
        return (
            fields
                ?.filter((f) => f.visible)
                .map((f) => ({
                    value: f.name,
                    label: f.label ?? f.name,
                })) ?? []
        );
    }, [fields]);

    return (
        <Stack align="flex-start" spacing="sm" p="sm">
            {Object.entries(filters).map(([uuid, filter]) => (
                <Filter
                    key={uuid}
                    filter={filter}
                    availableFields={availableFieldOptions}
                    onDelete={() => dispatch(removeFilter(uuid))}
                    onUpdate={(updatedFilter) =>
                        dispatch(updateFilter({ uuid, filter: updatedFilter }))
                    }
                />
            ))}
            {canAddFilter ? (
                <Button
                    size="xs"
                    leftIcon={<MantineIcon icon={IconPlus} />}
                    onClick={() => setCanAddFilter(false)}
                >
                    Add filter
                </Button>
            ) : (
                <Group spacing="xs">
                    <Select
                        size="xs"
                        data={availableFieldOptions}
                        placeholder="Select field"
                        searchable
                        onChange={(value) => {
                            if (value) {
                                dispatch(
                                    addFilter({
                                        field: value,
                                        operator:
                                            SemanticLayerStringFilterOperator.IS,
                                        values: [],
                                    }),
                                );
                            }

                            setCanAddFilter(true);
                        }}
                    />
                    <ActionIcon size="xs" onClick={() => setCanAddFilter(true)}>
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                </Group>
            )}
        </Stack>
    );
};

export default FiltersBar;
