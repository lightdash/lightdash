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
import { uniqBy } from 'lodash';
import { useCallback, useMemo, useState, type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import MantineIcon from '../../../../components/common/MantineIcon';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useSemanticLayerViewFields } from '../../api/hooks';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
    selectAllSelectedFieldNames,
    selectAllSelectedFieldsByKind,
    selectFilterFields,
    selectSemanticLayerInfo,
} from '../../store/selectors';
import {
    addFilter,
    removeFilter,
    updateFilter,
} from '../../store/semanticViewerSlice';
import Filter from './Filter';

type FiltersModalProps = ModalProps & {
    onApply?: () => void;
};

const FiltersModal: FC<FiltersModalProps> = ({
    onApply,
    onClose,
    ...props
}) => {
    const [isAddingFilter, setIsAddingFilter] = useState(false);
    const { projectUuid } = useAppSelector(selectSemanticLayerInfo);
    const { view, filters } = useAppSelector((state) => state.semanticViewer);
    const allSelectedFieldsBykind = useAppSelector(
        selectAllSelectedFieldsByKind,
    );
    const allSelectedFieldNames = useAppSelector(selectAllSelectedFieldNames);
    const filterFields = useAppSelector(selectFilterFields);

    const dispatch = useAppDispatch();

    const { showToastError } = useToaster();

    if (!view) {
        throw new Error('View not set');
    }

    const usedFields = useMemo(() => {
        return {
            dimensions: uniqBy(
                [
                    ...filterFields.dimensions,
                    ...allSelectedFieldsBykind.dimensions,
                ],
                'name',
            ),
            metrics: uniqBy(
                [...filterFields.metrics, ...allSelectedFieldsBykind.metrics],
                'name',
            ),
            timeDimensions: uniqBy(
                [
                    ...filterFields.timeDimensions,
                    ...allSelectedFieldsBykind.timeDimensions,
                ],
                'name',
            ),
        };
    }, [filterFields, allSelectedFieldsBykind]);

    const { data: fields } = useSemanticLayerViewFields(
        {
            projectUuid,
            view,
            selectedFields: usedFields,
        },
        {
            keepPreviousData: true,
        },
    );

    const availableFieldOptions = useMemo(() => {
        return (
            fields
                ?.filter(
                    (f) =>
                        f.visible &&
                        f.type === SemanticLayerFieldType.STRING &&
                        f.kind === FieldKind.DIMENSION, // TODO: for now only string dimensions are supported
                )
                .map((f) => ({
                    value: f.name,
                    label: f.label ?? f.name,
                    group: allSelectedFieldNames.includes(f.name)
                        ? 'Results'
                        : 'Other fields',
                })) ?? []
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
        >
            <Stack align="flex-start" spacing="sm">
                {filters.map((filter) => (
                    <Filter
                        key={filter.uuid}
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
