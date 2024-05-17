import {
    BinType,
    CustomDimensionType,
    getItemId,
    isCustomDimension,
    isDimension,
    snakeCaseName,
    type BinRange,
    type CustomBinDimension,
    type Dimension,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Flex,
    Group,
    Modal,
    NumberInput,
    Radio,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconX } from '@tabler/icons-react';
import { useEffect, useMemo, type FC } from 'react';
import useToaster from '../../../hooks/toaster/useToaster';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import MantineIcon from '../../common/MantineIcon';

// TODO: preview custom dimension results

const sanitizeId = (label: string, dimensionName: string) =>
    `${dimensionName}_${snakeCaseName(label)}`;

const MIN_OF_FIXED_NUMBER_BINS = 1;
const DEFAULT_CUSTOM_RANGE: BinRange[] = [
    { to: 0, from: undefined },
    { from: 1, to: undefined },
];

export const CustomBinDimensionModal: FC<{
    isEditing: boolean;
    item: Dimension | CustomBinDimension;
}> = ({ isEditing, item }) => {
    const { showToastSuccess } = useToaster();
    const toggleModal = useExplorerContext(
        (context) => context.actions.toggleCustomDimensionModal,
    );
    const customDimensions = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.customDimensions,
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
                    binNumber: MIN_OF_FIXED_NUMBER_BINS,
                },
                fixedWidth: {
                    binWidth: MIN_OF_FIXED_NUMBER_BINS,
                },
                customRange: DEFAULT_CUSTOM_RANGE,
            },
        },
        validate: {
            customDimensionLabel: (label) => {
                if (!label) return null;

                if (!item) return null;

                if (isEditing && label === item.name) {
                    return null;
                }
                const dimensionName = sanitizeId(
                    label,
                    isEditing && isCustomDimension(item)
                        ? item.dimensionId
                        : item.name,
                );

                if (
                    isEditing &&
                    isCustomDimension(item) &&
                    dimensionName === item.id
                ) {
                    return null;
                }

                return customDimensions?.some(
                    (customDimension) => customDimension.id === dimensionName,
                )
                    ? 'Dimension with this label already exists'
                    : null;
            },
        },
    });

    const { setFieldValue } = form;

    useEffect(() => {
        if (isEditing && isCustomDimension(item)) {
            setFieldValue('customDimensionLabel', item.name);
            setFieldValue('binType', item.binType);
            setFieldValue(
                'binConfig.fixedNumber.binNumber',
                item.binNumber ? item.binNumber : MIN_OF_FIXED_NUMBER_BINS,
            );

            setFieldValue(
                'binConfig.fixedWidth.binWidth',
                item.binWidth ? item.binWidth : MIN_OF_FIXED_NUMBER_BINS,
            );

            setFieldValue(
                'binConfig.customRange',
                item.customRange ? item.customRange : DEFAULT_CUSTOM_RANGE,
            );
        }
    }, [setFieldValue, item, isEditing]);

    const handleOnSubmit = form.onSubmit((values) => {
        if (item) {
            const sanitizedId = sanitizeId(
                values.customDimensionLabel,
                isEditing && isCustomDimension(item)
                    ? item.dimensionId
                    : item.name,
            );

            if (isEditing && isCustomDimension(item)) {
                editCustomDimension(
                    {
                        id: sanitizedId,
                        name: values.customDimensionLabel,
                        type: CustomDimensionType.BIN,
                        dimensionId: item.dimensionId,
                        binType: values.binType,
                        binNumber: values.binConfig.fixedNumber.binNumber,
                        binWidth: values.binConfig.fixedWidth.binWidth,
                        table: item.table,
                        customRange: values.binConfig.customRange,
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
                    type: CustomDimensionType.BIN,
                    dimensionId: getItemId(item),
                    binType: values.binType,
                    binNumber: values.binConfig.fixedNumber.binNumber,
                    binWidth: values.binConfig.fixedWidth.binWidth,
                    table: item.table,
                    customRange: values.binConfig.customRange,
                });

                showToastSuccess({
                    title: 'Custom dimension added successfully',
                });
            }
        }

        form.reset();
        toggleModal();
    });

    const baseDimensionLabel = useMemo(() => {
        if (item) {
            if (isEditing && isCustomDimension(item)) {
                // TODO: Store base dimension label in Custom Dimension
                return item.dimensionId;
            } else if (isDimension(item)) {
                return item.label;
            }
            return item.name;
        }
    }, [isEditing, item]);

    return (
        <Modal
            size="lg"
            onClick={(e) => e.stopPropagation()}
            opened={true}
            onClose={() => {
                toggleModal(undefined);
                form.reset();
            }}
            title={
                <>
                    <Title order={4}>
                        {isEditing ? 'Edit' : 'Create'} Custom Dimension
                        <Text span fw={400}>
                            {' '}
                            - {baseDimensionLabel}{' '}
                        </Text>
                    </Title>
                </>
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
                            <Radio
                                value={BinType.FIXED_WIDTH}
                                label="Fixed Width"
                            />
                            <Radio
                                value={BinType.CUSTOM_RANGE}
                                label="Custom range"
                            />
                        </Group>
                    </Radio.Group>

                    {form.values.binType === BinType.FIXED_NUMBER && (
                        <NumberInput
                            w={100}
                            label="Bin number"
                            required
                            min={MIN_OF_FIXED_NUMBER_BINS}
                            type="number"
                            {...form.getInputProps(
                                'binConfig.fixedNumber.binNumber',
                            )}
                        />
                    )}

                    {form.values.binType === BinType.FIXED_WIDTH && (
                        <NumberInput
                            w={100}
                            label="Bin width"
                            required
                            min={MIN_OF_FIXED_NUMBER_BINS}
                            type="number"
                            {...form.getInputProps(
                                'binConfig.fixedWidth.binWidth',
                            )}
                        />
                    )}

                    {form.values.binType === BinType.CUSTOM_RANGE && (
                        <>
                            <Text fw={500}>Range</Text>
                            {form.values.binConfig.customRange.map(
                                (range, index) => {
                                    const toProps = form.getInputProps(
                                        `binConfig.customRange.${index}.to`,
                                    );
                                    const fromProps = form.getInputProps(
                                        `binConfig.customRange.${index}.from`,
                                    );

                                    if (index === 0) {
                                        return (
                                            <Flex
                                                key={`custom-range.${index}`}
                                                gap="md"
                                                align="center"
                                            >
                                                <Text
                                                    w={100}
                                                    color="gray.6"
                                                    fw="400"
                                                >
                                                    &lt;{toProps.value}{' '}
                                                </Text>

                                                <NumberInput
                                                    w={100}
                                                    required
                                                    type="number"
                                                    {...toProps}
                                                />
                                                <Text color="gray.6" fw="400">
                                                    and under{' '}
                                                </Text>
                                            </Flex>
                                        );
                                    } else if (
                                        index ===
                                        form.values.binConfig.customRange
                                            .length -
                                            1
                                    ) {
                                        return (
                                            <Flex
                                                gap="md"
                                                align="center"
                                                key={`custom-range.${index}`}
                                            >
                                                <Text
                                                    w={100}
                                                    color="gray.6"
                                                    fw="400"
                                                >
                                                    ≥{fromProps.value}{' '}
                                                </Text>

                                                <NumberInput
                                                    w={100}
                                                    required
                                                    type="number"
                                                    {...fromProps}
                                                />
                                                <Text color="gray.6" fw="400">
                                                    and above{' '}
                                                </Text>
                                            </Flex>
                                        );
                                    } else {
                                        return (
                                            <Flex
                                                gap="md"
                                                align="center"
                                                key={`custom-range.${index}`}
                                            >
                                                <Text
                                                    w={100}
                                                    color="gray.6"
                                                    fw="400"
                                                >
                                                    ≥{fromProps.value} and &lt;
                                                    {toProps.value}
                                                </Text>

                                                <NumberInput
                                                    w={100}
                                                    required
                                                    type="number"
                                                    {...fromProps}
                                                />
                                                <Text color="gray.6" fw="400">
                                                    to{' '}
                                                </Text>

                                                <NumberInput
                                                    w={100}
                                                    required
                                                    type="number"
                                                    {...toProps}
                                                />

                                                <ActionIcon
                                                    onClick={() => {
                                                        const newRange = [
                                                            ...form.values
                                                                .binConfig
                                                                .customRange,
                                                        ];
                                                        newRange.splice(
                                                            index,
                                                            1,
                                                        );
                                                        form.setFieldValue(
                                                            'binConfig.customRange',
                                                            newRange,
                                                        );
                                                    }}
                                                >
                                                    <MantineIcon icon={IconX} />
                                                </ActionIcon>
                                            </Flex>
                                        );
                                    }
                                },
                            )}

                            <Text
                                color="blue.6"
                                fw="400"
                                maw={100}
                                sx={{ cursor: 'pointer' }}
                                onClick={() => {
                                    // Insert new custom range item before the last one
                                    const newRange = [
                                        ...form.values.binConfig.customRange,
                                    ];
                                    newRange.splice(newRange.length - 1, 0, {
                                        from: 0,
                                        to: 0,
                                    });

                                    form.setFieldValue(
                                        'binConfig.customRange',
                                        newRange,
                                    );
                                }}
                            >
                                {' '}
                                + Add a range{' '}
                            </Text>
                        </>
                    )}

                    {/* Add results preview */}

                    <Button ml="auto" type="submit">
                        {isEditing ? 'Save changes' : 'Create'}
                    </Button>
                </Stack>
            </form>
        </Modal>
    );
};
