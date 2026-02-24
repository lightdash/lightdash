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
    ActionIcon,
    Box,
    Button,
    Divider,
    Group,
    Menu,
    Stack,
    Text,
    useMantineColorScheme,
} from '@mantine-8/core';
import {
    IconDots,
    IconMoon,
    IconPlus,
    IconSun,
    IconTrash,
} from '@tabler/icons-react';
import { produce } from 'immer';
import { Fragment, useCallback, useState, type FC } from 'react';
import FiltersProvider from '../../common/Filters/FiltersProvider';
import MantineIcon from '../../common/MantineIcon';
import ColorSelector from '../ColorSelector';
import { Config } from '../common/Config';
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
    const [isAddingRule, setIsAddingRule] = useState(false);

    const handleAddRule = useCallback(() => {
        setIsAddingRule(true);

        if (isConditionalFormattingConfigWithSingleColor(value)) {
            onChange(
                produce(value, (draft) => {
                    draft.rules.push(
                        createConditionalFormattingRuleWithValues(),
                    );
                }),
            );
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
            <Accordion.Control
                icon={
                    <ColorSelector
                        color={previewColor}
                        swatches={colorPalette}
                    />
                }
            >
                <Group justify="space-between" wrap="nowrap">
                    <Text fw={500} size="xs" truncate>
                        {controlLabel}
                    </Text>
                    <Menu withArrow offset={-2}>
                        <Menu.Target>
                            <ActionIcon
                                variant="transparent"
                                color="gray"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <MantineIcon icon={IconDots} />
                            </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Item
                                leftSection={<MantineIcon icon={IconTrash} />}
                                color="red"
                                onClick={onRemove}
                            >
                                <Text fz="xs" fw={500}>
                                    Delete
                                </Text>
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                </Group>
            </Accordion.Control>
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
                            <Box
                                p="xs"
                                style={(theme) => ({
                                    backgroundColor: theme.colors.ldGray[1],
                                    border: `1px solid ${theme.colors.ldGray[4]}`,
                                    borderRadius: theme.radius.md,
                                })}
                            >
                                {value.rules.map((rule, ruleIndex) => (
                                    <Fragment key={ruleIndex}>
                                        <BigNumberConditionalFormattingRule
                                            isDefaultOpen={
                                                value.rules.length === 1 ||
                                                isAddingRule
                                            }
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

                                        {ruleIndex !==
                                            value.rules.length - 1 && (
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
                        ) : null}

                        {isConditionalFormattingConfigWithSingleColor(value) ? (
                            <Button
                                style={{ alignSelf: 'start' }}
                                variant="subtle"
                                size="compact-sm"
                                leftSection={<MantineIcon icon={IconPlus} />}
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
