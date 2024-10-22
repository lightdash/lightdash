import { type SemanticLayerFilter } from '@lightdash/common';
import {
    Button,
    Flex,
    Modal,
    Stack,
    Title,
    type ModalProps,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useAppDispatch, useAppSelector } from '../../../sqlRunner/store/hooks';
import {
    selectAllSelectedFieldNames,
    selectFilters,
} from '../../store/selectors';
import { setFilters } from '../../store/semanticViewerSlice';
import Filter from './Filter';
import FilterButton from './FilterButton';
import FilterFieldSelect from './FilterFieldSelect';

type FiltersModalProps = Omit<ModalProps, 'opened'> & {
    onApply?: () => void;
};

const FiltersModal: FC<FiltersModalProps> = ({
    onApply,
    onClose,
    ...props
}) => {
    const [isAddingFilter, setIsAddingFilter] = useState(false);
    const { fields } = useAppSelector((state) => state.semanticViewer);
    const selectedFields = useAppSelector(selectAllSelectedFieldNames);
    const filters = useAppSelector(selectFilters);

    const fieldOptions = useMemo(() => {
        if (!fields) return [];

        return fields
            .filter((f) => f.visible && f.availableOperators.length > 0)
            .map((f) => ({
                value: f.name,
                field: f,
                label: f.label,
                group: selectedFields.includes(f.name)
                    ? 'Results'
                    : 'Other fields',
            }))
            .sort((a, b) => {
                const aValue = a.group === 'Results' ? 1 : -1;
                const bValue = b.group === 'Results' ? 1 : -1;

                return bValue - aValue;
            });
    }, [selectedFields, fields]);

    const [draftFilters, setDraftFilters] =
        useState<SemanticLayerFilter[]>(filters);

    const dispatch = useAppDispatch();

    const handleUpdateFilter = (updatedFilter: SemanticLayerFilter) => {
        setDraftFilters((prev) => {
            const updatedFilters = [...prev];
            const filterIndex = updatedFilters.findIndex(
                (f) => f.uuid === updatedFilter.uuid,
            );
            updatedFilters[filterIndex] = updatedFilter;
            return updatedFilters;
        });
    };

    const handleRemoveFilter = (uuid: string) => {
        setDraftFilters((prev) => prev.filter((f) => f.uuid !== uuid));
    };

    const handleApply = useCallback(() => {
        dispatch(setFilters(draftFilters));
        onApply?.();
        onClose?.();
    }, [dispatch, draftFilters, onApply, onClose]);

    return (
        <Modal
            {...props}
            opened
            title={
                <Title order={5} fw={500}>
                    Filters
                </Title>
            }
            onClose={onClose}
        >
            {/* data-autofocus so that the focus remains inside the modal but doesn't try to focus a filter input and open the dropdown */}
            <Stack align="flex-start" spacing="sm" data-autofocus>
                {draftFilters.map((filter, index) => (
                    <Filter
                        key={filter.uuid}
                        isFirstRootFilter={index === 0}
                        filter={filter}
                        fields={fields ?? []}
                        fieldOptions={fieldOptions}
                        onDelete={() => handleRemoveFilter(filter.uuid)}
                        onUpdate={handleUpdateFilter}
                    />
                ))}
                {Boolean(!isAddingFilter && draftFilters.length > 0) ? (
                    <FilterButton
                        icon={IconPlus}
                        onClick={() => setIsAddingFilter(true)}
                    >
                        Add filter
                    </FilterButton>
                ) : (
                    <FilterFieldSelect
                        fields={fields}
                        fieldOptions={fieldOptions}
                        isCreatingFilter
                        onCreate={(newFilter) => {
                            setIsAddingFilter(false);
                            setDraftFilters((prev) => [...prev, newFilter]);
                        }}
                        onCancel={
                            draftFilters.length > 0
                                ? () => setIsAddingFilter(false)
                                : undefined
                        }
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
