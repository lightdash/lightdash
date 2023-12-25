import { subject } from '@casl/ability';
import { ApiScheduledDownloadCsv, ResultRow } from '@lightdash/common';
import { Alert, Box, Button, NumberInput, Radio, Stack } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconTableExport } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { FC, memo, useState } from 'react';
import { pollCsvFileUrl } from '../../api/csv';
import useHealth from '../../hooks/health/useHealth';
import useToaster from '../../hooks/toaster/useToaster';
import useUser from '../../hooks/user/useUser';
import { Can } from '../common/Authorization';
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

type ExportCsvRenderProps = {
    onExport: () => Promise<unknown>;
    isExporting: boolean;
};

export type ExportCSVProps = {
    projectUuid: string;
    rows: ResultRow[] | undefined;
    getCsvLink: (
        limit: number | null,
        onlyRaw: boolean,
    ) => Promise<ApiScheduledDownloadCsv>;
    isDialogBody?: boolean;
    renderDialogActions?: (renderProps: ExportCsvRenderProps) => JSX.Element;
};

const ExportCSV: FC<ExportCSVProps> = memo(
    ({ projectUuid, rows, getCsvLink, isDialogBody, renderDialogActions }) => {
        const { showToastError, showToastInfo, showToastWarning } =
            useToaster();

        const user = useUser(true);
        const [limit, setLimit] = useState<string>(Limit.TABLE);
        const [customLimit, setCustomLimit] = useState<number>(1);
        const [format, setFormat] = useState<string>(Values.FORMATTED);
        const health = useHealth();

        const { isLoading: isExporting, mutateAsync: exportCsvMutation } =
            useMutation(
                [limit, customLimit, rows, format],
                () =>
                    getCsvLink(
                        limit === Limit.CUSTOM
                            ? customLimit
                            : limit === Limit.TABLE
                            ? rows?.length ?? 0
                            : null,
                        format === Values.RAW,
                    ),
                {
                    onMutate: () => {
                        showToastInfo({
                            title: 'Exporting CSV',
                            subtitle: 'This may take a few minutes...',
                            loading: true,
                            key: 'exporting-csv',
                            autoClose: false,
                        });
                    },
                    onSuccess: (scheduledCsvResponse) => {
                        pollCsvFileUrl(scheduledCsvResponse)
                            .then((csvFile) => {
                                if (csvFile.url)
                                    window.location.href = csvFile.url;
                                notifications.hide('exporting-csv');

                                if (csvFile.truncated) {
                                    showToastWarning({
                                        title: `The results in this export have been limited.`,
                                        subtitle: `The export limit is ${health.data?.query.csvCellsLimit} cells, but your file exceeded that limit.`,
                                    });
                                }
                            })
                            .catch((error) => {
                                notifications.hide('exporting-csv');

                                showToastError({
                                    title: `Unable to download CSV`,
                                    subtitle: error?.error?.message,
                                });
                            });
                    },
                    onError: (error: { error: Error }) => {
                        notifications.hide('exporting-csv');

                        showToastError({
                            title: `Unable to download CSV`,
                            subtitle: error?.error?.message,
                        });
                    },
                },
            );

        if (!rows || rows.length <= 0) {
            return <Alert color="gray">No data to export</Alert>;
        }

        return (
            <Box>
                <Stack
                    spacing="xs"
                    m={isDialogBody ? 'md' : undefined}
                    miw={300}
                >
                    <Radio.Group
                        label="Values"
                        value={format}
                        onChange={(val) => setFormat(val)}
                    >
                        <Stack spacing="xs" mt="xs">
                            <Radio label="Formatted" value={Values.FORMATTED} />
                            <Radio label="Raw" value={Values.RAW} />
                        </Stack>
                    </Radio.Group>

                    <Can
                        I="manage"
                        this={subject('ChangeCsvResults', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid: projectUuid,
                        })}
                    >
                        <Radio.Group
                            label="Limit"
                            value={limit}
                            onChange={(val) => setLimit(val)}
                        >
                            <Stack spacing="xs" mt="xs">
                                <Radio
                                    label="Results in Table"
                                    value={Limit.TABLE}
                                />
                                <Radio label="All Results" value={Limit.ALL} />
                                <Radio label="Custom..." value={Limit.CUSTOM} />
                            </Stack>
                        </Radio.Group>
                    </Can>

                    {limit === Limit.CUSTOM && (
                        <NumberInput
                            w="7xl"
                            size="xs"
                            min={1}
                            precision={0}
                            required
                            value={customLimit}
                            onChange={(value) => setCustomLimit(Number(value))}
                        />
                    )}

                    {(limit === Limit.ALL || limit === Limit.CUSTOM) && (
                        <Alert color="gray">
                            Results are limited to{' '}
                            {Number(
                                health.data?.query.csvCellsLimit || 100000,
                            ).toLocaleString()}{' '}
                            cells for each file
                        </Alert>
                    )}
                    {!isDialogBody && (
                        <Button
                            loading={isExporting}
                            compact
                            sx={{
                                alignSelf: 'end',
                            }}
                            leftIcon={<MantineIcon icon={IconTableExport} />}
                            onClick={() => exportCsvMutation()}
                            data-testid="chart-export-csv-button"
                        >
                            Export CSV
                        </Button>
                    )}
                </Stack>

                {isDialogBody && renderDialogActions && (
                    <>
                        {renderDialogActions({
                            onExport: exportCsvMutation,
                            isExporting,
                        })}
                    </>
                )}
            </Box>
        );
    },
);

export default ExportCSV;
