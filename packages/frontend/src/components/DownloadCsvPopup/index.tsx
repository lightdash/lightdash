import {
    Button,
    Card,
    Intent,
    NumericInput,
    PopoverPosition,
    Radio,
    RadioGroup,
} from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
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
export enum Format {
    FORMATTED = 'formatted',
    UNFORMATTED = 'Unformatted',
}

const DownloadCsvPopup: FC<Props> = memo(
    ({ fileName, rows, getCsvResults }) => {
        const [isOpen, setIsOpen] = useState<boolean>(false);
        const [limit, setLimit] = useState<string>(Limit.TABLE);
        const [customLimit, setCustomLimit] = useState<number>(1);
        const [format, setFormat] = useState<string>(Format.FORMATTED);

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
            return <Button icon="download" text=".csv" disabled />;
        }
        return (
            <Popover2
                content={
                    <Card>
                        <RadioGroup
                            label={<Title>Format</Title>}
                            onChange={(e) => setFormat(e.currentTarget.value)}
                            selectedValue={format}
                        >
                            <Radio label="Formatted" value={Format.FORMATTED} />
                            <Radio
                                label="Unformatted"
                                value={Format.UNFORMATTED}
                            />
                        </RadioGroup>

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
                            data={csvRows}
                            ref={csvRef}
                            tabIndex={0}
                            target="_blank"
                            filename={csvFilename}
                        />
                        <Button
                            intent={Intent.PRIMARY}
                            onClick={() => {
                                if (limit === Limit.TABLE) {
                                    setCsvRows(
                                        getResultValues(
                                            rows,
                                            format === Format.UNFORMATTED,
                                        ),
                                    );
                                } else {
                                    getCsvResults(
                                        limit === Limit.CUSTOM
                                            ? customLimit
                                            : null,
                                        format === Format.UNFORMATTED,
                                    ).then((allRows) => {
                                        setCsvRows(allRows);
                                    });
                                }
                            }}
                        >
                            Download CSV
                        </Button>
                    </Card>
                }
                isOpen={isOpen}
                onInteraction={setIsOpen}
                position={PopoverPosition.BOTTOM_LEFT}
            >
                <Button icon="download" text=".csv" />
            </Popover2>
        );
    },
);

export default DownloadCsvPopup;
