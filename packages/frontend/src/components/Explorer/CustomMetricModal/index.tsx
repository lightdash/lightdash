import {
    AdditionalMetric,
    Dimension,
    fieldId as getFieldId,
    friendlyName,
    isAdditionalMetric,
    isDimension,
    MetricFilterRule,
    MetricType,
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
import { useForm } from '@mantine/form';
import {
    Dispatch,
    FC,
    SetStateAction,
    useCallback,
    useMemo,
    useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import { FiltersProvider } from '../../common/Filters/FiltersProvider';
import { FilterForm, MetricFilterRuleWithFieldId } from './FilterForm';
import { useDataForFiltersProvider } from './hooks/useDataForFiltersProvider';
import {
    addFieldIdToMetricFilterRule,
    getCustomMetricDescription,
    getCustomMetricName,
} from './utils';

type Props = {
    isEditMode: boolean;
    isCreatingCustomMetric: boolean;
    setIsCreatingCustomMetric: Dispatch<SetStateAction<boolean>>;
    customMetricType: MetricType | undefined;
    item: Dimension | AdditionalMetric;
};

export const CustomMetricModal: FC<Props> = ({
    isEditMode,
    item,
    isCreatingCustomMetric,
    setIsCreatingCustomMetric,
    customMetricType,
}) => {
    const addAdditionalMetric = useExplorerContext(
        (context) => context.actions.addAdditionalMetric,
    );
    const editAdditionalMetric = useExplorerContext(
        (context) => context.actions.editAdditionalMetric,
    );
    const tableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );

    const { data: exploreData } = useExplore(tableName);

    const additionalMetrics = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.additionalMetrics,
    );

    const { projectUuid, fieldsMap, startOfWeek } = useDataForFiltersProvider();

    const form = useForm({
        validateInputOnChange: true,
        initialValues: {
            customMetricLabel: isEditMode
                ? item.label
                : customMetricType
                ? `${friendlyName(customMetricType)} of ${item.label}`
                : '',
        },
        validate: {
            customMetricLabel: (label) => {
                if (!label) return null;
                const metricName = getCustomMetricName(label, item, isEditMode);
                return additionalMetrics?.some(
                    (metric) => metric.name === metricName,
                )
                    ? 'Metric with this label already exists'
                    : null;
            },
        },
    });

    const currentCustomMetricFiltersWithIds = useMemo(
        () =>
            isAdditionalMetric(item)
                ? item.filters?.map((filterRule) =>
                      addFieldIdToMetricFilterRule(filterRule),
                  ) || []
                : [],

        [item],
    );

    const [customMetricFiltersWithIds, setCustomMetricFiltersWithIds] =
        useState<MetricFilterRuleWithFieldId[]>(
            isEditMode ? currentCustomMetricFiltersWithIds : [],
        );

    const editOrAddCustomMetric = useCallback(
        (dimension: Dimension | AdditionalMetric, type: MetricType) => {
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

            if (
                isEditMode &&
                isAdditionalMetric(item) &&
                form.values.customMetricLabel &&
                item.baseDimensionName &&
                dimension.label &&
                exploreData
            ) {
                const tableLabel = exploreData.tables[item.table].label;
                editAdditionalMetric(
                    {
                        ...item,
                        name: getCustomMetricName(
                            form.values.customMetricLabel,
                            item,
                            true,
                        ),
                        description: getCustomMetricDescription(
                            type,
                            dimension.label,
                            tableLabel,
                            customMetricFilters,
                        ),
                        label: form.values.customMetricLabel,
                        sql: dimension.sql,
                        type,
                        filters:
                            customMetricFilters.length > 0
                                ? customMetricFilters
                                : [],
                        ...format,
                        ...round,
                        ...compact,
                    },
                    getFieldId(item),
                );
            } else if (
                isDimension(dimension) &&
                form.values.customMetricLabel
            ) {
                addAdditionalMetric({
                    uuid: uuidv4(),
                    name: getCustomMetricName(
                        form.values.customMetricLabel,
                        dimension,
                        false,
                    ),
                    description: getCustomMetricDescription(
                        type,
                        dimension.label,
                        dimension.tableLabel,
                        customMetricFilters,
                    ),
                    label: form.values.customMetricLabel,
                    table: dimension.table,
                    sql: dimension.sql,
                    type,
                    filters:
                        customMetricFilters.length > 0
                            ? customMetricFilters
                            : [],
                    baseDimensionName: dimension.name,
                    ...format,
                    ...round,
                    ...compact,
                });
            }
            setIsCreatingCustomMetric(false);
        },
        [
            addAdditionalMetric,
            customMetricFiltersWithIds,
            editAdditionalMetric,
            exploreData,
            form.values.customMetricLabel,
            isEditMode,
            item,
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
            <form
                onSubmit={() => editOrAddCustomMetric(item, customMetricType!)}
            >
                <Stack>
                    <TextInput
                        label="Label"
                        required
                        placeholder="Enter custom metric label"
                        {...form.getInputProps('customMetricLabel')}
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
                                    fieldsMap={fieldsMap}
                                    startOfWeek={startOfWeek}
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

                    <Button display="block" ml="auto" type="submit">
                        {isEditMode ? 'Save changes' : 'Create'}
                    </Button>
                </Stack>
            </form>
        </Modal>
    );
};
