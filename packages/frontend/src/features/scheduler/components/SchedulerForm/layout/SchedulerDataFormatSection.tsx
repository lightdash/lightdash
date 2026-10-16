import {
    isAppScheduler,
    isChartScheduler,
    isDashboardScheduler,
    SchedulerFormat,
    type Dashboard,
    type DashboardFilterRule,
    type FilterRule,
    type ItemsMap,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type SavedChart,
    type SchedulerAndTargets,
    type SchedulerAppState,
    type UnmetFilterRequirement,
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
} from '@mantine/core';
import { type TFunction } from 'i18next';
import isEqual from 'lodash/isEqual';
import { useMemo, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import useHealth from '../../../../../hooks/health/useHealth';
import { useProjectUuid } from '../../../../../hooks/useProjectUuid';
import { CsvFormattingOptions } from '../../CsvFormattingOptions';
import { Limit, Values } from '../../types';
import { SchedulerFormChartFilterOverridesTab } from '../SchedulerFormChartFilterOverridesTab';
import {
    hasFileAttachmentTargets,
    useSchedulerFormContext,
} from '../schedulerFormContext';
import { SchedulerFormFiltersTab } from '../SchedulerFormFiltersTab';
import { SchedulerFormParametersTab } from '../SchedulerFormParametersTab';
import classes from './SchedulerDeliveryModal.module.css';

// Counted from the interactive session (active tab only). Apps wired to load
// every tab's data during deliveries can capture more queries than this — the
// count is advisory, never a gate; the delivery itself fails if nothing runs.
const getAppQueryCountCaption = (
    t: TFunction,
    capturedQueryCount: number | undefined,
): string | null => {
    if (capturedQueryCount === undefined) return null;
    if (capturedQueryCount === 0) return t('dataFormat.appQueryCountNone');
    return t('dataFormat.appQueryCount', { count: capturedQueryCount });
};

type Props = {
    dashboard: Dashboard | undefined;
    /** Chart deliveries only: the chart whose saved filters can be adjusted. */
    savedChart?: SavedChart;
    /** Chart deliveries opened from the chart page: the explorer's fields. */
    itemsMap?: ItemsMap;
    /** Chart deliveries only: whether this user may replace the chart's saved filters. */
    canAdjustChartFilters?: boolean;
    chartFiltersWithUnmetRequirements?: FilterRule[];
    savedSchedulerData?: SchedulerAndTargets;
    isApp: boolean;
    appUuid?: string;
    /** App deliveries only: the app state currently reflected in the page URL. */
    currentAppState?: SchedulerAppState | null;
    /** App deliveries only: count of ready queries captured by the live preview.
     *  Undefined (no live data) leaves csv/xlsx enabled rather than gated shut. */
    capturedQueryCount?: number;
    isDashboardTabsAvailable: boolean;
    currentParameterValues?: ParametersValuesMap;
    availableParameters?: ParameterDefinitions;
    loading: boolean;
    unmetFilterRequirements: UnmetFilterRequirement[];
    filtersWithUnmetRequirements: DashboardFilterRule[];
};

export const SchedulerDataFormatSection: FC<Props> = ({
    dashboard,
    savedChart,
    itemsMap,
    canAdjustChartFilters = true,
    chartFiltersWithUnmetRequirements = [],
    savedSchedulerData,
    isApp,
    appUuid,
    currentAppState,
    capturedQueryCount,
    isDashboardTabsAvailable,
    currentParameterValues,
    availableParameters,
    loading,
    unmetFilterRequirements,
    filtersWithUnmetRequirements,
}) => {
    const { t } = useTranslation('scheduler');
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
    const appQueryCountCaption = getAppQueryCountCaption(t, capturedQueryCount);

    return (
        <Stack gap="lg">
            <Stack gap="xs">
                <Input.Label>{t('dataFormat.format')}</Input.Label>
                <Group gap="xs" wrap="nowrap">
                    {isApp ? (
                        <SegmentedControl
                            fullWidth
                            data={[
                                {
                                    label: t('formats.csv'),
                                    value: SchedulerFormat.CSV,
                                },
                                {
                                    label: t('formats.xlsx'),
                                    value: SchedulerFormat.XLSX,
                                },
                                {
                                    label: t('formats.image'),
                                    value: SchedulerFormat.IMAGE,
                                    disabled: isImageDisabled,
                                },
                            ]}
                            w="100%"
                            value={format}
                            onChange={(value) => {
                                const previousFormat = form.values.format;
                                form.setFieldValue(
                                    'format',
                                    value as SchedulerFormat,
                                );
                                if (
                                    value === SchedulerFormat.CSV ||
                                    value === SchedulerFormat.XLSX
                                ) {
                                    // CSV<->XLSX keeps its app-legal limit
                                    // (table/all); other origins normalize.
                                    const wasAlreadyCsvOrXlsx =
                                        previousFormat ===
                                            SchedulerFormat.CSV ||
                                        previousFormat === SchedulerFormat.XLSX;
                                    form.setFieldValue('options', {
                                        ...form.values.options,
                                        formatted: Values.FORMATTED,
                                        limit: wasAlreadyCsvOrXlsx
                                            ? form.values.options.limit
                                            : Limit.TABLE,
                                    });
                                }
                            }}
                        />
                    ) : (
                        <SegmentedControl
                            fullWidth
                            data={[
                                {
                                    label: t('formats.csv'),
                                    value: SchedulerFormat.CSV,
                                },
                                {
                                    label: t('formats.xlsx'),
                                    value: SchedulerFormat.XLSX,
                                },
                                {
                                    label: t('formats.image'),
                                    value: SchedulerFormat.IMAGE,
                                    disabled: isImageDisabled,
                                },
                                {
                                    label: t('formats.pdf'),
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
                    <Text size="xs" c="dimmed">
                        {appQueryCountCaption}
                    </Text>
                )}
                {isImageDisabled && (
                    <Text size="xs" c="dimmed">
                        <Trans
                            t={t}
                            i18nKey="dataFormat.headlessBrowserRequired"
                            components={{
                                anchor: (
                                    <Anchor href="https://docs.lightdash.com/self-host/customize-deployment/enable-headless-browser-for-lightdash" />
                                ),
                            }}
                        />
                    </Text>
                )}

                {isDashboardTabsAvailable && (
                    <Checkbox
                        size="xs"
                        label={t('dataFormat.includeAllTabs')}
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
                        placeholder={t('dataFormat.selectTabsPlaceholder')}
                        value={form.values.selectedTabs ?? undefined}
                        error={
                            form.errors.selectedTabs
                                ? t('form.validation.selectedTabsEmpty')
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
                        label={t('dataFormat.includePdf')}
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
                            label={t('dataFormat.pagePerTab')}
                            {...form.getInputProps('options.pagePerTab', {
                                type: 'checkbox',
                            })}
                        />
                    )}
                {(format === SchedulerFormat.CSV ||
                    format === SchedulerFormat.XLSX) && (
                    <Tooltip
                        label={t('dataFormat.attachDisabled')}
                        position="top-start"
                        disabled={hasFileAttachmentTargets(form.values)}
                    >
                        <Box display="flex" w="fit-content">
                            <Checkbox
                                size="xs"
                                label={t('dataFormat.attachFile')}
                                description={t(
                                    'dataFormat.attachFileDescription',
                                )}
                                {...form.getInputProps('options.asAttachment', {
                                    type: 'checkbox',
                                })}
                                disabled={
                                    !hasFileAttachmentTargets(form.values)
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
                            limitVariant={isApp ? 'tableOrAll' : 'full'}
                            hideExportPivotedData={isApp}
                        />
                    </Box>
                )}
            </Stack>

            {isApp && availableAppState && (
                <>
                    <Divider />
                    <Stack gap="xs">
                        <span className={classes.subBlockLabel}>
                            {t('dataFormat.appState')}
                        </span>
                        <Checkbox
                            size="xs"
                            label={t('dataFormat.sendAppState')}
                            description={
                                form.values.format === SchedulerFormat.IMAGE
                                    ? t('dataFormat.appStateImageDescription')
                                    : t('dataFormat.appStateDataDescription')
                            }
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
                                        {t('dataFormat.url')}
                                    </Text>
                                    <Code block className={classes.appStateUrl}>
                                        {appStateUrl}
                                    </Code>
                                </Box>
                                <Box>
                                    <Text size="xs" fw={500} mb={4}>
                                        {t('dataFormat.stateValues')}
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
                                                <Table.Th>
                                                    {t('dataFormat.key')}
                                                </Table.Th>
                                                <Table.Th>
                                                    {t('dataFormat.value')}
                                                </Table.Th>
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

            {savedChart && (
                <>
                    <Divider />
                    <Stack gap="xs">
                        <span className={classes.subBlockLabel}>
                            {t('alert.filters')}
                        </span>
                        <SchedulerFormChartFilterOverridesTab
                            savedChart={savedChart}
                            itemsMap={itemsMap}
                            readOnly={!canAdjustChartFilters}
                            draftFilters={form.values.chartFilters}
                            isEditMode={savedSchedulerData !== undefined}
                            savedFilters={
                                savedSchedulerData &&
                                isChartScheduler(savedSchedulerData)
                                    ? savedSchedulerData.filters
                                    : undefined
                            }
                            onChange={(chartFilters) => {
                                form.setFieldValue(
                                    'chartFilters',
                                    chartFilters,
                                );
                            }}
                            filtersWithUnmetRequirements={
                                chartFiltersWithUnmetRequirements
                            }
                        />
                    </Stack>
                </>
            )}

            {isDashboard && (
                <>
                    <Divider />
                    <Stack gap="xs">
                        <span className={classes.subBlockLabel}>
                            {t('alert.filters')}
                        </span>
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
                            unmetRequirements={unmetFilterRequirements}
                            filtersWithUnmetRequirements={
                                filtersWithUnmetRequirements
                            }
                        />
                    </Stack>

                    <Divider />
                    <Stack gap="xs">
                        <span className={classes.subBlockLabel}>
                            {t('alert.parameters')}
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
