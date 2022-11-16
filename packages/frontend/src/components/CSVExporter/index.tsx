import { Portal } from '@blueprintjs/core';
import { FC, memo, useCallback, useRef } from 'react';
import { CSVLink } from 'react-csv';
import { LinkProps } from 'react-csv/components/Link';

interface RenderElementArgs {
    handleCsvExport: () => void;
    isDisabled: boolean;
}

export type CsvExporterElementType = CSVLink &
    HTMLAnchorElement & {
        link: HTMLAnchorElement;
    };

interface CSVExporterProps extends LinkProps {
    renderElement?: (args: RenderElementArgs) => JSX.Element;
    linkRef?: React.RefObject<CsvExporterElementType>;
}

const CSVExporter: FC<CSVExporterProps> = memo(
    ({ data, renderElement, linkRef: outerRef, ...rest }) => {
        const innerRef = useRef<CsvExporterElementType>(null);
        const ref = outerRef || innerRef;

        const handleCsvExport = useCallback(() => {
            if (!ref.current) return;

            ref.current.link.click();
        }, [ref]);

        const isDisabled = !data || data.length <= 0;

        return (
            <>
                {renderElement?.({ handleCsvExport, isDisabled })}

                <Portal>
                    <CSVLink target="_blank" {...rest} data={data} ref={ref} />
                </Portal>
            </>
        );
    },
);

export default CSVExporter;
