import {
    createConditionalFormattingConfigWithSingleColor,
    getItemId,
    type ConditionalFormattingConfig,
    type ConditionalFormattingConfigWithSingleColor,
    type ConditionalFormattingWithFilterOperator,
    type FilterableItem,
    type FilterOperator,
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

type ItemProps = {
    colorPalette: string[];
    config: ConditionalFormattingConfigWithSingleColor;
    field: FilterableItem | undefined;
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
    field,
    index,
    isOpen,
    onChange,
    onRemove,
    addNewItem,
    removeItem,
}) => {
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

    return (
        <Accordion.Item value={accordionValue}>
            <AccordionControl
                label={`Rule ${index + 1}`}
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
                        disabled
                        size="xs"
                        item={field}
                        items={field ? [field] : []}
                        onChange={() => undefined}
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
    field: FilterableItem | undefined;
    conditionalFormattings: ConditionalFormattingConfig[];
    onSetConditionalFormattings: (
        configs: ConditionalFormattingConfig[],
    ) => void;
};

export const ChartConditionalFormatting: FC<Props> = ({
    colorPalette,
    field,
    conditionalFormattings,
    onSetConditionalFormattings,
}) => {
    const { openItems, handleAccordionChange, addNewItem, removeItem } =
        useControlledAccordion();

    const supportedConfigs = useMemo(
        () =>
            getSupportedChartConditionalFormattingConfigs(
                conditionalFormattings,
            ),
        [conditionalFormattings],
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
        const fieldTarget = field ? { fieldId: getItemId(field) } : null;
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
        field,
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
            setSupportedConfigs(
                produce(supportedConfigs, (draft) => {
                    draft[index] = newConfig;
                }),
            );
        },
        [setSupportedConfigs, supportedConfigs],
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
            >
                {supportedConfigs.map((config, index) => (
                    <ChartConditionalFormattingItem
                        key={configIdsRef.current[index] ?? index}
                        colorPalette={colorPalette}
                        config={config}
                        field={field}
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
