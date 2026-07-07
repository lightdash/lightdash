import {
    isDashboardScheduler,
    SchedulerFormat,
    type Dashboard,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type SchedulerAndTargets,
} from '@lightdash/common';
import {
    Anchor,
    Badge,
    Box,
    Checkbox,
    Divider,
    Group,
    Input,
    MultiSelect,
    SegmentedControl,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import isEqual from 'lodash/isEqual';
import { useMemo, type FC } from 'react';
import useHealth from '../../../../../hooks/health/useHealth';
import { CsvFormattingOptions } from '../../CsvFormattingOptions';
import { useSchedulerFormContext } from '../schedulerFormContext';
import { SchedulerFormFiltersTab } from '../SchedulerFormFiltersTab';
import { SchedulerFormParametersTab } from '../SchedulerFormParametersTab';
import classes from './SchedulerDeliveryModal.module.css';

type Props = {
    dashboard: Dashboard | undefined;
    savedSchedulerData?: SchedulerAndTargets;
    isApp: boolean;
    isDashboardTabsAvailable: boolean;
    currentParameterValues?: ParametersValuesMap;
    availableParameters?: ParameterDefinitions;
    loading: boolean;
};

export const SchedulerDataFormatSection: FC<Props> = ({
    dashboard,
    savedSchedulerData,
    isApp,
    isDashboardTabsAvailable,
    currentParameterValues,
    availableParameters,
    loading,
}) => {
    const form = useSchedulerFormContext();
    const health = useHealth();
    const isImageDisabled = !health.data?.hasHeadlessBrowser;
    const isDashboard = dashboard !== undefined;

    const allTabsSelected = useMemo(
        () =>
            form.values.selectedTabs === null ||
            isEqual(
                dashboard?.tabs.map((tab) => tab.uuid),
                form.values.selectedTabs,
            ),
        [form.values.selectedTabs, dashboard?.tabs],
    );

    const format = form.values.format;

    return (
        <Stack gap="lg">
            <Stack gap="xs">
                <Input.Label>Format</Input.Label>
                <Group gap="xs" wrap="nowrap">
                    {isApp ? (
                        <Badge variant="light" radius="sm" size="lg" px="sm">
                            Image
                        </Badge>
                    ) : (
                        <SegmentedControl
                            radius="md"
                            fullWidth
                            data={[
                                { label: '.csv', value: SchedulerFormat.CSV },
                                { label: '.xlsx', value: SchedulerFormat.XLSX },
                                {
                                    label: 'Image',
                                    value: SchedulerFormat.IMAGE,
                                    disabled: isImageDisabled,
                                },
                                {
                                    label: 'PDF',
                                    value: SchedulerFormat.PDF,
                                    disabled:
                                        isImageDisabled ||
                                        (form.values.msTeamsTargets?.length ??
                                            0) > 0 ||
                                        (form.values.googleChatTargets
                                            ?.length ?? 0) > 0,
                                },
                            ]}
                            w="100%"
                            {...form.getInputProps('format')}
                        />
                    )}
                </Group>
                {isImageDisabled && !isApp && (
                    <Text size="xs" c="ldGray.6">
                        You must enable the
                        <Anchor href="https://docs.lightdash.com/self-host/customize-deployment/enable-headless-browser-for-lightdash">
                            {' '}
                            headless browser{' '}
                        </Anchor>
                        to send images
                    </Text>
                )}

                {isDashboardTabsAvailable && (
                    <Checkbox
                        size="xs"
                        label="Include all dashboard tabs"
                        checked={allTabsSelected}
                        onChange={(e) => {
                            form.setFieldValue(
                                'selectedTabs',
                                e.target.checked ? null : [],
                            );
                        }}
                    />
                )}
                {isDashboardTabsAvailable && !allTabsSelected && (
                    <MultiSelect
                        placeholder="Select tabs to include in the delivery"
                        value={form.values.selectedTabs ?? undefined}
                        error={
                            form.errors.selectedTabs
                                ? 'Selected tabs should not be empty'
                                : undefined
                        }
                        data={(dashboard?.tabs || []).map((tab) => ({
                            value: tab.uuid,
                            label: tab.name,
                        }))}
                        searchable
                        onChange={(val) => {
                            form.setFieldValue('selectedTabs', val);
                        }}
                    />
                )}

                {format === SchedulerFormat.IMAGE && (
                    <Checkbox
                        size="xs"
                        label="Also include image as PDF attachment"
                        {...form.getInputProps('options.withPdf', {
                            type: 'checkbox',
                        })}
                    />
                )}
                {format === SchedulerFormat.CSV && (
                    <Tooltip
                        label="You must have at least one email recipient to attach a file to emails"
                        position="top-start"
                        withinPortal
                        disabled={(form.values.emailTargets?.length || 0) > 0}
                    >
                        <Box display="flex" w="fit-content">
                            <Checkbox
                                size="xs"
                                label="Attach the file to emails"
                                {...form.getInputProps('options.asAttachment', {
                                    type: 'checkbox',
                                })}
                                disabled={
                                    (form.values.emailTargets?.length || 0) ===
                                    0
                                }
                            />
                        </Box>
                    </Tooltip>
                )}
                {(format === SchedulerFormat.CSV ||
                    format === SchedulerFormat.XLSX) && (
                    <Box mt="sm">
                        <CsvFormattingOptions
                            inline
                            format={
                                format as
                                    | SchedulerFormat.CSV
                                    | SchedulerFormat.XLSX
                            }
                            formatted={form.values.options.formatted}
                            onFormattedChange={(value) =>
                                form.setFieldValue('options.formatted', value)
                            }
                            limit={form.values.options.limit}
                            onLimitChange={(value) =>
                                form.setFieldValue('options.limit', value)
                            }
                            customLimit={form.values.options.customLimit}
                            onCustomLimitChange={(value) =>
                                form.setFieldValue('options.customLimit', value)
                            }
                            exportPivotedData={
                                form.values.options.exportPivotedData
                            }
                            onExportPivotedDataChange={(value) =>
                                form.setFieldValue(
                                    'options.exportPivotedData',
                                    value,
                                )
                            }
                            xlsxFileLayout={form.values.options.xlsxFileLayout}
                            onXlsxFileLayoutChange={(value) =>
                                form.setFieldValue(
                                    'options.xlsxFileLayout',
                                    value,
                                )
                            }
                        />
                    </Box>
                )}
            </Stack>

            {isDashboard && (
                <>
                    <Divider />
                    <Stack gap="xs">
                        <span className={classes.subBlockLabel}>Filters</span>
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
                    </Stack>

                    <Divider />
                    <Stack gap="xs">
                        <span className={classes.subBlockLabel}>
                            Parameters
                        </span>
                        <SchedulerFormParametersTab
                            dashboard={dashboard}
                            currentParameterValues={currentParameterValues}
                            schedulerParameterValues={form.values.parameters}
                            availableParameters={availableParameters}
                            isLoading={loading}
                            onChange={(schedulerParameters) => {
                                form.setFieldValue(
                                    'parameters',
                                    schedulerParameters,
                                );
                            }}
                        />
                    </Stack>
                </>
            )}
        </Stack>
    );
};
