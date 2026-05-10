import {
    createConditionalFormattingRuleWithValues,
    isConditionalFormattingConfigWithSingleColor,
    type ConditionalFormattingConfig,
    type ConditionalFormattingWithFilterOperator,
    type FilterableItem,
    type FilterOperator,
} from '@lightdash/common';
import {
    Accordion,
    Button,
    Flex,
    Group,
    Stack,
    useMantineColorScheme,
} from '@mantine-8/core';
import { IconMoon, IconPlus, IconSun } from '@tabler/icons-react';
import { produce } from 'immer';
import { useCallback, useState, type FC } from 'react';
import FiltersProvider from '../../common/Filters/FiltersProvider';
import MantineIcon from '../../common/MantineIcon';
import ColorSelector from '../ColorSelector';
import { AccordionControl } from '../common/AccordionControl';
import { Config } from '../common/Config';
import classes from './BigNumberConditionalFormattingItem.module.css';
import BigNumberConditionalFormattingRule from './BigNumberConditionalFormattingRule';

type Props = {
    colorPalette: string[];
    index: number;
    field: FilterableItem | undefined;
    value: ConditionalFormattingConfig;
    onChange: (newConfig: ConditionalFormattingConfig) => void;
    onRemove: () => void;
};

export const BigNumberConditionalFormattingItem: FC<Props> = ({
    colorPalette,
    index: configIndex,
    field,
    value,
    onChange,
    onRemove,
}) => {
    const { colorScheme } = useMantineColorScheme();
    const [openConditions, setOpenConditions] = useState<string[]>(() =>
        isConditionalFormattingConfigWithSingleColor(value)
            ? value.rules.map((_, i) => `${i}`)
            : [],
    );

    const handleAddRule = useCallback(() => {
        if (isConditionalFormattingConfigWithSingleColor(value)) {
            const newIndex = value.rules.length;
            onChange(
                produce(value, (draft) => {
                    draft.rules.push(
                        createConditionalFormattingRuleWithValues(),
                    );
                }),
            );
            setOpenConditions((prev) => [...prev, `${newIndex}`]);
        }
    }, [onChange, value]);

    const handleRemoveRule = useCallback(
        (index: number) => {
            if (isConditionalFormattingConfigWithSingleColor(value)) {
                onChange(
                    produce(value, (draft) => {
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
        [onChange, value],
    );

    const handleChangeRuleOperator = useCallback(
        (index: number, newOperator: FilterOperator) => {
            if (isConditionalFormattingConfigWithSingleColor(value)) {
                onChange(
                    produce(value, (draft) => {
                        draft.rules[index] = {
                            ...draft.rules[index],
                            operator: newOperator,
                        };
                    }),
                );
            }
        },
        [onChange, value],
    );

    const handleChangeRule = useCallback(
        (index: number, newRule: ConditionalFormattingWithFilterOperator) => {
            if (isConditionalFormattingConfigWithSingleColor(value)) {
                onChange(
                    produce(value, (draft) => {
                        draft.rules[index] = newRule;
                    }),
                );
            }
        },
        [value, onChange],
    );

    const handleChangeLightColor = useCallback(
        (newColor: string) => {
            if (isConditionalFormattingConfigWithSingleColor(value)) {
                onChange(
                    produce(value, (draft) => {
                        draft.color = newColor;
                    }),
                );
            }
        },
        [onChange, value],
    );

    const handleChangeDarkColor = useCallback(
        (newColor: string) => {
            if (isConditionalFormattingConfigWithSingleColor(value)) {
                onChange(
                    produce(value, (draft) => {
                        draft.darkColor = newColor;
                    }),
                );
            }
        },
        [onChange, value],
    );

    const controlLabel = `Rule ${configIndex}`;
    const accordionValue = `${configIndex}`;

    const lightColor = isConditionalFormattingConfigWithSingleColor(value)
        ? value.color
        : colorPalette[0];
    const darkColor = isConditionalFormattingConfigWithSingleColor(value)
        ? (value.darkColor ?? value.color)
        : colorPalette[0];
    const previewColor = colorScheme === 'dark' ? darkColor : lightColor;

    return (
        <Accordion.Item value={accordionValue}>
            <AccordionControl
                label={controlLabel}
                extraControlElements={
                    <ColorSelector
                        color={previewColor}
                        swatches={colorPalette}
                    />
                }
                onRemove={onRemove}
            />
            <Accordion.Panel>
                <Stack gap="xs">
                    <FiltersProvider>
                        <Group>
                            <Group gap="xs">
                                <Config.Label icon={IconSun}>
                                    Light
                                </Config.Label>
                                <ColorSelector
                                    color={lightColor}
                                    swatches={colorPalette}
                                    onColorChange={handleChangeLightColor}
                                />
                            </Group>

                            <Group gap="xs">
                                <Config.Label icon={IconMoon}>
                                    Dark
                                </Config.Label>
                                <ColorSelector
                                    color={darkColor}
                                    swatches={colorPalette}
                                    onColorChange={handleChangeDarkColor}
                                />
                            </Group>
                        </Group>

                        {isConditionalFormattingConfigWithSingleColor(value) ? (
                            <>
                                <Flex justify="space-between">
                                    <Config.Label>Conditions</Config.Label>
                                    <Button
                                        size="compact-xs"
                                        variant="subtle"
                                        leftSection={
                                            <MantineIcon icon={IconPlus} />
                                        }
                                        onClick={handleAddRule}
                                    >
                                        Add
                                    </Button>
                                </Flex>
                                <Accordion
                                    multiple
                                    chevronPosition="right"
                                    variant="contained"
                                    className={classes.conditionsGroup}
                                    value={openConditions}
                                    onChange={setOpenConditions}
                                >
                                    {value.rules.map((rule, ruleIndex) => (
                                        <BigNumberConditionalFormattingRule
                                            key={ruleIndex}
                                            accordionValue={`${ruleIndex}`}
                                            hasRemove={value.rules.length > 1}
                                            ruleIndex={ruleIndex}
                                            rule={rule}
                                            field={field}
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
                                    ))}
                                </Accordion>
                            </>
                        ) : null}
                    </FiltersProvider>
                </Stack>
            </Accordion.Panel>
        </Accordion.Item>
    );
};
