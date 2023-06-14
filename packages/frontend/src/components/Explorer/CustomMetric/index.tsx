import {
    ConditionalOperator,
    createFilterRuleFromField,
    Dimension,
    Field,
    FieldTarget,
    FilterRule,
    friendlyName,
    isField,
    isFilterableField,
    MetricFilterRule,
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
import { useExplore } from '../../../hooks/useExplore';
import { useProject } from '../../../hooks/useProject';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import FilterRuleForm from '../../common/Filters/FilterRuleForm';
import {
    FiltersProvider,
    useFiltersContext,
} from '../../common/Filters/FiltersProvider';
import { useFieldsWithSuggestions } from '../FiltersCard/useFieldsWithSuggestions';

interface MetricFilterRuleWithFieldIds
    extends FilterRule<
        ConditionalOperator,
        FieldTarget & { fieldRef: string }
    > {}

type Props = {
    isEditMode: boolean;
    isCreatingCustomMetric: boolean;
    setIsCreatingCustomMetric: Dispatch<SetStateAction<boolean>>;
    customMetricType: MetricType | undefined;
    item: Dimension;
};

const FilterForm: FC<{
    item: Dimension;
    customMetricFiltersWithIds: MetricFilterRuleWithFieldIds[];
    setCustomMetricFiltersWithIds: Dispatch<
        SetStateAction<MetricFilterRuleWithFieldIds[]>
    >;
}> = ({ item, customMetricFiltersWithIds, setCustomMetricFiltersWithIds }) => {
    const isEditMode = useExplorerContext(
        (context) => context.state.isEditMode,
    );

    const { fieldsMap } = useFiltersContext();

    const fields = Object.values(fieldsMap);

    const addFieldRule = useCallback(
        (field: Field | TableCalculation | Dimension) => {
            if (isField(field) && isFilterableField(field)) {
                const newFilterRule = createFilterRuleFromField(field);

                setCustomMetricFiltersWithIds([
                    ...customMetricFiltersWithIds,
                    {
                        ...newFilterRule,
                        target: {
                            ...newFilterRule.target,
                            fieldRef: `${field.table}.${field.name}`,
                        },
                    },
                ]);
            }
        },
        [customMetricFiltersWithIds, setCustomMetricFiltersWithIds],
    );

    const onChangeItem = useCallback(
        (itemIndex: number, filterRule: FilterRule) => {
            setCustomMetricFiltersWithIds(
                customMetricFiltersWithIds.map((customMetricFilter, index) =>
                    itemIndex === index
                        ? {
                              ...filterRule,
                              target: {
                                  ...filterRule.target,
                                  fieldRef: `${
                                      fieldsMap[filterRule.target.fieldId].table
                                  }.${
                                      fieldsMap[filterRule.target.fieldId].name
                                  }`,
                              },
                          }
                        : customMetricFilter,
                ),
            );
        },
        [customMetricFiltersWithIds, fieldsMap, setCustomMetricFiltersWithIds],
    );

    const onDeleteItem = useCallback(
        (index: number) => {
            setCustomMetricFiltersWithIds(
                customMetricFiltersWithIds.filter((value, i) => i !== index),
            );
        },
        [customMetricFiltersWithIds, setCustomMetricFiltersWithIds],
    );

    return (
        <Stack spacing="sm">
            {customMetricFiltersWithIds.map((filterRule, index) => (
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
    isEditMode,
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

    const [customMetricFiltersWithIds, setCustomMetricFiltersWithIds] =
        useState<MetricFilterRuleWithFieldIds[]>([]);

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

            const customMetricFilters: MetricFilterRule[] =
                customMetricFiltersWithIds.map(
                    ({
                        target: { fieldId, ...restTarget },
                        ...customMetricFilter
                    }) => ({
                        ...customMetricFilter,
                        target: restTarget,
                    }),
                );

            addAdditionalMetric({
                name: `${dimension.name}_${snakeCaseName(customMetricName)}`,
                label: customMetricName,
                table: dimension.table,
                sql: dimension.sql,
                description: `${friendlyName(type)} of ${
                    dimension.label
                } on the table ${dimension.tableLabel}`,
                type,
                ...(customMetricFilters.length > 0 && {
                    filters: customMetricFilters,
                }),
                ...format,
                ...round,
                ...compact,
            });
            setIsCreatingCustomMetric(false);
        },
        [
            addAdditionalMetric,
            customMetricFiltersWithIds,
            customMetricName,
            setIsCreatingCustomMetric,
        ],
    );

    return (
        <Modal
            size="xl"
            centered
            zIndex={15}
            onClick={(e) => e.stopPropagation()}
            opened={isCreatingCustomMetric}
            onClose={() => setIsCreatingCustomMetric(false)}
            title={
                <Title order={4}>
                    {isEditMode ? 'Edit' : 'Create'} Custom Metric
                </Title>
            }
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
                        isEditMode
                            ? item.label
                            : `${friendlyName(customMetricType!)} of ${
                                  item.label
                              }`
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
                                    customMetricFiltersWithIds={
                                        customMetricFiltersWithIds
                                    }
                                    setCustomMetricFiltersWithIds={
                                        setCustomMetricFiltersWithIds
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
                    {isEditMode ? 'Save changes' : 'Create'}
                </Button>
            </Stack>
        </Modal>
    );
};
