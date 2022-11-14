import {
    Button,
    ButtonProps,
    FormGroup,
    Intent,
    NumericInput,
    PopoverPosition,
    Radio,
    RadioGroup,
} from '@blueprintjs/core';
import { Classes, Popover2 } from '@blueprintjs/popover2';
import { getResultValues, ResultRow } from '@lightdash/common';
import { FC, memo, useEffect, useRef, useState } from 'react';
import { CSVLink } from 'react-csv';
import { InputWrapper, Title } from './DownloadCsvPopup.styles';

type Props = {
    fileName: string | undefined;
    rows: ResultRow[] | undefined;
    getCsvResults: (
        limit: number | null,
        onlyRaw: boolean,
    ) => Promise<object[]>;
};

export enum Limit {
    TABLE = 'table',
    ALL = 'all',
    CUSTOM = 'custom',
}
export enum Values {
    FORMATTED = 'formatted',
    RAW = 'raw',
}

const ExportAsCSVButton: FC<ButtonProps> = ({ ...props }) => {
    return (
        <Button text="Export CSV" rightIcon="caret-down" minimal {...props} />
    );
};

const DownloadCsvPopup: FC<Props> = memo(
    ({ fileName, rows, getCsvResults }) => {
        const [isOpen, setIsOpen] = useState<boolean>(false);
        const [limit, setLimit] = useState<string>(Limit.TABLE);
        const [customLimit, setCustomLimit] = useState<number>(1);
        const [format, setFormat] = useState<string>(Values.FORMATTED);

        const [csvRows, setCsvRows] = useState<object[]>([]);
        const csvRef = useRef<
            CSVLink & HTMLAnchorElement & { link: HTMLAnchorElement }
        >(null);
        useEffect(() => {
            if (csvRows.length > 0 && csvRef.current?.link) {
                csvRef.current.link.click();
                setCsvRows([]);
                setIsOpen(false);
            }
        }, [csvRows]);

        const csvFilename = `lightdash-${fileName || 'export'}-${
            limit === Limit.ALL ? 'all-' : ''
        }${new Date().toISOString().slice(0, 10)}.csv`;

        if (!rows || rows.length <= 0) {
            return <ExportAsCSVButton disabled />;
        }

        return (
            <Popover2
                placement="bottom-end"
                isOpen={isOpen}
                onInteraction={setIsOpen}
                position={PopoverPosition.BOTTOM_LEFT}
                popoverClassName={Classes.POPOVER2_CONTENT_SIZING}
                content={
                    <>
                        <FormGroup>
                            <RadioGroup
                                label={<Title>Values</Title>}
                                onChange={(e) =>
                                    setFormat(e.currentTarget.value)
                                }
                                selectedValue={format}
                            >
                                <Radio
                                    label="Formatted"
                                    value={Values.FORMATTED}
                                />
                                <Radio label="Raw" value={Values.RAW} />
                            </RadioGroup>
                        </FormGroup>

                        <FormGroup>
                            <RadioGroup
                                label={<Title>Limit</Title>}
                                onChange={(e) =>
                                    setLimit(e.currentTarget.value)
                                }
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

                        <CSVLink
                            ref={csvRef}
                            target="_blank"
                            data={csvRows}
                            filename={csvFilename}
                        />

                        <Button
                            fill
                            intent={Intent.PRIMARY}
                            icon="export"
                            onClick={() => {
                                if (limit === Limit.TABLE) {
                                    setCsvRows(
                                        getResultValues(
                                            rows,
                                            format === Values.RAW,
                                        ),
                                    );
                                } else {
                                    getCsvResults(
                                        limit === Limit.CUSTOM
                                            ? customLimit
                                            : null,
                                        format === Values.RAW,
                                    ).then((allRows) => {
                                        setCsvRows(allRows);
                                    });
                                }
                            }}
                        >
                            Export CSV
                        </Button>
                    </>
                }
            >
                <ExportAsCSVButton />
            </Popover2>
        );
    },
);

export default DownloadCsvPopup;
