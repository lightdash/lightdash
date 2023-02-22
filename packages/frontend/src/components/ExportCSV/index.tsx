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
} from '@blueprintjs/core';
import { ResultRow } from '@lightdash/common';
import { FC, Fragment, memo, useState } from 'react';
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

type ExportCsvRenderProps = {
    onExport: () => Promise<void>;
    isExporting: boolean;
};

export type ExportCSVProps = {
    rows: ResultRow[] | undefined;
    getCsvLink: (limit: number | null, onlyRaw: boolean) => Promise<string>;
    isDialogBody?: boolean;
    renderDialogActions?: (renderProps: ExportCsvRenderProps) => JSX.Element;
};

const ExportCSV: FC<ExportCSVProps> = memo(
    ({ rows, getCsvLink, isDialogBody, renderDialogActions }) => {
        const [limit, setLimit] = useState<string>(Limit.TABLE);
        const [customLimit, setCustomLimit] = useState<number>(1);
        const [format, setFormat] = useState<string>(Values.FORMATTED);
        const [isExporting, setIsExporting] = useState<boolean>(false);

        if (!rows || rows.length <= 0) {
            return <ExportAsCSVButton disabled />;
        }

        const Wrapper = isDialogBody ? DialogBody : Fragment;

        const handleExport = async () => {
            setIsExporting(true);

            const url = await getCsvLink(
                limit === Limit.CUSTOM
                    ? customLimit
                    : limit === Limit.TABLE
                    ? rows.length
                    : null,
                format === Values.RAW,
            );

            setIsExporting(false);

            window.open(url, '_blank');
        };

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
                </Wrapper>

                {isDialogBody && renderDialogActions ? (
                    <DialogFooter
                        actions={renderDialogActions({
                            onExport: handleExport,
                            isExporting,
                        })}
                    />
                ) : (
                    <Button
                        loading={isExporting}
                        fill
                        intent={Intent.PRIMARY}
                        icon="export"
                        onClick={handleExport}
                    >
                        Export CSV
                    </Button>
                )}
            </>
        );
    },
);

export default ExportCSV;
