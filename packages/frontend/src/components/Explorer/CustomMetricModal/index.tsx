import {
    AdditionalMetric,
    Dimension,
    fieldId as getFieldId,
    friendlyName,
    isAdditionalMetric,
    isDimension,
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
    getCustomMetricName,
    prepareCustomMetricData,
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

                const metricName = getCustomMetricName(
                    label,
                    isEditMode &&
                        isAdditionalMetric(item) &&
                        'baseDimensionName' in item &&
                        item.baseDimensionName
                        ? item.baseDimensionName
                        : item.name,
                );
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
            if (!form.values.customMetricLabel) return;

            const data = prepareCustomMetricData({
                dimension,
                type,
                customMetricLabel: form.values.customMetricLabel,
                customMetricFiltersWithIds,
                isEditMode,
                item,
                exploreData,
            });

            if (isEditMode && isAdditionalMetric(item)) {
                editAdditionalMetric(
                    {
                        ...item,
                        ...data,
                    },
                    getFieldId(item),
                );
            } else if (
                isDimension(dimension) &&
                form.values.customMetricLabel
            ) {
                addAdditionalMetric({
                    uuid: uuidv4(),
                    table: dimension.table,
                    sql: dimension.sql,
                    type,
                    baseDimensionName: dimension.name,
                    ...data,
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
