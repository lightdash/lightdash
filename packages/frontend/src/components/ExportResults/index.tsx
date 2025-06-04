import { subject } from '@casl/ability';
import {
    DownloadFileType,
    formatDate,
    type PivotConfig,
} from '@lightdash/common';
import {
    Alert,
    Box,
    Button,
    NumberInput,
    SegmentedControl,
    Stack,
    Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconTableExport } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { memo, useState, type FC } from 'react';
import useHealth from '../../hooks/health/useHealth';
import useToaster from '../../hooks/toaster/useToaster';
import { downloadQuery } from '../../hooks/useQueryResults';
import useUser from '../../hooks/user/useUser';
import { Can } from '../../providers/Ability';
import MantineIcon from '../common/MantineIcon';

enum Limit {
    TABLE = 'table',
    ALL = 'all',
    CUSTOM = 'custom',
}

enum Values {
    FORMATTED = 'formatted',
    RAW = 'raw',
}

export type ExportResultsProps = {
    projectUuid: string;
    totalResults: number | undefined;
    getDownloadQueryUuid: (limit: number | null) => Promise<string>;
    columnOrder?: string[];
    customLabels?: Record<string, string>;
    hiddenFields?: string[];
    showTableNames?: boolean;
    chartName?: string;
    pivotConfig?: PivotConfig;
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
    }) => {
        const { showToastError, showToastInfo, showToastWarning } =
            useToaster();

        const user = useUser(true);
        const [limit, setLimit] = useState<string>(Limit.TABLE);
        const [customLimit, setCustomLimit] = useState<number>(1);
        const [format, setFormat] = useState<string>(Values.FORMATTED);
        const [fileType, setFileType] = useState<DownloadFileType>(
            DownloadFileType.CSV,
        );
        const health = useHealth();

        const { isLoading: isExporting, mutateAsync: exportMutation } =
            useMutation(
                ['export-results', fileType],
                async () => {
                    const queryUuid = await getDownloadQueryUuid(
                        limit === Limit.CUSTOM
                            ? customLimit
                            : limit === Limit.TABLE
                            ? totalResults ?? 0
                            : null,
                    );
                    return downloadQuery(projectUuid, queryUuid, {
                        fileType,
                        onlyRaw: format === Values.RAW,
                        columnOrder,
                        customLabels,
                        hiddenFields,
                        showTableNames,
                        pivotConfig,
                    });
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
                        // Download file
                        const link = document.createElement('a');
                        link.href = response.fileUrl;
                        console.log({ chartName });
                        link.setAttribute(
                            'download',
                            `${chartName || 'results'}_${formatDate(
                                new Date(),
                            )}.${fileType}`,
                        );
                        document.body.appendChild(link);
                        link.click();
                        link.remove(); // Remove the link from the DOM
                        // Hide toast
                        notifications.hide(TOAST_KEY);

                        if (response.truncated) {
                            showToastWarning({
                                title: `The results in this export have been limited.`,
                                subtitle: `The export limit is ${health.data?.query.csvCellsLimit} cells, but your file exceeded that limit.`,
                            });
                        }
                    },
                    onError: (error: { error: Error }) => {
                        notifications.hide(TOAST_KEY);

                        showToastError({
                            title: `Unable to download results`,
                            subtitle: error?.error?.message,
                        });
                    },
                },
            );

        if (!totalResults || totalResults <= 0) {
            return <Alert color="gray">No data to export</Alert>;
        }

        return (
            <Box>
                <Stack spacing="xs" miw={300}>
                    <SegmentedControl
                        size={'xs'}
                        value={fileType}
                        onChange={(value) =>
                            setFileType(value as DownloadFileType)
                        }
                        data={[
                            { label: 'CSV', value: DownloadFileType.CSV },
                            { label: 'XLSX', value: DownloadFileType.XLSX },
                        ]}
                    />

                    <Stack spacing="xs">
                        <Box>Values</Box>
                        <SegmentedControl
                            size={'xs'}
                            value={format}
                            onChange={(value) => setFormat(value)}
                            data={[
                                { label: 'Formatted', value: Values.FORMATTED },
                                { label: 'Raw', value: Values.RAW },
                            ]}
                        />
                    </Stack>

                    <Can
                        I="manage"
                        this={subject('ChangeCsvResults', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid: projectUuid,
                        })}
                    >
                        <Stack spacing="xs">
                            <Box>Limit</Box>
                            <SegmentedControl
                                size={'xs'}
                                value={limit}
                                onChange={(value) => setLimit(value)}
                                data={[
                                    {
                                        label: 'Results in Table',
                                        value: Limit.TABLE,
                                    },
                                    { label: 'All Results', value: Limit.ALL },
                                    { label: 'Custom...', value: Limit.CUSTOM },
                                ]}
                            />
                        </Stack>
                    </Can>

                    {limit === Limit.CUSTOM && (
                        <NumberInput
                            w="100%"
                            size="xs"
                            min={1}
                            precision={0}
                            required
                            value={customLimit}
                            onChange={(value) => setCustomLimit(Number(value))}
                        />
                    )}

                    {(limit === Limit.ALL || limit === Limit.CUSTOM) && (
                        <Alert color="gray.9" p="xs">
                            <Text size="xs">
                                Results are limited to{' '}
                                {Number(
                                    health.data?.query.csvCellsLimit || 100000,
                                ).toLocaleString()}{' '}
                                cells for each file
                            </Text>
                        </Alert>
                    )}

                    <Button
                        loading={isExporting}
                        compact
                        sx={{
                            alignSelf: 'end',
                        }}
                        leftIcon={<MantineIcon icon={IconTableExport} />}
                        onClick={exportMutation}
                        data-testid="chart-export-results-button"
                    >
                        Download
                    </Button>
                </Stack>
            </Box>
        );
    },
);

export default ExportResults;
