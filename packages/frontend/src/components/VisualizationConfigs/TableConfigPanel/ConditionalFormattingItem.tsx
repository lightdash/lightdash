import {
    assertUnreachable,
    ConditionalFormattingConfigType,
    createConditionalFormatingRule,
    createConditionalFormattingConfigWithColorRange,
    createConditionalFormattingConfigWithSingleColor,
    getConditionalFormattingConfigType,
    getItemId,
    hasPercentageFormat,
    isConditionalFormattingConfigWithColorRange,
    isConditionalFormattingConfigWithSingleColor,
    type ConditionalFormattingConfig,
    type ConditionalFormattingConfigWithColorRange,
    type ConditionalFormattingWithConditionalOperator,
    type ConditionalOperator,
    type FilterableItem,
} from '@lightdash/common';
import {
    Accordion,
    ActionIcon,
    Box,
    Button,
    Divider,
    Group,
    SegmentedControl,
    Stack,
    Tooltip,
} from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { IconPercentage, IconPlus, IconTrash } from '@tabler/icons-react';
import produce from 'immer';
import { Fragment, useCallback, useMemo, useState, type FC } from 'react';
import FieldSelect from '../../common/FieldSelect';
import FilterNumberInput from '../../common/Filters/FilterInputs/FilterNumberInput';
import { FiltersProvider } from '../../common/Filters/FiltersProvider';
import MantineIcon from '../../common/MantineIcon';
import ColorSelector from '../ColorSelector';
import { Config } from '../common/Config';
import ConditionalFormattingRule from './ConditionalFormattingRule';

type Props = {
    isOpen: boolean;
    colorPalette: string[];
    index: number;
    fields: FilterableItem[];
    value: ConditionalFormattingConfig;
    onChange: (newConfig: ConditionalFormattingConfig) => void;
    onRemove: () => void;
    addNewItem: (value: string) => void;
    removeItem: (value: string) => void;
};

const ConditionalFormattingRuleLabels = {
    [ConditionalFormattingConfigType.Single]: 'Single',
    [ConditionalFormattingConfigType.Range]: 'Range',
};

export const ConditionalFormattingItem: FC<Props> = ({
    colorPalette,
    index: configIndex,
    fields,
    isOpen,
    value,
    onChange,
    onRemove,
    addNewItem,
    removeItem,
}) => {
    const [isAddingRule, setIsAddingRule] = useState(false);
    const [config, setConfig] = useState<ConditionalFormattingConfig>(value);

    const field = useMemo(
        () => fields.find((f) => getItemId(f) === config?.target?.fieldId),
        [fields, config],
    );

    const handleRemove = useCallback(() => {
        onRemove();
    }, [onRemove]);

    const handleChange = useCallback(
        (newConfig: ConditionalFormattingConfig) => {
            setConfig(newConfig);
            onChange(newConfig);
        },
        [onChange],
    );

    const handleChangeField = useCallback(
        (newField: FilterableItem | undefined) => {
            handleChange(
                produce(config, (draft) => {
                    draft.target = newField
                        ? { fieldId: getItemId(newField) }
                        : null;
                }),
            );
        },
        [handleChange, config],
    );

    const handleConfigTypeChange = useCallback(
        (newConfigType: ConditionalFormattingConfigType) => {
            switch (newConfigType) {
                case ConditionalFormattingConfigType.Single:
                    return handleChange(
                        createConditionalFormattingConfigWithSingleColor(
                            colorPalette[0],
                            config.target,
                        ),
                    );
                case ConditionalFormattingConfigType.Range:
                    return handleChange(
                        createConditionalFormattingConfigWithColorRange(
                            colorPalette[0],
                            config.target,
                        ),
                    );
                default:
                    return assertUnreachable(
                        newConfigType,
                        'Unknown config type',
                    );
            }
        },
        [handleChange, config, colorPalette],
    );

    const handleAddRule = useCallback(() => {
        setIsAddingRule(true);

        if (isConditionalFormattingConfigWithSingleColor(config)) {
            handleChange(
                produce(config, (draft) => {
                    draft.rules.push(createConditionalFormatingRule());
                }),
            );
        }
    }, [handleChange, config]);

    const handleRemoveRule = useCallback(
        (index: number) => {
            if (isConditionalFormattingConfigWithSingleColor(config)) {
                handleChange(
                    produce(config, (draft) => {
                        draft.rules.splice(index, 1);
                    }),
                );
            }
        },
        [handleChange, config],
    );

    const handleChangeRuleOperator = useCallback(
        (index: number, newOperator: ConditionalOperator) => {
            if (isConditionalFormattingConfigWithSingleColor(config)) {
                handleChange(
                    produce(config, (draft) => {
                        draft.rules[index] = {
                            ...draft.rules[index],
                            operator: newOperator,
                        };
                    }),
                );
            }
        },
        [handleChange, config],
    );

    const handleChangeRule = useCallback(
        (
            index: number,
            newRule: ConditionalFormattingWithConditionalOperator,
        ) => {
            if (isConditionalFormattingConfigWithSingleColor(config)) {
                handleChange(
                    produce(config, (draft) => {
                        // FIXME: check if we can fix this problem in number input
                        draft.rules[index] = {
                            ...newRule,
                            values: newRule.values.map((v) => Number(v)),
                        };
                    }),
                );
            }
        },
        [handleChange, config],
    );

    const handleChangeSingleColor = useCallback(
        (newColor: string) => {
            if (isConditionalFormattingConfigWithSingleColor(config)) {
                handleChange(
                    produce(config, (draft) => {
                        draft.color = newColor;
                    }),
                );
            }
        },
        [handleChange, config],
    );

    const handleChangeColorRangeColor = useCallback(
        (
            newColor: Partial<
                ConditionalFormattingConfigWithColorRange['color']
            >,
        ) => {
            if (isConditionalFormattingConfigWithColorRange(config)) {
                handleChange(
                    produce(config, (draft) => {
                        draft.color = {
                            ...draft.color,
                            ...newColor,
                        };
                    }),
                );
            }
        },
        [handleChange, config],
    );

    const handleChangeColorRangeRule = useCallback(
        (
            newRule: Partial<ConditionalFormattingConfigWithColorRange['rule']>,
        ) => {
            if (isConditionalFormattingConfigWithColorRange(config)) {
                handleChange(
                    produce(config, (draft) => {
                        draft.rule = {
                            ...draft.rule,
                            ...newRule,
                        };
                    }),
                );
            }
        },
        [handleChange, config],
    );

    const { ref, hovered } = useHover<HTMLButtonElement>();
    const controlLabel = `Rule ${configIndex}`;
    const accordionValue = `${configIndex}`;

    return (
        <Accordion.Item value={accordionValue}>
            <Accordion.Control
                ref={ref}
                onClick={() =>
                    isOpen
                        ? removeItem(accordionValue)
                        : addNewItem(accordionValue)
                }
            >
                <Group spacing="xs" position="apart">
                    <Group spacing="xs">
                        <Config.Heading>{controlLabel}</Config.Heading>

                        <Tooltip
                            variant="xs"
                            label="Remove rule"
                            position="left"
                            withinPortal
                        >
                            <ActionIcon
                                onClick={handleRemove}
                                sx={{
                                    visibility: hovered ? 'visible' : 'hidden',
                                }}
                            >
                                <MantineIcon icon={IconTrash} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                </Group>
            </Accordion.Control>

            <Accordion.Panel>
                <Stack spacing="xs">
                    <FiltersProvider>
                        <FieldSelect
                            label="Select field"
                            clearable
                            item={field}
                            items={fields}
                            onChange={handleChangeField}
                            hasGrouping
                        />

                        <Group spacing="xs">
                            <Config.Label>Color</Config.Label>

                            <SegmentedControl
                                data={[
                                    {
                                        value: ConditionalFormattingConfigType.Single,
                                        label: ConditionalFormattingRuleLabels[
                                            ConditionalFormattingConfigType
                                                .Single
                                        ],
                                    },
                                    {
                                        value: ConditionalFormattingConfigType.Range,
                                        label: ConditionalFormattingRuleLabels[
                                            ConditionalFormattingConfigType
                                                .Range
                                        ],
                                    },
                                ]}
                                value={getConditionalFormattingConfigType(
                                    config,
                                )}
                                onChange={(
                                    newConfigType: ConditionalFormattingConfigType,
                                ) => {
                                    handleConfigTypeChange(newConfigType);
                                }}
                            />

                            {isConditionalFormattingConfigWithSingleColor(
                                config,
                            ) ? (
                                <ColorSelector
                                    color={config.color}
                                    swatches={colorPalette}
                                    onColorChange={handleChangeSingleColor}
                                />
                            ) : null}
                        </Group>

                        {isConditionalFormattingConfigWithSingleColor(
                            config,
                        ) ? (
                            <Box
                                p="xs"
                                sx={(theme) => ({
                                    backgroundColor: theme.colors.gray[1],
                                    border: `1px solid ${theme.colors.gray[4]}`,
                                    borderRadius: theme.radius.sm,
                                })}
                            >
                                {config.rules.map((rule, ruleIndex) => (
                                    <Fragment key={ruleIndex}>
                                        <ConditionalFormattingRule
                                            isDefaultOpen={
                                                config.rules.length === 1 ||
                                                isAddingRule
                                            }
                                            hasRemove={config.rules.length > 1}
                                            ruleIndex={ruleIndex}
                                            rule={rule}
                                            field={field || fields[0]}
                                            onChangeRule={(newRule) =>
                                                handleChangeRule(
                                                    ruleIndex,
                                                    newRule,
                                                )
                                            }
                                            onChangeRuleOperator={(
                                                newOperator,
                                            ) =>
                                                handleChangeRuleOperator(
                                                    ruleIndex,
                                                    newOperator,
                                                )
                                            }
                                            onRemoveRule={() =>
                                                handleRemoveRule(ruleIndex)
                                            }
                                        />

                                        {ruleIndex !==
                                            config.rules.length - 1 && (
                                            <Divider
                                                mt="xs"
                                                label={
                                                    <Config.Label>
                                                        AND
                                                    </Config.Label>
                                                }
                                                labelPosition="center"
                                            />
                                        )}
                                    </Fragment>
                                ))}
                            </Box>
                        ) : isConditionalFormattingConfigWithColorRange(
                              config,
                          ) ? (
                            <Group spacing="xs" noWrap grow>
                                <Group>
                                    <Stack spacing="one">
                                        <Config.Label>Start</Config.Label>
                                        <ColorSelector
                                            color={config.color.start}
                                            swatches={colorPalette}
                                            onColorChange={(newStartColor) => {
                                                handleChangeColorRangeColor({
                                                    start: newStartColor,
                                                });
                                            }}
                                        />
                                    </Stack>
                                    <Stack spacing="one">
                                        <Config.Label>End</Config.Label>
                                        <ColorSelector
                                            color={config.color.end}
                                            swatches={colorPalette}
                                            onColorChange={(newEndColor) => {
                                                handleChangeColorRangeColor({
                                                    end: newEndColor,
                                                });
                                            }}
                                        />
                                    </Stack>
                                </Group>

                                {/* FIXME: remove this and use NumberInput from @mantine/core once we upgrade to mantine v7 */}
                                {/* INFO: mantine v6 NumberInput does not handle decimal values properly */}
                                <FilterNumberInput
                                    label="Min"
                                    icon={
                                        hasPercentageFormat(field) ? (
                                            <MantineIcon
                                                icon={IconPercentage}
                                            />
                                        ) : null
                                    }
                                    value={config.rule.min}
                                    onChange={(newMin) => {
                                        if (newMin === null) return;

                                        handleChangeColorRangeRule({
                                            min: newMin,
                                        });
                                    }}
                                />

                                {/* FIXME: remove this and use NumberInput from @mantine/core once we upgrade to mantine v7 */}
                                {/* INFO: mantine v6 NumberInput does not handle decimal values properly */}
                                <FilterNumberInput
                                    label="Max"
                                    icon={
                                        hasPercentageFormat(field) ? (
                                            <MantineIcon
                                                icon={IconPercentage}
                                            />
                                        ) : null
                                    }
                                    value={config.rule.max}
                                    onChange={(newMax) => {
                                        if (newMax === null) return;

                                        handleChangeColorRangeRule({
                                            max: newMax,
                                        });
                                    }}
                                />
                            </Group>
                        ) : (
                            assertUnreachable(config, 'Unknown config type')
                        )}

                        {isConditionalFormattingConfigWithSingleColor(
                            config,
                        ) ? (
                            <Button
                                sx={{ alignSelf: 'start' }}
                                variant="subtle"
                                leftIcon={<MantineIcon icon={IconPlus} />}
                                onClick={handleAddRule}
                            >
                                Add new condition
                            </Button>
                        ) : null}
                    </FiltersProvider>
                </Stack>
            </Accordion.Panel>
        </Accordion.Item>
    );
};
