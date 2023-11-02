import {
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
    NumberInput,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import useToaster from '../../../hooks/toaster/useToaster';
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

export const CustomMetricModal = () => {
    const {
        isOpen,
        isEditing,
        item,
        type: customMetricType,
    } = useExplorerContext((context) => context.state.modals.additionalMetric);

    const toggleModal = useExplorerContext(
        (context) => context.actions.toggleAdditionalMetricModal,
    );

    const { showToastSuccess } = useToaster();
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
            customMetricLabel: '',
            percentile: 50,
        },
        validate: {
            customMetricLabel: (label) => {
                if (!label) return null;

                if (!item) return null;

                const metricName = getCustomMetricName(
                    label,
                    isEditing &&
                        isAdditionalMetric(item) &&
                        'baseDimensionName' in item &&
                        item.baseDimensionName
                        ? item.baseDimensionName
                        : item.name,
                );

                if (isEditing && metricName === item.name) {
                    return null;
                }

                return additionalMetrics?.some(
                    (metric) => metric.name === metricName,
                )
                    ? 'Metric with this label already exists'
                    : null;
            },
            percentile: (percentile: number) => {
                if (!percentile) return null;
                if (percentile < 0 || percentile > 100) {
                    return 'Percentile must be a number between 0 and 100';
                }
            },
        },
    });

    const { setFieldValue } = form;
    useEffect(() => {
        if (!item || !customMetricType) return;

        if (item.label && customMetricType) {
            setFieldValue(
                'customMetricLabel',
                isEditing
                    ? item.label
                    : customMetricType
                    ? `${friendlyName(customMetricType)} of ${item.label}`
                    : '',
            );
        }

        if (
            isEditing &&
            isAdditionalMetric(item) &&
            item.percentile !== undefined
        ) {
            setFieldValue('percentile', item.percentile);
        }
    }, [setFieldValue, item, customMetricType, isEditing]);

    const initialCustomMetricFiltersWithIds = useMemo(() => {
        if (!isEditing) return [];

        return isAdditionalMetric(item)
            ? item.filters?.map((filterRule) =>
                  addFieldIdToMetricFilterRule(filterRule),
              ) || []
            : [];
    }, [isEditing, item]);

    const [customMetricFiltersWithIds, setCustomMetricFiltersWithIds] =
        useState<MetricFilterRuleWithFieldId[]>(
            initialCustomMetricFiltersWithIds,
        );

    useEffect(() => {
        setCustomMetricFiltersWithIds(initialCustomMetricFiltersWithIds);
    }, [initialCustomMetricFiltersWithIds]);

    const handleOnSubmit = form.onSubmit(
        ({ customMetricLabel, percentile }) => {
            if (!item || !customMetricType) return;

            const data = prepareCustomMetricData({
                item,
                type: customMetricType,
                customMetricLabel,
                customMetricFiltersWithIds,
                isEditingCustomMetric: !!isEditing,
                exploreData,
                percentile,
            });

            if (isEditing && isAdditionalMetric(item)) {
                editAdditionalMetric(
                    {
                        ...item,
                        ...data,
                    },
                    getFieldId(item),
                );
                showToastSuccess({
                    title: 'Custom metric edited successfully',
                });
            } else if (isDimension(item) && form.values.customMetricLabel) {
                addAdditionalMetric({
                    uuid: uuidv4(),
                    baseDimensionName: item.name,
                    ...data,
                });
                showToastSuccess({
                    title: 'Custom metric added successfully',
                });
            }
            toggleModal();
        },
    );

    const defaultFilterRuleFieldId = useMemo(() => {
        if (item) {
            if (!isEditing) return getFieldId(item);

            if (
                isEditing &&
                'baseDimensionName' in item &&
                item.baseDimensionName
            ) {
                return `${item.table}_${item.baseDimensionName}`;
            }
        }
    }, [isEditing, item]);

    return item ? (
        <Modal
            size="xl"
            onClick={(e) => e.stopPropagation()}
            opened={isOpen}
            onClose={() => toggleModal(undefined)}
            title={
                <Title order={4}>
                    {isEditing ? 'Edit' : 'Create'} Custom Metric
                </Title>
            }
        >
            <form onSubmit={handleOnSubmit}>
                <Stack>
                    <TextInput
                        label="Label"
                        required
                        placeholder="Enter custom metric label"
                        {...form.getInputProps('customMetricLabel')}
                    />
                    {customMetricType === MetricType.PERCENTILE && (
                        <NumberInput
                            w={100}
                            max={100}
                            min={0}
                            required
                            label="Percentile"
                            {...form.getInputProps('percentile')}
                        />
                    )}
                    <Accordion chevronPosition="left" chevronSize="xs">
                        <Accordion.Item value="filters">
                            <Accordion.Control>
                                <Text fw={500} fz="sm">
                                    Filters
                                    <Text span fw={400} fz="xs">
                                        {customMetricFiltersWithIds.length > 0
                                            ? `(${customMetricFiltersWithIds.length}) `
                                            : ' '}
                                    </Text>
                                    <Text span fz="xs" color="gray.5" fw={400}>
                                        (optional)
                                    </Text>
                                </Text>
                            </Accordion.Control>
                            <Accordion.Panel>
                                <FiltersProvider
                                    projectUuid={projectUuid}
                                    fieldsMap={fieldsMap}
                                    startOfWeek={startOfWeek ?? undefined}
                                    inModal
                                >
                                    <FilterForm
                                        defaultFilterRuleFieldId={
                                            defaultFilterRuleFieldId
                                        }
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
                        {isEditing ? 'Save changes' : 'Create'}
                    </Button>
                </Stack>
            </form>
        </Modal>
    ) : null;
};
