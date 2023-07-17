import {
    ConditionalFormattingConfig,
    ConditionalFormattingRule as ConditionalFormattingRuleT,
    ConditionalOperator,
    createConditionalFormatingRule,
    FilterableItem,
    getItemId,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Collapse,
    Group,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconChevronDown,
    IconChevronUp,
    IconPlus,
    IconX,
} from '@tabler/icons-react';
import produce from 'immer';
import React, { FC, useMemo, useState } from 'react';
import FieldIcon from '../../common/Filters/FieldIcon';
import { fieldLabelText } from '../../common/Filters/FieldLabel';
import { FiltersProvider } from '../../common/Filters/FiltersProvider';
import MantineIcon from '../../common/MantineIcon';
import ColorSelector from '../ColorSelector';
import FieldSelectItem from '../FieldSelectItem';
import ConditionalFormattingRule from './ConditionalFormattingRule';

interface ConditionalFormattingProps {
    isDefaultOpen?: boolean;
    index: number;
    fields: FilterableItem[];
    value: ConditionalFormattingConfig;
    onChange: (newConfig: ConditionalFormattingConfig) => void;
    onRemove: () => void;
}

const ConditionalFormatting: FC<ConditionalFormattingProps> = ({
    isDefaultOpen = true,
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

    const handleRemove = () => {
        onRemove();
    };

    const handleChange = (newConfig: ConditionalFormattingConfig) => {
        setConfig(newConfig);
        onChange(newConfig);
    };

    const handleChangeField = (newFieldId: string) => {
        handleChange(
            produce(config, (draft) => {
                draft.target = newFieldId ? { fieldId: newFieldId } : null;
            }),
        );
    };

    const handleAddRule = () => {
        setIsAddingRule(true);
        handleChange(
            produce(config, (draft) => {
                draft.rules.push(createConditionalFormatingRule());
            }),
        );
    };

    const handleRemoveRule = (index: number) => {
        handleChange(
            produce(config, (draft) => {
                draft.rules.splice(index, 1);
            }),
        );
    };

    const handleChangeRuleOperator = (
        index: number,
        newOperator: ConditionalOperator,
    ) => {
        handleChange(
            produce(config, (draft) => {
                draft.rules[index].operator = newOperator;
            }),
        );
    };

    const handleChangeRule = (
        index: number,
        newRule: ConditionalFormattingRuleT,
    ) => {
        handleChange(
            produce(config, (draft) => {
                draft.rules[index] = newRule;
                // FIXME: check if we can fix this problem in number input
                draft.rules[index].values = draft.rules[index].values.map((v) =>
                    Number(v),
                );
            }),
        );
    };

    const handleChangeColor = (newColor: string) => {
        handleChange(
            produce(config, (draft) => {
                draft.color = newColor;
            }),
        );
    };

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

                    <Tooltip label="Remove rule" position="left">
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
                        <Select
                            label="Select field"
                            placeholder="Search field..."
                            searchable
                            clearable
                            icon={field && <FieldIcon item={field} />}
                            value={field ? getItemId(field) : ''}
                            data={fields.map((f) => {
                                const id = getItemId(f);
                                return {
                                    item: f,
                                    value: id,
                                    label: fieldLabelText(f),
                                    disabled:
                                        id === (field && getItemId(field)),
                                };
                            })}
                            itemComponent={FieldSelectItem}
                            onChange={handleChangeField}
                        />
                        <Group spacing="xs" my="xs">
                            <Text fw={500}>Select color</Text>

                            <ColorSelector
                                color={config.color}
                                onColorChange={handleChangeColor}
                            ></ColorSelector>
                        </Group>

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
                                        handleChangeRule(ruleIndex, newRule)
                                    }
                                    onChangeRuleOperator={(newOperator) =>
                                        handleChangeRuleOperator(
                                            ruleIndex,
                                            newOperator,
                                        )
                                    }
                                    onRemoveRule={() =>
                                        handleRemoveRule(ruleIndex)
                                    }
                                />

                                {ruleIndex !== config.rules.length - 1 && (
                                    <Box p={0}>
                                        <Text fz="xs" fw={600}>
                                            AND
                                        </Text>
                                    </Box>
                                )}
                            </React.Fragment>
                        ))}

                        <Button
                            sx={{ alignSelf: 'start' }}
                            size="xs"
                            variant="subtle"
                            leftIcon={<MantineIcon icon={IconPlus} />}
                            onClick={handleAddRule}
                        >
                            Add new condition
                        </Button>
                    </Stack>
                </Collapse>
            </Stack>
        </FiltersProvider>
    );
};
export default ConditionalFormatting;
