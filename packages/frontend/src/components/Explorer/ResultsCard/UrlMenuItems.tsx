import {
    friendlyName,
    getItemId,
    getItemLabel,
    getTemplatedUrlRowDependencies,
    isField,
    renderTemplatedUrl,
    type Field,
    type FieldUrl,
    type ResultRow,
    type ResultValue,
    type TableCalculation,
} from '@lightdash/common';
import { Box, Menu, Tooltip } from '@mantine/core';
import { IconExclamationCircle, IconLink } from '@tabler/icons-react';
import { type Cell } from '@tanstack/react-table';
import { useMemo, type FC } from 'react';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';

const UrlMenuItem: FC<{
    urlConfig: FieldUrl;
    itemsMap?: Record<string, Field | TableCalculation>;
    itemIdsInRow: string[];
    value: ResultValue;
    row: Record<string, Record<string, ResultValue>>;
    showError?: boolean;
}> = ({ urlConfig, itemsMap, itemIdsInRow, value, row, showError = true }) => {
    const tracking = useTracking(true);
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
    if (!showError && error) {
        return null;
    }
    return (
        <Tooltip
            withinPortal
            maw={300}
            multiline
            disabled={!error}
            label={error}
            position="bottom"
        >
            <Box>
                <Menu.Item
                    icon={<MantineIcon icon={IconLink} />}
                    rightSection={
                        error && (
                            <Box ml="sm">
                                <MantineIcon icon={IconExclamationCircle} />
                            </Box>
                        )
                    }
                    disabled={!url}
                    onClick={() => {
                        tracking?.track({
                            name: EventName.GO_TO_LINK_CLICKED,
                        });
                        window.open(url, '_blank');
                    }}
                >
                    {urlConfig.label}
                </Menu.Item>
            </Box>
        </Tooltip>
    );
};

const UrlMenuItems: FC<{
    urls: FieldUrl[] | undefined;
    cell: Cell<ResultRow, ResultRow[0]>;
    itemsMap?: Record<string, Field | TableCalculation>;
    showErrors?: boolean;
}> = ({ urls, cell, itemsMap, showErrors }) => {
    const value: ResultValue = cell.getValue()?.value || {};
    const [itemIdsInRow, rowData] = useMemo(() => {
        const itemIds: string[] = [];
        const row = cell.row
            .getAllCells()
            .reduce<Record<string, Record<string, ResultValue>>>(
                (acc, rowCell) => {
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
                },
                {},
            );
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
                    showError={showErrors}
                />
            ))}
        </>
    );
};

export default UrlMenuItems;
