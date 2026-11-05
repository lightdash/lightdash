import { assertUnreachable, WarehouseTableType } from '@lightdash/common';
import {
    IconCloudDataConnection,
    IconTable,
    IconTableFilled,
    type Icon,
} from '@tabler/icons-react';
import { IconTableEye } from './IconTableEye';

// Rows cached before the type was stored fall back to the table icon
export const getTableTypeDisplay = (
    tableType: WarehouseTableType | undefined,
): { icon: Icon; label: string } => {
    switch (tableType) {
        case WarehouseTableType.VIEW:
            return { icon: IconTableEye, label: 'View' };
        case WarehouseTableType.MATERIALIZED_VIEW:
            return { icon: IconTableFilled, label: 'Materialized view' };
        case WarehouseTableType.EXTERNAL:
            return { icon: IconCloudDataConnection, label: 'External table' };
        case WarehouseTableType.TABLE:
        case undefined:
            return { icon: IconTable, label: 'Table' };
        default:
            return assertUnreachable(tableType, 'Unknown table type');
    }
};
