import {
    ConditionalFormattingComparisonType,
    FilterOperator,
    FilterType,
    getItemId,
    isBooleanItem,
    isConditionalFormattingWithCompareTarget,
    isConditionalFormattingWithValues,
    isNumericItem,
    isStringDimension,
    type ConditionalFormattingWithFilterOperator,
    type FilterableItem,
} from '@lightdash/common';
import {
    TextInput,
    Accordion,
    Center,
    Group,
    Stack,
    Text,
    SegmentedControl,
    Select,
    Tooltip,
} from '@mantine/core';
import differenceBy from 'lodash/differenceBy';
import { useCallback, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import FieldSelect from '../../common/FieldSelect';
import FilterInputComponent from '../../common/Filters/FilterInputs';
import {
    getFilterOperatorOptions,
    getFilterOptions,
} from '../../common/Filters/FilterInputs/utils';
import FiltersProvider from '../../common/Filters/FiltersProvider';
import { AccordionControl } from '../common/AccordionControl';

interface ConditionalFormattingRuleProps {
    accordionValue: string;
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
    disabled?: boolean;
}

const ConditionalFormattingRule: FC<ConditionalFormattingRuleProps> = ({
    accordionValue,
    ruleIndex,
    rule,
    field,
    fields,
    onChangeRule,
    onChangeRuleOperator,
    onChangeRuleComparisonType,
    onRemoveRule,
    hasRemove,
    disabled,
}) => {
    const { t } = useTranslation('vizConfig');
    const projectUuid = useProjectUuid();

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

    // conditional formatting only supports number, string or boolean filters
    const filterType:
        | FilterType.NUMBER
        | FilterType.STRING
        | FilterType.BOOLEAN
        | undefined = useMemo(() => {
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
        if (isBooleanItem(fieldToFilter)) return FilterType.BOOLEAN;
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
        if (filterType === FilterType.BOOLEAN) {
            const options = getFilterOperatorOptions(filterType);

            if (isConditionalFormattingWithCompareTarget(rule)) {
                const ignoredOperators = getFilterOptions([
                    FilterOperator.NULL,
                    FilterOperator.NOT_NULL,
                ]);

                return differenceBy(options, ignoredOperators, 'value');
            }

            return options;
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
                        (isStringDimension(f) && isStringDimension(field)) ||
                        (isBooleanItem(f) && isBooleanItem(field))) &&
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
                const valuesField = isConditionalFormattingWithCompareTarget(
                    newRule,
                )
                    ? compareField
                    : field;

                onChangeRule({
                    ...newRule,
                    values: newRule.values.map((v) => {
                        if (isStringDimension(valuesField)) {
                            return String(v);
                        }
                        // Boolean inputs already emit real booleans; keep them
                        if (isBooleanItem(valuesField)) {
                            return v;
                        }
                        // FIXME: check if we can fix this problem in number input
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
        <Accordion.Item value={accordionValue}>
            <AccordionControl
                label={t('tableConditionalFormatting.rule.conditionNumber', {
                    number: ruleIndex + 1,
                })}
                disabled={disabled}
                title={
                    disabled
                        ? t('tableConditionalFormatting.selectFieldFirst')
                        : undefined
                }
                onRemove={hasRemove ? onRemoveRule : undefined}
            />

            <Accordion.Panel>
                <Stack gap="xs">
                    <Group wrap="nowrap" gap="xs">
                        <Text fw={500} fz="xs" c="dimmed">
                            {t('tableConditionalFormatting.rule.compare')}
                        </Text>
                        <SegmentedControl
                            size="xs"
                            value={comparisonType}
                            onChange={(value) =>
                                onChangeRuleComparisonType(
                                    value as ConditionalFormattingComparisonType,
                                )
                            }
                            data={[
                                {
                                    label: (
                                        <Tooltip
                                            label={t(
                                                'tableConditionalFormatting.rule.compareValuesTooltip',
                                            )}
                                        >
                                            <Center>
                                                {t(
                                                    'tableConditionalFormatting.rule.compareValues',
                                                )}
                                            </Center>
                                        </Tooltip>
                                    ),
                                    value: ConditionalFormattingComparisonType.VALUES,
                                },
                                {
                                    label: (
                                        <Tooltip
                                            label={t(
                                                'tableConditionalFormatting.rule.compareFieldTooltip',
                                            )}
                                        >
                                            <Center>
                                                {t(
                                                    'tableConditionalFormatting.rule.compareField',
                                                )}
                                            </Center>
                                        </Tooltip>
                                    ),
                                    value: ConditionalFormattingComparisonType.TARGET_FIELD,
                                },
                                {
                                    label: (
                                        <Tooltip
                                            label={t(
                                                'tableConditionalFormatting.rule.compareFieldValuesTooltip',
                                            )}
                                        >
                                            <Center>
                                                {t(
                                                    'tableConditionalFormatting.rule.compareFieldValues',
                                                )}
                                            </Center>
                                        </Tooltip>
                                    ),
                                    value: ConditionalFormattingComparisonType.TARGET_TO_VALUES,
                                },
                            ]}
                        />
                    </Group>
                    {isConditionalFormattingWithCompareTarget(rule) &&
                        isConditionalFormattingWithValues(rule) && (
                            <FieldSelect
                                clearable
                                item={compareField}
                                items={availableCompareFields}
                                onChange={handleChangeCompareField}
                                hasGrouping
                                size="xs"
                                placeholder={t(
                                    'tableConditionalFormatting.rule.compareFieldPlaceholder',
                                )}
                            />
                        )}
                    <Group wrap="nowrap" gap="xs">
                        <Select
                            allowDeselect={false}
                            value={rule.operator}
                            data={filterOperatorOptions}
                            size="xs"
                            onChange={(value) => {
                                if (!value) return;
                                onChangeRuleOperator(value as FilterOperator);
                            }}
                            placeholder={t(
                                'tableConditionalFormatting.rule.condition',
                            )}
                            disabled={!field || !filterType}
                        />

                        <Select
                            allowDeselect={false}
                            display={field && filterType ? 'none' : 'block'}
                            placeholder={t(
                                'tableConditionalFormatting.rule.valuesPlaceholder',
                            )}
                            data={[]}
                            size="xs"
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
                                            placeholder={t(
                                                'tableConditionalFormatting.rule.values',
                                            )}
                                            size="xs"
                                        />
                                    )}
                                </FiltersProvider>
                            )}
                        {isConditionalFormattingWithCompareTarget(rule) &&
                            !isConditionalFormattingWithValues(rule) && (
                                <FieldSelect
                                    size="xs"
                                    clearable
                                    item={compareField}
                                    items={availableCompareFields}
                                    onChange={handleChangeCompareField}
                                    hasGrouping
                                    placeholder={t(
                                        'tableConditionalFormatting.rule.compareFieldPlaceholder',
                                    )}
                                />
                            )}
                    </Group>
                </Stack>
            </Accordion.Panel>
        </Accordion.Item>
    );
};

export default ConditionalFormattingRule;
