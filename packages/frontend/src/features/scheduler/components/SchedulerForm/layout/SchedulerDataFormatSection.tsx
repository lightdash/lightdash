import {
    isAppScheduler,
    isDashboardScheduler,
    SchedulerFormat,
    type Dashboard,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type SchedulerAndTargets,
    type SchedulerAppState,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Checkbox,
    Code,
    Divider,
    Group,
    Input,
    MultiSelect,
    SegmentedControl,
    Stack,
    Table,
    Text,
    Tooltip,
} from '@mantine-8/core';
import isEqual from 'lodash/isEqual';
import { useMemo, type FC } from 'react';
import useHealth from '../../../../../hooks/health/useHealth';
import { useProjectUuid } from '../../../../../hooks/useProjectUuid';
import { CsvFormattingOptions } from '../../CsvFormattingOptions';
import { Limit, Values } from '../../types';
import { useSchedulerFormContext } from '../schedulerFormContext';
import { SchedulerFormFiltersTab } from '../SchedulerFormFiltersTab';
import { SchedulerFormParametersTab } from '../SchedulerFormParametersTab';
import classes from './SchedulerDeliveryModal.module.css';

const getAppQueryCountCaption = (
    capturedQueryCount: number | undefined,
): string | null => {
    if (capturedQueryCount === undefined) return null;
    if (capturedQueryCount === 0) return 'This app ran no data queries';
    if (capturedQueryCount === 1)
        return '1 data query detected — it becomes a file';
    return `${capturedQueryCount} data queries detected — each becomes a file`;
};

type Props = {
    dashboard: Dashboard | undefined;
    savedSchedulerData?: SchedulerAndTargets;
    isApp: boolean;
    appUuid?: string;
    /** App deliveries only: the app state currently reflected in the page URL. */
    currentAppState?: SchedulerAppState | null;
    /** App deliveries only: count of ready queries captured by the live preview.
     *  Undefined when the host page has no live query data (e.g. editing without
     *  a preview open) — csv/xlsx are then left enabled rather than gated shut. */
    capturedQueryCount?: number;
    isDashboardTabsAvailable: boolean;
    currentParameterValues?: ParametersValuesMap;
    availableParameters?: ParameterDefinitions;
    loading: boolean;
};

export const SchedulerDataFormatSection: FC<Props> = ({
    dashboard,
    savedSchedulerData,
    isApp,
    appUuid,
    currentAppState,
    capturedQueryCount,
    isDashboardTabsAvailable,
    currentParameterValues,
    availableParameters,
    loading,
}) => {
    const form = useSchedulerFormContext();
    const health = useHealth();
    const projectUuid = useProjectUuid();
    const isImageDisabled = !health.data?.hasHeadlessBrowser;
    const isDashboard = dashboard !== undefined;

    // The state the toggle can attach: the scheduler's saved snapshot in edit
    // mode, otherwise whatever the page URL carries right now.
    const savedAppState =
        savedSchedulerData && isAppScheduler(savedSchedulerData)
            ? (savedSchedulerData.appState ?? null)
            : null;
    const availableAppState = savedAppState ?? currentAppState ?? null;

    const appStateUrl = useMemo(() => {
        const state = form.values.appState ?? availableAppState;
        if (!state || !appUuid || !projectUuid) return null;
        return `${window.location.origin}/projects/${projectUuid}/apps/${appUuid}/view?state=${encodeURIComponent(
            JSON.stringify(state),
        )}`;
    }, [form.values.appState, availableAppState, appUuid, projectUuid]);

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
    const appQueryCountCaption = getAppQueryCountCaption(capturedQueryCount);

    return (
        <Stack gap="lg">
            <Stack gap="xs">
                <Input.Label>Format</Input.Label>
                <Group gap="xs" wrap="nowrap">
                    {isApp ? (
                        <SegmentedControl
                            radius="md"
                            fullWidth
                            data={[
                                {
                                    label: '.csv',
                                    value: SchedulerFormat.CSV,
                                    disabled: capturedQueryCount === 0,
                                },
                                {
                                    label: '.xlsx',
                                    value: SchedulerFormat.XLSX,
                                    disabled: capturedQueryCount === 0,
                                },
                                {
                                    label: 'Image',
                                    value: SchedulerFormat.IMAGE,
                                    disabled: isImageDisabled,
                                },
                            ]}
                            w="100%"
                            value={format}
                            onChange={(value) => {
                                form.setFieldValue(
                                    'format',
                                    value as SchedulerFormat,
                                );
                                if (
                                    value === SchedulerFormat.CSV ||
                                    value === SchedulerFormat.XLSX
                                ) {
                                    // The only limit shape the backend accepts for app deliveries.
                                    form.setFieldValue('options', {
                                        ...form.values.options,
                                        formatted: Values.FORMATTED,
                                        limit: Limit.TABLE,
                                    });
                                }
                            }}
                        />
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
                {isApp && appQueryCountCaption && (
                    <Text size="xs" c="ldGray.6">
                        {appQueryCountCaption}
                    </Text>
                )}
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
                {isDashboardTabsAvailable &&
                    (format === SchedulerFormat.PDF ||
                        (format === SchedulerFormat.IMAGE &&
                            form.values.options.withPdf)) && (
                        <Checkbox
                            size="xs"
                            label="Each tab on its own page (with dashboard and tab title)"
                            {...form.getInputProps('options.pagePerTab', {
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
                            hideLimit={isApp}
                            hideExportPivotedData={isApp}
                        />
                    </Box>
                )}
            </Stack>

            {isApp && availableAppState && (
                <>
                    <Divider />
                    <Stack gap="xs">
                        <span className={classes.subBlockLabel}>App state</span>
                        <Checkbox
                            size="xs"
                            label="Send current app state"
                            description="The delivery renders the app with this state applied (selected filters, tabs, etc.) instead of its default view."
                            checked={form.values.appState != null}
                            onChange={(e) => {
                                form.setFieldValue(
                                    'appState',
                                    e.target.checked ? availableAppState : null,
                                );
                            }}
                        />
                        {form.values.appState != null && appStateUrl && (
                            <Stack gap="xs">
                                <Box>
                                    <Text size="xs" fw={500} mb={4}>
                                        URL
                                    </Text>
                                    <Code block className={classes.appStateUrl}>
                                        {appStateUrl}
                                    </Code>
                                </Box>
                                <Box>
                                    <Text size="xs" fw={500} mb={4}>
                                        State values
                                    </Text>
                                    <Table
                                        withTableBorder
                                        withColumnBorders
                                        verticalSpacing="xs"
                                        horizontalSpacing="sm"
                                        className={classes.appStateTable}
                                    >
                                        <Table.Thead>
                                            <Table.Tr>
                                                <Table.Th>Key</Table.Th>
                                                <Table.Th>Value</Table.Th>
                                            </Table.Tr>
                                        </Table.Thead>
                                        <Table.Tbody>
                                            {Object.entries(
                                                form.values.appState,
                                            ).map(([key, value]) => (
                                                <Table.Tr key={key}>
                                                    <Table.Td>
                                                        <Code>{key}</Code>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Code>
                                                            {typeof value ===
                                                            'string'
                                                                ? value
                                                                : JSON.stringify(
                                                                      value,
                                                                  )}
                                                        </Code>
                                                    </Table.Td>
                                                </Table.Tr>
                                            ))}
                                        </Table.Tbody>
                                    </Table>
                                </Box>
                            </Stack>
                        )}
                    </Stack>
                </>
            )}

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
