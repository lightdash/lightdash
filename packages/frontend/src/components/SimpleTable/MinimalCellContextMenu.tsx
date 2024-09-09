import { isField, type ResultValue } from '@lightdash/common';
import { Menu } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconCopy } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import useToaster from '../../hooks/toaster/useToaster';
import MantineIcon from '../common/MantineIcon';
import { type CellContextMenuProps } from '../common/Table/types';
import UrlMenuItems from '../Explorer/ResultsCard/UrlMenuItems';

const MinimalCellContextMenu: FC<Pick<CellContextMenuProps, 'cell'>> = ({
    cell,
}) => {
    const { showToastSuccess } = useToaster();
    const meta = cell.column.columnDef.meta;
    const item = meta?.item;

    const value: ResultValue = useMemo(
        () => cell.getValue()?.value || {},
        [cell],
    );

    const clipboard = useClipboard({ timeout: 200 });

    const handleCopyToClipboard = useCallback(() => {
        clipboard.copy(value.formatted);
        showToastSuccess({ title: 'Copied to clipboard!' });
    }, [clipboard, showToastSuccess, value.formatted]);

    return (
        <>
            {item && value.raw && isField(item) && (
                <UrlMenuItems urls={item.urls} cell={cell} showErrors={false} />
            )}

            {isField(item) && (item.urls || []).length > 0 && <Menu.Divider />}

            <Menu.Item
                icon={<MantineIcon icon={IconCopy} size="md" fillOpacity={0} />}
                onClick={handleCopyToClipboard}
            >
                Copy value
            </Menu.Item>
        </>
    );
};

export default MinimalCellContextMenu;
