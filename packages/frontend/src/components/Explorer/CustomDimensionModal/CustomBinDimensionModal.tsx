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
    NumberInput,
    Radio,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconLayoutDashboard, IconX } from '@tabler/icons-react';
import cloneDeep from 'lodash/cloneDeep';
import { useEffect, useMemo, type FC } from 'react';
import { z } from 'zod';
import {
    explorerActions,
    selectCustomDimensions,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import useToaster from '../../../hooks/toaster/useToaster';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';

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
    const dispatch = useExplorerDispatch();
    const customDimensions = useExplorerSelector(selectCustomDimensions);

    const toggleModal = () =>
        dispatch(explorerActions.toggleCustomDimensionModal());

    const formSchema = z.object({
        customDimensionLabel: z.string().refine(
            (label) => {
                if (!label) return true;
                if (!item) return true;
                if (isEditing && label === item.name) return true;

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
                    return true;
                }

                return !customDimensions?.some(
                    (customDimension) => customDimension.id === dimensionName,
                );
            },
            { message: 'Dimension with this label already exists' },
        ),
        binType: z.nativeEnum(BinType),
        binConfig: z.object({
            fixedNumber: z.object({
                binNumber: z.number().positive(),
            }),
            fixedWidth: z.object({
                binWidth: z.number().positive(),
            }),
            customRange: z.array(
                z
                    .object({
                        from: z.number({ coerce: true }).optional(),
                        to: z.number({ coerce: true }).optional(),
                    })
                    .transform((o) => ({ from: o.from, to: o.to })),
            ),
        }),
    });

    type FormValues = z.infer<typeof formSchema>;

    const form = useForm<FormValues>({
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
        validate: zodResolver(formSchema),
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
                item.customRange
                    ? cloneDeep(item.customRange)
                    : DEFAULT_CUSTOM_RANGE,
            );
        }
    }, [setFieldValue, item, isEditing]);

    const handleOnSubmit = form.onSubmit((unparsedValues) => {
        // mantine form does not produce zod parsed values
        // so, number({ coerce: true }) does not work
        // that's why we need to parse the values manually
        const values = formSchema.parse(unparsedValues);

        if (item) {
            const sanitizedId = sanitizeId(
                values.customDimensionLabel,
                isEditing && isCustomDimension(item)
                    ? item.dimensionId
                    : item.name,
            );

            if (isEditing && isCustomDimension(item)) {
                // Edit by updating the entire array
                const updatedDimension: CustomBinDimension = {
                    id: item.id,
                    name: values.customDimensionLabel,
                    type: CustomDimensionType.BIN,
                    dimensionId: item.dimensionId,
                    binType: values.binType,
                    binNumber: values.binConfig.fixedNumber.binNumber,
                    binWidth: values.binConfig.fixedWidth.binWidth,
                    table: item.table,
                    customRange: values.binConfig.customRange,
                };
                const updatedDimensions = (customDimensions ?? []).map((dim) =>
                    dim.id === item.id ? updatedDimension : dim,
                );
                dispatch(
                    explorerActions.setCustomDimensions(updatedDimensions),
                );

                showToastSuccess({
                    title: 'Custom dimension edited successfully',
                });
            } else {
                dispatch(
                    explorerActions.addCustomDimension({
                        id: sanitizedId,
                        name: values.customDimensionLabel,
                        type: CustomDimensionType.BIN,
                        dimensionId: getItemId(item),
                        binType: values.binType,
                        binNumber: values.binConfig.fixedNumber.binNumber,
                        binWidth: values.binConfig.fixedWidth.binWidth,
                        table: item.table,
                        customRange: values.binConfig.customRange,
                    }),
                );

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

    const handleClose = () => {
        toggleModal();
        form.reset();
    };

    return (
        <MantineModal
            size="lg"
            opened={true}
            onClose={handleClose}
            title={`${
                isEditing ? 'Edit' : 'Create'
            } Custom Dimension - ${baseDimensionLabel}`}
            icon={IconLayoutDashboard}
            actions={
                <Button type="submit" form="custom-bin-dimension-form">
                    {isEditing ? 'Save changes' : 'Create'}
                </Button>
            }
        >
            <form id="custom-bin-dimension-form" onSubmit={handleOnSubmit}>
                <Stack gap="md">
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
                                                gap="sm"
                                                align="center"
                                            >
                                                <Text
                                                    w={100}
                                                    c="ldDark.9"
                                                    fw="400"
                                                    size="xs"
                                                >
                                                    &lt;{toProps.value}{' '}
                                                </Text>

                                                <TextInput
                                                    w={100}
                                                    required
                                                    type="number"
                                                    size="xs"
                                                    {...toProps}
                                                />
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
                                                gap="sm"
                                                align="center"
                                                key={`custom-range.${index}`}
                                            >
                                                <Text
                                                    w={100}
                                                    c="ldDark.9"
                                                    fw="400"
                                                    size="xs"
                                                >
                                                    ≥{fromProps.value}{' '}
                                                </Text>

                                                <TextInput
                                                    w={100}
                                                    required
                                                    type="number"
                                                    size="xs"
                                                    {...fromProps}
                                                />
                                                <Text
                                                    c="ldDark.9"
                                                    fw="400"
                                                    size="xs"
                                                >
                                                    and above{' '}
                                                </Text>
                                            </Flex>
                                        );
                                    } else {
                                        return (
                                            <Flex
                                                gap="sm"
                                                align="center"
                                                key={`custom-range.${index}`}
                                            >
                                                <Text
                                                    w={100}
                                                    c="ldDark.9"
                                                    fw="400"
                                                    size="xs"
                                                >
                                                    ≥{fromProps.value} and &lt;
                                                    {toProps.value}
                                                </Text>

                                                <TextInput
                                                    w={100}
                                                    size="xs"
                                                    required
                                                    type="number"
                                                    {...fromProps}
                                                />
                                                <Text
                                                    c="ldDark.6"
                                                    fw="400"
                                                    size="xs"
                                                >
                                                    to{' '}
                                                </Text>

                                                <TextInput
                                                    w={100}
                                                    size="xs"
                                                    required
                                                    type="number"
                                                    {...toProps}
                                                />

                                                <ActionIcon
                                                    variant="subtle"
                                                    color="ldDark.6"
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

                            <Button
                                c="blue"
                                variant="light"
                                size="compact-xs"
                                fw="400"
                                style={{ alignSelf: 'flex-start' }}
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
                                + Add a range
                            </Button>
                        </>
                    )}
                </Stack>
            </form>
        </MantineModal>
    );
};
