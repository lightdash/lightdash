import {
    type DimensionType,
    type FieldTarget,
    type FilterGroup,
    type FilterOperator,
    type FilterRule,
    type Filters,
    friendlyName,
    getFilterGroupItemsPropertyName,
    getFilterRulesFromGroup,
    getFilterTypeFromItemType,
    isAndFilterGroup,
    isOrFilterGroup,
    type MetricType,
    type TableCalculationType,
} from '@lightdash/common';
import { Button, Flex, Text } from '@mantine-8/core';
import { type FC } from 'react';
import { getConditionalRuleLabel } from '../../../../../components/common/Filters/FilterInputs/utils';

import classes from './AgentVisualizationFilters.module.css';

const FilterRuleDisplay: FC<{
    rule: FilterRule<
        FilterOperator,
        FieldTarget & {
            type: DimensionType | MetricType | TableCalculationType;
        }
    >;
    compact?: boolean;
}> = ({ rule, compact = false }) => {
    const displayName = friendlyName(rule.target.fieldId);

    const filterType = getFilterTypeFromItemType(rule.target.type);

    const ruleLabels = getConditionalRuleLabel(rule, filterType, displayName);

    return (
        <Button
            size={compact ? 'compact-xs' : 'xs'}
            variant="default"
            className={classes.filterButton}
            styles={{
                inner: {
                    color: 'black',
                },
                label: {
                    maxWidth: '100%',
                },
            }}
        >
            <Text fz="xs" truncate>
                <Text fw={600} span fz="xs">
                    {ruleLabels.field}
                </Text>{' '}
                <Text span c="dimmed" fz="xs">
                    {ruleLabels.operator}
                </Text>
                {ruleLabels.value && (
                    <>
                        {' '}
                        <Text fw={700} span fz="xs">
                            {ruleLabels.value}
                        </Text>
                    </>
                )}
            </Text>
        </Button>
    );
};

const FilterGroupDisplay: FC<{ group: FilterGroup; compact?: boolean }> = ({
    group,
    compact = false,
}) => {
    const rules = getFilterRulesFromGroup(group);
    const combinator = getFilterGroupItemsPropertyName(group);

    if (rules.length === 0) return null;

    return (
        <Flex align="center" gap={4} wrap="wrap">
            {rules.map((rule, index) => (
                <Flex key={rule.id} align="center" gap={4}>
                    <FilterRuleDisplay
                        compact={compact}
                        rule={
                            rule as FilterRule<
                                FilterOperator,
                                FieldTarget & {
                                    type:
                                        | DimensionType
                                        | MetricType
                                        | TableCalculationType;
                                }
                            >
                        }
                    />
                    {combinator === 'or' && index !== rules.length - 1 && (
                        <Text fz="xs" color="gray.6" fw={500}>
                            OR
                        </Text>
                    )}
                </Flex>
            ))}
        </Flex>
    );
};

type Props = {
    filters: Filters;
    compact?: boolean;
};

const AgentVisualizationFilters: FC<Props> = ({ filters, compact = false }) => {
    if (!filters || (!filters.dimensions && !filters.metrics)) {
        return null;
    }

    const hasDimensionFilters =
        filters.dimensions &&
        ((isAndFilterGroup(filters.dimensions) &&
            filters.dimensions.and.length > 0) ||
            (isOrFilterGroup(filters.dimensions) &&
                filters.dimensions.or.length > 0));

    const hasMetricFilters =
        filters.metrics &&
        ((isAndFilterGroup(filters.metrics) &&
            filters.metrics.and.length > 0) ||
            (isOrFilterGroup(filters.metrics) &&
                filters.metrics.or.length > 0));

    if (!hasDimensionFilters && !hasMetricFilters) {
        return null;
    }

    return (
        <>
            <Flex gap="xs" wrap="wrap" align="center">
                {hasDimensionFilters && filters.dimensions && (
                    <FilterGroupDisplay
                        group={filters.dimensions}
                        compact={compact}
                    />
                )}
                {hasMetricFilters && filters.metrics && (
                    <FilterGroupDisplay
                        group={filters.metrics}
                        compact={compact}
                    />
                )}
            </Flex>
        </>
    );
};

export default AgentVisualizationFilters;
