import {
    ConditionalFormattingComparisonType,
    ConditionalFormattingConfigType,
    assertUnreachable,
    createConditionalFormattingConfigWithColorRange,
    createConditionalFormattingConfigWithSingleColor,
    createConditionalFormattingRuleWithCompareTarget,
    createConditionalFormattingRuleWithCompareTargetValues,
    createConditionalFormattingRuleWithValues,
    getConditionalFormattingConfigType,
    getItemId,
    getItemLabelWithoutTableName,
    isConditionalFormattingConfigWithColorRange,
    isConditionalFormattingConfigWithSingleColor,
    isConditionalFormattingWithCompareTarget,
    isNumericItem,
    isStringDimension,
    type ConditionalFormattingColorRange,
    type ConditionalFormattingConfig,
    type ConditionalFormattingConfigWithColorRange,
    type ConditionalFormattingWithFilterOperator,
    type FilterOperator,
    type FilterableItem,
} from '@lightdash/common';
import {
    Accordion,
    Box,
    Button,
    Divider,
    Group,
    SegmentedControl,
    Stack,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { produce } from 'immer';
import { Fragment, useCallback, useMemo, useState, type FC } from 'react';
import FieldSelect from '../../common/FieldSelect';
import FiltersProvider from '../../common/Filters/FiltersProvider';
import MantineIcon from '../../common/MantineIcon';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import ColorSelector from '../ColorSelector';
import { AccordionControl } from '../common/AccordionControl';
import { Config } from '../common/Config';
import ConditionalFormattingItemColorRange from './ConditionalFormattingItemColorRange';
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
    const { itemsMap } = useVisualizationContext();

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
                    const currentField = draft.target?.fieldId
                        ? itemsMap?.[draft.target?.fieldId]
                        : undefined;
                    // Reset the config if the field type changes
                    // TODO: move to a helper function
                    const shouldReset =
                        ((!currentField || isNumericItem(currentField)) &&
                            isStringDimension(newField)) ||
                        (isStringDimension(currentField) &&
                            isNumericItem(newField));

                    if (shouldReset && newField) {
                        // Reset the config if the field type changes
                        return createConditionalFormattingConfigWithSingleColor(
                            colorPalette[0],
                            { fieldId: getItemId(newField) },
                        );
                    } else if (newField) {
                        // Update the target if the field is changed
                        draft.target = { fieldId: getItemId(newField) };

                        if (
                            isConditionalFormattingConfigWithSingleColor(draft)
                        ) {
                            draft.rules = draft.rules.map((rule) => {
                                // When we're changing the field, we need to be sure that the compareTarget is set to null if it matches the new field
                                // We cannot compare to the same field
                                if (
                                    isConditionalFormattingWithCompareTarget(
                                        rule,
                                    )
                                ) {
                                    if (
                                        getItemId(newField) ===
                                        rule.compareTarget?.fieldId
                                    ) {
                                        return {
                                            ...rule,
                                            compareTarget: null,
                                        };
                                    }
                                }

                                return rule;
                            });
                        }
                    } else {
                        // Reset the config if the field is removed
                        return createConditionalFormattingConfigWithSingleColor(
                            colorPalette[0],
                        );
                    }
                }),
            );
        },
        [handleChange, config, colorPalette, itemsMap],
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
                    draft.rules.push(
                        createConditionalFormattingRuleWithValues(),
                    );
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
        (index: number, newOperator: FilterOperator) => {
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

    const handleChangeRuleComparisonType = useCallback(
        (
            index: number,
            comparisonType: ConditionalFormattingComparisonType,
        ) => {
            if (isConditionalFormattingConfigWithSingleColor(config)) {
                handleChange(
                    produce(config, (draft) => {
                        switch (comparisonType) {
                            case ConditionalFormattingComparisonType.VALUES:
                                draft.rules[index] =
                                    createConditionalFormattingRuleWithValues();
                                break;
                            case ConditionalFormattingComparisonType.TARGET_FIELD:
                                draft.rules[index] =
                                    createConditionalFormattingRuleWithCompareTarget();
                                break;
                            case ConditionalFormattingComparisonType.TARGET_TO_VALUES:
                                draft.rules[index] =
                                    createConditionalFormattingRuleWithCompareTargetValues();
                                break;
                            default:
                                assertUnreachable(
                                    comparisonType,
                                    'Unknown comparison type',
                                );
                        }
                    }),
                );
            }
        },
        [handleChange, config],
    );

    const handleChangeRule = useCallback(
        (index: number, newRule: ConditionalFormattingWithFilterOperator) => {
            if (isConditionalFormattingConfigWithSingleColor(config)) {
                handleChange(
                    produce(config, (draft) => {
                        draft.rules[index] = newRule;
                    }),
                );
            }
        },
        [config, handleChange],
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
        (newColor: Partial<ConditionalFormattingColorRange>) => {
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

    const controlLabel = `Rule ${configIndex}`;
    const accordionValue = `${configIndex}`;

    const onControlClick = useCallback(
        () =>
            isOpen ? removeItem(accordionValue) : addNewItem(accordionValue),
        [isOpen, removeItem, addNewItem, accordionValue],
    );

    return (
        <Accordion.Item value={accordionValue}>
            <AccordionControl
                label={
                    field ? getItemLabelWithoutTableName(field) : controlLabel
                }
                extraControlElements={
                    <ColorSelector
                        color={
                            isConditionalFormattingConfigWithSingleColor(config)
                                ? config.color
                                : config.color.start
                        }
                        swatches={colorPalette}
                    />
                }
                onControlClick={onControlClick}
                onRemove={handleRemove}
            />
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
                                        disabled:
                                            field && !isNumericItem(field),
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
                                            field={field}
                                            fields={fields}
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
                                            onChangeRuleComparisonType={(
                                                newComparisonType,
                                            ) =>
                                                handleChangeRuleComparisonType(
                                                    ruleIndex,
                                                    newComparisonType,
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
                            <ConditionalFormattingItemColorRange
                                config={config}
                                field={field}
                                colorPalette={colorPalette}
                                onChangeColorRange={handleChangeColorRangeColor}
                                onChangeMinMax={handleChangeColorRangeRule}
                            />
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
