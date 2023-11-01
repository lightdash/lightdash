import {
    Button,
    ButtonProps,
    DialogBody,
    DialogFooter,
    FormGroup,
    Intent,
    NumericInput,
    Radio,
    RadioGroup,
    Spinner,
} from '@blueprintjs/core';
import { Classes } from '@blueprintjs/popover2';
import { ApiScheduledDownloadCsv, ResultRow } from '@lightdash/common';
import { FC, Fragment, memo, useState } from 'react';
import { useMutation } from 'react-query';
import { pollCsvFileUrl } from '../../api/csv';
import useHealth from '../../hooks/health/useHealth';
import useToaster from '../../hooks/toaster/useToaster';
import { AppToaster } from '../AppToaster';
import { InputWrapper, LimitWarning, Title } from './ExportCSV.styles';

enum Limit {
    TABLE = 'table',
    ALL = 'all',
    CUSTOM = 'custom',
}

enum Values {
    FORMATTED = 'formatted',
    RAW = 'raw',
}

const ExportAsCSVButton: FC<ButtonProps> = ({ ...props }) => {
    return (
        <Button text="Export CSV" rightIcon="caret-down" minimal {...props} />
    );
};

type ExportCsvRenderProps = {
    onExport: () => Promise<unknown>;
    isExporting: boolean;
};

export type ExportCSVProps = {
    rows: ResultRow[] | undefined;
    getCsvLink: (
        limit: number | null,
        onlyRaw: boolean,
    ) => Promise<ApiScheduledDownloadCsv>;
    isDialogBody?: boolean;
    renderDialogActions?: (renderProps: ExportCsvRenderProps) => JSX.Element;
};

const ExportCSV: FC<ExportCSVProps> = memo(
    ({ rows, getCsvLink, isDialogBody, renderDialogActions }) => {
        const { showToastError, showToast, showToastWarning } = useToaster();

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
                        showToast({
                            title: 'Exporting CSV',
                            subtitle: 'This may take a few minutes...',
                            icon: (
                                <Spinner
                                    className="bp4-icon bp4-icon-error"
                                    size={16}
                                />
                            ),
                            key: 'exporting-csv',
                            timeout: 0,
                        });
                    },
                    onSuccess: (scheduledCsvResponse) => {
                        pollCsvFileUrl(scheduledCsvResponse)
                            .then((csvFile) => {
                                if (csvFile.url)
                                    window.location.href = csvFile.url;
                                AppToaster.dismiss('exporting-csv');

                                if (csvFile.truncated) {
                                    showToastWarning({
                                        title: `The results in this export have been limited.`,
                                        subtitle: `The export limit is ${health.data?.query.csvCellsLimit} cells, but your file exceeded that limit.`,
                                    });
                                }
                            })
                            .catch((error) => {
                                AppToaster.dismiss('exporting-csv');

                                showToastError({
                                    title: `Unable to download CSV`,
                                    subtitle: error?.error?.message,
                                });
                            });
                    },
                    onError: (error: { error: Error }) => {
                        AppToaster.dismiss('exporting-csv');

                        showToastError({
                            title: `Unable to download CSV`,
                            subtitle: error?.error?.message,
                        });
                    },
                },
            );

        if (!rows || rows.length <= 0) {
            return <ExportAsCSVButton disabled />;
        }

        const Wrapper = isDialogBody ? DialogBody : Fragment;

        return (
            <>
                <Wrapper>
                    <FormGroup>
                        <RadioGroup
                            label={<Title>Values</Title>}
                            onChange={(e) => setFormat(e.currentTarget.value)}
                            selectedValue={format}
                        >
                            <Radio label="Formatted" value={Values.FORMATTED} />
                            <Radio label="Raw" value={Values.RAW} />
                        </RadioGroup>
                    </FormGroup>

                    <FormGroup>
                        <RadioGroup
                            label={<Title>Limit</Title>}
                            onChange={(e) => setLimit(e.currentTarget.value)}
                            selectedValue={limit}
                        >
                            <Radio
                                label="Results in Table"
                                value={Limit.TABLE}
                            />
                            <Radio label="All Results" value={Limit.ALL} />
                            <Radio label="Custom..." value={Limit.CUSTOM} />
                        </RadioGroup>
                    </FormGroup>

                    {limit === Limit.CUSTOM && (
                        <InputWrapper>
                            <NumericInput
                                value={customLimit}
                                min={1}
                                fill
                                onValueChange={(value: any) =>
                                    setCustomLimit(value)
                                }
                            />
                        </InputWrapper>
                    )}

                    {(limit === Limit.ALL || limit === Limit.CUSTOM) && (
                        <LimitWarning>
                            Results are limited to{' '}
                            {Number(
                                health.data?.query.csvCellsLimit || 100000,
                            ).toLocaleString()}{' '}
                            cells for each file
                        </LimitWarning>
                    )}
                </Wrapper>

                {isDialogBody && renderDialogActions ? (
                    <DialogFooter
                        actions={renderDialogActions({
                            onExport: exportCsvMutation,
                            isExporting,
                        })}
                    />
                ) : (
                    <Button
                        className={Classes.POPOVER2_DISMISS}
                        loading={isExporting}
                        fill
                        intent={Intent.PRIMARY}
                        icon="export"
                        onClick={() => exportCsvMutation()}
                        data-testid="chart-export-csv-button"
                    >
                        Export CSV
                    </Button>
                )}
            </>
        );
    },
);

export default ExportCSV;
