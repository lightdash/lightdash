import {
    assertUnreachable,
    ConditionalFormattingColorApplyTo,
    ConditionalFormattingComparisonType,
    ConditionalFormattingConfigType,
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
    isBooleanItem,
    isConditionalFormattingWithCompareTarget,
    isConditionalFormattingWithValues,
    isNumericItem,
    isStringDimension,
    type ConditionalFormattingColorRange,
    type ConditionalFormattingConfig,
    type ConditionalFormattingConfigWithColorRange,
    type ConditionalFormattingTextStyle,
    type ConditionalFormattingWithFilterOperator,
    type FilterableItem,
    type FilterOperator,
} from '@lightdash/common';
import {
    Accordion,
    ActionIcon,
    Button,
    Flex,
    Group,
    SegmentedControl,
    Stack,
    Tooltip,
} from '@mantine/core';
import {
    IconBold,
    IconItalic,
    IconPlus,
    IconUnderline,
} from '@tabler/icons-react';
import { produce } from 'immer';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import FieldSelect from '../../common/FieldSelect';
import { filterOperatorLabel } from '../../common/Filters/FilterInputs/constants';
import FiltersProvider from '../../common/Filters/FiltersProvider';
import MantineIcon from '../../common/MantineIcon';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import ColorSelector from '../ColorSelector';
import { AccordionControl } from '../common/AccordionControl';
import { Config } from '../common/Config';
import classes from './ConditionalFormattingItem.module.css';
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

const TEXT_STYLE_TOGGLES: {
    key: keyof ConditionalFormattingTextStyle;
    labelKey: string;
    icon: typeof IconBold;
}[] = [
    {
        key: 'bold',
        labelKey: 'tableConditionalFormatting.textStyle.bold',
        icon: IconBold,
    },
    {
        key: 'italic',
        labelKey: 'tableConditionalFormatting.textStyle.italic',
        icon: IconItalic,
    },
    {
        key: 'underline',
        labelKey: 'tableConditionalFormatting.textStyle.underline',
        icon: IconUnderline,
    },
];

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
    const { t } = useTranslation('vizConfig');
    const [config, setConfig] = useState<ConditionalFormattingConfig>(value);
    const [openConditions, setOpenConditions] = useState<string[]>(() =>
        isConditionalFormattingConfigWithSingleColor(value)
            ? value.rules.map((_, i) => `${i}`)
            : [],
    );
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
                    // Reset the config if the field type family changes,
                    // since operators and values are type-specific
                    const getTypeFamily = (
                        f: typeof newField | typeof currentField,
                    ) => {
                        if (isNumericItem(f)) return 'numeric';
                        if (isStringDimension(f)) return 'string';
                        if (isBooleanItem(f)) return 'boolean';
                        return undefined;
                    };
                    const currentFamily =
                        getTypeFamily(currentField) ?? 'numeric';
                    const shouldReset =
                        currentFamily !== getTypeFamily(newField);

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
        if (isConditionalFormattingConfigWithSingleColor(config)) {
            const newIndex = config.rules.length;
            handleChange(
                produce(config, (draft) => {
                    draft.rules.push(
                        createConditionalFormattingRuleWithValues(),
                    );
                }),
            );
            setOpenConditions((prev) => [...prev, `${newIndex}`]);
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
                setOpenConditions((prev) =>
                    prev
                        .filter((v) => v !== `${index}`)
                        .map((v) => {
                            const i = Number(v);
                            return i > index ? `${i - 1}` : v;
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

    const handleChangeApplyTo = useCallback(
        (newApplyTo: ConditionalFormattingColorApplyTo) => {
            handleChange(
                produce(config, (draft) => {
                    draft.applyTo = newApplyTo;
                }),
            );
        },
        [handleChange, config],
    );

    const handleToggleTextStyle = useCallback(
        (key: keyof ConditionalFormattingTextStyle) => {
            handleChange(
                produce(config, (draft) => {
                    const current = draft.textStyle ?? {};
                    draft.textStyle = { ...current, [key]: !current[key] };
                }),
            );
        },
        [handleChange, config],
    );

    const controlLabel = t('tableConditionalFormatting.ruleNumber', {
        number: configIndex,
    });
    const accordionValue = `${configIndex}`;

    const description = useMemo(() => {
        if (!field) return t('tableConditionalFormatting.noConditionSet');

        if (isConditionalFormattingConfigWithColorRange(config)) {
            const min =
                config.rule.min === 'auto'
                    ? t('tableConditionalFormatting.minInTable')
                    : config.rule.min;
            const max =
                config.rule.max === 'auto'
                    ? t('tableConditionalFormatting.maxInTable')
                    : config.rule.max;
            return t('tableConditionalFormatting.rangeSummary', { min, max });
        }

        if (
            isConditionalFormattingConfigWithSingleColor(config) &&
            config.rules.length > 0
        ) {
            const firstRule = config.rules[0];
            const operator =
                filterOperatorLabel[firstRule.operator] ?? firstRule.operator;
            const values = isConditionalFormattingWithValues(firstRule)
                ? (firstRule.values ?? []).join(', ')
                : '';
            const ruleStr = values ? `${operator} ${values}` : operator;
            const extraCount = config.rules.length - 1;
            return extraCount > 0
                ? t('tableConditionalFormatting.ruleSummaryWithExtra', {
                      rule: ruleStr,
                      count: extraCount,
                  })
                : ruleStr;
        }

        return t('tableConditionalFormatting.noConditionSet');
    }, [config, field, t]);

    const onControlClick = useCallback(
        () =>
            isOpen ? removeItem(accordionValue) : addNewItem(accordionValue),
        [isOpen, removeItem, addNewItem, accordionValue],
    );

    const colorSelected = isConditionalFormattingConfigWithSingleColor(config)
        ? { color: config.color }
        : { color: config.color.start, secondaryColor: config.color.end };
    return (
        <Accordion.Item value={accordionValue} className={classes.ruleItem}>
            <AccordionControl
                label={
                    field ? getItemLabelWithoutTableName(field) : controlLabel
                }
                description={description}
                extraControlElements={
                    <ColorSelector {...colorSelected} swatches={colorPalette} />
                }
                onControlClick={onControlClick}
                onRemove={handleRemove}
            />
            <Accordion.Panel className={classes.rulePanel}>
                <Stack gap="xs">
                    <FiltersProvider>
                        <FieldSelect
                            label={
                                <Config.Label>
                                    {t(
                                        'tableConditionalFormatting.selectField',
                                    )}
                                </Config.Label>
                            }
                            clearable
                            size="xs"
                            item={field}
                            items={fields}
                            onChange={handleChangeField}
                            hasGrouping
                        />

                        <Stack gap={4}>
                            <Config.Label>
                                {t('tableConditionalFormatting.colorMode')}
                            </Config.Label>
                            <SegmentedControl
                                fullWidth
                                data={[
                                    {
                                        value: ConditionalFormattingConfigType.Single,
                                        label: t(
                                            'tableConditionalFormatting.configType.single',
                                        ),
                                    },
                                    {
                                        value: ConditionalFormattingConfigType.Range,
                                        label: t(
                                            'tableConditionalFormatting.configType.range',
                                        ),
                                        disabled:
                                            field && !isNumericItem(field),
                                    },
                                ]}
                                value={getConditionalFormattingConfigType(
                                    config,
                                )}
                                onChange={(value) => {
                                    handleConfigTypeChange(
                                        value as ConditionalFormattingConfigType,
                                    );
                                }}
                            />
                        </Stack>

                        {isConditionalFormattingConfigWithSingleColor(
                            config,
                        ) ? (
                            <Group gap="xs">
                                <Config.Label>
                                    {t('tableConditionalFormatting.color')}
                                </Config.Label>
                                <ColorSelector
                                    color={config.color}
                                    swatches={colorPalette}
                                    onColorChange={handleChangeSingleColor}
                                />
                            </Group>
                        ) : null}

                        <Group gap="xs">
                            <Config.Label>
                                {t('tableConditionalFormatting.applyTo')}
                            </Config.Label>

                            <SegmentedControl
                                data={[
                                    {
                                        value: ConditionalFormattingColorApplyTo.CELL,
                                        label: t(
                                            'tableConditionalFormatting.applyToCell',
                                        ),
                                    },
                                    {
                                        value: ConditionalFormattingColorApplyTo.TEXT,
                                        label: t(
                                            'tableConditionalFormatting.applyToText',
                                        ),
                                    },
                                    // Row fill only applies to single-color rules;
                                    // color-range (gradient) rules ignore ROW, so
                                    // don't offer a dead option for them.
                                    ...(isConditionalFormattingConfigWithSingleColor(
                                        config,
                                    )
                                        ? [
                                              {
                                                  value: ConditionalFormattingColorApplyTo.ROW,
                                                  label: t(
                                                      'tableConditionalFormatting.applyToRow',
                                                  ),
                                              },
                                          ]
                                        : []),
                                ]}
                                value={
                                    config.applyTo ??
                                    ConditionalFormattingColorApplyTo.CELL
                                }
                                onChange={(value) =>
                                    handleChangeApplyTo(
                                        value as ConditionalFormattingColorApplyTo,
                                    )
                                }
                            />
                        </Group>

                        <Group gap="xs">
                            <Config.Label>
                                {t(
                                    'tableConditionalFormatting.textStyle.label',
                                )}
                            </Config.Label>
                            <ActionIcon.Group>
                                {TEXT_STYLE_TOGGLES.map(
                                    ({ key, labelKey, icon }) => (
                                        <Tooltip key={key} label={t(labelKey)}>
                                            <ActionIcon
                                                variant={
                                                    config.textStyle?.[key]
                                                        ? 'filled'
                                                        : 'default'
                                                }
                                                aria-label={t(labelKey)}
                                                onClick={() =>
                                                    handleToggleTextStyle(key)
                                                }
                                            >
                                                <MantineIcon
                                                    icon={icon}
                                                    size="sm"
                                                />
                                            </ActionIcon>
                                        </Tooltip>
                                    ),
                                )}
                            </ActionIcon.Group>
                        </Group>

                        {isConditionalFormattingConfigWithSingleColor(
                            config,
                        ) ? (
                            <>
                                <Flex justify="space-between">
                                    <Config.Label>
                                        {t(
                                            'tableConditionalFormatting.conditions',
                                        )}
                                    </Config.Label>
                                    <Button
                                        size="compact-xs"
                                        variant="subtle"
                                        disabled={!field}
                                        title={
                                            !field
                                                ? t(
                                                      'tableConditionalFormatting.selectFieldFirst',
                                                  )
                                                : undefined
                                        }
                                        leftSection={
                                            <MantineIcon
                                                icon={IconPlus}
                                                size="sm"
                                            />
                                        }
                                        onClick={handleAddRule}
                                    >
                                        {t('actions.add', { ns: 'common' })}
                                    </Button>
                                </Flex>
                                <Accordion
                                    multiple
                                    chevronPosition="right"
                                    variant="contained"
                                    className={classes.conditionsGroup}
                                    value={field ? openConditions : []}
                                    onChange={setOpenConditions}
                                >
                                    {config.rules.map((rule, ruleIndex) => (
                                        <ConditionalFormattingRule
                                            key={ruleIndex}
                                            accordionValue={`${ruleIndex}`}
                                            hasRemove={config.rules.length > 1}
                                            disabled={!field}
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
                                    ))}
                                </Accordion>
                            </>
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
                    </FiltersProvider>
                </Stack>
            </Accordion.Panel>
        </Accordion.Item>
    );
};
