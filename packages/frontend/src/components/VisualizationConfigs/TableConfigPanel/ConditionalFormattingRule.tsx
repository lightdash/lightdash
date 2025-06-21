import {
    ConditionalFormattingComparisonType,
    FilterOperator,
    FilterType,
    getItemId,
    isConditionalFormattingWithCompareTarget,
    isConditionalFormattingWithValues,
    isNumericItem,
    isStringDimension,
    type ConditionalFormattingWithFilterOperator,
    type FilterableItem,
} from '@lightdash/common';
import {
    ActionIcon,
    Center,
    Collapse,
    Group,
    SegmentedControl,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { IconChevronDown, IconChevronUp, IconTrash } from '@tabler/icons-react';
import { differenceBy } from 'lodash';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useParams } from 'react-router';
import FieldSelect from '../../common/FieldSelect';
import FilterInputComponent from '../../common/Filters/FilterInputs';
import {
    getFilterOperatorOptions,
    getFilterOptions,
} from '../../common/Filters/FilterInputs/utils';
import FiltersProvider from '../../common/Filters/FiltersProvider';
import MantineIcon from '../../common/MantineIcon';

interface ConditionalFormattingRuleProps {
    isDefaultOpen?: boolean;
    ruleIndex: number;
    rule: ConditionalFormattingWithFilterOperator;
    field: FilterableItem | undefined;
    fields: FilterableItem[];
    hasRemove?: boolean;
    onChangeRule: (newRule: ConditionalFormattingWithFilterOperator) => void;
    onChangeRuleOperator: (newOperator: FilterOperator) => void;
    onChangeRuleComparisonType: (
        comparisonType: ConditionalFormattingComparisonType,
    ) => void;
    onRemoveRule: () => void;
}

const ConditionalFormattingRule: FC<ConditionalFormattingRuleProps> = ({
    isDefaultOpen = true,
    ruleIndex,
    rule,
    field,
    fields,
    onChangeRule,
    onChangeRuleOperator,
    onChangeRuleComparisonType,
    onRemoveRule,
    hasRemove,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const { ref, hovered } = useHover();
    const [isOpen, setIsOpen] = useState(isDefaultOpen);

    const comparisonType = useMemo(() => {
        if (
            isConditionalFormattingWithCompareTarget(rule) &&
            isConditionalFormattingWithValues(rule)
        ) {
            return ConditionalFormattingComparisonType.TARGET_TO_VALUES;
        } else if (
            isConditionalFormattingWithCompareTarget(rule) &&
            !isConditionalFormattingWithValues(rule)
        ) {
            return ConditionalFormattingComparisonType.TARGET_FIELD;
        }

        return ConditionalFormattingComparisonType.VALUES;
    }, [rule]);

    const compareField = useMemo(() => {
        if (isConditionalFormattingWithCompareTarget(rule)) {
            return fields.find(
                (f) => getItemId(f) === rule.compareTarget?.fieldId,
            );
        }
    }, [fields, rule]);

    // conditional formatting only supports number filters or string filters
    const filterType: FilterType.NUMBER | FilterType.STRING | undefined =
        useMemo(() => {
            let fieldToFilter = field;

            if (
                isConditionalFormattingWithCompareTarget(rule) &&
                isConditionalFormattingWithValues(rule) &&
                compareField
            ) {
                fieldToFilter = compareField;
            }

            if (isNumericItem(fieldToFilter)) return FilterType.NUMBER;
            if (isStringDimension(fieldToFilter)) return FilterType.STRING;
            return undefined;
        }, [field, compareField, rule]);

    const filterOperatorOptions = useMemo(() => {
        if (!filterType) return [];
        if (filterType === FilterType.NUMBER) {
            const options = getFilterOperatorOptions(filterType);

            if (isConditionalFormattingWithCompareTarget(rule)) {
                const ignoredOperators = getFilterOptions([
                    FilterOperator.NULL,
                    FilterOperator.NOT_NULL,
                    FilterOperator.IN_BETWEEN,
                    FilterOperator.NOT_IN_BETWEEN,
                ]);

                return differenceBy(options, ignoredOperators, 'value');
            }

            return options;
        }
        if (filterType === FilterType.STRING) {
            return getFilterOptions([
                FilterOperator.EQUALS,
                FilterOperator.NOT_EQUALS,
                FilterOperator.INCLUDE,
            ]);
        }
        return [];
    }, [filterType, rule]);

    const availableCompareFields = useMemo(() => {
        return fields.filter((f) => {
            // If the rule is comparing with another field and its values, we don't need them to be the same type
            if (
                isConditionalFormattingWithCompareTarget(rule) &&
                isConditionalFormattingWithValues(rule)
            ) {
                return field && getItemId(f) !== getItemId(field);
            }

            // If the rule is comparing with another field, we need them to be the same type
            if (
                isConditionalFormattingWithCompareTarget(rule) &&
                !isConditionalFormattingWithValues(rule)
            ) {
                return (
                    ((isNumericItem(f) && isNumericItem(field)) ||
                        (isStringDimension(f) && isStringDimension(field))) &&
                    field &&
                    getItemId(f) !== getItemId(field)
                );
            }

            return [];
        });
    }, [fields, rule, field]);

    const handleChangeCompareField = useCallback(
        (newCompareField: FilterableItem | undefined) => {
            if (isConditionalFormattingWithCompareTarget(rule)) {
                onChangeRule({
                    ...rule,
                    compareTarget: newCompareField
                        ? {
                              fieldId: getItemId(newCompareField),
                          }
                        : null,
                });
            }
        },
        [onChangeRule, rule],
    );

    const handleChangeRule = useCallback(
        (newRule: ConditionalFormattingWithFilterOperator) => {
            if (isConditionalFormattingWithValues(newRule)) {
                onChangeRule({
                    ...newRule,
                    values: newRule.values.map((v) => {
                        // FIXME: check if we can fix this problem in number input
                        if (
                            isConditionalFormattingWithCompareTarget(newRule)
                                ? isStringDimension(compareField)
                                : isStringDimension(field)
                        ) {
                            return String(v);
                        }
                        return Number(v);
                    }),
                });
            } else {
                onChangeRule(newRule);
            }
        },
        [onChangeRule, compareField, field],
    );

    const valuesInputField = useMemo(() => {
        if (isConditionalFormattingWithCompareTarget(rule)) {
            return compareField;
        }
        return field;
    }, [rule, compareField, field]);

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
                        <Text fw={500} fz="xs" c="dimmed">
                            Compare:
                        </Text>
                        <SegmentedControl
                            size="xs"
                            value={comparisonType}
                            onChange={onChangeRuleComparisonType}
                            data={[
                                {
                                    label: (
                                        <Tooltip
                                            label="Compare selected field to values"
                                            withinPortal
                                            variant="xs"
                                        >
                                            <Center>Values</Center>
                                        </Tooltip>
                                    ),
                                    value: ConditionalFormattingComparisonType.VALUES,
                                },
                                {
                                    label: (
                                        <Tooltip
                                            label="Compare selected field to another field"
                                            withinPortal
                                            variant="xs"
                                        >
                                            <Center>Field</Center>
                                        </Tooltip>
                                    ),
                                    value: ConditionalFormattingComparisonType.TARGET_FIELD,
                                },
                                {
                                    label: (
                                        <Tooltip
                                            label="Compare another field to values"
                                            withinPortal
                                            variant="xs"
                                        >
                                            <Center>Field values</Center>
                                        </Tooltip>
                                    ),
                                    value: ConditionalFormattingComparisonType.TARGET_TO_VALUES,
                                },
                            ]}
                        ></SegmentedControl>
                    </Group>
                    {isConditionalFormattingWithCompareTarget(rule) &&
                        isConditionalFormattingWithValues(rule) && (
                            <FieldSelect
                                clearable
                                item={compareField}
                                items={availableCompareFields}
                                onChange={handleChangeCompareField}
                                hasGrouping
                                placeholder="Compare field"
                            />
                        )}
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
                                    {valuesInputField ? (
                                        <FilterInputComponent
                                            filterType={filterType}
                                            field={valuesInputField}
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
                        {isConditionalFormattingWithCompareTarget(rule) &&
                            !isConditionalFormattingWithValues(rule) && (
                                <FieldSelect
                                    clearable
                                    item={compareField}
                                    items={availableCompareFields}
                                    onChange={handleChangeCompareField}
                                    hasGrouping
                                    placeholder="Compare field"
                                />
                            )}
                    </Group>
                </Stack>
            </Collapse>
        </Stack>
    );
};

export default ConditionalFormattingRule;
