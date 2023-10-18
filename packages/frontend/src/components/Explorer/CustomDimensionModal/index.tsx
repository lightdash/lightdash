import { BinType, fieldId } from '@lightdash/common';
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
import useToaster from '../../../hooks/toaster/useToaster';
import { useExplorerContext } from '../../../providers/ExplorerProvider';

// TODO: edit custom dimension
// TODO: preview custom dimension results

export const CustomDimensionModal = () => {
    const { showToastSuccess } = useToaster();
    const { isOpen, isEditing, item } = useExplorerContext(
        (context) => context.state.modals.customDimension,
    );
    const addCustomDimension = useExplorerContext(
        (context) => context.actions.addCustomDimension,
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
    });

    const toggleModal = useExplorerContext(
        (context) => context.actions.toggleCustomDimensionModal,
    );

    const handleOnSubmit = form.onSubmit((values) => {
        if (item) {
            addCustomDimension({
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

        toggleModal();
    });

    return !!item ? (
        <Modal
            size="xl"
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
                            label="Bin number"
                            required
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
