import {
    canApplyFormattingToCustomMetric,
    CustomFormatType,
    friendlyName,
    getCustomMetricType,
    getFilterableDimensionsFromItemsMap,
    getItemId,
    getMetrics,
    isAdditionalMetric,
    isCustomDimension,
    isDimension,
    isNonAggregateMetricType,
    MetricType,
    NumberSeparator,
    type AdditionalMetric,
    type CustomFormat,
    type Dimension,
    type FilterableDimension,
} from '@lightdash/common';
import {
    Accordion,
    Button,
    Group,
    NumberInput,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconSparkles } from '@tabler/icons-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { type ValueOf } from 'type-fest';
import { v4 as uuidv4 } from 'uuid';
import {
    explorerActions,
    selectAdditionalMetrics,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import useToaster from '../../../hooks/toaster/useToaster';
import { useExplore } from '../../../hooks/useExplore';
import Callout from '../../common/Callout';
import FieldIcon from '../../common/Filters/FieldIcon';
import FiltersProvider from '../../common/Filters/FiltersProvider';
import MantineModal from '../../common/MantineModal';
import { FormatForm } from '../FormatForm';
import { FilterForm, type MetricFilterRuleWithFieldId } from './FilterForm';
import { useDataForFiltersProvider } from './hooks/useDataForFiltersProvider';
import {
    addFieldIdToMetricFilterRule,
    getCustomMetricName,
    prepareCustomMetricData,
} from './utils';

export const CustomMetricModal = memo(() => {
    const {
        isOpen,
        isEditing,
        item,
        type: customMetricType,
    } = useExplorerSelector((state) => state.explorer.modals.additionalMetric);

    const dispatch = useExplorerDispatch();
    const additionalMetrics = useExplorerSelector(selectAdditionalMetrics);
    const tableName = useExplorerSelector(selectTableName);

    const { data: exploreData } = useExplore(tableName);

    const { showToastSuccess } = useToaster();

    let dimensionToCheck: Dimension | undefined;

    const { projectUuid, fieldsMap, startOfWeek } = useDataForFiltersProvider();

    const dimensionsMap = useMemo(
        () => getFilterableDimensionsFromItemsMap(fieldsMap),
        [fieldsMap],
    );

    if (isDimension(item)) {
        dimensionToCheck = item;
    }
    if (isEditing && isAdditionalMetric(item) && item.baseDimensionName) {
        dimensionToCheck =
            exploreData?.tables[item.table]?.dimensions[item.baseDimensionName];
    }

    const originalBaseDimensionName = useMemo(() => {
        if (isEditing && isAdditionalMetric(item) && item.baseDimensionName) {
            return item.baseDimensionName;
        }
        if (!isEditing && isDimension(item)) {
            return item.name;
        }
        return null;
    }, [isEditing, item]);

    const [selectedBaseDimensionName, setSelectedBaseDimensionName] = useState<
        string | null
    >(originalBaseDimensionName);

    useEffect(() => {
        setSelectedBaseDimensionName(originalBaseDimensionName);
    }, [originalBaseDimensionName]);

    const baseDimensionOptions = useMemo(() => {
        if (!exploreData || !item || !customMetricType) return [];
        const table = exploreData.tables[item.table];
        if (!table) return [];
        return Object.values(table.dimensions)
            .filter((dim) => !dim.hidden)
            .filter((dim) =>
                getCustomMetricType(dim.type).includes(customMetricType),
            )
            .map((dim) => ({
                value: dim.name,
                label: dim.label || dim.name,
                dim,
            }));
    }, [exploreData, item, customMetricType]);

    const baseDimensionByName = useMemo(() => {
        const map: Record<string, Dimension> = {};
        baseDimensionOptions.forEach(({ value, dim }) => {
            map[value] = dim;
        });
        return map;
    }, [baseDimensionOptions]);

    const selectedBaseDimension = useMemo(() => {
        if (!selectedBaseDimensionName) return null;
        return baseDimensionByName[selectedBaseDimensionName] ?? null;
    }, [baseDimensionByName, selectedBaseDimensionName]);

    const showBaseDimensionPicker =
        isDimension(item) ||
        (isEditing && isAdditionalMetric(item) && !!item.baseDimensionName);

    const baseDimensionChanged =
        isEditing &&
        !!originalBaseDimensionName &&
        !!selectedBaseDimensionName &&
        originalBaseDimensionName !== selectedBaseDimensionName;

    const renderBaseDimensionOption: React.ComponentProps<
        typeof Select
    >['renderOption'] = ({ option }) => {
        const dim = baseDimensionByName[option.value];
        return (
            <Group gap="xs" wrap="nowrap">
                {dim ? <FieldIcon item={dim} size="sm" /> : null}
                <Text size="sm">{option.label}</Text>
            </Group>
        );
    };

    const canApplyFormatting = useMemo(
        () =>
            dimensionToCheck &&
            customMetricType &&
            canApplyFormattingToCustomMetric(
                dimensionToCheck,
                customMetricType,
            ),
        [dimensionToCheck, customMetricType],
    );

    const form = useForm<
        Pick<AdditionalMetric, 'percentile'> & {
            format: CustomFormat;
            customMetricLabel: string;
        }
    >({
        validateInputOnChange: true,
        validateInputOnBlur: true,
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

                const metricIds = exploreData
                    ? getMetrics(exploreData).map(getItemId)
                    : [];
                if (
                    metricIds.includes(
                        getItemId({ table: item.table, name: metricName }),
                    )
                ) {
                    return 'Metric with this ID already exists';
                }

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
                    setFieldValue('format', {
                        // This spread is intentional to avoid @mantine/form mutating the enum object `item.formatOptions.type`
                        ...item.formatOptions,
                    });
                }
            }
        },
        [isEditing, item, setFieldValue],
    );

    const handleClose = useCallback(() => {
        form.reset();
        dispatch(explorerActions.toggleAdditionalMetricModal());
    }, [form, dispatch]);

    const handleOnSubmit = form.onSubmit(
        ({ customMetricLabel, percentile, format }) => {
            if (!item || !customMetricType) return;

            // When the user picked a different source field on edit, swap
            // sql + table on the item handed to prepareCustomMetricData so the
            // resulting metric aggregates the new column. The metric's internal
            // `name` stays stable because prepareCustomMetricData derives it
            // from item.baseDimensionName, which we leave untouched here.
            const effectiveItem =
                isEditing &&
                isAdditionalMetric(item) &&
                baseDimensionChanged &&
                selectedBaseDimension
                    ? {
                          ...item,
                          sql: selectedBaseDimension.sql,
                          table: selectedBaseDimension.table,
                      }
                    : item;

            const data = prepareCustomMetricData({
                item: effectiveItem,
                type: customMetricType,
                customMetricLabel,
                customMetricFiltersWithIds,
                isEditingCustomMetric: !!isEditing,
                exploreData,
                percentile,
                formatOptions: format,
            });

            if (isEditing && isAdditionalMetric(item)) {
                const updatedBaseDimensionName =
                    baseDimensionChanged && selectedBaseDimension
                        ? { baseDimensionName: selectedBaseDimension.name }
                        : {};
                dispatch(
                    explorerActions.editAdditionalMetric({
                        additionalMetric: {
                            ...item,
                            ...data,
                            ...updatedBaseDimensionName,
                        },
                        previousAdditionalMetricName: getItemId(item),
                    }),
                );
                showToastSuccess({
                    title:
                        baseDimensionChanged && selectedBaseDimension
                            ? `Custom metric rebuilt on ${
                                  selectedBaseDimension.label ||
                                  selectedBaseDimension.name
                              }`
                            : 'Custom metric edited successfully',
                });
            } else if (isDimension(item) && form.values.customMetricLabel) {
                dispatch(
                    explorerActions.addAdditionalMetric({
                        uuid: uuidv4(),
                        baseDimensionName: item.name,
                        ...data,
                    }),
                );
                showToastSuccess({
                    title: 'Custom metric added successfully',
                });
            } else if (isCustomDimension(item)) {
                dispatch(
                    explorerActions.addAdditionalMetric({
                        uuid: uuidv4(),
                        // Do not add baseDimensionName to avoid invalid validation errors in queryBuilder
                        ...data,
                    }),
                );
                showToastSuccess({
                    title: 'Custom metric added successfully',
                });
            }
            handleClose();
        },
    );

    const defaultFilterRuleFieldId = useMemo(() => {
        if (item) {
            if (!isEditing) return getItemId(item);

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

    const CUSTOM_METRIC_FORM_ID = 'custom-metric-form';

    if (!isOpen) {
        return null;
    }

    return item ? (
        <MantineModal
            size="xl"
            opened={isOpen}
            onClose={handleClose}
            title={`${isEditing ? 'Edit' : 'Create'} Custom Metric`}
            icon={IconSparkles}
            actions={
                <Button
                    type="submit"
                    form={CUSTOM_METRIC_FORM_ID}
                    disabled={!form.isValid()}
                >
                    {isEditing ? 'Save changes' : 'Create'}
                </Button>
            }
        >
            <form
                id={CUSTOM_METRIC_FORM_ID}
                onSubmit={handleOnSubmit}
                onClick={(e) => e.stopPropagation()}
            >
                <Stack gap="md">
                    <TextInput
                        label="Label"
                        required
                        placeholder="Enter custom metric label"
                        {...form.getInputProps('customMetricLabel')}
                    />
                    {showBaseDimensionPicker && customMetricType && (
                        <Stack gap="xs">
                            <Select
                                label="Source field"
                                description={
                                    isEditing
                                        ? `The field this metric aggregates over. Pick a different one to rebuild it without recreating it.`
                                        : 'The field this metric aggregates over.'
                                }
                                data={baseDimensionOptions.map(
                                    ({ value, label }) => ({ value, label }),
                                )}
                                value={selectedBaseDimensionName}
                                onChange={setSelectedBaseDimensionName}
                                readOnly={!isEditing}
                                searchable={isEditing}
                                allowDeselect={false}
                                renderOption={renderBaseDimensionOption}
                                leftSection={
                                    selectedBaseDimension ? (
                                        <FieldIcon
                                            item={selectedBaseDimension}
                                            size="sm"
                                        />
                                    ) : null
                                }
                                nothingFoundMessage="No compatible fields on this table"
                                comboboxProps={{ withinPortal: true }}
                            />
                            {baseDimensionChanged && selectedBaseDimension ? (
                                <Callout
                                    variant="info"
                                    title="Source field will change"
                                >
                                    This metric will be rebuilt to aggregate{' '}
                                    <Text span fw={600}>
                                        {selectedBaseDimension.label ||
                                            selectedBaseDimension.name}
                                    </Text>
                                    . Filters and format options are preserved,
                                    and the metric ID stays the same so saved
                                    charts and dashboards keep working.
                                </Callout>
                            ) : null}
                        </Stack>
                    )}
                    {customMetricType && (
                        <TextInput
                            label="Type"
                            value={friendlyName(customMetricType)}
                            readOnly
                            description="Metric type"
                        />
                    )}
                    {isEditing &&
                        isAdditionalMetric(item) &&
                        item.sql &&
                        isNonAggregateMetricType(item.type) && (
                            <TextInput
                                label="SQL"
                                value={item.sql}
                                readOnly
                                description="SQL"
                            />
                        )}
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
                    <Accordion
                        chevronPosition="left"
                        chevronSize="xs"
                        variant="separated"
                        radius="md"
                    >
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
                                    <Text span fz="xs" c="ldGray.5" fw={400}>
                                        (optional)
                                    </Text>
                                </Text>
                            </Accordion.Control>
                            <Accordion.Panel>
                                <FiltersProvider<
                                    Record<string, FilterableDimension>
                                >
                                    projectUuid={projectUuid}
                                    itemsMap={dimensionsMap}
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
                </Stack>
            </form>
        </MantineModal>
    ) : null;
});
