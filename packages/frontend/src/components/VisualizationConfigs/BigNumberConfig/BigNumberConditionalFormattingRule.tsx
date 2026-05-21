import {
    FilterOperator,
    FilterType,
    isConditionalFormattingWithValues,
    isNumericItem,
    isStringDimension,
    type ConditionalFormattingWithFilterOperator,
    type FilterableItem,
} from '@lightdash/common';
import { Group, Select, Stack, TextInput, Accordion } from '@mantine-8/core';
import { useCallback, useMemo, type FC } from 'react';
import { useParams } from 'react-router';
import FilterInputComponent from '../../common/Filters/FilterInputs';
import {
    getFilterOperatorOptions,
    getFilterOptions,
} from '../../common/Filters/FilterInputs/utils';
import FiltersProvider from '../../common/Filters/FiltersProvider';
import { AccordionControl } from '../common/AccordionControl';

interface Props {
    accordionValue: string;
    ruleIndex: number;
    rule: ConditionalFormattingWithFilterOperator;
    field: FilterableItem | undefined;
    hasRemove?: boolean;
    onChangeRule: (newRule: ConditionalFormattingWithFilterOperator) => void;
    onChangeRuleOperator: (newOperator: FilterOperator) => void;
    onRemoveRule: () => void;
}

const BigNumberConditionalFormattingRule: FC<Props> = ({
    accordionValue,
    ruleIndex,
    rule,
    field,
    onChangeRule,
    onChangeRuleOperator,
    onRemoveRule,
    hasRemove,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

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
        <Accordion.Item value={accordionValue}>
            <AccordionControl
                label={`Condition ${ruleIndex + 1}`}
                onRemove={hasRemove ? onRemoveRule : undefined}
            />

            <Accordion.Panel>
                <Stack gap="xs">
                    <Group wrap="nowrap" gap="xs" align="flex-start">
                        <Select
                            size="xs"
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
                            size="xs"
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
                                            size="xs"
                                            disabled={true}
                                            placeholder="Values"
                                        />
                                    )}
                                </FiltersProvider>
                            )}
                    </Group>
                </Stack>
            </Accordion.Panel>
        </Accordion.Item>
    );
};

export default BigNumberConditionalFormattingRule;
