import {
    friendlyName,
    getItemLabelWithoutTableName,
    interpolateUiString,
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
import { useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import ErrorBoundary from '../../../../../features/errorBoundary/ErrorBoundary';
import { useUiStrings } from '../../../../providers/Embed/useUiStrings';
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
}> = ({ query, fieldsMap }) => {
    const getUiString = useUiStrings();
    const rowsKey =
        query.limit === 1
            ? 'aiAgent.queryDetails.rows.singular'
            : 'aiAgent.queryDetails.rows.plural';
    return (
        <Group gap="xs" wrap="wrap">
            {query.sorts.map((sort) => (
                <Badge
                    key={sort.fieldId}
                    color="blue"
                    className={styles.badge}
                    data-testid="semantic-query-sort"
                    leftSection={
                        <MantineIcon
                            icon={sort.descending ? IconArrowDown : IconArrowUp}
                            aria-label={getUiString(
                                sort.descending
                                    ? 'aiAgent.queryDetails.descending'
                                    : 'aiAgent.queryDetails.ascending',
                            )}
                            strokeWidth={3}
                            size="sm"
                        />
                    }
                >
                    <Text span fw={400} fz="xs">
                        {getUiString('aiAgent.queryDetails.sortedBy')}
                    </Text>{' '}
                    <Text span fw={600} fz="xs">
                        {itemLabel(fieldsMap, sort.fieldId)}
                    </Text>
                </Badge>
            ))}
            <Badge
                color="blue"
                className={styles.badge}
                data-testid="semantic-query-limit"
            >
                <Text span fw={400} fz="xs">
                    {getUiString('aiAgent.queryDetails.limit')}
                </Text>{' '}
                <Text span fw={600} fz="xs">
                    {interpolateUiString(getUiString(rowsKey), {
                        count: query.limit,
                    })}
                </Text>
            </Badge>
        </Group>
    );
};

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
    const getUiString = useUiStrings();
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
        sortsCount > 0
            ? interpolateUiString(
                  getUiString('aiAgent.queryDetails.sortCount'),
                  {
                      count: sortsCount,
                  },
              )
            : null,
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
                    flex="0 0 auto"
                    bd="none"
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
