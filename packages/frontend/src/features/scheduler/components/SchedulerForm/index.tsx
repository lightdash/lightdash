import {
    SchedulerFormat,
    type CreateSchedulerAndTargetsWithoutIds,
    type Dashboard,
    type ItemsMap,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type SchedulerAndTargets,
} from '@lightdash/common';
import { Badge, Group, Tabs, Text } from '@mantine-8/core';
import { type FC } from 'react';
import { SchedulerFormCustomizationTab } from './SchedulerFormCustomizationTab';
import { SchedulerFormFiltersTab } from './SchedulerFormFiltersTab';
import { SchedulerFormParametersTab } from './SchedulerFormParametersTab';
import { SchedulerFormPreviewTab } from './SchedulerFormPreviewTab';
import { SchedulerFormSetupTab } from './SchedulerFormSetupTab';
import { useSchedulerFormContext } from './schedulerFormContext';

type Props = {
    savedSchedulerData?: SchedulerAndTargets;
    resource?: {
        uuid: string;
        type: 'chart' | 'dashboard';
    };
    onSubmit: (data: any) => void;
    onSendNow: (data: CreateSchedulerAndTargetsWithoutIds) => void;
    onBack?: () => void;
    loading?: boolean;
    confirmText?: string;
    isThresholdAlert?: boolean;
    itemsMap?: ItemsMap;
    currentParameterValues?: ParametersValuesMap;
    availableParameters?: ParameterDefinitions;
    // Added these
    dashboard: Dashboard | undefined;
    isThresholdAlertWithNoFields: boolean;
    numericMetrics: Record<string, any>;
    isDashboardTabsAvailable: boolean;
};

const SchedulerForm: FC<Props> = ({
    savedSchedulerData,
    loading,
    isThresholdAlert,
    currentParameterValues,
    availableParameters,
    dashboard,
    isThresholdAlertWithNoFields,
    numericMetrics,
    isDashboardTabsAvailable,
    onSubmit,
}) => {
    const form = useSchedulerFormContext();

    const isDashboard = dashboard !== undefined;

    const requiredFiltersWithoutValues = (form.values.filters ?? []).filter(
        (filter) =>
            filter.required && (!filter.values || filter.values.length === 0),
    );

    return (
        <form
            id="scheduler-form"
            onSubmit={form.onSubmit((values) => onSubmit(values))}
        >
            <Tabs defaultValue="setup">
                <Tabs.List mt="sm" mb={0}>
                    <Tabs.Tab value="setup" ml="md">
                        Setup
                    </Tabs.Tab>
                    {isDashboard ? (
                        <>
                            <Tabs.Tab value="filters">
                                <Group gap="xs">
                                    Filters
                                    {form.values.filters &&
                                    form.values.filters.length > 0 ? (
                                        <Badge
                                            color="blue"
                                            size="xs"
                                            variant="light"
                                            radius="sm"
                                        >
                                            {form.values.filters.length}
                                        </Badge>
                                    ) : (
                                        ''
                                    )}
                                    {requiredFiltersWithoutValues.length >
                                        0 && (
                                        <Text span c="red" ml={4}>
                                            *
                                        </Text>
                                    )}
                                </Group>
                            </Tabs.Tab>
                            <Tabs.Tab value="parameters">Parameters</Tabs.Tab>
                        </>
                    ) : null}

                    {!isThresholdAlert && (
                        <>
                            <Tabs.Tab value="customization">
                                {isThresholdAlert
                                    ? 'Alert message'
                                    : 'Customization'}
                            </Tabs.Tab>
                            <Tabs.Tab
                                disabled={
                                    form.values.format !==
                                        SchedulerFormat.IMAGE || !isDashboard
                                }
                                value="preview"
                            >
                                Preview and Size
                            </Tabs.Tab>
                        </>
                    )}
                </Tabs.List>

                <Tabs.Panel value="setup" mt="md">
                    <SchedulerFormSetupTab
                        dashboard={dashboard}
                        isThresholdAlert={!!isThresholdAlert}
                        isThresholdAlertWithNoFields={
                            isThresholdAlertWithNoFields
                        }
                        numericMetrics={numericMetrics}
                        isDashboardTabsAvailable={isDashboardTabsAvailable}
                    />
                </Tabs.Panel>

                {isDashboard ? (
                    <>
                        <Tabs.Panel value="filters" p="md">
                            <SchedulerFormFiltersTab
                                dashboard={dashboard}
                                draftFilters={form.values.filters}
                                isEditMode={savedSchedulerData !== undefined}
                                savedFilters={
                                    savedSchedulerData &&
                                    'filters' in savedSchedulerData
                                        ? savedSchedulerData.filters
                                        : []
                                }
                                onChange={(schedulerFilters) => {
                                    form.setFieldValue(
                                        'filters',
                                        schedulerFilters,
                                    );
                                }}
                            />
                        </Tabs.Panel>

                        <Tabs.Panel value="parameters" p="md">
                            <SchedulerFormParametersTab
                                dashboard={dashboard}
                                currentParameterValues={currentParameterValues}
                                schedulerParameterValues={
                                    form.values.parameters
                                }
                                availableParameters={availableParameters}
                                isLoading={!!loading}
                                onChange={(schedulerParameters) => {
                                    form.setFieldValue(
                                        'parameters',
                                        schedulerParameters,
                                    );
                                }}
                            />
                        </Tabs.Panel>
                    </>
                ) : null}

                <Tabs.Panel value="customization">
                    <SchedulerFormCustomizationTab />
                </Tabs.Panel>
                {isDashboard ? (
                    <Tabs.Panel value="preview">
                        <SchedulerFormPreviewTab
                            schedulerFilters={form.values.filters}
                            dashboard={dashboard}
                            customViewportWidth={
                                form.values.customViewportWidth
                            }
                            onChange={(customViewportWidth) => {
                                form.setFieldValue(
                                    'customViewportWidth',
                                    customViewportWidth
                                        ? parseInt(customViewportWidth)
                                        : undefined,
                                );
                            }}
                        />
                    </Tabs.Panel>
                ) : null}
            </Tabs>
        </form>
    );
};

export default SchedulerForm;
