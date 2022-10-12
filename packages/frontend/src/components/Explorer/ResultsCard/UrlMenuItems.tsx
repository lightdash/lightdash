import { Icon } from '@blueprintjs/core';
import { MenuItem2, Tooltip2 } from '@blueprintjs/popover2';
import {
    FieldUrl,
    isField,
    renderTemplatedUrl,
    ResultRow,
} from '@lightdash/common';
import { Cell } from '@tanstack/react-table';
import { FC } from 'react';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';

const UrlMenuItems: FC<{
    urls: FieldUrl[] | undefined;
    cell: Cell<ResultRow, ResultRow[0]>;
}> = ({ urls, cell }) => {
    const { track } = useTracking();
    const value: ResultRow[0]['value'] = cell.getValue()?.value || {};
    const row = cell.row
        .getAllCells()
        .reduce<
            Record<string, Record<string, { raw: any; formatted: string }>>
        >((acc, rowCell) => {
            const item = rowCell.column.columnDef.meta?.item;
            const rowCellValue = (rowCell.getValue() as ResultRow[0])?.value;
            if (item && isField(item) && value) {
                acc[item.table] = acc[item.table] || {};
                acc[item.table][item.name] = rowCellValue;
                return acc;
            }
            return acc;
        }, {});

    return (
        <>
            {(urls || []).map((urlConfig) => {
                let parsedUrl: string | undefined = undefined;
                let error: string | undefined = undefined;
                try {
                    parsedUrl = renderTemplatedUrl(
                        urlConfig.url,
                        {
                            raw: value.raw,
                            formatted: value.formatted,
                        },
                        row,
                    );
                } catch (e: any) {
                    if (e.originalError?.name === 'UndefinedVariableError') {
                        const rowReferences = e.context.match(
                            /row\.([a-z\\._]+)\.([a-z\\._]+)\.(raw|formatted)/g,
                        );
                        console.log('rowReferences', rowReferences);
                        if (rowReferences && rowReferences.length > 0) {
                            error = `To use this action add ${rowReferences.join(
                                ' and ',
                            )} to your query`;
                        } else {
                            error = `Value not found for reference "${e.token.content}"`;
                        }
                    } else {
                        error = `${e}`;
                    }
                }
                return (
                    <MenuItem2
                        key={`url_entry_${urlConfig.label}`}
                        icon="open-application"
                        text={urlConfig.label}
                        labelElement={
                            error && (
                                <Tooltip2 content={error}>
                                    <Icon icon="issue" />
                                </Tooltip2>
                            )
                        }
                        disabled={!parsedUrl}
                        onClick={() => {
                            track({
                                name: EventName.GO_TO_LINK_CLICKED,
                            });
                            window.open(parsedUrl, '_blank');
                        }}
                    />
                );
            })}
        </>
    );
};

export default UrlMenuItems;
