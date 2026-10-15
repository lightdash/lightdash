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
import { Checkbox, Divider, Group, Select, Stack, Text } from '@mantine/core';
import { IconPercentage } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import FieldSelect from '../../../../../components/common/FieldSelect';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { NumberInput } from '../../../../../components/common/NumberInput';
import { SchedulerFormChartFiltersTab } from '../SchedulerFormChartFiltersTab';
import { useSchedulerFormContext } from '../schedulerFormContext';
import { SchedulerFormParametersTab } from '../SchedulerFormParametersTab';
import classes from './SchedulerDeliveryModal.module.css';
import { THRESHOLD_OPERATOR_KEYS } from './schedulerDetailSummary';

const THRESHOLD_OPERATORS = [
    ThresholdOperator.GREATER_THAN,
    ThresholdOperator.LESS_THAN,
    ThresholdOperator.INCREASED_BY,
    ThresholdOperator.DECREASED_BY,
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
    const { t } = useTranslation('scheduler');
    const form = useSchedulerFormContext();
    const thresholdOperatorOptions = useMemo(
        () =>
            THRESHOLD_OPERATORS.map((value) => ({
                value,
                label: t(THRESHOLD_OPERATOR_KEYS[value]),
            })),
        [t],
    );
    const { onChange: _onChange, ...thresholdInputProps } =
        form.getInputProps('thresholds.0.value');
    const operator = form.values.thresholds?.[0]?.operator;
    const isPercentOperator =
        operator === ThresholdOperator.INCREASED_BY ||
        operator === ThresholdOperator.DECREASED_BY;

    return (
        <Stack gap="lg">
            <FieldSelect
                label={t('alert.field')}
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
                    {t('alert.noNumericFields')}
                </Text>
            )}
            <Group wrap="nowrap" grow>
                <Select
                    label={t('alert.condition')}
                    data={thresholdOperatorOptions}
                    {...form.getInputProps('thresholds.0.operator')}
                />
                <NumberInput
                    label={t('alert.threshold')}
                    size="sm"
                    w="100%"
                    hideControls
                    decimalScale="unlimited"
                    {...thresholdInputProps}
                    onNumberChange={(value) => {
                        form.setFieldValue('thresholds.0.value', value ?? '');
                    }}
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
                    label={t('alert.notifyOnce')}
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
                        <Text size="xs" c="dimmed" fs="italic">
                            {t('alert.notifyAlways')}
                        </Text>
                    )}
            </Stack>

            <Divider />
            <Stack gap="xs">
                <span className={classes.subBlockLabel}>
                    {t('alert.filters')}
                </span>
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
                <span className={classes.subBlockLabel}>
                    {t('alert.parameters')}
                </span>
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
