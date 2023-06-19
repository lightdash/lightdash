import {
    fieldId as getFieldId,
    friendlyName,
    isAdditionalMetric,
    isDimension,
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
        },
    });

    useEffect(() => {
        if (item?.label && customMetricType) {
            form.setFieldValue(
                'customMetricLabel',
                isEditing
                    ? item.label
                    : customMetricType
                    ? `${friendlyName(customMetricType)} of ${item.label}`
                    : '',
            );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item, customMetricType]);

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
            isEditing ? currentCustomMetricFiltersWithIds : [],
        );

    const handleOnSubmit = form.onSubmit(({ customMetricLabel }) => {
        if (!customMetricLabel || !item) return;

        const data = prepareCustomMetricData({
            dimension: item,
            type: customMetricType!,
            customMetricLabel,
            customMetricFiltersWithIds,
            isEditingCustomMetric: !!isEditing,
            item,
            exploreData,
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
                table: item.table,
                sql: item.sql,
                type: customMetricType!,
                baseDimensionName: item.name,
                ...data,
            });
            showToastSuccess({
                title: 'Custom metric added successfully',
            });
        }
        toggleModal();
    });

    return item ? (
        <Modal
            size="xl"
            centered
            zIndex={15}
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
                        {isEditing ? 'Save changes' : 'Create'}
                    </Button>
                </Stack>
            </form>
        </Modal>
    ) : null;
};
