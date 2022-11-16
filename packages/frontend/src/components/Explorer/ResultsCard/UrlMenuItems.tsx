import { Icon } from '@blueprintjs/core';
import { MenuItem2, Tooltip2 } from '@blueprintjs/popover2';
import {
    Field,
    FieldUrl,
    friendlyName,
    getItemId,
    getItemLabel,
    getTemplatedUrlRowDependencies,
    isField,
    renderTemplatedUrl,
    ResultRow,
    TableCalculation,
} from '@lightdash/common';
import { Cell } from '@tanstack/react-table';
import { FC, useMemo } from 'react';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';

const UrlMenuItem: FC<{
    urlConfig: FieldUrl;
    itemsMap?: Record<string, Field | TableCalculation>;
    itemIdsInRow: string[];
    value: { raw: any; formatted: string };
    row: Record<string, Record<string, { raw: any; formatted: string }>>;
}> = ({ urlConfig, itemsMap, itemIdsInRow, value, row }) => {
    const { track } = useTracking();
    const [url, renderError] = useMemo(() => {
        let parsedUrl: string | undefined = undefined;
        let errorMessage: string | undefined = undefined;
        try {
            parsedUrl = renderTemplatedUrl(
                urlConfig.url,
                {
                    raw: value.raw,
                    formatted: value.formatted,
                },
                row,
            );
        } catch (e) {
            errorMessage = e instanceof Error ? e.message : `${e}`;
        }
        return [parsedUrl, errorMessage];
    }, [row, urlConfig, value]);
    const validationError = useMemo(() => {
        let errorMessage: string | undefined = undefined;
        try {
            const rowDependencies = getTemplatedUrlRowDependencies(
                urlConfig.url,
            );
            const missingDependencies = rowDependencies.filter(
                (rowDependency) => !itemIdsInRow.includes(rowDependency),
            );
            if (missingDependencies.length > 0) {
                if (itemsMap) {
                    errorMessage = `To use this action add ${missingDependencies
                        .map((rowReference) => {
                            const item = itemsMap[rowReference];
                            const label = item
                                ? getItemLabel(item)
                                : friendlyName(rowReference);
                            return `"${label}"`;
                        })
                        .join(' and ')} to your query`;
                } else {
                    errorMessage = 'Action not available for this query';
                }
            }
        } catch (e) {
            errorMessage = e instanceof Error ? e.message : `${e}`;
        }
        return errorMessage;
    }, [itemIdsInRow, itemsMap, urlConfig]);
    const error: string | undefined = validationError || renderError;

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
            disabled={!url}
            onClick={() => {
                track({
                    name: EventName.GO_TO_LINK_CLICKED,
                });
                window.open(url, '_blank');
            }}
        />
    );
};

const UrlMenuItems: FC<{
    urls: FieldUrl[] | undefined;
    cell: Cell<ResultRow, ResultRow[0]>;
    itemsMap?: Record<string, Field | TableCalculation>;
}> = ({ urls, cell, itemsMap }) => {
    const value: ResultRow[0]['value'] = cell.getValue()?.value || {};
    const [itemIdsInRow, rowData] = useMemo(() => {
        const itemIds: string[] = [];
        const row = cell.row
            .getAllCells()
            .reduce<
                Record<string, Record<string, { raw: any; formatted: string }>>
            >((acc, rowCell) => {
                const item = rowCell.column.columnDef.meta?.item;
                const rowCellValue = (rowCell.getValue() as ResultRow[0])
                    ?.value;
                if (item && isField(item) && rowCellValue) {
                    itemIds.push(getItemId(item));
                    acc[item.table] = acc[item.table] || {};
                    acc[item.table][item.name] = rowCellValue;
                    return acc;
                }
                return acc;
            }, {});
        return [itemIds, row];
    }, [cell]);

    return (
        <>
            {(urls || []).map((urlConfig) => (
                <UrlMenuItem
                    key={urlConfig.label}
                    urlConfig={urlConfig}
                    itemsMap={itemsMap}
                    itemIdsInRow={itemIdsInRow}
                    row={rowData}
                    value={value}
                />
            ))}
        </>
    );
};

export default UrlMenuItems;
