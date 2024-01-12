import { FieldUrl, isField, ResultValue } from '@lightdash/common';
import { Menu } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconCopy } from '@tabler/icons-react';
import { FC, useCallback, useMemo } from 'react';
import useToaster from '../../hooks/toaster/useToaster';
import MantineIcon from '../common/MantineIcon';
import { CellContextMenuProps } from '../common/Table/types';
import UrlMenuItems from '../Explorer/ResultsCard/UrlMenuItems';

const CellContextMenu: FC<Pick<CellContextMenuProps, 'cell'>> = ({ cell }) => {
    const clipboard = useClipboard({ timeout: 2000 });
    const { showToastSuccess } = useToaster();

    const item = useMemo(() => cell.column.columnDef.meta?.item, [cell]);
    const value: ResultValue = useMemo(
        () => cell.getValue()?.value || {},
        [cell],
    );

    const handleCopyToClipboard = useCallback(() => {
        clipboard.copy(value.formatted);
        showToastSuccess({ title: 'Copied to clipboard!' });
    }, [value, clipboard, showToastSuccess]);

    const urls: FieldUrl[] | undefined = useMemo(
        () => (value.raw && isField(item) ? item.urls : undefined),
        [value, item],
    );

    return (
        <>
            <UrlMenuItems urls={urls} cell={cell} />
            {urls && urls.length > 0 && <Menu.Divider />}
            <Menu.Item
                icon={<MantineIcon icon={IconCopy} />}
                onClick={handleCopyToClipboard}
            >
                Copy value
            </Menu.Item>
        </>
    );
};

export default CellContextMenu;
