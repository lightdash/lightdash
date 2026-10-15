import { subject } from '@casl/ability';
import {
    DownloadFileType,
    formatDate,
    type ConditionalFormattingConfig,
    type DownloadOptions,
    type PivotConfig,
} from '@lightdash/common';
import {
    Alert,
    Button,
    Group,
    Paper,
    SegmentedControl,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
    IconHelpCircle,
    IconInfoCircle,
    IconTableExport,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { memo, useState, type FC, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import useIsEmbedded from '../../ee/providers/Embed/useIsEmbedded';
import { pollJobStatus } from '../../features/scheduler/hooks/useScheduler';
import useHealth from '../../hooks/health/useHealth';
import useToaster from '../../hooks/toaster/useToaster';
import { scheduleDownloadQuery } from '../../hooks/useQueryResults';
import useUser from '../../hooks/user/useUser';
import { Can } from '../../providers/Ability';
import MantineIcon from '../common/MantineIcon';
import { NumberInput } from '../common/NumberInput';
import classes from './ExportResults.module.css';
import LargeExportWarning from './LargeExportWarning';
import { Limit } from './types';

type ExportCsvRenderProps = {
    onExport: () => Promise<unknown>;
    isExporting: boolean;
};

const EXPORT_DATA_LAYOUT = {
    PIVOTED: 'pivoted',
    UNPIVOTED: 'unpivoted',
} as const;

enum Values {
    FORMATTED = 'formatted',
    RAW = 'raw',
}

export type ExportResultsProps = {
    projectUuid: string;
    totalResults: number | undefined;
    getDownloadQueryUuid: (
        limit: number | null,
        limitType: Limit,
        exportPivotedData?: boolean,
    ) => Promise<string>;
    columnOrder?: string[];
    customLabels?: Record<string, string>;
    hiddenFields?: string[];
    showTableNames?: boolean;
    chartName?: string;
    pivotConfig?: PivotConfig;
    conditionalFormattings?: ConditionalFormattingConfig[];
    showColumnTotals?: boolean;
    hideLimitSelection?: boolean;
    forceShowLimitSelection?: boolean;
    renderDialogActions?: (renderProps: ExportCsvRenderProps) => ReactNode;
};

const TOAST_KEY = 'exporting-results';

const ExportResults: FC<ExportResultsProps> = memo(
    ({
        projectUuid,
        totalResults,
        getDownloadQueryUuid,
        columnOrder,
        customLabels,
        hiddenFields,
        showTableNames,
        chartName,
        pivotConfig,
        conditionalFormattings,
        showColumnTotals,
        hideLimitSelection = false,
        forceShowLimitSelection = false,
        renderDialogActions,
    }) => {
        const { t } = useTranslation('export');
        const { showToastError, showToastInfo, showToastWarning } =
            useToaster();

        const user = useUser(true);
        const health = useHealth();
        const isEmbedded = useIsEmbedded();
        const [limit, setLimit] = useState<Limit>(Limit.TABLE);
        const [customLimit, setCustomLimit] = useState<number>(1);
        const [format, setFormat] = useState<string>(Values.FORMATTED);
        const [exportPivotedData, setExportPivotedData] = useState(true);
        const [fileType, setFileType] = useState<DownloadFileType>(
            DownloadFileType.CSV,
        );

        const [hasExported, setHasExported] = useState(false);
        const { isLoading: isExporting, mutateAsync: exportMutation } =
            useMutation(
                ['export-results', fileType],
                async () => {
                    const queryUuid = await getDownloadQueryUuid(
                        limit === Limit.CUSTOM
                            ? customLimit
                            : limit === Limit.TABLE
                              ? (totalResults ?? 0)
                              : null,
                        limit,
                        exportPivotedData,
                    );

                    const downloadOptions: DownloadOptions = {
                        fileType,
                        onlyRaw: format === Values.RAW,
                        columnOrder,
                        customLabels,
                        hiddenFields,
                        showTableNames,
                        pivotConfig: exportPivotedData
                            ? pivotConfig
                            : undefined,
                        exportPivotedData,
                        attachmentDownloadName: chartName
                            ? `${chartName}_${formatDate(new Date())}`
                            : undefined,
                        conditionalFormattings:
                            fileType === DownloadFileType.XLSX &&
                            (!pivotConfig || !exportPivotedData)
                                ? conditionalFormattings
                                : undefined,
                        // Pivoted exports get their totals from `pivotConfig`
                        showColumnTotals:
                            exportPivotedData && pivotConfig
                                ? undefined
                                : showColumnTotals,
                    };

                    return scheduleDownloadQuery(
                        projectUuid,
                        queryUuid,
                        downloadOptions,
                    );
                },
                {
                    onMutate: () => {
                        setHasExported(false);
                        showToastInfo({
                            title: t('exportResults.toast.exporting'),
                            subtitle: t('exportResults.toast.mayTakeMinutes'),
                            loading: true,
                            key: TOAST_KEY,
                            autoClose: false,
                        });
                    },
                    onSuccess: (response) => {
                        pollJobStatus(
                            response.jobId,
                            isEmbedded ? projectUuid : undefined,
                        )
                            .then(async (details) => {
                                if (!details?.fileUrl) {
                                    throw new Error(
                                        t('exportResults.errors.noDownloadUrl'),
                                    );
                                }
                                const link = document.createElement('a');
                                link.href = details?.fileUrl;
                                link.setAttribute(
                                    'download',
                                    `${chartName || 'results'}_${formatDate(
                                        new Date(),
                                    )}.${fileType}`,
                                );
                                document.body.appendChild(link);
                                link.click();
                                link.remove();
                                setHasExported(true);
                                notifications.hide(TOAST_KEY);

                                if (details?.truncated) {
                                    showToastWarning({
                                        title: t(
                                            'exportResults.toast.truncatedTitle',
                                        ),
                                        subtitle: t(
                                            'exportResults.toast.truncatedSubtitle',
                                        ),
                                    });
                                }
                            })
                            .catch((error: Error) => {
                                notifications.hide(TOAST_KEY);
                                showToastError({
                                    title: t(
                                        'exportResults.toast.downloadFailed',
                                    ),
                                    subtitle: error.message,
                                });
                            });
                    },
                    onError: (error: { error: Error }) => {
                        notifications.hide(TOAST_KEY);

                        showToastError({
                            title: t('exportResults.toast.downloadFailed'),
                            subtitle: error?.error?.message,
                        });
                    },
                },
            );

        if (!totalResults || totalResults <= 0) {
            return <Alert color="gray">{t('exportResults.noData')}</Alert>;
        }

        const csvCellsLimit = health.data?.query?.csvCellsLimit || 100000;
        const maxColumnLimit = health.data?.pivotTable?.maxColumnLimit || 60;
        const isPivotTable = exportPivotedData && !!pivotConfig;
        const isDialog = !!renderDialogActions;
        const showLimitNote =
            isPivotTable ||
            (fileType === DownloadFileType.XLSX &&
                (limit === Limit.ALL || limit === Limit.CUSTOM) &&
                !isPivotTable);

        const limitSelection = (
            <Stack gap="sm">
                <SegmentedControl
                    size="sm"
                    fullWidth
                    value={limit}
                    onChange={(value) => setLimit(value as Limit)}
                    data={[
                        {
                            label: t('exportResults.limit.tableRows'),
                            value: Limit.TABLE,
                        },
                        {
                            label: (
                                <span
                                    data-tour-scope="manage:ChangeCsvResults"
                                    data-tour-step="2"
                                    data-tour-route="/projects/:projectUuid/saved/:savedQueryUuid"
                                    data-tour-label="Choose All results"
                                    data-tour-title="Change the rows exported"
                                    data-tour-docs="explore/share-charts.mdx#choosing-how-many-rows-an-export-contains:p2:1"
                                    data-tour-interactive="true"
                                    data-tour-via='[data-tour-nav="browse"] >> [data-tour-nav="all-charts"] >> [data-tour-anchor="chart-row"][data-tour-value="Orders over time"] >> [data-tour-anchor="results-heading"] >> [data-tour-anchor="export-results"] >> [data-tour-anchor="export-choose-download"]?'
                                    data-tour-then='[data-tour-anchor="export-download"]'
                                >
                                    {t('exportResults.limit.allResults')}
                                </span>
                            ),
                            value: Limit.ALL,
                        },
                        {
                            label: t('exportResults.limit.custom'),
                            value: Limit.CUSTOM,
                        },
                    ]}
                />
                {limit === Limit.CUSTOM && (
                    <NumberInput
                        label={t('exportResults.limit.rowsToExport')}
                        size="sm"
                        min={1}
                        allowDecimal={false}
                        required
                        value={customLimit}
                        onChange={(value) => setCustomLimit(Number(value))}
                        maw={160}
                    />
                )}
            </Stack>
        );

        const layoutSelection = pivotConfig ? (
            <Stack gap="sm">
                <Stack gap={4}>
                    <Group gap={4}>
                        <Text fw={600} fz="sm">
                            {t('exportResults.layout.title')}
                        </Text>
                        <Tooltip
                            maw={300}
                            label={t('exportResults.layout.tooltip')}
                            position="top"
                        >
                            <div>
                                <MantineIcon
                                    icon={IconHelpCircle}
                                    size="sm"
                                    color="gray"
                                />
                            </div>
                        </Tooltip>
                    </Group>
                    <Text fz="xs" c="dimmed">
                        {t('exportResults.layout.description')}
                    </Text>
                </Stack>
                <SegmentedControl
                    size="sm"
                    fullWidth
                    value={
                        exportPivotedData
                            ? EXPORT_DATA_LAYOUT.PIVOTED
                            : EXPORT_DATA_LAYOUT.UNPIVOTED
                    }
                    onChange={(value) =>
                        setExportPivotedData(
                            value === EXPORT_DATA_LAYOUT.PIVOTED,
                        )
                    }
                    data={[
                        {
                            label: t('exportResults.layout.grouped'),
                            value: EXPORT_DATA_LAYOUT.PIVOTED,
                        },
                        {
                            label: t('exportResults.layout.flat'),
                            value: EXPORT_DATA_LAYOUT.UNPIVOTED,
                        },
                    ]}
                />
            </Stack>
        ) : null;

        return (
            <Stack
                gap="md"
                miw={0}
                w={isDialog ? '100%' : 'min(32rem, calc(100vw - 64px))'}
                maw="100%"
                mah={isDialog ? undefined : 'calc(100dvh - 160px)'}
                className={isDialog ? undefined : classes.popover}
                // Walkthrough result marker for manage:ExportCsv: the export
                // dialog, still open once the file has been sent.
                data-tour-scope="manage:ExportCsv"
                data-tour-step="1"
                data-tour-route="/projects/:projectUuid/saved/:savedQueryUuid"
                data-tour-label="A download keeps the table's rows"
                data-tour-docs="explore/share-charts.mdx#download-results-or-a-chart-image:1"
                data-tour-return="none"
                data-tour-resultdocs="explore/share-charts.mdx#choosing-how-many-rows-an-export-contains:p2:1"
            >
                {isDialog && (
                    <Stack gap="xs">
                        <Text fz="xs" fw={600} tt="uppercase" c="dimmed">
                            {t('exportResults.dialog.title')}
                        </Text>
                        <Text fz="sm" c="dimmed">
                            {t('exportResults.dialog.description')}
                        </Text>
                    </Stack>
                )}

                <Paper
                    p="md"
                    data-tour-scope="manage:ChangeCsvResults"
                    data-tour-step="1"
                    data-tour-route="/projects/:projectUuid/saved/:savedQueryUuid"
                    data-tour-label="Choose which rows to export"
                    data-tour-busy='[data-tour-anchor="csv-export-pending"]'
                    data-tour-docs="explore/share-charts.mdx#choosing-how-many-rows-an-export-contains:1"
                    data-tour-return="none"
                    data-tour-resultdocs="explore/share-charts.mdx#choosing-how-many-rows-an-export-contains:p2:1"
                    data-tour-anchor={
                        isExporting || !hasExported
                            ? 'csv-export-pending'
                            : undefined
                    }
                >
                    <Stack gap="lg">
                        <Stack gap="sm">
                            <Stack gap={4}>
                                <Text fw={600} fz="sm">
                                    {t('exportResults.fileFormat.title')}
                                </Text>
                                <Text fz="xs" c="dimmed">
                                    {t('exportResults.fileFormat.description')}
                                </Text>
                            </Stack>
                            <SegmentedControl
                                size="sm"
                                fullWidth
                                value={fileType}
                                onChange={(value) =>
                                    setFileType(value as DownloadFileType)
                                }
                                data={[
                                    {
                                        label: 'CSV',
                                        value: DownloadFileType.CSV,
                                    },
                                    {
                                        label: 'XLSX',
                                        value: DownloadFileType.XLSX,
                                    },
                                ]}
                            />
                        </Stack>

                        <Stack gap="sm">
                            <Stack gap={4}>
                                <Text fw={600} fz="sm">
                                    {t('exportResults.values.title')}
                                </Text>
                                <Text fz="xs" c="dimmed">
                                    {t('exportResults.values.description')}
                                </Text>
                            </Stack>
                            <SegmentedControl
                                size="sm"
                                fullWidth
                                value={format}
                                onChange={(value) => setFormat(value)}
                                data={[
                                    {
                                        label: t(
                                            'exportResults.values.formatted',
                                        ),
                                        value: Values.FORMATTED,
                                    },
                                    {
                                        label: t('exportResults.values.raw'),
                                        value: Values.RAW,
                                    },
                                ]}
                            />
                        </Stack>

                        {layoutSelection}

                        {!hideLimitSelection &&
                            (forceShowLimitSelection ? (
                                <Stack gap="sm">
                                    <Stack gap={4}>
                                        <Text fw={600} fz="sm">
                                            {t(
                                                'exportResults.resultScope.title',
                                            )}
                                        </Text>
                                        <Text fz="xs" c="dimmed">
                                            {t(
                                                'exportResults.resultScope.description',
                                            )}
                                        </Text>
                                    </Stack>
                                    {limitSelection}
                                </Stack>
                            ) : (
                                <Can
                                    I="manage"
                                    this={subject('ChangeCsvResults', {
                                        organizationUuid:
                                            user.data?.organizationUuid,
                                        projectUuid: projectUuid,
                                    })}
                                >
                                    <Stack gap="sm">
                                        <Stack gap={4}>
                                            <Text fw={600} fz="sm">
                                                {t(
                                                    'exportResults.resultScope.title',
                                                )}
                                            </Text>
                                            <Text fz="xs" c="dimmed">
                                                {t(
                                                    'exportResults.resultScope.description',
                                                )}
                                            </Text>
                                        </Stack>
                                        {limitSelection}
                                    </Stack>
                                </Can>
                            ))}
                    </Stack>
                </Paper>

                {showLimitNote && (
                    <Stack gap="xs">
                        {isPivotTable && (
                            <Group gap="xs" wrap="nowrap" align="flex-start">
                                <MantineIcon
                                    icon={IconInfoCircle}
                                    size="sm"
                                    color="dimmed"
                                />
                                <Text size="xs" c="dimmed">
                                    <Trans
                                        t={t}
                                        i18nKey="exportResults.pivotLimitNote"
                                        values={{
                                            cells: csvCellsLimit.toLocaleString(),
                                            columns: maxColumnLimit,
                                        }}
                                        components={{
                                            strong: (
                                                <Text
                                                    span
                                                    fw={500}
                                                    c="foreground"
                                                />
                                            ),
                                        }}
                                    />
                                </Text>
                            </Group>
                        )}

                        {fileType === DownloadFileType.XLSX &&
                            (limit === Limit.ALL || limit === Limit.CUSTOM) &&
                            !isPivotTable && (
                                <Group
                                    gap="xs"
                                    wrap="nowrap"
                                    align="flex-start"
                                >
                                    <MantineIcon
                                        icon={IconInfoCircle}
                                        size="sm"
                                        color="dimmed"
                                    />
                                    <Text size="xs" c="dimmed">
                                        <Trans
                                            t={t}
                                            i18nKey="exportResults.excelLimitNote"
                                            components={{
                                                strong: (
                                                    <Text
                                                        span
                                                        fw={500}
                                                        c="foreground"
                                                    />
                                                ),
                                            }}
                                        />
                                    </Text>
                                </Group>
                            )}
                    </Stack>
                )}

                {!isPivotTable && (
                    <LargeExportWarning
                        limit={limit}
                        customLimit={customLimit}
                        totalResults={totalResults}
                        columnOrder={columnOrder}
                        hiddenFields={hiddenFields}
                        csvCellsLimit={csvCellsLimit}
                        exportTimeoutMs={health.data?.query?.exportTimeoutMs}
                    />
                )}

                {!renderDialogActions ? (
                    <Button
                        loading={isExporting}
                        size="sm"
                        leftSection={<MantineIcon icon={IconTableExport} />}
                        onClick={() => exportMutation()}
                        data-testid="chart-export-results-button"
                        // Walkthrough anchor (data-tour-then): the download.
                        data-tour-anchor="export-download"
                        data-tour-hint="Click Download"
                        ml="auto"
                    >
                        {t('actions.download', { ns: 'common' })}
                    </Button>
                ) : (
                    <Stack gap="sm">
                        {renderDialogActions({
                            onExport: exportMutation,
                            isExporting,
                        })}
                    </Stack>
                )}
            </Stack>
        );
    },
);

export default ExportResults;
