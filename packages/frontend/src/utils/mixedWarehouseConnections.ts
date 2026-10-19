import { type WarehouseTypes } from '@lightdash/common';
import { getWarehouseLabel } from '../components/ProjectConnection/ProjectConnectFlow/utils';

export const getExplorerConnectionLabel = (
    connectionName: string | null,
    warehouseType: WarehouseTypes | null,
    mixedWarehouseConnectionsEnabled: boolean,
): string | null => {
    if (!mixedWarehouseConnectionsEnabled || !connectionName || !warehouseType)
        return connectionName;
    return `${connectionName} · ${getWarehouseLabel(warehouseType)}`;
};

export const getWarehouseSqlCaption = (
    warehouseType: WarehouseTypes | null,
    mixedWarehouseConnectionsEnabled: boolean,
): string | null => {
    if (!mixedWarehouseConnectionsEnabled || warehouseType === null)
        return null;
    return `${getWarehouseLabel(warehouseType)} SQL`;
};

export const resolveNewCalculationEditMode = <Mode>({
    preferredMode,
    sqlMode,
    isNewCalculation,
    isFormulaSupported,
    mixedWarehouseConnectionsEnabled,
}: {
    preferredMode: Mode;
    sqlMode: Mode;
    isNewCalculation: boolean;
    isFormulaSupported: boolean;
    mixedWarehouseConnectionsEnabled: boolean;
}): Mode =>
    mixedWarehouseConnectionsEnabled && isNewCalculation && !isFormulaSupported
        ? sqlMode
        : preferredMode;
