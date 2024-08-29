import { ActionIcon, Button, Group, Select, Stack } from '@mantine/core';
import { IconPlus, IconX } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import useToaster from '../../../../hooks/toaster/useToaster';
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

    const { showToastError } = useToaster();

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
                    fieldOptions={availableFieldOptions}
                    allFields={fields ?? []}
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
                            setCanAddFilter(true);

                            if (!value) {
                                return;
                            }

                            const defaultOperator = fields?.find(
                                (f) => f.name === value,
                            )?.availableOperators[0];

                            if (!defaultOperator) {
                                showToastError({
                                    title: 'Error',
                                    subtitle:
                                        'No filter operators available for this field',
                                });
                                return;
                            }

                            dispatch(
                                addFilter({
                                    field: value,
                                    operator: defaultOperator,
                                    values: [],
                                }),
                            );
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
