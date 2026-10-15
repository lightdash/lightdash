import {
    type CustomDimension,
    type Field,
    type TableCalculation,
} from '@lightdash/common';
import { Menu, Text } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
    getSortDirectionOrder,
    getSortLabel,
    type SortDirection,
} from '../../../utils/sortUtils';
import MantineIcon from '../../common/MantineIcon';

type Props = {
    item: Field | TableCalculation | CustomDimension;
    selectedDirection: SortDirection | undefined;
    onSelect: (direction: SortDirection) => void;
    /** When provided and a direction is active, renders a "Remove sort" item. */
    onRemove?: () => void;
};

const ColumnHeaderSortMenuOptions: FC<Props> = ({
    item,
    selectedDirection,
    onSelect,
    onRemove,
}) => {
    const { t } = useTranslation('explorer');
    return (
        <>
            <Menu.Label>{t('columnHeaderMenu.sort.title')}</Menu.Label>
            {getSortDirectionOrder(item).map((direction) => {
                const isActive = selectedDirection === direction;
                return (
                    <Menu.Item
                        key={direction}
                        leftSection={
                            isActive ? (
                                <MantineIcon icon={IconCheck} />
                            ) : undefined
                        }
                        disabled={isActive}
                        onClick={() => onSelect(direction)}
                    >
                        <Trans
                            t={t}
                            i18nKey="columnHeaderMenu.sort.direction"
                            values={{ label: getSortLabel(item, direction) }}
                            components={{ bold: <Text span fw="bold" /> }}
                        />
                    </Menu.Item>
                );
            })}
            {onRemove && selectedDirection !== undefined && (
                <>
                    <Menu.Divider />
                    <Menu.Item color="red" onClick={onRemove}>
                        {t('columnHeaderMenu.sort.remove')}
                    </Menu.Item>
                </>
            )}
        </>
    );
};

export default ColumnHeaderSortMenuOptions;
