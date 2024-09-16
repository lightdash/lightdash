import {
    FieldType as FieldKind,
    SemanticLayerFieldType,
    type SemanticLayerFilter,
} from '@lightdash/common';
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
import { v4 as uuidv4 } from 'uuid';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectAllSelectedFieldNames } from '../../store/selectors';
import { setFilters } from '../../store/semanticViewerSlice';
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

    const [draftFilters, setDraftFilters] =
        useState<SemanticLayerFilter[]>(filters);

    const dispatch = useAppDispatch();

    const { showToastError } = useToaster();

    const availableFieldOptions = useMemo(() => {
        if (!fields) return [];

        return fields
            .filter(
                (f) =>
                    f.visible &&
                    f.type === SemanticLayerFieldType.STRING &&
                    f.kind === FieldKind.DIMENSION, // TODO: for now only string dimensions are supported
            )
            .map((f) => ({
                value: f.name,
                field: f,
                label: f.label,
                group: allSelectedFieldNames.includes(f.name)
                    ? 'Results'
                    : 'Other fields',
            }))
            .sort((a, b) => {
                const aValue = a.group === 'Results' ? 1 : -1;
                const bValue = b.group === 'Results' ? 1 : -1;

                return bValue - aValue;
            });
    }, [allSelectedFieldNames, fields]);

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
            title={
                <Title order={5} fw={500}>
                    Filters
                </Title>
            }
            onClose={onClose}
            p="sm"
            radius="md"
        >
            {/* data-autofocus so that the focus remains inside the modal but doesn't try to focus a filter input and open the dropdown */}
            <Stack align="flex-start" spacing="sm" data-autofocus>
                {draftFilters.map((filter, index) => (
                    <Filter
                        key={filter.uuid}
                        isFirstRootFilter={index === 0}
                        filter={filter}
                        fieldOptions={availableFieldOptions}
                        allFields={fields ?? []}
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
                        availableFieldOptions={availableFieldOptions}
                        onFieldChange={(value) => {
                            setIsAddingFilter(false);

                            const field = fields?.find((f) => f.name === value);

                            if (!field) {
                                showToastError({
                                    title: 'Error',
                                    subtitle: 'Field not found',
                                });
                                return;
                            }

                            const defaultOperator = field.availableOperators[0];

                            if (!defaultOperator) {
                                showToastError({
                                    title: 'Error',
                                    subtitle:
                                        'No filter operators available for this field',
                                });
                                return;
                            }
                            const newFilter = {
                                uuid: uuidv4(),
                                field: value,
                                fieldKind: field.kind,
                                fieldType: field.type,
                                operator: defaultOperator,
                                values: [],
                            };

                            setDraftFilters((prev) => [...prev, newFilter]);
                        }}
                        onCancel={
                            draftFilters.length > 0
                                ? () => setIsAddingFilter(false)
                                : undefined
                        }
                        isCreatingFilter
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
