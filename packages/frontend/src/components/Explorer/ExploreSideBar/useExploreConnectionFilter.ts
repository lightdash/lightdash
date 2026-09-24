import { type WarehouseConnectionForUserCredentials } from '@lightdash/common';
import { useCallback, useMemo, useState } from 'react';
import { useConnectionBadges } from '../../../hooks/useConnectionBadges';
import {
    readConnectionFilter,
    writeConnectionFilter,
} from './connectionFilterStorage';

export const useExploreConnectionFilter = (
    projectUuid: string | undefined,
): {
    connections: WarehouseConnectionForUserCredentials[] | null;
    connectionFilter: string | null;
    setConnectionFilter: (warehouseConnectionUuid: string | null) => void;
} => {
    const connections = useConnectionBadges(projectUuid);
    const [chosenFilter, setChosenFilter] = useState<string | null | undefined>(
        undefined,
    );
    const connectionFilter = useMemo(() => {
        const connectionUuids =
            connections?.map(
                ({ warehouseConnectionUuid }) => warehouseConnectionUuid,
            ) ?? [];
        const candidate =
            chosenFilter === undefined
                ? readConnectionFilter(projectUuid, connectionUuids)
                : chosenFilter;
        return candidate !== null && connectionUuids.includes(candidate)
            ? candidate
            : null;
    }, [chosenFilter, connections, projectUuid]);
    const setConnectionFilter = useCallback(
        (warehouseConnectionUuid: string | null) => {
            setChosenFilter(warehouseConnectionUuid);
            writeConnectionFilter(projectUuid, warehouseConnectionUuid);
        },
        [projectUuid],
    );
    return { connections, connectionFilter, setConnectionFilter };
};
