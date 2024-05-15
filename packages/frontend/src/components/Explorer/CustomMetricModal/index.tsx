import {
    canApplyFormattingToCustomMetric,
    CustomFormatType,
    fieldId as getFieldId,
    friendlyName,
    isAdditionalMetric,
    isCustomDimension,
    isDimension,
    MetricType,
    NumberSeparator,
    type AdditionalMetric,
    type CustomFormat,
    type Dimension,
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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ValueOf } from 'type-fest';
import { v4 as uuidv4 } from 'uuid';
import useToaster from '../../../hooks/toaster/useToaster';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import { FiltersProvider } from '../../common/Filters/FiltersProvider';
import { FormatForm } from '../FormatForm';
import { FilterForm, type MetricFilterRuleWithFieldId } from './FilterForm';
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

    let dimensionToCheck: Dimension | undefined;

    if (isDimension(item)) {
        dimensionToCheck = item;
    }
    if (isEditing && isAdditionalMetric(item) && item.baseDimensionName) {
        dimensionToCheck =
            exploreData?.tables[item.table]?.dimensions[item.baseDimensionName];
    }

    const canApplyFormatting =
        dimensionToCheck &&
        customMetricType &&
        canApplyFormattingToCustomMetric(dimensionToCheck, customMetricType);

    const additionalMetrics = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.additionalMetrics,
    );

    const { projectUuid, fieldsMap, startOfWeek } = useDataForFiltersProvider();

    const form = useForm<
        Pick<AdditionalMetric, 'percentile'> & {
            format: CustomFormat;
            customMetricLabel: string;
        }
    >({
        validateInputOnChange: true,
        initialValues: {
            customMetricLabel: '',
            percentile: 50,
            format: {
                type: CustomFormatType.DEFAULT,
                round: undefined,
                separator: NumberSeparator.DEFAULT,
                currency: undefined,
                compact: undefined,
                prefix: undefined,
                suffix: undefined,
            },
        },
        validate: {
            customMetricLabel: (label) => {
                if (!label) return null;

                if (!item) return null;

                const metricName = getCustomMetricName(
                    item.table,
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
            percentile: (percentile) => {
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

        const label = isCustomDimension(item) ? item.name : item.label;
        if (label && customMetricType) {
            setFieldValue(
                'customMetricLabel',
                isEditing
                    ? label
                    : customMetricType
                    ? `${friendlyName(customMetricType)} of ${label}`
                    : '',
            );
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

    useEffect(
        function populateForm() {
            if (isEditing && isAdditionalMetric(item)) {
                if (item.percentile)
                    setFieldValue('percentile', item.percentile);

                if (item.formatOptions) {
                    setFieldValue('format', item.formatOptions);
                }
            }
        },
        [isEditing, item, setFieldValue],
    );

    const handleClose = useCallback(() => {
        form.reset();
        toggleModal();
    }, [form, toggleModal]);

    const handleOnSubmit = form.onSubmit(
        ({ customMetricLabel, percentile, format }) => {
            if (!item || !customMetricType) return;

            const data = prepareCustomMetricData({
                item,
                type: customMetricType,
                customMetricLabel,
                customMetricFiltersWithIds,
                isEditingCustomMetric: !!isEditing,
                exploreData,
                percentile,
                formatOptions: format,
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
            } else if (isCustomDimension(item)) {
                addAdditionalMetric({
                    uuid: uuidv4(),
                    // Do not add baseDimensionName to avoid invalid validation errors in queryBuilder
                    ...data,
                });
                showToastSuccess({
                    title: 'Custom metric added successfully',
                });
            }
            handleClose();
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

    const getFormatInputProps = (path: keyof CustomFormat) =>
        form.getInputProps(`format.${path}`);

    const setFormatFieldValue = (
        path: keyof CustomFormat,
        value: ValueOf<CustomFormat>,
    ) => form.setFieldValue(`format.${path}`, value);

    return item ? (
        <Modal
            size="xl"
            onClick={(e) => e.stopPropagation()}
            opened={isOpen}
            onClose={handleClose}
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
                        {canApplyFormatting && (
                            <Accordion.Item value="format">
                                <Accordion.Control>
                                    <Text fw={500} fz="sm">
                                        Format
                                    </Text>
                                </Accordion.Control>
                                <Accordion.Panel>
                                    <FormatForm
                                        formatInputProps={getFormatInputProps}
                                        format={form.values.format}
                                        setFormatFieldValue={
                                            setFormatFieldValue
                                        }
                                    />
                                </Accordion.Panel>
                            </Accordion.Item>
                        )}
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
                                    popoverProps={{
                                        withinPortal: true,
                                    }}
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
