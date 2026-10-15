import { isField, type FieldUrl, type ResultValue } from '@lightdash/common';
import { Menu } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconCopy } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import useToaster from '../../hooks/toaster/useToaster';
import MantineIcon from '../common/MantineIcon';
import { type CellContextMenuProps } from '../common/Table/types';
import UrlMenuItems from '../Explorer/ResultsCard/UrlMenuItems';

const CellContextMenu: FC<Pick<CellContextMenuProps, 'cell'>> = ({ cell }) => {
    const { t } = useTranslation('app');
    const clipboard = useClipboard({ timeout: 2000 });
    const { showToastSuccess } = useToaster();

    const item = useMemo(() => cell.column.columnDef.meta?.item, [cell]);
    const value: ResultValue = useMemo(
        () => cell.getValue()?.value || {},
        [cell],
    );

    const handleCopyToClipboard = useCallback(() => {
        clipboard.copy(value.formatted);
        showToastSuccess({ title: t('metricQueryData.copiedToClipboard') });
    }, [value, clipboard, showToastSuccess, t]);

    const urls: FieldUrl[] | undefined = useMemo(
        () =>
            value.raw !== undefined && value.raw !== null && isField(item)
                ? item.urls
                : undefined,
        [value, item],
    );

    return (
        <>
            <UrlMenuItems urls={urls} cell={cell} />
            {urls && urls.length > 0 && <Menu.Divider />}
            <Menu.Item
                leftSection={<MantineIcon icon={IconCopy} />}
                onClick={handleCopyToClipboard}
            >
                {t('metricQueryData.copyValue')}
            </Menu.Item>
        </>
    );
};

export default CellContextMenu;
