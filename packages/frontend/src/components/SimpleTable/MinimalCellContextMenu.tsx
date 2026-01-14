import { isDimension, isField, type ResultValue } from '@lightdash/common';
import { Menu } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconCopy } from '@tabler/icons-react';
import mapValues from 'lodash/mapValues';
import { useCallback, useMemo, type FC } from 'react';
import useToaster from '../../hooks/toaster/useToaster';
import MantineIcon from '../common/MantineIcon';
import { type CellContextMenuProps } from '../common/Table/types';
import { UnderlyingDataMenuItem } from '../DashboardTiles/UnderlyingDataMenuItem';
import UrlMenuItems from '../Explorer/ResultsCard/UrlMenuItems';
import { useMetricQueryDataContext } from '../MetricQueryData/useMetricQueryDataContext';

const MinimalCellContextMenu: FC<Pick<CellContextMenuProps, 'cell'>> = ({
    cell,
}) => {
    const { showToastSuccess } = useToaster();
    const { openUnderlyingDataModal, metricQuery } =
        useMetricQueryDataContext();

    const meta = cell.column.columnDef.meta;
    const item = meta?.item;

    const value: ResultValue = useMemo(
        () => cell.getValue()?.value || {},
        [cell],
    );

    const fieldValues = useMemo(
        () => mapValues(cell.row.original, (v) => v?.value) || {},
        [cell.row.original],
    );

    const clipboard = useClipboard({ timeout: 200 });

    const handleCopyToClipboard = useCallback(() => {
        clipboard.copy(value.formatted);
        showToastSuccess({ title: 'Copied to clipboard!' });
    }, [clipboard, showToastSuccess, value.formatted]);

    const handleViewUnderlyingData = useCallback(() => {
        if (meta === undefined) return;

        openUnderlyingDataModal({
            item: meta.item,
            value,
            fieldValues,
            pivotReference: meta?.pivotReference,
        });
    }, [openUnderlyingDataModal, meta, value, fieldValues]);

    return (
        <>
            {item && value.raw && isField(item) ? (
                <UrlMenuItems urls={item.urls} cell={cell} showErrors={false} />
            ) : null}

            {isField(item) && (item.urls || []).length > 0 && <Menu.Divider />}

            <Menu.Item
                icon={<MantineIcon icon={IconCopy} size="md" fillOpacity={0} />}
                onClick={handleCopyToClipboard}
            >
                Copy value
            </Menu.Item>

            {item && !isDimension(item) && metricQuery && (
                <UnderlyingDataMenuItem
                    metricQuery={metricQuery}
                    onViewUnderlyingData={handleViewUnderlyingData}
                />
            )}
        </>
    );
};

export default MinimalCellContextMenu;
