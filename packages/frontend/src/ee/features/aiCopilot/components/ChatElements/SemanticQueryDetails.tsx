import {
    friendlyName,
    getItemLabelWithoutTableName,
    type ItemsMap,
    type MetricQuery,
    type ParametersValuesMap,
} from '@lightdash/common';
import { Badge, Button, Collapse, Group, Stack, Text } from '@mantine/core';
import {
    IconArrowDown,
    IconArrowUp,
    IconChevronDown,
    IconChevronUp,
} from '@tabler/icons-react';
import { Fragment, useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import ErrorBoundary from '../../../../../features/errorBoundary/ErrorBoundary';
import AgentVisualizationFilters from './AgentVisualizationFilters';
import AgentVisualizationMetricsAndDimensions from './AgentVisualizationMetricsAndDimensions';
import AgentVisualizationParameters from './AgentVisualizationParameters';
import {
    getVisualizationFieldsCount,
    getVisualizationFiltersCount,
} from './AiVisualizationRenderer.utils';
import styles from './SemanticQueryDetails.module.css';

export type SemanticQueryDetailsQuery = Pick<
    MetricQuery,
    'dimensions' | 'metrics' | 'filters' | 'sorts' | 'limit'
> &
    Partial<Pick<MetricQuery, 'additionalMetrics'>>;

const itemLabel = (fieldsMap: ItemsMap, fieldId: string) => {
    const item = fieldsMap[fieldId];
    return item ? getItemLabelWithoutTableName(item) : friendlyName(fieldId);
};

const SortAndLimit: FC<{
    query: SemanticQueryDetailsQuery;
    fieldsMap: ItemsMap;
}> = ({ query, fieldsMap }) => (
    <Group gap={4} wrap="wrap">
        {query.sorts.length > 0 && (
            <Badge
                color="blue"
                className={styles.badge}
                data-testid="semantic-query-sort"
            >
                <Group gap={4} wrap="nowrap" className={styles.badgeContent}>
                    <Text span fw={400} fz="xs">
                        Sorted by
                    </Text>
                    {query.sorts.map((sort, index) => (
                        <Fragment key={sort.fieldId}>
                            <Text span fw={600} fz="xs" truncate>
                                {itemLabel(fieldsMap, sort.fieldId)}
                            </Text>
                            <MantineIcon
                                icon={
                                    sort.descending
                                        ? IconArrowDown
                                        : IconArrowUp
                                }
                                aria-label={
                                    sort.descending ? 'descending' : 'ascending'
                                }
                                strokeWidth={3}
                                size="sm"
                            />
                            {index < query.sorts.length - 1 && ','}
                        </Fragment>
                    ))}
                </Group>
            </Badge>
        )}
        <Badge className={styles.badge} data-testid="semantic-query-limit">
            <Text span fw={400} fz="xs">
                Limit
            </Text>{' '}
            <Text span fw={600} fz="xs">
                {query.limit} rows
            </Text>
        </Badge>
    </Group>
);

type Props = {
    metricQuery: SemanticQueryDetailsQuery;
    fieldsMap: ItemsMap;
    parameters: ParametersValuesMap;
    showFields: boolean;
    showFilters: boolean;
    showSortAndLimit: boolean;
};

/** A collapsed count line that expands to a semantic query's fields, filters, sort, limit and parameters. */
export const SemanticQueryDetails: FC<Props> = ({
    metricQuery,
    fieldsMap,
    parameters,
    showFields,
    showFilters,
    showSortAndLimit,
}) => {
    const [expanded, setExpanded] = useState(false);
    const fieldsCount = showFields
        ? getVisualizationFieldsCount(metricQuery)
        : 0;
    const filtersCount = showFilters
        ? getVisualizationFiltersCount(metricQuery.filters)
        : 0;
    const sortsCount = showSortAndLimit ? metricQuery.sorts.length : 0;
    const parametersCount = Object.keys(parameters).length;
    const counts = [
        fieldsCount > 0 ? `Fields ${fieldsCount}` : null,
        filtersCount > 0 ? `Filters ${filtersCount}` : null,
        sortsCount > 0 ? `Sort ${sortsCount}` : null,
        parametersCount > 0 ? `Parameters ${parametersCount}` : null,
    ].filter((count) => count !== null);
    if (counts.length === 0) return null;

    return (
        <Stack gap="xs">
            <Group>
                <Button
                    size="compact-xs"
                    variant="subtle"
                    color="ldGray"
                    c="dimmed"
                    className={styles.toggle}
                    aria-expanded={expanded}
                    rightSection={
                        <MantineIcon
                            icon={expanded ? IconChevronUp : IconChevronDown}
                            size={12}
                        />
                    }
                    onClick={() => setExpanded((value) => !value)}
                >
                    {counts.join(' · ')}
                </Button>
            </Group>
            <Collapse expanded={expanded}>
                <Stack gap="xs">
                    <ErrorBoundary>
                        {fieldsCount > 0 && (
                            <AgentVisualizationMetricsAndDimensions
                                metricQuery={metricQuery}
                                fieldsMap={fieldsMap}
                            />
                        )}
                        {filtersCount > 0 && (
                            <AgentVisualizationFilters
                                filters={metricQuery.filters}
                                fieldsMap={fieldsMap}
                            />
                        )}
                        {showSortAndLimit && (
                            <SortAndLimit
                                query={metricQuery}
                                fieldsMap={fieldsMap}
                            />
                        )}
                        {parametersCount > 0 && (
                            <AgentVisualizationParameters
                                parameterValues={parameters}
                            />
                        )}
                    </ErrorBoundary>
                </Stack>
            </Collapse>
        </Stack>
    );
};
