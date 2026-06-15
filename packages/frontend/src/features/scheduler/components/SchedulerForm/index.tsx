import {
    isDashboardScheduler,
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
import { SchedulerFormChartFiltersTab } from './SchedulerFormChartFiltersTab';
import { useSchedulerFormContext } from './schedulerFormContext';
import { SchedulerFormCustomizationTab } from './SchedulerFormCustomizationTab';
import { SchedulerFormFiltersTab } from './SchedulerFormFiltersTab';
import { SchedulerFormParametersTab } from './SchedulerFormParametersTab';
import { SchedulerFormPreviewTab } from './SchedulerFormPreviewTab';
import { SchedulerFormSetupTab } from './SchedulerFormSetupTab';

type Props = {
    savedSchedulerData?: SchedulerAndTargets;
    resource?: {
        uuid: string;
        type: 'chart' | 'dashboard' | 'app';
    };
    onSubmit: (data: any) => void;
    onSendNow: (data: CreateSchedulerAndTargetsWithoutIds) => void;
    onBack?: () => void;
    loading?: boolean;
    confirmText?: string;
    isThresholdAlert?: boolean;
    projectUuid: string | undefined;
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
    projectUuid,
    itemsMap,
    currentParameterValues,
    availableParameters,
    dashboard,
    isThresholdAlertWithNoFields,
    numericMetrics,
    isDashboardTabsAvailable,
    onSubmit,
    resource,
}) => {
    const isApp = resource?.type === 'app';
    const form = useSchedulerFormContext();

    const isDashboard = dashboard !== undefined;
    // Threshold alerts are chart schedulers; expose chart-scoped overrides.
    const isChartAlert = !!isThresholdAlert && !isDashboard;

    const requiredFiltersWithoutValues = (
        form.values.dashboardFilters ?? []
    ).filter(
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
                                    {form.values.dashboardFilters &&
                                    form.values.dashboardFilters.length > 0 ? (
                                        <Badge
                                            color="blue"
                                            size="xs"
                                            variant="light"
                                            radius="sm"
                                        >
                                            {
                                                form.values.dashboardFilters
                                                    .length
                                            }
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

                    {isChartAlert ? (
                        <>
                            <Tabs.Tab value="filters">Filters</Tabs.Tab>
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
                        isApp={isApp}
                    />
                </Tabs.Panel>

                {isDashboard ? (
                    <>
                        <Tabs.Panel value="filters" p="md">
                            <SchedulerFormFiltersTab
                                dashboard={dashboard}
                                draftFilters={form.values.dashboardFilters}
                                isEditMode={savedSchedulerData !== undefined}
                                savedFilters={
                                    savedSchedulerData &&
                                    isDashboardScheduler(savedSchedulerData)
                                        ? savedSchedulerData.filters
                                        : []
                                }
                                onChange={(schedulerFilters) => {
                                    form.setFieldValue(
                                        'dashboardFilters',
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

                {isChartAlert ? (
                    <>
                        <Tabs.Panel value="filters" p="md">
                            <SchedulerFormChartFiltersTab
                                projectUuid={projectUuid}
                                itemsMap={itemsMap}
                                filters={form.values.chartFilters ?? {}}
                                onChange={(chartFilters) => {
                                    form.setFieldValue(
                                        'chartFilters',
                                        chartFilters,
                                    );
                                }}
                            />
                        </Tabs.Panel>

                        <Tabs.Panel value="parameters" p="md">
                            <SchedulerFormParametersTab
                                projectUuid={projectUuid}
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
                            schedulerFilters={form.values.dashboardFilters}
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
