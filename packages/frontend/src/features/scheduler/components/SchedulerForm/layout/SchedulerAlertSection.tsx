import {
    getItemId,
    NotificationFrequency,
    ThresholdOperator,
    type CustomDimension,
    type Field,
    type ItemsMap,
    type Metric,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type TableCalculation,
} from '@lightdash/common';
import { Checkbox, Divider, Group, Select, Stack, Text } from '@mantine-8/core';
import { IconPercentage } from '@tabler/icons-react';
import { type FC } from 'react';
import FieldSelect from '../../../../../components/common/FieldSelect';
import FilterNumberInput from '../../../../../components/common/Filters/FilterInputs/FilterNumberInput';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { SchedulerFormChartFiltersTab } from '../SchedulerFormChartFiltersTab';
import { useSchedulerFormContext } from '../schedulerFormContext';
import { SchedulerFormParametersTab } from '../SchedulerFormParametersTab';
import classes from './SchedulerDeliveryModal.module.css';

const thresholdOperatorOptions = [
    { label: 'is greater than', value: ThresholdOperator.GREATER_THAN },
    { label: 'is less than', value: ThresholdOperator.LESS_THAN },
    { label: 'increased by', value: ThresholdOperator.INCREASED_BY },
    { label: 'decreased by', value: ThresholdOperator.DECREASED_BY },
];

type Props = {
    numericMetrics: Record<
        string,
        TableCalculation | Metric | Field | CustomDimension
    >;
    isThresholdAlertWithNoFields: boolean;
    projectUuid: string | undefined;
    itemsMap: ItemsMap | undefined;
    currentParameterValues?: ParametersValuesMap;
    availableParameters?: ParameterDefinitions;
    loading: boolean;
};

export const SchedulerAlertSection: FC<Props> = ({
    numericMetrics,
    isThresholdAlertWithNoFields,
    projectUuid,
    itemsMap,
    currentParameterValues,
    availableParameters,
    loading,
}) => {
    const form = useSchedulerFormContext();
    const operator = form.values.thresholds?.[0]?.operator;
    const isPercentOperator =
        operator === ThresholdOperator.INCREASED_BY ||
        operator === ThresholdOperator.DECREASED_BY;

    return (
        <Stack gap="lg">
            <FieldSelect
                label="Alert field"
                required
                disabled={isThresholdAlertWithNoFields}
                comboboxProps={{ withinPortal: true }}
                hasGrouping
                items={Object.values(numericMetrics)}
                data-testid="Alert/FieldSelect"
                {...{
                    ...form.getInputProps('thresholds.0.field'),
                    item: Object.values(numericMetrics).find(
                        (metric) =>
                            getItemId(metric) ===
                            form.values?.thresholds?.[0]?.fieldId,
                    ),
                    onChange: (value) => {
                        if (!value) return;
                        form.setFieldValue(
                            'thresholds.0.fieldId',
                            getItemId(value),
                        );
                    },
                }}
            />
            {isThresholdAlertWithNoFields && (
                <Text c="red" size="xs">
                    No numeric fields available. You must have at least one
                    numeric metric or calculation to set an alert.
                </Text>
            )}
            <Group wrap="nowrap" grow>
                <Select
                    label="Condition"
                    data={thresholdOperatorOptions}
                    {...form.getInputProps('thresholds.0.operator')}
                />
                <FilterNumberInput
                    label="Threshold"
                    size="sm"
                    {...form.getInputProps('thresholds.0.value')}
                    onChange={(value) => {
                        form.setFieldValue('thresholds.0.value', value || '');
                    }}
                    value={form.values.thresholds?.[0]?.value}
                    rightSection={
                        isPercentOperator && (
                            <MantineIcon
                                icon={IconPercentage}
                                size="lg"
                                color="blue.4"
                            />
                        )
                    }
                />
            </Group>

            <Stack gap="xs">
                <Checkbox
                    label="Notify me only once"
                    {...{
                        ...form.getInputProps('notificationFrequency'),
                        checked:
                            'notificationFrequency' in form.values &&
                            form.values.notificationFrequency ===
                                NotificationFrequency.ONCE,
                        onChange: (e) => {
                            form.setFieldValue(
                                'notificationFrequency',
                                e.target.checked
                                    ? NotificationFrequency.ONCE
                                    : NotificationFrequency.ALWAYS,
                            );
                        },
                    }}
                />
                {'notificationFrequency' in form.values &&
                    form.values.notificationFrequency ===
                        NotificationFrequency.ALWAYS && (
                        <Text size="xs" c="ldGray.6" fs="italic">
                            You will be notified at the specified frequency
                            whenever the threshold conditions are met
                        </Text>
                    )}
            </Stack>

            <Divider />
            <Stack gap="xs">
                <span className={classes.subBlockLabel}>Filters</span>
                <SchedulerFormChartFiltersTab
                    projectUuid={projectUuid}
                    itemsMap={itemsMap}
                    filters={form.values.chartFilters ?? {}}
                    onChange={(chartFilters) => {
                        form.setFieldValue('chartFilters', chartFilters);
                    }}
                />
            </Stack>

            <Divider />
            <Stack gap="xs">
                <span className={classes.subBlockLabel}>Parameters</span>
                <SchedulerFormParametersTab
                    projectUuid={projectUuid}
                    currentParameterValues={currentParameterValues}
                    schedulerParameterValues={form.values.parameters}
                    availableParameters={availableParameters}
                    isLoading={loading}
                    onChange={(schedulerParameters) => {
                        form.setFieldValue('parameters', schedulerParameters);
                    }}
                />
            </Stack>
        </Stack>
    );
};
