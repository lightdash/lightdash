import {
    FieldType as FieldKind,
    SemanticLayerFieldType,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Flex,
    Group,
    Modal,
    Select,
    Stack,
    type ModalProps,
} from '@mantine/core';
import { IconPlus, IconX } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import MantineIcon from '../../../../components/common/MantineIcon';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectAllSelectedFieldNames } from '../../store/selectors';
import {
    addFilter,
    removeFilter,
    updateFilter,
} from '../../store/semanticViewerSlice';
import Filter from './Filter';
import FilterFieldSelectItem from './FilterFieldSelectItem';

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
            .sort((a, b) =>
                a.group === 'Results' && b.group !== 'Results' ? 0 : 1,
            );
    }, [allSelectedFieldNames, fields]);

    const handleApply = useCallback(() => {
        onApply?.();
        onClose?.();
    }, [onApply, onClose]);

    return (
        <Modal
            {...props}
            onClose={onClose}
            overlayProps={{ opacity: 0.1 }}
            p="sm"
            radius="md"
        >
            <Stack align="flex-start" spacing="sm">
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
                    <Button
                        variant="subtle"
                        size="xs"
                        leftIcon={<MantineIcon icon={IconPlus} />}
                        onClick={() => setIsAddingFilter(true)}
                    >
                        Add filter
                    </Button>
                ) : (
                    <Group spacing="xs">
                        <Select
                            size="xs"
                            data={availableFieldOptions}
                            itemComponent={FilterFieldSelectItem}
                            placeholder="Select field"
                            searchable
                            withinPortal={true}
                            onChange={(value) => {
                                setIsAddingFilter(false);

                                if (!value) {
                                    return;
                                }

                                const field = fields?.find(
                                    (f) => f.name === value,
                                );

                                if (!field) {
                                    showToastError({
                                        title: 'Error',
                                        subtitle: 'Field not found',
                                    });
                                    return;
                                }

                                const defaultOperator =
                                    field.availableOperators[0];

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
                                        uuid: uuidv4(),
                                        field: value,
                                        fieldKind: field.kind,
                                        fieldType: field.type,
                                        operator: defaultOperator,
                                        values: [],
                                    }),
                                );
                            }}
                        />
                        <ActionIcon
                            size="xs"
                            onClick={() => setIsAddingFilter(false)}
                        >
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    </Group>
                )}
                <Flex w="100%" justify="flex-end">
                    <Button
                        bg="black"
                        onClick={handleApply}
                        sx={(theme) => ({
                            ':hover': {
                                backgroundColor: theme.colors.gray[6],
                            },
                        })}
                    >
                        Apply
                    </Button>
                </Flex>
            </Stack>
        </Modal>
    );
};

export default FiltersModal;
