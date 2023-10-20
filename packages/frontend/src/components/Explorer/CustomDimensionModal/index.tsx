import { BinType, fieldId, isCustomDimension } from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    NumberInput,
    Radio,
    Stack,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect } from 'react';
import useToaster from '../../../hooks/toaster/useToaster';
import { useExplorerContext } from '../../../providers/ExplorerProvider';

// TODO: edit custom dimension
// TODO: preview custom dimension results

export const CustomDimensionModal = () => {
    const { showToastSuccess } = useToaster();
    const { isOpen, isEditing, item } = useExplorerContext(
        (context) => context.state.modals.customDimension,
    );
    const toggleModal = useExplorerContext(
        (context) => context.actions.toggleCustomDimensionModal,
    );
    const addCustomDimension = useExplorerContext(
        (context) => context.actions.addCustomDimension,
    );
    const editCustomDimension = useExplorerContext(
        (context) => context.actions.editCustomDimension,
    );

    const form = useForm({
        initialValues: {
            customDimensionLabel: '',
            binType: BinType.FIXED_NUMBER,
            binConfig: {
                fixedNumber: {
                    binNumber: 0,
                },
            },
        },

        // TODO: add validation to ensure unique custom dimension label
    });

    const { setFieldValue } = form;

    useEffect(() => {
        if (isEditing && isCustomDimension(item)) {
            setFieldValue('customDimensionLabel', item.name);
            setFieldValue('binType', item.binType);
            setFieldValue(
                'binConfig.fixedNumber.binNumber',
                item.binNumber ? +item.binNumber : 0,
            );
        }
    }, [setFieldValue, item, isEditing]);

    const handleOnSubmit = form.onSubmit((values) => {
        if (item) {
            console.log(values.customDimensionLabel);

            const sanitizedId = values.customDimensionLabel
                .toLowerCase()
                .replace(/[^a-z0-9]/gi, '_') // Replace non-alphanumeric characters with underscores
                .replace(/_{2,}/g, '_') // Replace multiple underscores with a single one
                .replace(/^_|_$/g, ''); // Remove leading and trailing underscores

            if (isEditing && isCustomDimension(item)) {
                editCustomDimension(
                    {
                        id: sanitizedId,
                        name: values.customDimensionLabel,
                        dimensionId: item.dimensionId,
                        binType: values.binType,
                        binNumber: values.binConfig.fixedNumber.binNumber,
                        table: item.table,
                    },
                    item.name,
                );

                showToastSuccess({
                    title: 'Custom dimension edited successfully',
                });
            } else {
                addCustomDimension({
                    id: sanitizedId,
                    name: values.customDimensionLabel,
                    dimensionId: fieldId(item),
                    binType: values.binType,
                    binNumber: values.binConfig.fixedNumber.binNumber,
                    table: item.table,

                    // TODO: consider renaming some properties to match `addCustomMetric` logic
                });

                showToastSuccess({
                    title: 'Custom dimension added successfully',
                });
            }
        }

        form.reset();
        toggleModal();
    });

    return !!item ? (
        <Modal
            size="lg"
            onClick={(e) => e.stopPropagation()}
            opened={isOpen}
            onClose={() => toggleModal(undefined)}
            title={
                <Title order={4}>
                    {isEditing ? 'Edit' : 'Create'} Custom Dimension -{' '}
                    {item.name}
                </Title>
            }
        >
            <form onSubmit={handleOnSubmit}>
                <Stack>
                    <TextInput
                        label="Label"
                        required
                        placeholder="Enter custom dimension label"
                        {...form.getInputProps('customDimensionLabel')}
                    />

                    <Radio.Group
                        label="Bin type"
                        withAsterisk
                        required
                        {...form.getInputProps('binType')}
                    >
                        <Group mt="md">
                            <Radio
                                value={BinType.FIXED_NUMBER}
                                label="Fixed number of bins"
                            />
                            <Tooltip label="Coming soon">
                                <Radio
                                    disabled
                                    value="fixed width"
                                    label="Fixed Width"
                                />
                            </Tooltip>
                            <Tooltip label="Coming soon">
                                <Radio
                                    disabled
                                    value="custom range"
                                    label="Custom Range"
                                />
                            </Tooltip>
                        </Group>
                    </Radio.Group>

                    {form.values.binType === BinType.FIXED_NUMBER && (
                        <NumberInput
                            w={100}
                            label="Bin number"
                            required
                            min={1}
                            type="number"
                            {...form.getInputProps(
                                'binConfig.fixedNumber.binNumber',
                            )}
                        />
                    )}

                    {/* Add results preview */}

                    <Button ml="auto" type="submit">
                        {isEditing ? 'Edit' : 'Create'} custom dimension
                    </Button>
                </Stack>
            </form>
        </Modal>
    ) : null;
};
