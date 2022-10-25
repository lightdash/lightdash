import {
    Button,
    Card,
    Classes,
    Icon,
    Intent,
    Menu,
    PopoverPosition,
    Radio,
    RadioGroup,
} from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import {
    ApiQueryResults,
    getResultValues,
    TableSelectionType,
} from '@lightdash/common';
import React, {
    FC,
    memo,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';
import { CSVLink } from 'react-csv';
import { Title } from './DownloadCsvPopup.styles';

type Props = {
    fileName: string | undefined;
    rows: object[] | undefined;
    getAllResults: () => Promise<object[]>;
};

export enum Limit {
    TABLE = 'table',
    ALL = 'all',
}

const DownloadCsvPopup: FC<Props> = memo(
    ({ fileName, rows, getAllResults }) => {
        const [isOpen, setIsOpen] = useState<boolean>(false);
        const [limit, setLimit] = useState<string>(Limit.TABLE);

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
                            label={<Title>Limit</Title>}
                            onChange={(e) => setLimit(e.currentTarget.value)}
                            selectedValue={limit}
                        >
                            <Radio
                                label="Results in Table"
                                value={Limit.TABLE}
                            />
                            <Radio label="All Results" value={Limit.ALL} />
                        </RadioGroup>

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
                                    setCsvRows(rows);
                                } else {
                                    getAllResults().then((allRows) => {
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
