import { type ApiScheduledDownloadCsv } from '@lightdash/common';
import { Alert, Box, Button, NumberInput, Radio, Stack } from '@mantine/core';
import { IconTableExport } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { memo, useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import useHealth from '../../../../../hooks/health/useHealth';
import { pollEmbedCsvFileUrl } from '../api';

enum Limit {
    TABLE = 'table',
    ALL = 'all',
    CUSTOM = 'custom',
}

export type ExportEmbedCSVProps = {
    embedToken: string;
    projectUuid: string;
    totalResults: number | undefined;
    getCsvLink: (
        limit: number | null,
        onlyRaw: boolean,
    ) => Promise<ApiScheduledDownloadCsv>;
    overrideCanExportAllResults?: boolean;
};

const ExportEmbedCSV: FC<ExportEmbedCSVProps> = memo(
    ({
        embedToken,
        projectUuid,
        totalResults,
        getCsvLink,
        overrideCanExportAllResults = false,
    }) => {
        // const user = useUser(true);
        const [limit, setLimit] = useState<string>(Limit.TABLE);
        const [customLimit, setCustomLimit] = useState<number>(1);
        const health = useHealth();

        const { isLoading: isExporting, mutateAsync: exportCsvMutation } =
            useMutation(
                [limit, customLimit, totalResults],
                () =>
                    getCsvLink(
                        limit === Limit.CUSTOM
                            ? customLimit
                            : limit === Limit.TABLE
                            ? totalResults ?? 0
                            : null,
                        false,
                    ),
                {
                    onMutate: () => {
                        console.log('Exporting embeded csv');
                    },
                    onSuccess: (scheduledCsvResponse) => {
                        pollEmbedCsvFileUrl({
                            embedToken,
                            projectUuid,
                            jobId: scheduledCsvResponse.jobId,
                        })
                            .then((csvFile) => {
                                if (csvFile.url)
                                    window.location.href = csvFile.url;
                            })
                            .catch((error) => {
                                console.error(error);
                            });
                    },
                    onError: (error: { error: Error }) => {
                        console.error('Error exporting embeded csv', error);
                    },
                },
            );

        if (!totalResults || totalResults <= 0) {
            return <Alert color="gray">No data to export</Alert>;
        }

        const userCanChangeLimit = overrideCanExportAllResults === true;

        return (
            <Box>
                <Stack spacing="xs" miw={300}>
                    {userCanChangeLimit && (
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
                    )}

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
                </Stack>
            </Box>
        );
    },
);

export default ExportEmbedCSV;
