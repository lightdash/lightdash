import {
    assertUnreachable,
    ConditionalFormattingConfigType,
    type ConditionalFormattingColorRange,
    type ConditionalFormattingMinMaxMap,
    createConditionalFormatingRule,
    createConditionalFormattingConfigWithColorRange,
    createConditionalFormattingConfigWithSingleColor,
    getConditionalFormattingConfigType,
    getItemId,
    getItemLabelWithoutTableName,
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
    minMaxByFieldId: ConditionalFormattingMinMaxMap;
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
    minMaxByFieldId,
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

    const columnMinMax = useMemo(() => {
        if (!field) return null;
        return minMaxByFieldId[getItemId(field)];
    }, [field, minMaxByFieldId]);

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
                        console.log({
                            ...draft.rule,
                            ...newRule,
                        });

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
                                            minMax={columnMinMax}
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
