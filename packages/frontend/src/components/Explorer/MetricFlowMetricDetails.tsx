import {
    FilterOperator,
    FilterType,
    getFilterTypeFromItem,
    type BaseFilterRule,
    type ConditionalRuleLabel,
    type Explore,
    type FilterableItem,
    type Metric,
} from '@lightdash/common';
import {
    Badge,
    Box,
    Code,
    Divider,
    Group,
    Paper,
    SimpleGrid,
    Stack,
    Text,
} from '@mantine/core';
import { useMemo, type FC, type ReactNode } from 'react';
import {
    type MetricDefinition,
    type MetricDefinitionFilter,
    type MetricLineage,
} from '../../api/MetricFlowAPI';
import { convertDimensionNameToLabels } from '../../features/metricFlow/utils/convertDimensionNameToLabels';
import { getConditionalRuleLabelFromItem } from '../common/Filters/FilterInputs/utils';
import MetricFlowLineagePanel from './MetricFlowLineagePanel';

const normalizeOperator = (operator: string) => operator.trim().toLowerCase();

const mapMetricDefinitionOperator = (
    operator: string,
): FilterOperator | undefined => {
    switch (normalizeOperator(operator)) {
        case '=':
        case '==':
        case 'is':
            return FilterOperator.EQUALS;
        case '!=':
        case '<>':
        case 'is not':
            return FilterOperator.NOT_EQUALS;
        case 'in':
        case 'contains':
            return FilterOperator.INCLUDE;
        case 'not in':
        case 'not contains':
            return FilterOperator.NOT_INCLUDE;
        case '>':
            return FilterOperator.GREATER_THAN;
        case '>=':
            return FilterOperator.GREATER_THAN_OR_EQUAL;
        case '<':
            return FilterOperator.LESS_THAN;
        case '<=':
            return FilterOperator.LESS_THAN_OR_EQUAL;
        case 'is null':
            return FilterOperator.NULL;
        case 'is not null':
            return FilterOperator.NOT_NULL;
        default:
            return undefined;
    }
};

type StructuredFilterEntry = {
    filter: MetricDefinitionFilter;
    source?: string;
};

type FilterLabelEntry = {
    id: string;
    label: ConditionalRuleLabel;
    source?: string;
};

type RawFilterEntry = {
    id: string;
    expression: string;
    source?: string;
};

const buildFilterLabels = (
    filters: StructuredFilterEntry[],
    dimensionMap: Map<string, FilterableItem>,
    dimensionLabelMap: Map<string, string>,
): FilterLabelEntry[] => {
    return filters.map((entry, index) => {
        const field = dimensionMap.get(entry.filter.dimension);
        const operator = mapMetricDefinitionOperator(entry.filter.operator);
        const id = `metric-definition-filter-${index}`;
        if (field && operator) {
            const rule: BaseFilterRule = {
                id,
                operator,
                values: entry.filter.values ?? [],
            };
            const label = getConditionalRuleLabelFromItem(rule, field);
            const filterType = getFilterTypeFromItem(field);
            const formattedValue =
                filterType === FilterType.STRING && entry.filter.values
                    ? entry.filter.values
                          .map((value) =>
                              typeof value === 'string' &&
                              !value.startsWith("'") &&
                              !value.startsWith('"')
                                  ? `'${value}'`
                                  : String(value),
                          )
                          .join(', ')
                    : label.value;

            return {
                id,
                label: {
                    ...label,
                    operator: entry.filter.operator.trim() || label.operator,
                    value: formattedValue,
                },
                source: entry.source,
            };
        }

        const fallbackLabel =
            dimensionLabelMap.get(entry.filter.dimension) ||
            convertDimensionNameToLabels(entry.filter.dimension)
                .dimensionLabel ||
            entry.filter.dimension;
        return {
            id,
            label: {
                field: fallbackLabel,
                operator: entry.filter.operator.trim(),
                value: (entry.filter.values ?? []).join(', '),
            },
            source: entry.source,
        };
    });
};

const collectDefinitionFilters = (definition?: MetricDefinition | null) => {
    const structured: StructuredFilterEntry[] = [];
    const raw: RawFilterEntry[] = [];

    if (!definition) return { structured, raw };

    const pushStructured = (
        filters?: MetricDefinitionFilter[] | null,
        source?: string,
    ) => {
        filters?.forEach((filter) => structured.push({ filter, source }));
    };

    const stripWrappingQuotes = (value: string) => {
        const trimmed = value.trim().replace(/;$/, '');
        if (
            (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
            (trimmed.startsWith('"') && trimmed.endsWith('"'))
        ) {
            return trimmed.slice(1, -1);
        }
        return trimmed;
    };

    const stripWrappingParens = (value: string) => {
        const trimmed = value.trim();
        if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
            return trimmed.slice(1, -1).trim();
        }
        return trimmed;
    };

    const parseRawDimensionFilter = (
        expression: string,
    ): MetricDefinitionFilter | null => {
        let trimmed = expression.trim();
        if (!trimmed) return null;

        trimmed = stripWrappingParens(trimmed);

        const dimensionMatch = trimmed.match(
            /\{\{\s*Dimension\((['"])([^'"]+)\1\)\s*\}\}/i,
        );
        if (!dimensionMatch) return null;
        const dimension = dimensionMatch[2];
        const operatorRegex = /(=|!=|<>|>=|<=|>|<|not in|in)\b/i;
        const operatorMatch = trimmed.match(operatorRegex);
        if (!operatorMatch) return null;
        const operator = operatorMatch[1].toLowerCase();

        const operatorIndex = trimmed.indexOf(operatorMatch[0]);
        const valueStart = operatorIndex + operatorMatch[0].length;
        if (valueStart >= trimmed.length) return null;
        let valuePart = trimmed.slice(valueStart).trim();
        if (!valuePart) return null;

        if (operator === 'in' || operator === 'not in') {
            valuePart = stripWrappingParens(valuePart);
            const listMatch = valuePart.match(/^\((.*)\)$/) ?? ['', valuePart];
            const listStr = listMatch[1].trim();
            if (!listStr) return null;
            const values = listStr
                .split(',')
                .map((value) => stripWrappingQuotes(value))
                .filter((value) => value.length > 0);
            return values.length > 0 ? { dimension, operator, values } : null;
        }

        valuePart = stripWrappingParens(valuePart);
        return {
            dimension,
            operator,
            values: [stripWrappingQuotes(valuePart)],
        };
    };

    const pushRaw = (expression?: string | null, source?: string) => {
        if (!expression) return;
        const trimmed = expression.trim();
        if (!trimmed) return;
        const parsed = parseRawDimensionFilter(trimmed);
        if (parsed) {
            structured.push({ filter: parsed, source });
            return;
        }
        raw.push({
            id: `metric-definition-filter-raw-${raw.length}`,
            expression: trimmed,
            source,
        });
    };

    pushStructured(definition.filterStructured, undefined);
    pushStructured(definition.filters, undefined);
    pushRaw(definition.filterRaw, undefined);

    definition.inputs?.inputMetrics?.forEach((inputMetric) => {
        const source = inputMetric.label || inputMetric.name;
        pushStructured(inputMetric.filterStructured, source);
        pushRaw(inputMetric.filterRaw, source);
    });

    definition.inputs?.inputMeasures?.forEach((inputMeasure) => {
        const source = inputMeasure.label || inputMeasure.name;
        pushRaw(inputMeasure.filterRaw, source);
    });

    return { structured, raw };
};

const DefinitionRow: FC<{
    label: string;
    value?: ReactNode;
    emptyText?: string;
}> = ({ label, value, emptyText = '暂无' }) => (
    <Group align="flex-start" spacing="sm" noWrap>
        <Text size="xs" fw={500} c="ldGray.7" sx={{ minWidth: 72 }}>
            {label}
        </Text>
        <Box sx={{ flex: 1 }}>
            {value === undefined || value === null ? (
                <Text size="xs" c="ldGray.6">
                    {emptyText}
                </Text>
            ) : typeof value === 'string' || typeof value === 'number' ? (
                <Text size="sm" c="ldDark.7">
                    {value}
                </Text>
            ) : (
                value
            )}
        </Box>
    </Group>
);

const MetricFlowMetricDetails: FC<{
    metric: Metric;
    explore?: Explore;
    definition?: MetricDefinition | null;
    lineage?: MetricLineage['lineage'];
    description?: string;
    isLoading: boolean;
}> = ({
    metric,
    explore,
    definition,
    lineage: _lineage,
    description,
    isLoading,
}) => {
    const dimensionMap = useMemo(() => {
        if (!explore) return new Map<string, FilterableItem>();
        const dimensions = Object.values(
            explore.tables[explore.baseTable].dimensions,
        );
        return new Map(
            dimensions.map((dimension) => [dimension.name, dimension]),
        );
    }, [explore]);

    const { structured: structuredFilters, raw: rawFilters } = useMemo(
        () => collectDefinitionFilters(definition),
        [definition],
    );

    const dimensionLabelMap = useMemo(() => {
        const map = new Map<string, string>();
        definition?.dimensions?.forEach((dimension) => {
            map.set(dimension.name, dimension.label || dimension.name);
        });
        return map;
    }, [definition]);

    const filterLabels = useMemo(
        () =>
            buildFilterLabels(
                structuredFilters,
                dimensionMap,
                dimensionLabelMap,
            ),
        [structuredFilters, dimensionMap, dimensionLabelMap],
    );

    const inputMetrics = definition?.inputs?.inputMetrics ?? [];
    const inputMeasures = definition?.inputs?.inputMeasures ?? [];
    const dimensions = definition?.dimensions ?? [];
    const semanticModels = definition?.semanticModels ?? [];
    const metricDescription = definition?.description ?? description;
    const structuredSources = useMemo(() => {
        const sourceKeys = new Set<string>();
        structuredFilters.forEach((entry) => {
            sourceKeys.add(entry.source || '__metric__');
        });
        return sourceKeys;
    }, [structuredFilters]);
    const rawFiltersToShow = useMemo(
        () =>
            rawFilters.filter(
                (entry) => !structuredSources.has(entry.source || '__metric__'),
            ),
        [rawFilters, structuredSources],
    );

    return (
        <Stack spacing="md">
            <MetricFlowLineagePanel lineage={_lineage} isLoading={isLoading} />

            <Paper withBorder radius="md" p="md">
                <Stack spacing="xs">
                    <Group position="apart">
                        <Text size="sm" fw={600} c="ldDark.7">
                            指标定义
                        </Text>
                        {definition?.type && (
                            <Badge
                                radius="sm"
                                color="indigo"
                                p={2}
                                sx={(theme) => ({
                                    boxShadow: theme.shadows.subtle,
                                    border: `1px solid ${theme.colors.indigo[1]}`,
                                })}
                            >
                                {definition.type}
                            </Badge>
                        )}
                    </Group>
                    <Divider color="ldGray.2" />
                    {isLoading ? (
                        <Text size="xs" c="ldGray.6">
                            加载中…
                        </Text>
                    ) : (
                        <Stack spacing="sm">
                            <SimpleGrid
                                cols={2}
                                spacing="sm"
                                breakpoints={[{ maxWidth: 'sm', cols: 1 }]}
                            >
                                <DefinitionRow
                                    label="名称"
                                    value={definition?.name || metric.name}
                                />
                                <DefinitionRow
                                    label="显示名"
                                    value={definition?.label || metric.label}
                                />
                                {semanticModels.length > 0 && (
                                    <DefinitionRow
                                        label="语义模型"
                                        value={
                                            <Group spacing={6}>
                                                {semanticModels.map((model) => (
                                                    <Badge
                                                        key={model.name}
                                                        radius="sm"
                                                        color="grape"
                                                        variant="light"
                                                    >
                                                        {model.label ||
                                                            model.name}
                                                    </Badge>
                                                ))}
                                            </Group>
                                        }
                                    />
                                )}
                            </SimpleGrid>

                            {definition?.formulaDisplay && (
                                <Stack spacing={4}>
                                    <Text size="xs" fw={600} c="ldGray.7">
                                        公式
                                    </Text>
                                    <Paper
                                        withBorder
                                        radius="sm"
                                        p="xs"
                                        sx={(theme) => ({
                                            backgroundColor:
                                                theme.colors.ldGray[0],
                                        })}
                                    >
                                        <Code fz="xs">
                                            {definition.formulaDisplay}
                                        </Code>
                                    </Paper>
                                </Stack>
                            )}

                            {metricDescription && (
                                <Stack spacing={4}>
                                    <Text size="xs" fw={600} c="ldGray.7">
                                        描述
                                    </Text>
                                    <Text size="sm" c="ldDark.7">
                                        {metricDescription}
                                    </Text>
                                </Stack>
                            )}

                            <Divider color="ldGray.2" />

                            <Stack spacing={6}>
                                <Text size="xs" fw={600} c="ldGray.7">
                                    输入指标
                                </Text>
                                {inputMetrics.length > 0 ? (
                                    <Group spacing={6}>
                                        {inputMetrics.map((inputMetric) => (
                                            <Badge
                                                key={inputMetric.name}
                                                radius="sm"
                                                color="blue"
                                                variant="light"
                                            >
                                                {inputMetric.label ||
                                                    inputMetric.name}
                                            </Badge>
                                        ))}
                                    </Group>
                                ) : (
                                    <Text size="xs" c="ldGray.6">
                                        暂无
                                    </Text>
                                )}
                            </Stack>

                            <Stack spacing={6}>
                                <Text size="xs" fw={600} c="ldGray.7">
                                    输入度量
                                </Text>
                                {inputMeasures.length > 0 ? (
                                    <Group spacing={6}>
                                        {inputMeasures.map((inputMeasure) => (
                                            <Badge
                                                key={inputMeasure.name}
                                                radius="sm"
                                                color="teal"
                                                variant="light"
                                            >
                                                {inputMeasure.label ||
                                                    inputMeasure.name}
                                            </Badge>
                                        ))}
                                    </Group>
                                ) : (
                                    <Text size="xs" c="ldGray.6">
                                        暂无
                                    </Text>
                                )}
                            </Stack>

                            <Stack spacing={6}>
                                <Text size="xs" fw={600} c="ldGray.7">
                                    维度
                                </Text>
                                {dimensions.length > 0 ? (
                                    <Group spacing={6}>
                                        {dimensions.map((dimension) => (
                                            <Badge
                                                key={dimension.name}
                                                radius="sm"
                                                color="gray"
                                                variant="light"
                                            >
                                                {dimension.label ||
                                                    dimension.name}
                                            </Badge>
                                        ))}
                                    </Group>
                                ) : (
                                    <Text size="xs" c="ldGray.6">
                                        暂无
                                    </Text>
                                )}
                            </Stack>

                            <Stack spacing={6}>
                                <Text size="xs" fw={600} c="ldGray.7">
                                    过滤条件
                                </Text>
                                {filterLabels.length > 0 ||
                                rawFiltersToShow.length > 0 ? (
                                    <Stack spacing={6}>
                                        {filterLabels.map((filter) => (
                                            <Paper
                                                key={filter.id}
                                                withBorder
                                                radius="sm"
                                                px="xs"
                                                py={6}
                                                sx={(theme) => ({
                                                    backgroundColor:
                                                        theme.colors.ldGray[0],
                                                })}
                                            >
                                                <Group
                                                    spacing={6}
                                                    align="center"
                                                >
                                                    {filter.source && (
                                                        <Badge
                                                            size="xs"
                                                            radius="sm"
                                                            color="indigo"
                                                            variant="light"
                                                        >
                                                            {filter.source}
                                                        </Badge>
                                                    )}
                                                    <Code fz="xs" fw={600}>
                                                        {filter.label.field}
                                                    </Code>
                                                    <Text
                                                        size="xs"
                                                        fw={500}
                                                        c="ldGray.7"
                                                    >
                                                        {filter.label.operator}
                                                    </Text>
                                                    <Code fz="xs">
                                                        {filter.label.value ||
                                                            '—'}
                                                    </Code>
                                                </Group>
                                            </Paper>
                                        ))}
                                        {rawFiltersToShow.map((filter) => (
                                            <Paper
                                                key={filter.id}
                                                withBorder
                                                radius="sm"
                                                px="xs"
                                                py={6}
                                                sx={(theme) => ({
                                                    backgroundColor:
                                                        theme.colors.ldGray[0],
                                                })}
                                            >
                                                <Stack spacing={4}>
                                                    {filter.source && (
                                                        <Badge
                                                            size="xs"
                                                            radius="sm"
                                                            color="indigo"
                                                            variant="light"
                                                            w="fit-content"
                                                        >
                                                            {filter.source}
                                                        </Badge>
                                                    )}
                                                    <Code fz="xs">
                                                        {filter.expression}
                                                    </Code>
                                                </Stack>
                                            </Paper>
                                        ))}
                                    </Stack>
                                ) : (
                                    <Text size="xs" c="ldGray.6">
                                        暂无
                                    </Text>
                                )}
                            </Stack>
                        </Stack>
                    )}
                </Stack>
            </Paper>
        </Stack>
    );
};

export default MetricFlowMetricDetails;
