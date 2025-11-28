import {
    friendlyName,
    getFilterGroupItemsPropertyName,
    getFilterRulesFromGroup,
    getItemLabel,
    getItemLabelWithoutTableName,
    isAndFilterGroup,
    isField,
    isOrFilterGroup,
    type AiFilterRule,
    type FilterGroup,
    type Filters,
    type ItemsMap,
} from '@lightdash/common';
import { Button, Flex, Text } from '@mantine-8/core';
import { useMemo, type FC } from 'react';
import { getConditionalRuleLabel } from '../../../../../components/common/Filters/FilterInputs/utils';

import classes from './AgentVisualizationFilters.module.css';

const FilterRuleDisplay: FC<{
    rule: AiFilterRule;
    fieldsMap: ItemsMap;
    showTablePrefix: boolean;
    compact?: boolean;
}> = ({ rule, fieldsMap, showTablePrefix, compact = false }) => {
    const field = fieldsMap[rule.target.fieldId];
    const displayName = field
        ? showTablePrefix
            ? getItemLabel(field)
            : getItemLabelWithoutTableName(field)
        : friendlyName(rule.target.fieldId);

    const ruleLabels = getConditionalRuleLabel(
        rule,
        rule.target.fieldFilterType,
        displayName,
    );

    return (
        <Button
            size={compact ? 'compact-xs' : 'xs'}
            variant="default"
            className={classes.filterButton}
            styles={{
                root: {
                    cursor: 'default',
                    pointerEvents: 'none',
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

const FilterGroupDisplay: FC<{
    group: FilterGroup;
    fieldsMap: ItemsMap;
    showTablePrefix: boolean;
    compact?: boolean;
}> = ({ group, fieldsMap, showTablePrefix, compact = false }) => {
    const rules = getFilterRulesFromGroup(group);
    const combinator = getFilterGroupItemsPropertyName(group);

    if (rules.length === 0) return null;

    return (
        <Flex align="center" gap={4} wrap="wrap">
            {rules.map((rule, index) => (
                <Flex key={rule.id} align="center" gap={4}>
                    <FilterRuleDisplay
                        compact={compact}
                        fieldsMap={fieldsMap}
                        showTablePrefix={showTablePrefix}
                        rule={rule as AiFilterRule}
                    />
                    {combinator === 'or' && index !== rules.length - 1 && (
                        <Text fz="xs" color="ldGray.6" fw={500}>
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
    fieldsMap: ItemsMap;
    compact?: boolean;
};

const AgentVisualizationFilters: FC<Props> = ({
    filters,
    fieldsMap,
    compact = false,
}) => {
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

    const numberOfExplores = useMemo(() => {
        return new Set(
            [
                ...(hasDimensionFilters && filters.dimensions
                    ? getFilterRulesFromGroup(filters.dimensions)
                    : []),
                ...(hasMetricFilters && filters.metrics
                    ? getFilterRulesFromGroup(filters.metrics)
                    : []),
            ]
                .map((rule) => {
                    const field = fieldsMap[rule.target.fieldId];
                    if (field && isField(field)) {
                        return field.table;
                    }
                    return null;
                })
                .filter((table) => table !== null),
        ).size;
    }, [
        hasDimensionFilters,
        filters.dimensions,
        hasMetricFilters,
        filters.metrics,
        fieldsMap,
    ]);

    if (!filters || (!filters.dimensions && !filters.metrics)) {
        return null;
    }

    if (!hasDimensionFilters && !hasMetricFilters) {
        return null;
    }

    const showTablePrefix = numberOfExplores > 1;

    return (
        <>
            <Flex gap="xs" wrap="wrap" align="center">
                {hasDimensionFilters && filters.dimensions && (
                    <FilterGroupDisplay
                        group={filters.dimensions}
                        fieldsMap={fieldsMap}
                        showTablePrefix={showTablePrefix}
                        compact={compact}
                    />
                )}
                {hasMetricFilters && filters.metrics && (
                    <FilterGroupDisplay
                        group={filters.metrics}
                        fieldsMap={fieldsMap}
                        showTablePrefix={showTablePrefix}
                        compact={compact}
                    />
                )}
            </Flex>
        </>
    );
};

export default AgentVisualizationFilters;
