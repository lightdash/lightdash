import {
    addFilterRule,
    Dimension,
    Field,
    FilterRule,
    Filters,
    friendlyName,
    getFilterRulesByFieldType,
    getTotalFilterRules,
    isField,
    isFilterableField,
    MetricType,
    snakeCaseName,
    TableCalculation,
} from '@lightdash/common';
import {
    Accordion,
    Button,
    Modal,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { Dispatch, FC, SetStateAction, useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useExplore } from '../../../hooks/useExplore';
import { useProject } from '../../../hooks/useProject';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import FilterRuleForm from '../../common/Filters/FilterRuleForm';
import {
    FiltersProvider,
    useFiltersContext,
} from '../../common/Filters/FiltersProvider';
import { useFieldsWithSuggestions } from '../FiltersCard/useFieldsWithSuggestions';

type Props = {
    isCreatingCustomMetric: boolean;
    setIsCreatingCustomMetric: Dispatch<SetStateAction<boolean>>;
    customMetricType: MetricType | undefined;
    item: Dimension;
};

const FilterForm: FC<{
    item: Dimension;
    customMetricFilters: Filters;
    setCustomMetricFilters: Dispatch<SetStateAction<Filters>>;
}> = ({ item, customMetricFilters, setCustomMetricFilters }) => {
    const isEditMode = useExplorerContext(
        (context) => context.state.isEditMode,
    );
    const totalFilterRules = getTotalFilterRules(customMetricFilters);

    const { fieldsMap } = useFiltersContext();

    const fields = Object.values(fieldsMap);

    const addFieldRule = useCallback(
        (field: Field | TableCalculation | Dimension) => {
            if (isField(field) && isFilterableField(field)) {
                setCustomMetricFilters(
                    addFilterRule({ filters: customMetricFilters, field }),
                );
            }
        },
        [customMetricFilters, setCustomMetricFilters],
    );

    const onChangeItem = useCallback(
        (index: number, filterRule: FilterRule) => {
            const result = getFilterRulesByFieldType(fields, [
                ...totalFilterRules.slice(0, index),
                filterRule,
                ...totalFilterRules.slice(index + 1),
            ]);

            setCustomMetricFilters({
                ...customMetricFilters,
                dimensions:
                    result.dimensions.length > 0
                        ? {
                              id: uuidv4(),
                              ...customMetricFilters.dimensions,
                              and: result.dimensions,
                          }
                        : undefined,
                metrics:
                    result.metrics.length > 0
                        ? {
                              id: uuidv4(),
                              ...customMetricFilters.metrics,
                              and: result.metrics,
                          }
                        : undefined,
            });
        },
        [fields, customMetricFilters, totalFilterRules, setCustomMetricFilters],
    );

    const onDeleteItem = useCallback(
        (index: number) => {
            const result = getFilterRulesByFieldType(fields, [
                ...totalFilterRules.slice(0, index),
                ...totalFilterRules.slice(index + 1),
            ]);

            setCustomMetricFilters({
                ...customMetricFilters,
                dimensions:
                    result.dimensions.length > 0
                        ? {
                              id: uuidv4(),
                              ...customMetricFilters.dimensions,
                              and: result.dimensions,
                          }
                        : undefined,
                metrics:
                    result.metrics.length > 0
                        ? {
                              id: uuidv4(),
                              ...customMetricFilters.metrics,
                              and: result.metrics,
                          }
                        : undefined,
            });
        },
        [fields, customMetricFilters, totalFilterRules, setCustomMetricFilters],
    );

    return (
        <Stack spacing="sm">
            {totalFilterRules.map((filterRule, index) => (
                <FilterRuleForm
                    key={filterRule.id}
                    filterRule={filterRule}
                    fields={fields}
                    isEditMode={isEditMode}
                    onChange={(value) => onChangeItem(index, value)}
                    onDelete={() => onDeleteItem(index)}
                />
            ))}
            <Button
                display="block"
                mr="auto"
                size="xs"
                variant="outline"
                onClick={() => {
                    addFieldRule(item);
                }}
                disabled={fields.length <= 0}
            >
                Add filter
            </Button>
        </Stack>
    );
};

export const CreateCustomMetricModal: FC<Props> = ({
    item,
    isCreatingCustomMetric,
    setIsCreatingCustomMetric,
    customMetricType,
}) => {
    const [customMetricName, setCustomMetricName] = useState(
        customMetricType
            ? `${friendlyName(customMetricType)} of ${item.label}`
            : '',
    );
    const [customMetricFilters, setCustomMetricFilters] = useState<Filters>({});

    const { projectUuid } = useParams<{ projectUuid: string }>();
    const project = useProject(projectUuid);

    const addAdditionalMetric = useExplorerContext(
        (context) => context.actions.addAdditionalMetric,
    );
    const tableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );

    const additionalMetrics = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.additionalMetrics,
    );
    const queryResults = useExplorerContext(
        (context) => context.queryResults.data,
    );

    const { data } = useExplore(tableName);

    const fieldsWithSuggestions = useFieldsWithSuggestions({
        data,
        queryResults,
        additionalMetrics,
    });

    const createCustomMetric = useCallback(
        (dimension: Dimension, type: MetricType) => {
            const shouldCopyFormatting = [
                MetricType.PERCENTILE,
                MetricType.MEDIAN,
                MetricType.AVERAGE,
                MetricType.SUM,
                MetricType.MIN,
                MetricType.MAX,
            ].includes(type);
            const compact =
                shouldCopyFormatting && dimension.compact
                    ? { compact: dimension.compact }
                    : {};
            const format =
                shouldCopyFormatting && dimension.format
                    ? { format: dimension.format }
                    : {};

            const defaultRound =
                type === MetricType.AVERAGE ? { round: 2 } : {};
            const round =
                shouldCopyFormatting && dimension.round
                    ? { round: dimension.round }
                    : defaultRound;

            addAdditionalMetric({
                name: `${dimension.name}_${snakeCaseName(customMetricName)}`,
                label: customMetricName,
                table: dimension.table,
                sql: dimension.sql,
                description: `${friendlyName(type)} of ${
                    dimension.label
                } on the table ${dimension.tableLabel}`,
                type,
                ...(!!Object.keys(customMetricFilters).length && {
                    filters: getTotalFilterRules(customMetricFilters),
                }),
                ...format,
                ...round,
                ...compact,
            });
            setIsCreatingCustomMetric(false);
        },
        [
            addAdditionalMetric,
            customMetricFilters,
            customMetricName,
            setIsCreatingCustomMetric,
        ],
    );

    return (
        <Modal
            withinPortal
            closeOnClickOutside
            zIndex={15}
            size="xl"
            centered
            opened={isCreatingCustomMetric}
            onClose={() => setIsCreatingCustomMetric(false)}
            title={<Title order={4}>Create Custom Metric</Title>}
        >
            <Stack>
                <TextInput
                    name="customMetricName"
                    label="Name"
                    required
                    placeholder="Enter custom metric name"
                    onChange={(e) => {
                        setCustomMetricName(e.target.value);
                    }}
                    defaultValue={
                        customMetricType
                            ? `${friendlyName(customMetricType)} of ${
                                  item.label
                              }`
                            : ''
                    }
                />
                <Accordion chevronPosition="left" chevronSize="xs">
                    <Accordion.Item value="filters">
                        <Accordion.Control>
                            <Text fw={500} fz="sm">
                                Filters{' '}
                                <Text span fz="xs" color="gray.5" fw={400}>
                                    (optional)
                                </Text>
                            </Text>
                        </Accordion.Control>
                        <Accordion.Panel>
                            <FiltersProvider
                                projectUuid={projectUuid}
                                fieldsMap={fieldsWithSuggestions}
                                startOfWeek={
                                    project.data?.warehouseConnection
                                        ?.startOfWeek
                                }
                            >
                                <FilterForm
                                    item={item}
                                    customMetricFilters={customMetricFilters}
                                    setCustomMetricFilters={
                                        setCustomMetricFilters
                                    }
                                />
                            </FiltersProvider>
                        </Accordion.Panel>
                    </Accordion.Item>
                </Accordion>

                <Button
                    display="block"
                    ml="auto"
                    type="submit"
                    onClick={() => createCustomMetric(item, customMetricType!)}
                >
                    Create
                </Button>
            </Stack>
        </Modal>
    );
};
