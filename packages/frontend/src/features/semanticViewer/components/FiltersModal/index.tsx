import { Button, Flex, Modal, Stack, type ModalProps } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectAllSelectedFieldNames } from '../../store/selectors';
import {
    addFilter,
    removeFilter,
    updateFilter,
} from '../../store/semanticViewerSlice';
import Filter from './Filter';
import FilterButton from './FilterButton';
import FilterFieldSelect from './FilterFieldSelect';

type FiltersModalProps = ModalProps & {
    onApply?: () => void;
};

const FiltersModal: FC<FiltersModalProps> = ({
    onApply,
    onClose,
    ...props
}) => {
    const [isAddingFilter, setIsAddingFilter] = useState(false);
    const { filters, fields } = useAppSelector((state) => state.semanticViewer);
    const allSelectedFieldNames = useAppSelector(selectAllSelectedFieldNames);

    const dispatch = useAppDispatch();

    const availableFieldOptions = useMemo(() => {
        if (!fields) return [];

        return fields
            .filter((f) => f.visible && f.availableOperators.length > 0)
            .map((f) => ({
                value: f.name,
                field: f,
                label: f.label,
                group: allSelectedFieldNames.includes(f.name)
                    ? 'Results'
                    : 'Other fields',
            }))
            .sort((a, b) =>
                a.group === 'Results' && b.group !== 'Results' ? 0 : 1,
            );
    }, [allSelectedFieldNames, fields]);

    const handleApply = useCallback(() => {
        onApply?.();
        onClose?.();
    }, [onApply, onClose]);

    return (
        <Modal {...props} onClose={onClose} p="sm" radius="md">
            <Stack align="flex-start" spacing="md">
                {filters.map((filter, index) => (
                    <Filter
                        key={filter.uuid}
                        isFirstRootFilter={index === 0}
                        filter={filter}
                        fieldOptions={availableFieldOptions}
                        allFields={fields ?? []}
                        onDelete={() => dispatch(removeFilter(filter.uuid))}
                        onUpdate={(updatedFilter) =>
                            dispatch(updateFilter(updatedFilter))
                        }
                    />
                ))}
                {!isAddingFilter ? (
                    <FilterButton
                        icon={IconPlus}
                        onClick={() => setIsAddingFilter(true)}
                    >
                        Add filter
                    </FilterButton>
                ) : (
                    <FilterFieldSelect
                        availableFieldOptions={availableFieldOptions}
                        fields={fields ?? []}
                        onAddFilter={(filter) => {
                            dispatch(addFilter(filter));
                            setIsAddingFilter(false);
                        }}
                        onCancel={() => setIsAddingFilter(false)}
                    />
                )}
                <Flex w="100%" justify="flex-end">
                    <Button onClick={handleApply}>Apply</Button>
                </Flex>
            </Stack>
        </Modal>
    );
};

export default FiltersModal;
