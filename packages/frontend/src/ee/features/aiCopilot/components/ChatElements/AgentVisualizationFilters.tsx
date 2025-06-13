import {
    getFilterTypeFromItemType,
    type AiAgentMessageAssistant,
    type ConditionalOperator,
    type DimensionType,
    type FilterSchemaType,
    type MetricType,
    type UnitOfTime,
} from '@lightdash/common';
import { Box, Button, Flex, Text, createStyles } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { getConditionalRuleLabel } from '../../../../../components/common/Filters/FilterInputs/utils';

const useFilterStyles = createStyles((theme) => ({
    filterButton: {
        backgroundColor: 'white',
        borderColor: theme.colors.gray[3],
        cursor: 'default',
        '&:hover': {
            backgroundColor: 'white',
        },
        '&:active': {
            transform: 'none',
        },
    },
    filterText: {
        maxWidth: '800px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    groupConnector: {
        fontSize: theme.fontSizes.xs,
        color: theme.colors.gray[6],
        fontWeight: 500,
        padding: `0 ${theme.spacing.xs}px`,
    },
}));

type Props = {
    message: Pick<AiAgentMessageAssistant, 'metricQuery'>;
};

type FilterRule = {
    id: string;
    target: {
        fieldId: string;
        type: DimensionType | MetricType;
    };
    operator: ConditionalOperator;
    values: (string | number | boolean | null)[];
    settings?: {
        completed?: boolean;
        unitOfTime?: UnitOfTime;
    };
};

type FilterGroup =
    | {
          id: string;
          and: FilterRule[];
      }
    | {
          id: string;
          or: FilterRule[];
      };

const getFieldDisplayName = (fieldId: string): string => {
    const parts = fieldId.split('_');
    if (parts.length <= 1) return fieldId;

    return parts
        .slice(1)
        .join(' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
        .toLowerCase()
        .replace(/^\w/, (c) => c.toUpperCase());
};

const FilterRuleDisplay: FC<{ rule: FilterRule }> = ({ rule }) => {
    const { classes } = useFilterStyles();

    const displayName = getFieldDisplayName(rule.target.fieldId);
    const filterType = getFilterTypeFromItemType(rule.target.type);

    const ruleLabels = getConditionalRuleLabel(rule, filterType, displayName);

    return (
        <Button
            size="xs"
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
            <Box className={classes.filterText}>
                <Text fz="xs" truncate>
                    <Text fw={600} span>
                        {ruleLabels.field}
                    </Text>{' '}
                    <Text span color="gray.7">
                        {ruleLabels.operator}
                    </Text>
                    {ruleLabels.value && (
                        <>
                            {' '}
                            <Text fw={700} span>
                                {ruleLabels.value}
                            </Text>
                        </>
                    )}
                </Text>
            </Box>
        </Button>
    );
};

const FilterGroupDisplay: FC<{ group: FilterGroup }> = ({ group }) => {
    const { classes } = useFilterStyles();
    const rules = ('and' in group ? group.and : group.or) || [];
    const connector = 'and' in group ? 'AND' : 'OR';

    if (rules.length === 0) return null;

    return (
        <Flex align="center" gap={4}>
            {rules.map((rule, index) => (
                <Flex key={rule.id} align="center" gap={4}>
                    <FilterRuleDisplay rule={rule} />
                    {index < rules.length - 1 && (
                        <span className={classes.groupConnector}>
                            {connector}
                        </span>
                    )}
                </Flex>
            ))}
        </Flex>
    );
};

const AgentVisualizationFilters: FC<Props> = ({ message }) => {
    const filters = useMemo(() => {
        return (message.metricQuery as any)?.filters as
            | FilterSchemaType
            | undefined;
    }, [message]);

    if (!filters || (!filters.dimensions && !filters.metrics)) {
        return null;
    }

    const hasDimensionFilters =
        filters.dimensions &&
        (('and' in filters.dimensions &&
            filters.dimensions.and &&
            filters.dimensions.and.length > 0) ||
            ('or' in filters.dimensions &&
                filters.dimensions.or &&
                filters.dimensions.or.length > 0));

    const hasMetricFilters =
        filters.metrics &&
        (('and' in filters.metrics &&
            filters.metrics.and &&
            filters.metrics.and.length > 0) ||
            ('or' in filters.metrics &&
                filters.metrics.or &&
                filters.metrics.or.length > 0));

    if (!hasDimensionFilters && !hasMetricFilters) {
        return null;
    }

    return (
        <Box mb="sm">
            <Flex gap="xs" wrap="wrap" align="center">
                {hasDimensionFilters && filters.dimensions && (
                    <FilterGroupDisplay group={filters.dimensions} />
                )}
                {hasDimensionFilters && hasMetricFilters && (
                    <Text fz="xs" color="gray.6" fw={500}>
                        AND
                    </Text>
                )}
                {hasMetricFilters && filters.metrics && (
                    <FilterGroupDisplay group={filters.metrics} />
                )}
            </Flex>
        </Box>
    );
};

export default AgentVisualizationFilters;
