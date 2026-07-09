import {
    createConditionalFormattingConfigWithSingleColor,
    FilterOperator,
    getItemId,
    isConditionalFormattingWithCompareTarget,
    isConditionalFormattingWithValues,
    type ConditionalFormattingConfig,
    type ConditionalFormattingConfigWithSingleColor,
    type ConditionalFormattingWithFilterOperator,
    type FilterableItem,
} from '@lightdash/common';
import { Accordion, Divider, Group } from '@mantine-8/core';
import { produce } from 'immer';
import {
    Fragment,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    type FC,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import FieldSelect from '../../../common/FieldSelect';
import { filterOperatorLabel } from '../../../common/Filters/FilterInputs/constants';
import ColorSelector from '../../ColorSelector';
import accordionClasses from '../../common/Accordion.module.css';
import { AccordionControl } from '../../common/AccordionControl';
import { AddButton } from '../../common/AddButton';
import { Config } from '../../common/Config';
import { useControlledAccordion } from '../../common/hooks/useControlledAccordion';
import { ChartConditionalFormattingRule } from './ChartConditionalFormattingRule';
import {
    getSupportedChartConditionalFormattingConfigs,
    mergeChartConditionalFormattingConfigs,
} from './chartConditionalFormattingUtils';

// A values-based rule with nothing filled in yet (fresh configs are created
// with an empty `equals` rule)
const isIncompleteRule = (rule: ConditionalFormattingWithFilterOperator) =>
    isConditionalFormattingWithValues(rule) &&
    !isConditionalFormattingWithCompareTarget(rule) &&
    (rule.values ?? []).length === 0 &&
    rule.operator !== FilterOperator.NULL &&
    rule.operator !== FilterOperator.NOT_NULL;

type ItemProps = {
    colorPalette: string[];
    config: ConditionalFormattingConfigWithSingleColor;
    fields: FilterableItem[];
    index: number;
    isOpen: boolean;
    onChange: (config: ConditionalFormattingConfigWithSingleColor) => void;
    onRemove: () => void;
    addNewItem: (value: string) => void;
    removeItem: (value: string) => void;
};

const ChartConditionalFormattingItem: FC<ItemProps> = ({
    colorPalette,
    config,
    fields,
    index,
    isOpen,
    onChange,
    onRemove,
    addNewItem,
    removeItem,
}) => {
    const field = useMemo(
        () =>
            fields.find(
                (candidate) => getItemId(candidate) === config.target?.fieldId,
            ),
        [fields, config.target?.fieldId],
    );
    const accordionValue = `${index}`;

    const handleControlClick = useCallback(() => {
        if (isOpen) {
            removeItem(accordionValue);
        } else {
            addNewItem(accordionValue);
        }
    }, [accordionValue, addNewItem, isOpen, removeItem]);

    const handleAddRule = useCallback(() => {
        onChange(
            produce(config, (draft) => {
                draft.rules.push({
                    id: uuidv4(),
                    operator: 'equals' as FilterOperator,
                    values: [],
                });
            }),
        );
        addNewItem(accordionValue);
    }, [accordionValue, addNewItem, config, onChange]);

    const handleRemoveRule = useCallback(
        (ruleIndex: number) => {
            onChange(
                produce(config, (draft) => {
                    draft.rules.splice(ruleIndex, 1);
                }),
            );
        },
        [config, onChange],
    );

    const handleChangeRule = useCallback(
        (
            ruleIndex: number,
            nextRule: ConditionalFormattingWithFilterOperator,
        ) => {
            onChange(
                produce(config, (draft) => {
                    draft.rules[ruleIndex] = nextRule;
                }),
            );
        },
        [config, onChange],
    );

    const handleChangeRuleOperator = useCallback(
        (ruleIndex: number, operator: FilterOperator) => {
            onChange(
                produce(config, (draft) => {
                    draft.rules[ruleIndex] = {
                        ...draft.rules[ruleIndex],
                        operator,
                    };
                }),
            );
        },
        [config, onChange],
    );

    const description = useMemo(() => {
        if (config.rules.length === 0) return 'No condition set';
        const firstRule = config.rules[0];
        if (isIncompleteRule(firstRule)) return 'No condition set';
        const operator =
            filterOperatorLabel[firstRule.operator] ?? firstRule.operator;
        const values = isConditionalFormattingWithValues(firstRule)
            ? (firstRule.values ?? []).join(', ')
            : '';
        const ruleStr = values ? `${operator} ${values}` : operator;
        const extraCount = config.rules.length - 1;
        const extra =
            extraCount > 0
                ? ` +${extraCount} ${extraCount === 1 ? 'rule' : 'rules'}`
                : '';
        return `${ruleStr}${extra}`;
    }, [config.rules]);

    return (
        <Accordion.Item value={accordionValue}>
            <AccordionControl
                label={`Rule ${index + 1}`}
                description={description}
                extraControlElements={
                    <ColorSelector
                        color={config.color}
                        swatches={colorPalette}
                        readOnly
                    />
                }
                onControlClick={handleControlClick}
                onRemove={onRemove}
            />
            <Accordion.Panel>
                <Config.Section>
                    <FieldSelect
                        disabled={fields.length <= 1}
                        size="xs"
                        item={field}
                        items={fields}
                        onChange={(newField) => {
                            if (!newField) return;
                            onChange({
                                ...config,
                                target: { fieldId: getItemId(newField) },
                            });
                        }}
                        hasGrouping
                        label={<Config.Label>Select Field</Config.Label>}
                    />
                    <Group gap="xs">
                        <Config.Label>Color</Config.Label>
                        <ColorSelector
                            color={config.color}
                            swatches={colorPalette}
                            onColorChange={(color) =>
                                onChange({
                                    ...config,
                                    color,
                                })
                            }
                        />
                    </Group>
                    {config.rules.map((rule, ruleIndex) => (
                        <Fragment key={rule.id ?? ruleIndex}>
                            <ChartConditionalFormattingRule
                                field={field}
                                rule={rule}
                                ruleIndex={ruleIndex}
                                hasRemove={config.rules.length > 1}
                                onChangeRule={(newRule) =>
                                    handleChangeRule(ruleIndex, newRule)
                                }
                                onChangeRuleOperator={(operator) =>
                                    handleChangeRuleOperator(
                                        ruleIndex,
                                        operator,
                                    )
                                }
                                onRemoveRule={() => handleRemoveRule(ruleIndex)}
                            />
                            {ruleIndex !== config.rules.length - 1 && (
                                <Divider
                                    mt="xs"
                                    label={<Config.Label>AND</Config.Label>}
                                    labelPosition="center"
                                />
                            )}
                        </Fragment>
                    ))}
                    <AddButton onClick={handleAddRule}>Add condition</AddButton>
                </Config.Section>
            </Accordion.Panel>
        </Accordion.Item>
    );
};

type Props = {
    colorPalette: string[];
    fields: FilterableItem[];
    // When true, all rules share a single target field (stacked charts)
    enforceSingleTarget: boolean;
    conditionalFormattings: ConditionalFormattingConfig[];
    onSetConditionalFormattings: (
        configs: ConditionalFormattingConfig[],
    ) => void;
};

export const ChartConditionalFormatting: FC<Props> = ({
    colorPalette,
    fields,
    enforceSingleTarget,
    conditionalFormattings,
    onSetConditionalFormattings,
}) => {
    const supportedConfigs = useMemo(
        () =>
            getSupportedChartConditionalFormattingConfigs(
                conditionalFormattings,
            ),
        [conditionalFormattings],
    );

    // Expand the rule right away when the panel opens with a single
    // not-yet-configured rule (fresh from the "Apply custom colors" toggle)
    const { openItems, handleAccordionChange, addNewItem, removeItem } =
        useControlledAccordion(
            supportedConfigs.length === 1 &&
                supportedConfigs[0].rules.every(isIncompleteRule)
                ? ['0']
                : [],
        );

    const configIdsRef = useRef<string[]>([]);

    useEffect(() => {
        while (configIdsRef.current.length < supportedConfigs.length) {
            configIdsRef.current.push(uuidv4());
        }
        configIdsRef.current = configIdsRef.current.slice(
            0,
            supportedConfigs.length,
        );
    }, [supportedConfigs.length]);

    const setSupportedConfigs = useCallback(
        (
            nextSupportedConfigs: ConditionalFormattingConfigWithSingleColor[],
        ) => {
            onSetConditionalFormattings(
                mergeChartConditionalFormattingConfigs({
                    previousConfigs: conditionalFormattings,
                    nextSupportedConfigs,
                }),
            );
        },
        [conditionalFormattings, onSetConditionalFormattings],
    );

    const handleAdd = useCallback(() => {
        // With a single shared target, new rules follow the existing one
        const sharedTarget = enforceSingleTarget
            ? supportedConfigs[0]?.target
            : undefined;
        const defaultField = fields[0];
        const fieldTarget =
            sharedTarget ??
            (defaultField ? { fieldId: getItemId(defaultField) } : null);
        setSupportedConfigs(
            produce(supportedConfigs, (draft) => {
                draft.push(
                    createConditionalFormattingConfigWithSingleColor(
                        colorPalette[0],
                        fieldTarget,
                    ),
                );
                addNewItem(`${draft.length - 1}`);
            }),
        );
    }, [
        addNewItem,
        colorPalette,
        enforceSingleTarget,
        fields,
        setSupportedConfigs,
        supportedConfigs,
    ]);

    const handleRemove = useCallback(
        (index: number) => {
            configIdsRef.current.splice(index, 1);
            setSupportedConfigs(
                produce(supportedConfigs, (draft) => {
                    draft.splice(index, 1);
                }),
            );
        },
        [setSupportedConfigs, supportedConfigs],
    );

    const handleChange = useCallback(
        (
            index: number,
            newConfig: ConditionalFormattingConfigWithSingleColor,
        ) => {
            const targetChanged =
                newConfig.target?.fieldId !==
                supportedConfigs[index]?.target?.fieldId;
            setSupportedConfigs(
                produce(supportedConfigs, (draft) => {
                    draft[index] = newConfig;
                    // Single shared target: retarget every rule together
                    if (enforceSingleTarget && targetChanged) {
                        draft.forEach((config, configIndex) => {
                            if (configIndex !== index) {
                                config.target = newConfig.target;
                            }
                        });
                    }
                }),
            );
        },
        [enforceSingleTarget, setSupportedConfigs, supportedConfigs],
    );

    return (
        <Config.Section>
            <Config.Group>
                <Config.Heading>Rules and Conditions</Config.Heading>
                <AddButton onClick={handleAdd} />
            </Config.Group>
            <Accordion
                multiple
                variant="contained"
                value={openItems}
                onChange={handleAccordionChange}
                className={accordionClasses.containedList}
                transparentActiveItem
            >
                {supportedConfigs.map((config, index) => (
                    <ChartConditionalFormattingItem
                        key={configIdsRef.current[index] ?? index}
                        colorPalette={colorPalette}
                        config={config}
                        fields={fields}
                        index={index}
                        isOpen={openItems.includes(`${index}`)}
                        onChange={(newConfig) => handleChange(index, newConfig)}
                        onRemove={() => handleRemove(index)}
                        addNewItem={addNewItem}
                        removeItem={removeItem}
                    />
                ))}
            </Accordion>
        </Config.Section>
    );
};
