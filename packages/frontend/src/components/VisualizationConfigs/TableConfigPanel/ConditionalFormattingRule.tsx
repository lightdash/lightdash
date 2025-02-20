import {
    FilterOperator,
    FilterType,
    getConditionalFormattingComparisonType,
    getItemId,
    isConditionalFormattingWithCompareTarget,
    isConditionalFormattingWithValues,
    isNumericItem,
    isStringDimension,
    type ConditionalFormattingWithConditionalOperator,
    type ConditionalOperator,
    type FilterableItem,
} from '@lightdash/common';
import { ConditionalFormattingComparisonType } from '@lightdash/common/src/types/conditionalFormatting';
import {
    ActionIcon,
    Chip,
    Collapse,
    Group,
    Select,
    Stack,
    Text,
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
    rule: ConditionalFormattingWithConditionalOperator;
    field: FilterableItem | undefined;
    fields: FilterableItem[];
    hasRemove?: boolean;
    onChangeRule: (
        newRule: ConditionalFormattingWithConditionalOperator,
    ) => void;
    onChangeRuleOperator: (newOperator: ConditionalOperator) => void;
    onChangeRuleComparisonType: (
        newComparisonType: ConditionalFormattingComparisonType,
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

    // conditional formatting only supports number filters or string filters
    const filterType: FilterType.NUMBER | FilterType.STRING | undefined =
        useMemo(() => {
            if (isNumericItem(field)) return FilterType.NUMBER;
            if (isStringDimension(field)) return FilterType.STRING;
            return undefined;
        }, [field]);

    const filterOperatorOptions = useMemo(() => {
        if (!filterType) return [];
        if (filterType === FilterType.NUMBER) {
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
        if (filterType === FilterType.STRING) {
            return getFilterOptions([
                FilterOperator.EQUALS,
                FilterOperator.INCLUDE,
            ]);
        }
        return [];
    }, [filterType, rule]);

    const compareField = useMemo(() => {
        if (isConditionalFormattingWithCompareTarget(rule)) {
            return fields.find(
                (f) => getItemId(f) === rule.compareTarget?.fieldId,
            );
        }
    }, [fields, rule]);

    const availableCompareFields = useMemo(() => {
        return fields.filter(
            (f) =>
                ((isNumericItem(f) && isNumericItem(field)) ||
                    (isStringDimension(f) && isStringDimension(field))) &&
                field &&
                getItemId(f) !== getItemId(field),
        );
    }, [fields, field]);

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

    return (
        <Stack spacing="xs" ref={ref}>
            <Group noWrap position="apart">
                <Group spacing="xs">
                    <Text fw={500} fz="xs">
                        Condition {ruleIndex + 1}
                    </Text>
                    <Chip.Group
                        value={getConditionalFormattingComparisonType(rule)}
                        onChange={(value) =>
                            onChangeRuleComparisonType(
                                value as ConditionalFormattingComparisonType,
                            )
                        }
                    >
                        <Chip
                            value={ConditionalFormattingComparisonType.Values}
                        >
                            Select field values
                        </Chip>
                        <Chip
                            value={
                                ConditionalFormattingComparisonType.CompareTarget
                            }
                        >
                            Compare to other field
                        </Chip>
                    </Chip.Group>

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
                <Group noWrap spacing="xs">
                    <Select
                        value={rule.operator}
                        data={filterOperatorOptions}
                        onChange={(value) => {
                            if (!value) return;
                            onChangeRuleOperator(value as ConditionalOperator);
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
                        field &&
                        filterType &&
                        (isConditionalFormattingWithValues(rule) ? (
                            <FiltersProvider projectUuid={projectUuid}>
                                <FilterInputComponent
                                    filterType={filterType}
                                    field={field}
                                    rule={rule}
                                    onChange={onChangeRule}
                                />
                            </FiltersProvider>
                        ) : (
                            <FieldSelect
                                label="Select field"
                                clearable
                                item={compareField}
                                items={availableCompareFields}
                                onChange={handleChangeCompareField}
                                hasGrouping
                            />
                        ))}
                </Group>
            </Collapse>
        </Stack>
    );
};

export default ConditionalFormattingRule;
