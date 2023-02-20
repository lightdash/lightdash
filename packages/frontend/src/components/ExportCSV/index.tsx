import {
    Button,
    ButtonProps,
    FormGroup,
    Intent,
    NumericInput,
    Radio,
    RadioGroup,
} from '@blueprintjs/core';
import { ResultRow } from '@lightdash/common';
import { FC, memo, useState } from 'react';
import { InputWrapper, Title } from './ExportCSV.styles';

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

export type ExportCSVProps = {
    rows: ResultRow[] | undefined;
    getCsvLink: (limit: number | null, onlyRaw: boolean) => Promise<string>;
};

const ExportCSV: FC<ExportCSVProps> = memo(({ rows, getCsvLink }) => {
    const [limit, setLimit] = useState<string>(Limit.TABLE);
    const [customLimit, setCustomLimit] = useState<number>(1);
    const [format, setFormat] = useState<string>(Values.FORMATTED);

    if (!rows || rows.length <= 0) {
        return <ExportAsCSVButton disabled />;
    }

    return (
        <>
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
                    <Radio label="Results in Table" value={Limit.TABLE} />
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
                        onValueChange={(value: any) => setCustomLimit(value)}
                    />
                </InputWrapper>
            )}
            <Button
                fill
                intent={Intent.PRIMARY}
                icon="export"
                onClick={() => {
                    getCsvLink(
                        limit === Limit.CUSTOM
                            ? customLimit
                            : limit === Limit.TABLE
                            ? rows.length
                            : null,
                        format === Values.RAW,
                    ).then((url) => {
                        window.open(url, '_blank');
                    });
                }}
            >
                Export CSV
            </Button>
        </>
    );
});

export default ExportCSV;
