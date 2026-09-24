import { type SqlChart } from '@lightdash/common';
import { useCallback, useState } from 'react';
import { useAppSelector } from '../store/hooks';
import { selectConnectionRequest } from '../store/sqlRunnerSlice';

export const useSavedChartConnection = (
    savedSqlChart: Pick<SqlChart, 'warehouseConnectionUuid'> | undefined,
) => {
    const connectionRequest = useAppSelector(selectConnectionRequest);
    const [savedConnectionUuid, setSavedConnectionUuid] = useState<
        string | null | undefined
    >(savedSqlChart?.warehouseConnectionUuid);

    const hasConnectionChange =
        connectionRequest.ready &&
        connectionRequest.field.warehouseConnectionUuid !== undefined &&
        connectionRequest.field.warehouseConnectionUuid !== savedConnectionUuid;

    const markSaved = useCallback(() => {
        if (
            connectionRequest.ready &&
            connectionRequest.field.warehouseConnectionUuid !== undefined
        ) {
            setSavedConnectionUuid(
                connectionRequest.field.warehouseConnectionUuid,
            );
        }
    }, [connectionRequest]);

    return { connectionRequest, hasConnectionChange, markSaved };
};
