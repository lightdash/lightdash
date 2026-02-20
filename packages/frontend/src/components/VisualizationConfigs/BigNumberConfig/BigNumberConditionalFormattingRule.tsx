import {
    FilterOperator,
    FilterType,
    isConditionalFormattingWithValues,
    isNumericItem,
    isStringDimension,
    type ConditionalFormattingWithFilterOperator,
    type FilterableItem,
} from '@lightdash/common';
import {
    ActionIcon,
    Collapse,
    Group,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { IconChevronDown, IconChevronUp, IconTrash } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useParams } from 'react-router';
import FilterInputComponent from '../../common/Filters/FilterInputs';
import {
    getFilterOperatorOptions,
    getFilterOptions,
} from '../../common/Filters/FilterInputs/utils';
import FiltersProvider from '../../common/Filters/FiltersProvider';
import MantineIcon from '../../common/MantineIcon';

interface Props {
    isDefaultOpen?: boolean;
    ruleIndex: number;
    rule: ConditionalFormattingWithFilterOperator;
    field: FilterableItem | undefined;
    hasRemove?: boolean;
    onChangeRule: (newRule: ConditionalFormattingWithFilterOperator) => void;
    onChangeRuleOperator: (newOperator: FilterOperator) => void;
    onRemoveRule: () => void;
}

const BigNumberConditionalFormattingRule: FC<Props> = ({
    isDefaultOpen = true,
    ruleIndex,
    rule,
    field,
    onChangeRule,
    onChangeRuleOperator,
    onRemoveRule,
    hasRemove,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const { ref, hovered } = useHover();
    const [isOpen, setIsOpen] = useState(isDefaultOpen);

    const filterType: FilterType.NUMBER | FilterType.STRING | undefined =
        useMemo(() => {
            if (isNumericItem(field)) return FilterType.NUMBER;
            if (isStringDimension(field)) return FilterType.STRING;
            return undefined;
        }, [field]);

    const filterOperatorOptions = useMemo(() => {
        if (!filterType) return [];
        if (filterType === FilterType.NUMBER) {
            return getFilterOperatorOptions(filterType);
        }
        if (filterType === FilterType.STRING) {
            return getFilterOptions([
                FilterOperator.EQUALS,
                FilterOperator.NOT_EQUALS,
                FilterOperator.INCLUDE,
            ]);
        }
        return [];
    }, [filterType]);

    const handleChangeRule = useCallback(
        (newRule: ConditionalFormattingWithFilterOperator) => {
            if (isConditionalFormattingWithValues(newRule)) {
                onChangeRule({
                    ...newRule,
                    values: newRule.values.map((v) => {
                        if (isStringDimension(field)) {
                            return String(v);
                        }
                        return Number(v);
                    }),
                });
            } else {
                onChangeRule(newRule);
            }
        },
        [onChangeRule, field],
    );

    return (
        <Stack spacing="xs" ref={ref}>
            <Group noWrap position="apart">
                <Group spacing="xs">
                    <Text fw={500} fz="xs">
                        Condition {ruleIndex + 1}
                    </Text>

                    {hasRemove && hovered && (
                        <Tooltip
                            variant="xs"
                            label="Remove condition"
                            position="left"
                            withinPortal
                        >
                            <ActionIcon onClick={onRemoveRule}>
                                <MantineIcon icon={IconTrash} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </Group>

                <ActionIcon onClick={() => setIsOpen(!isOpen)} size="sm">
                    <MantineIcon
                        icon={isOpen ? IconChevronUp : IconChevronDown}
                    />
                </ActionIcon>
            </Group>

            <Collapse in={isOpen}>
                <Stack spacing="xs">
                    <Group noWrap spacing="xs">
                        <Select
                            value={rule.operator}
                            data={filterOperatorOptions}
                            onChange={(value) => {
                                if (!value) return;
                                onChangeRuleOperator(value as FilterOperator);
                            }}
                            placeholder="Condition"
                            disabled={!field || !filterType}
                        />

                        <Select
                            display={field && filterType ? 'none' : 'block'}
                            placeholder="Value(s)"
                            data={[]}
                            disabled={!field || !filterType}
                        />

                        {projectUuid &&
                            filterType &&
                            isConditionalFormattingWithValues(rule) && (
                                <FiltersProvider projectUuid={projectUuid}>
                                    {field ? (
                                        <FilterInputComponent
                                            filterType={filterType}
                                            field={field}
                                            rule={rule}
                                            onChange={handleChangeRule}
                                        />
                                    ) : (
                                        <TextInput
                                            disabled={true}
                                            placeholder="Values"
                                        />
                                    )}
                                </FiltersProvider>
                            )}
                    </Group>
                </Stack>
            </Collapse>
        </Stack>
    );
};

export default BigNumberConditionalFormattingRule;
