import { assertUnreachable, WarehouseTableType } from '@lightdash/common';
import {
    IconCloudDataConnection,
    IconTable,
    IconTableFilled,
    type Icon,
} from '@tabler/icons-react';
import i18n from '../../../i18n/i18n';
import { IconTableEye } from './IconTableEye';

// Rows cached before the type was stored fall back to the table icon
export const getTableTypeDisplay = (
    tableType: WarehouseTableType | undefined,
): { icon: Icon; label: string } => {
    switch (tableType) {
        case WarehouseTableType.VIEW:
            return {
                icon: IconTableEye,
                label: i18n.t('tableType.view', { ns: 'sqlRunner' }),
            };
        case WarehouseTableType.MATERIALIZED_VIEW:
            return {
                icon: IconTableFilled,
                label: i18n.t('tableType.materializedView', {
                    ns: 'sqlRunner',
                }),
            };
        case WarehouseTableType.EXTERNAL:
            return {
                icon: IconCloudDataConnection,
                label: i18n.t('tableType.external', { ns: 'sqlRunner' }),
            };
        case WarehouseTableType.TABLE:
        case undefined:
            return {
                icon: IconTable,
                label: i18n.t('tableType.table', { ns: 'sqlRunner' }),
            };
        default:
            return assertUnreachable(tableType, 'Unknown table type');
    }
};
