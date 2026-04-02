import {
    assertUnreachable,
    BinType,
    CustomDimensionType,
    DimensionType,
    getItemId,
    GroupValueMatchType,
    isCustomBinDimension,
    isCustomDimension,
    isDimension,
    snakeCaseName,
    type BinGroup,
    type BinRange,
    type CustomBinDimension,
    type Dimension,
    type GroupValueRule,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Flex,
    Group,
    Menu,
    NumberInput,
    Radio,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { useForm, zodResolver, type UseFormReturnType } from '@mantine/form';
import {
    IconArrowsTransferDown,
    IconLayoutDashboard,
    IconX,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FC } from 'react';
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
import classes from './CustomBinDimensionModal.module.css';

// TODO: preview custom dimension results

const sanitizeId = (label: string, dimensionName: string) =>
    `${dimensionName}_${snakeCaseName(label)}`;

const MIN_OF_FIXED_NUMBER_BINS = 1;
const DEFAULT_CUSTOM_RANGE: BinRange[] = [
    { to: 0, from: undefined },
    { from: 1, to: undefined },
];

type FormGroupValueRule = GroupValueRule & { _id: string };
type FormBinGroup = Omit<BinGroup, 'values'> & {
    _id: string;
    values: FormGroupValueRule[];
};

const makeFormGroup = (group: BinGroup): FormBinGroup => ({
    ...group,
    _id: crypto.randomUUID(),
    values: group.values.map((v) => ({ ...v, _id: crypto.randomUUID() })),
});

const stripFormIds = (groups: FormBinGroup[]): BinGroup[] =>
    groups.map(({ _id, values, ...rest }) => ({
        ...rest,
        values: values.map(({ _id: _, ...v }) => v),
    }));

const createDefaultCustomGroups = (): FormBinGroup[] => [
    makeFormGroup({ name: 'Group 1', values: [] }),
];

const MATCH_TYPE_OPTIONS = [
    { value: GroupValueMatchType.EXACT, label: 'is' },
    { value: GroupValueMatchType.STARTS_WITH, label: 'starts with' },
    { value: GroupValueMatchType.ENDS_WITH, label: 'ends with' },
    { value: GroupValueMatchType.INCLUDES, label: 'includes' },
];

const createDefaultValueRule = (): FormGroupValueRule => ({
    _id: crypto.randomUUID(),
    matchType: GroupValueMatchType.EXACT,
    value: '',
});

const isStringBinType = (binType: BinType) => binType === BinType.CUSTOM_GROUP;

const buildCustomBinDimension = (
    base: { id: string; name: string; table: string; dimensionId: string },
    values: FormValues,
): CustomBinDimension => {
    const common = {
        ...base,
        type: CustomDimensionType.BIN as const,
    };
    switch (values.binType) {
        case BinType.FIXED_NUMBER:
            return {
                ...common,
                binType: BinType.FIXED_NUMBER,
                binNumber: values.binConfig.fixedNumber.binNumber,
            };
        case BinType.FIXED_WIDTH:
            return {
                ...common,
                binType: BinType.FIXED_WIDTH,
                binWidth: values.binConfig.fixedWidth.binWidth,
            };
        case BinType.CUSTOM_RANGE:
            return {
                ...common,
                binType: BinType.CUSTOM_RANGE,
                customRange: values.binConfig.customRange as BinRange[],
            };
        case BinType.CUSTOM_GROUP:
            return {
                ...common,
                binType: BinType.CUSTOM_GROUP,
                customGroups: stripFormIds(values.binConfig.customGroups),
            };
        default:
            return assertUnreachable(values.binType, `Unknown bin type`);
    }
};

type FormValues = {
    customDimensionLabel: string;
    binType: BinType;
    binConfig: {
        fixedNumber: { binNumber: number };
        fixedWidth: { binWidth: number };
        customRange: Array<{ from?: number; to?: number }>;
        customGroups: FormBinGroup[];
    };
};

const GroupValueRow: FC<{
    form: UseFormReturnType<FormValues>;
    groupIndex: number;
    valueIndex: number;
    onAddValueAfter: (groupIndex: number, valueIndex: number) => void;
}> = ({ form, groupIndex, valueIndex, onAddValueAfter }) => {
    const groups = form.values.binConfig.customGroups;

    return (
        <Flex gap="sm" align="center" ml="md">
            <Select
                size="xs"
                w={110}
                data={MATCH_TYPE_OPTIONS}
                allowDeselect={false}
                {...form.getInputProps(
                    `binConfig.customGroups.${groupIndex}.values.${valueIndex}.matchType`,
                )}
            />
            <TextInput
                flex={1}
                size="xs"
                placeholder="Enter a value"
                data-focus-id={`custom-group-${groupIndex}-value-${valueIndex}`}
                {...form.getInputProps(
                    `binConfig.customGroups.${groupIndex}.values.${valueIndex}.value`,
                )}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        onAddValueAfter(groupIndex, valueIndex);
                    }
                }}
            />
            {groups.length > 1 && (
                <Menu position="bottom-end" withinPortal>
                    <Menu.Target>
                        <ActionIcon
                            variant="subtle"
                            color="ldDark.4"
                            size="sm"
                            title="Move to group"
                        >
                            <MantineIcon icon={IconArrowsTransferDown} />
                        </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Label>Move to group</Menu.Label>
                        {groups.map((targetGroup, targetIndex) =>
                            targetIndex !== groupIndex ? (
                                <Menu.Item
                                    key={targetGroup._id}
                                    onClick={() => {
                                        const movedValue =
                                            groups[groupIndex].values[
                                                valueIndex
                                            ];
                                        const newGroups = groups.map((g, i) => {
                                            if (i === groupIndex) {
                                                return {
                                                    ...g,
                                                    values: g.values.filter(
                                                        (_, j) =>
                                                            j !== valueIndex,
                                                    ),
                                                };
                                            }
                                            if (i === targetIndex) {
                                                return {
                                                    ...g,
                                                    values: [
                                                        ...g.values,
                                                        movedValue,
                                                    ],
                                                };
                                            }
                                            return g;
                                        });
                                        form.setFieldValue(
                                            'binConfig.customGroups',
                                            newGroups,
                                        );
                                    }}
                                >
                                    {targetGroup.name ||
                                        `Group ${targetIndex + 1}`}
                                </Menu.Item>
                            ) : null,
                        )}
                    </Menu.Dropdown>
                </Menu>
            )}
            <ActionIcon
                variant="subtle"
                color="ldDark.6"
                size="sm"
                onClick={() => {
                    const newGroups = groups.map((g, i) =>
                        i === groupIndex
                            ? {
                                  ...g,
                                  values: g.values.filter(
                                      (_, j) => j !== valueIndex,
                                  ),
                              }
                            : g,
                    );
                    form.setFieldValue('binConfig.customGroups', newGroups);
                }}
            >
                <MantineIcon icon={IconX} />
            </ActionIcon>
        </Flex>
    );
};

const CustomGroupCard: FC<{
    form: UseFormReturnType<FormValues>;
    groupIndex: number;
    onAddValue: (groupIndex: number, afterValueIndex?: number) => void;
}> = ({ form, groupIndex, onAddValue }) => {
    const groups = form.values.binConfig.customGroups;
    const group = groups[groupIndex];

    return (
        <Stack className={classes.groupCard} gap="xs" p="sm">
            <Flex gap="sm" align="center">
                <TextInput
                    flex={1}
                    size="sm"
                    label="Group name"
                    required
                    placeholder="e.g. North America"
                    {...form.getInputProps(
                        `binConfig.customGroups.${groupIndex}.name`,
                    )}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            onAddValue(groupIndex);
                        }
                    }}
                />
                {groups.length > 1 && (
                    <ActionIcon
                        variant="subtle"
                        color="ldDark.6"
                        mt="xl"
                        onClick={() => {
                            const newGroups = [...groups];
                            newGroups.splice(groupIndex, 1);
                            form.setFieldValue(
                                'binConfig.customGroups',
                                newGroups,
                            );
                        }}
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                )}
            </Flex>

            {group.values.map((value, valueIndex) => (
                <GroupValueRow
                    key={value._id}
                    form={form}
                    groupIndex={groupIndex}
                    valueIndex={valueIndex}
                    onAddValueAfter={onAddValue}
                />
            ))}

            <Button
                variant="light"
                size="compact-xs"
                fw="400"
                ml="md"
                className={classes.addButton}
                onClick={() => onAddValue(groupIndex)}
            >
                + Add a value
            </Button>
        </Stack>
    );
};

export const CustomBinDimensionModal: FC<{
    isEditing: boolean;
    item: Dimension | CustomBinDimension;
}> = ({ isEditing, item }) => {
    const { showToastSuccess } = useToaster();
    const dispatch = useExplorerDispatch();
    const customDimensions = useExplorerSelector(selectCustomDimensions);

    const isStringDimension = useMemo(() => {
        if (isDimension(item)) {
            return item.type === DimensionType.STRING;
        }
        if (isCustomBinDimension(item)) {
            return isStringBinType(item.binType);
        }
        return false;
    }, [item]);

    const toggleModal = () =>
        dispatch(explorerActions.toggleCustomDimensionModal());

    const formSchema = z
        .object({
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
                        (customDimension) =>
                            customDimension.id === dimensionName,
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
                customGroups: z.array(
                    z.object({
                        _id: z.string(),
                        name: z.string(),
                        values: z.array(
                            z.object({
                                _id: z.string(),
                                matchType: z.nativeEnum(GroupValueMatchType),
                                value: z.string(),
                            }),
                        ),
                    }),
                ),
            }),
        })
        .superRefine((data, ctx) => {
            if (data.binType === BinType.CUSTOM_GROUP) {
                data.binConfig.customGroups.forEach((group, groupIndex) => {
                    if (group.name.trim().length === 0) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.too_small,
                            minimum: 1,
                            type: 'string',
                            inclusive: true,
                            message: 'Group name is required',
                            path: [
                                'binConfig',
                                'customGroups',
                                groupIndex,
                                'name',
                            ],
                        });
                    }
                    if (group.values.length === 0) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.too_small,
                            minimum: 1,
                            type: 'array',
                            inclusive: true,
                            message: 'Each group must have at least one value',
                            path: [
                                'binConfig',
                                'customGroups',
                                groupIndex,
                                'values',
                            ],
                        });
                    }
                    group.values.forEach((value, valueIndex) => {
                        if (value.value.trim().length === 0) {
                            ctx.addIssue({
                                code: z.ZodIssueCode.too_small,
                                minimum: 1,
                                type: 'string',
                                inclusive: true,
                                message: 'Value is required',
                                path: [
                                    'binConfig',
                                    'customGroups',
                                    groupIndex,
                                    'values',
                                    valueIndex,
                                    'value',
                                ],
                            });
                        }
                    });
                });
            }
        });

    const form = useForm<FormValues>({
        initialValues: {
            customDimensionLabel: '',
            binType: isStringDimension
                ? BinType.CUSTOM_GROUP
                : BinType.FIXED_NUMBER,
            binConfig: {
                fixedNumber: {
                    binNumber: MIN_OF_FIXED_NUMBER_BINS,
                },
                fixedWidth: {
                    binWidth: MIN_OF_FIXED_NUMBER_BINS,
                },
                customRange: DEFAULT_CUSTOM_RANGE,
                customGroups: createDefaultCustomGroups(),
            },
        },
        validate: zodResolver(formSchema),
    });

    const { setFieldValue } = form;

    useEffect(() => {
        if (isEditing && isCustomDimension(item)) {
            setFieldValue('customDimensionLabel', item.name);
            setFieldValue('binType', item.binType);
            switch (item.binType) {
                case BinType.FIXED_NUMBER:
                    setFieldValue(
                        'binConfig.fixedNumber.binNumber',
                        item.binNumber,
                    );
                    break;
                case BinType.FIXED_WIDTH:
                    setFieldValue(
                        'binConfig.fixedWidth.binWidth',
                        item.binWidth,
                    );
                    break;
                case BinType.CUSTOM_RANGE:
                    setFieldValue(
                        'binConfig.customRange',
                        structuredClone(item.customRange),
                    );
                    break;
                case BinType.CUSTOM_GROUP:
                    setFieldValue(
                        'binConfig.customGroups',
                        item.customGroups.map(makeFormGroup),
                    );
                    break;
                default:
                    break;
            }
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
                const updatedDimension = buildCustomBinDimension(
                    {
                        id: item.id,
                        name: values.customDimensionLabel,
                        table: item.table,
                        dimensionId: item.dimensionId,
                    },
                    values,
                );
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
                    explorerActions.addCustomDimension(
                        buildCustomBinDimension(
                            {
                                id: sanitizedId,
                                name: values.customDimensionLabel,
                                table: item.table,
                                dimensionId: getItemId(item),
                            },
                            values,
                        ),
                    ),
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

    const [focusTarget, setFocusTarget] = useState<string | null>(null);

    useEffect(() => {
        if (focusTarget) {
            setFocusTarget(null);
            requestAnimationFrame(() => {
                const el = document.querySelector<HTMLInputElement>(
                    `[data-focus-id="${focusTarget}"]`,
                );
                el?.focus();
            });
        }
    }, [focusTarget]);

    const addValueToGroup = (groupIndex: number, afterValueIndex?: number) => {
        const groups = form.values.binConfig.customGroups;
        const insertAt =
            afterValueIndex !== undefined
                ? afterValueIndex + 1
                : groups[groupIndex].values.length;
        const newGroups = groups.map((g, i) =>
            i === groupIndex
                ? {
                      ...g,
                      values: [
                          ...g.values.slice(0, insertAt),
                          createDefaultValueRule(),
                          ...g.values.slice(insertAt),
                      ],
                  }
                : g,
        );
        form.setFieldValue('binConfig.customGroups', newGroups);
        setFocusTarget(`custom-group-${groupIndex}-value-${insertAt}`);
    };

    const hasEmptyGroups = useMemo(
        () =>
            form.values.binType === BinType.CUSTOM_GROUP &&
            form.values.binConfig.customGroups.some(
                (group) =>
                    group.values.length === 0 ||
                    group.values.some((v) => v.value.trim() === ''),
            ),
        [form.values.binType, form.values.binConfig.customGroups],
    );

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
                <Tooltip
                    label="Each group must have at least one value"
                    disabled={!hasEmptyGroups}
                >
                    <Button
                        type="submit"
                        form="custom-bin-dimension-form"
                        disabled={hasEmptyGroups}
                    >
                        {isEditing ? 'Save changes' : 'Create'}
                    </Button>
                </Tooltip>
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

                    {isStringDimension ? (
                        <Text size="sm" c="ldDark.6">
                            Group values into custom categories. Ungrouped
                            values will be labeled &quot;Other&quot;.
                        </Text>
                    ) : (
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
                    )}

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
                                variant="light"
                                size="compact-xs"
                                fw="400"
                                className={classes.addButton}
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

                    {form.values.binType === BinType.CUSTOM_GROUP && (
                        <>
                            <Text fw={500}>Groups</Text>
                            {form.values.binConfig.customGroups.map(
                                (group, groupIndex) => (
                                    <CustomGroupCard
                                        key={group._id}
                                        form={form}
                                        groupIndex={groupIndex}
                                        onAddValue={addValueToGroup}
                                    />
                                ),
                            )}

                            <Button
                                variant="light"
                                size="compact-xs"
                                fw="400"
                                className={classes.addButton}
                                onClick={() => {
                                    form.setFieldValue(
                                        'binConfig.customGroups',
                                        [
                                            ...form.values.binConfig
                                                .customGroups,
                                            makeFormGroup({
                                                name: '',
                                                values: [],
                                            }),
                                        ],
                                    );
                                }}
                            >
                                + Add a group
                            </Button>

                            <Text size="xs" c="ldDark.6">
                                Values not assigned to any group will be labeled
                                &quot;Other&quot;.
                            </Text>
                        </>
                    )}
                </Stack>
            </form>
        </MantineModal>
    );
};
