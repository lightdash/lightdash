import { AUTO_DETECTED_URL_LABEL, isUrlValue } from '@lightdash/common';
import { Menu } from '@mantine/core';
import { IconCopy, IconLink } from '@tabler/icons-react';
import useToaster from '../../../hooks/toaster/useToaster';
import { JsonCellMenuItem } from '../../common/JsonViewer/JsonCellViewer';
import {
    getJsonCellValue,
    getJsonLikeString,
} from '../../common/JsonViewer/utils';
import MantineIcon from '../../common/MantineIcon';
import { type CellContextMenuProps } from '../../common/Table/types';

export const RawResultCellContextMenu = ({
    cell,
    onViewJsonCell,
}: CellContextMenuProps) => {
    const { showToastSuccess } = useToaster();
    const value = cell.getValue();
    const jsonValue = getJsonCellValue(value) ?? getJsonLikeString(value);

    return (
        <>
            {isUrlValue(value) ? (
                <>
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconLink} />}
                        onClick={() =>
                            window.open(value, '_blank', 'noopener,noreferrer')
                        }
                    >
                        {AUTO_DETECTED_URL_LABEL}
                    </Menu.Item>
                    <Menu.Divider />
                </>
            ) : null}
            <Menu.Item
                leftSection={<MantineIcon icon={IconCopy} />}
                onClick={() => {
                    void navigator.clipboard?.writeText(String(value ?? ''));
                    showToastSuccess({ title: 'Copied to clipboard!' });
                }}
            >
                Copy value
            </Menu.Item>

            {jsonValue && onViewJsonCell ? (
                <JsonCellMenuItem onClick={() => onViewJsonCell(jsonValue)} />
            ) : null}
        </>
    );
};
