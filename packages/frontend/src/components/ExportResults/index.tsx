import { subject } from '@casl/ability';
import {
    DownloadFileType,
    formatDate,
    type DownloadOptions,
    type PivotConfig,
} from '@lightdash/common';
import {
    Alert,
    Button,
    Group,
    NumberInput,
    Paper,
    SegmentedControl,
    Stack,
    Text,
} from '@mantine-8/core';
import { notifications } from '@mantine/notifications';
import { IconInfoCircle, IconTableExport } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { memo, useState, type FC, type ReactNode } from 'react';
import { pollJobStatus } from '../../features/scheduler/hooks/useScheduler';
import useHealth from '../../hooks/health/useHealth';
import useToaster from '../../hooks/toaster/useToaster';
import { scheduleDownloadQuery } from '../../hooks/useQueryResults';
import useUser from '../../hooks/user/useUser';
import { Can } from '../../providers/Ability';
import MantineIcon from '../common/MantineIcon';
import { Limit } from './types';

type ExportCsvRenderProps = {
    onExport: () => Promise<unknown>;
    isExporting: boolean;
};

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
    ) => Promise<string>;
    columnOrder?: string[];
    customLabels?: Record<string, string>;
    hiddenFields?: string[];
    showTableNames?: boolean;
    chartName?: string;
    pivotConfig?: PivotConfig;
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
        hideLimitSelection = false,
        forceShowLimitSelection = false,
        renderDialogActions,
    }) => {
        const { showToastError, showToastInfo, showToastWarning } =
            useToaster();

        const user = useUser(true);
        const health = useHealth();
        const [limit, setLimit] = useState<Limit>(Limit.TABLE);
        const [customLimit, setCustomLimit] = useState<number>(1);
        const [format, setFormat] = useState<string>(Values.FORMATTED);
        const [fileType, setFileType] = useState<DownloadFileType>(
            DownloadFileType.CSV,
        );

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
                    );

                    const downloadOptions: DownloadOptions = {
                        fileType,
                        onlyRaw: format === Values.RAW,
                        columnOrder,
                        customLabels,
                        hiddenFields,
                        showTableNames,
                        pivotConfig,
                        attachmentDownloadName: chartName
                            ? `${chartName}_${formatDate(new Date())}`
                            : undefined,
                    };

                    return scheduleDownloadQuery(
                        projectUuid,
                        queryUuid,
                        downloadOptions,
                    );
                },
                {
                    onMutate: () => {
                        showToastInfo({
                            title: 'Exporting results',
                            subtitle: 'This may take a few minutes...',
                            loading: true,
                            key: TOAST_KEY,
                            autoClose: false,
                        });
                    },
                    onSuccess: (response) => {
                        pollJobStatus(response.jobId)
                            .then(async (details) => {
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
                                notifications.hide(TOAST_KEY);

                                if (details?.truncated) {
                                    showToastWarning({
                                        title: 'The results in this export have been limited.',
                                        subtitle:
                                            'The export was truncated due to size constraints.',
                                    });
                                }
                            })
                            .catch((error: Error) => {
                                notifications.hide(TOAST_KEY);
                                showToastError({
                                    title: 'Unable to download results',
                                    subtitle: error.message,
                                });
                            });
                    },
                    onError: (error: { error: Error }) => {
                        notifications.hide(TOAST_KEY);

                        showToastError({
                            title: 'Unable to download results',
                            subtitle: error?.error?.message,
                        });
                    },
                },
            );

        if (!totalResults || totalResults <= 0) {
            return <Alert color="gray">No data to export</Alert>;
        }

        const csvCellsLimit = health.data?.query?.csvCellsLimit || 100000;
        const maxColumnLimit = health.data?.pivotTable?.maxColumnLimit || 60;
        const isPivotTable = !!pivotConfig;
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
                            label: 'Table rows',
                            value: Limit.TABLE,
                        },
                        {
                            label: 'All results',
                            value: Limit.ALL,
                        },
                        {
                            label: 'Custom',
                            value: Limit.CUSTOM,
                        },
                    ]}
                />
                {limit === Limit.CUSTOM && (
                    <NumberInput
                        label="Rows to export"
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

        return (
            <Stack gap="md" miw="20rem">
                {isDialog && (
                    <Stack gap="xs">
                        <Text fz="xs" fw={700} tt="uppercase" c="dimmed">
                            Export configuration
                        </Text>
                        <Text fz="sm" c="dimmed">
                            Choose the file type, value format, and result scope
                            for this export.
                        </Text>
                    </Stack>
                )}

                <Paper withBorder p="md">
                    <Stack gap="lg">
                        <Stack gap="sm">
                            <Stack gap={4}>
                                <Text fw={600} fz="sm">
                                    File format
                                </Text>
                                <Text fz="xs" c="dimmed">
                                    CSV is best for pipelines. XLSX is ready for
                                    spreadsheet tools.
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
                                    Values
                                </Text>
                                <Text fz="xs" c="dimmed">
                                    Formatted keeps table presentation. Raw uses
                                    the underlying values.
                                </Text>
                            </Stack>
                            <SegmentedControl
                                size="sm"
                                fullWidth
                                value={format}
                                onChange={(value) => setFormat(value)}
                                data={[
                                    {
                                        label: 'Formatted',
                                        value: Values.FORMATTED,
                                    },
                                    { label: 'Raw', value: Values.RAW },
                                ]}
                            />
                        </Stack>

                        {!hideLimitSelection &&
                            (forceShowLimitSelection ? (
                                <Stack gap="sm">
                                    <Stack gap={4}>
                                        <Text fw={600} fz="sm">
                                            Result scope
                                        </Text>
                                        <Text fz="xs" c="dimmed">
                                            Export only the visible table rows
                                            or expand the result set.
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
                                                Result scope
                                            </Text>
                                            <Text fz="xs" c="dimmed">
                                                Export only the visible table
                                                rows or expand the result set.
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
                                    color="ldGray.6"
                                />
                                <Text size="xs" c="dimmed">
                                    <Text span fw={500} c="foreground">
                                        Pivot export limit.
                                    </Text>{' '}
                                    Pivot exports are limited to{' '}
                                    {csvCellsLimit.toLocaleString()} cells and{' '}
                                    {maxColumnLimit} columns.
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
                                        color="ldGray.6"
                                    />
                                    <Text size="xs" c="dimmed">
                                        <Text span fw={500} c="foreground">
                                            Excel row limit.
                                        </Text>{' '}
                                        Excel exports are limited to 1,000,000
                                        rows.
                                    </Text>
                                </Group>
                            )}
                    </Stack>
                )}

                {!renderDialogActions ? (
                    <Button
                        loading={isExporting}
                        size="sm"
                        leftSection={<MantineIcon icon={IconTableExport} />}
                        onClick={() => exportMutation()}
                        data-testid="chart-export-results-button"
                        ml="auto"
                    >
                        Download
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
