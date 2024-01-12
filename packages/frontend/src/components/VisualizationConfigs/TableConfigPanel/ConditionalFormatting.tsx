import {
    assertUnreachable,
    ConditionalFormattingConfig,
    ConditionalFormattingConfigType,
    ConditionalFormattingConfigWithColorRange,
    ConditionalFormattingWithConditionalOperator,
    ConditionalOperator,
    createConditionalFormatingRule,
    createConditionalFormattingConfigWithColorRange,
    createConditionalFormattingConfigWithSingleColor,
    FilterableItem,
    getConditionalFormattingConfigType,
    getItemId,
    hasPercentageFormat,
    isConditionalFormattingConfigWithColorRange,
    isConditionalFormattingConfigWithSingleColor,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Collapse,
    ColorInput,
    Group,
    NumberInput,
    Select,
    SimpleGrid,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconChevronDown,
    IconChevronUp,
    IconPercentage,
    IconPlus,
    IconX,
} from '@tabler/icons-react';
import produce from 'immer';
import React, { FC, useCallback, useMemo, useState } from 'react';
import FieldSelect from '../../common/FieldSelect';
import { FiltersProvider } from '../../common/Filters/FiltersProvider';
import MantineIcon from '../../common/MantineIcon';
import ConditionalFormattingRule from './ConditionalFormattingRule';

interface ConditionalFormattingProps {
    isDefaultOpen?: boolean;
    colorPalette: string[];
    index: number;
    fields: FilterableItem[];
    value: ConditionalFormattingConfig;
    onChange: (newConfig: ConditionalFormattingConfig) => void;
    onRemove: () => void;
}

const ConditionalFormattingRuleLabels = {
    [ConditionalFormattingConfigType.Single]: 'Single color',
    [ConditionalFormattingConfigType.Range]: 'Color range',
};

const ConditionalFormatting: FC<ConditionalFormattingProps> = ({
    isDefaultOpen = true,
    colorPalette,
    index: configIndex,
    fields,
    value,
    onChange,
    onRemove,
}) => {
    const [isAddingRule, setIsAddingRule] = useState(false);
    const [isOpen, setIsOpen] = useState(isDefaultOpen);
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

    return (
        <FiltersProvider>
            <Stack spacing="xs">
                <Group noWrap position="apart">
                    <Group spacing="xs">
                        <ActionIcon
                            onClick={() => setIsOpen(!isOpen)}
                            size="sm"
                        >
                            <MantineIcon
                                icon={isOpen ? IconChevronUp : IconChevronDown}
                            />
                        </ActionIcon>

                        <Text fw={500}>Rule {configIndex + 1}</Text>
                    </Group>

                    <Tooltip label="Remove rule" position="left" withinPortal>
                        <ActionIcon onClick={handleRemove} size="sm">
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
                <Collapse in={isOpen}>
                    <Stack
                        bg={'gray.0'}
                        p="sm"
                        spacing="sm"
                        sx={(theme) => ({
                            borderRadius: theme.radius.sm,
                        })}
                    >
                        <FieldSelect
                            label="Select field"
                            clearable
                            item={field}
                            items={fields}
                            onChange={handleChangeField}
                        />

                        <Select
                            label="Select type"
                            value={getConditionalFormattingConfigType(config)}
                            data={[
                                {
                                    value: ConditionalFormattingConfigType.Single,
                                    label: ConditionalFormattingRuleLabels[
                                        ConditionalFormattingConfigType.Single
                                    ],
                                },
                                {
                                    value: ConditionalFormattingConfigType.Range,
                                    label: ConditionalFormattingRuleLabels[
                                        ConditionalFormattingConfigType.Range
                                    ],
                                },
                            ]}
                            onChange={(
                                newConfigType: ConditionalFormattingConfigType,
                            ) => {
                                handleConfigTypeChange(newConfigType);
                            }}
                        />

                        {isConditionalFormattingConfigWithSingleColor(
                            config,
                        ) ? (
                            <>
                                <ColorInput
                                    withinPortal={false}
                                    withEyeDropper={false}
                                    format="hex"
                                    swatches={colorPalette}
                                    swatchesPerRow={colorPalette.length}
                                    label="Select color"
                                    value={config.color}
                                    onChange={handleChangeSingleColor}
                                />

                                {config.rules.map((rule, ruleIndex) => (
                                    <React.Fragment key={ruleIndex}>
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
                                            <Text fz="xs" fw={600}>
                                                AND
                                            </Text>
                                        )}
                                    </React.Fragment>
                                ))}
                            </>
                        ) : isConditionalFormattingConfigWithColorRange(
                              config,
                          ) ? (
                            <SimpleGrid cols={2}>
                                <ColorInput
                                    withinPortal={false}
                                    withEyeDropper={false}
                                    format="hex"
                                    swatches={colorPalette}
                                    swatchesPerRow={colorPalette.length}
                                    label="Start color"
                                    value={config.color.start}
                                    onChange={(newStartColor) =>
                                        handleChangeColorRangeColor({
                                            start: newStartColor,
                                        })
                                    }
                                />

                                <ColorInput
                                    withinPortal={false}
                                    withEyeDropper={false}
                                    format="hex"
                                    swatches={colorPalette}
                                    swatchesPerRow={colorPalette.length}
                                    label="End color"
                                    value={config.color.end}
                                    onChange={(newEndColor) =>
                                        handleChangeColorRangeColor({
                                            end: newEndColor,
                                        })
                                    }
                                />

                                <NumberInput
                                    label="Min value"
                                    value={config.rule.min}
                                    icon={
                                        hasPercentageFormat(field) ? (
                                            <MantineIcon
                                                icon={IconPercentage}
                                            />
                                        ) : null
                                    }
                                    onChange={(newMin) => {
                                        if (newMin === '') return;

                                        handleChangeColorRangeRule({
                                            min: newMin,
                                        });
                                    }}
                                />

                                <NumberInput
                                    label="Max value"
                                    icon={
                                        hasPercentageFormat(field) ? (
                                            <MantineIcon
                                                icon={IconPercentage}
                                            />
                                        ) : null
                                    }
                                    value={config.rule.max}
                                    onChange={(newMax) => {
                                        if (newMax === '') return;

                                        handleChangeColorRangeRule({
                                            max: newMax,
                                        });
                                    }}
                                />
                            </SimpleGrid>
                        ) : (
                            assertUnreachable(config, 'Unknown config type')
                        )}

                        {isConditionalFormattingConfigWithSingleColor(
                            config,
                        ) ? (
                            <Button
                                sx={{ alignSelf: 'start' }}
                                size="xs"
                                variant="subtle"
                                leftIcon={<MantineIcon icon={IconPlus} />}
                                onClick={handleAddRule}
                            >
                                Add new condition
                            </Button>
                        ) : null}
                    </Stack>
                </Collapse>
            </Stack>
        </FiltersProvider>
    );
};
export default ConditionalFormatting;
