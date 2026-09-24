import { type SqlRunnerWarehouseConnection } from '@lightdash/common';
import isEqual from 'lodash/isEqual';
import {
    useEffect,
    useMemo,
    useState,
    type FC,
    type PropsWithChildren,
} from 'react';
import { useProject } from '../../../../hooks/useProject';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
    selectConnectionRoute,
    setConnectionRoute,
    type SqlRunnerConnectionRoute,
} from '../../store/sqlRunnerSlice';
import { useActiveConnection } from '../hooks/useActiveConnection';
import { useSqlRunnerConnections } from '../hooks/useConnectionCatalog';
import { ActiveConnectionProvider } from './ActiveConnectionProvider';

const useSyncConnectionRoute = (desired: SqlRunnerConnectionRoute | null) => {
    const dispatch = useAppDispatch();
    const current = useAppSelector(selectConnectionRoute);
    useEffect(() => {
        if (desired && !isEqual(current, desired)) {
            dispatch(setConnectionRoute(desired));
        }
    }, [dispatch, current, desired]);
};

const toStoreConnection = (connection: SqlRunnerWarehouseConnection) => ({
    warehouseConnectionUuid: connection.isOriginal
        ? null
        : connection.warehouseConnectionUuid,
    name: connection.name,
    warehouseType: connection.warehouseType,
});

const ActiveConnectionStoreSync: FC<{ isEditingSavedChart: boolean }> = ({
    isEditingSavedChart,
}) => {
    const { connections, activeConnection, switchConnection } =
        useActiveConnection();
    const savedSqlChart = useAppSelector(
        (state) => state.sqlRunner.savedSqlChart,
    );
    const [appliedChartUuid, setAppliedChartUuid] = useState<
        string | undefined
    >(undefined);
    const chartBinding = savedSqlChart
        ? connections.find((connection) =>
              savedSqlChart.warehouseConnectionUuid === null
                  ? connection.isOriginal
                  : connection.warehouseConnectionUuid ===
                    savedSqlChart.warehouseConnectionUuid,
          )
        : undefined;

    useEffect(() => {
        if (!savedSqlChart || appliedChartUuid === savedSqlChart.savedSqlUuid) {
            return;
        }
        if (chartBinding) {
            switchConnection(chartBinding.warehouseConnectionUuid);
        }
        setAppliedChartUuid(savedSqlChart.savedSqlUuid);
    }, [savedSqlChart, chartBinding, switchConnection, appliedChartUuid]);

    const isWaitingForChart =
        isEditingSavedChart &&
        (!savedSqlChart || appliedChartUuid !== savedSqlChart.savedSqlUuid);

    const desired = useMemo<SqlRunnerConnectionRoute>(
        () => ({
            route: 'multi',
            connection:
                activeConnection && !isWaitingForChart
                    ? toStoreConnection(activeConnection)
                    : null,
        }),
        [activeConnection, isWaitingForChart],
    );
    useSyncConnectionRoute(desired);
    return null;
};

export const SqlRunnerConnectionScope: FC<
    PropsWithChildren<{ isEditingSavedChart: boolean }>
> = ({ isEditingSavedChart, children }) => {
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const { data: project } = useProject(projectUuid);
    const isMulti = project?.connectionRoute === 'multi';
    const { data: connections, error } = useSqlRunnerConnections(
        projectUuid,
        isMulti,
    );
    const routesSingle =
        project !== undefined &&
        (!isMulti || error?.error.name === 'SingleConnectionProjectError');

    const desired = useMemo<SqlRunnerConnectionRoute | null>(() => {
        if (routesSingle) return { route: 'single' };
        if (isMulti && !connections)
            return { route: 'multi', connection: null };
        return null;
    }, [routesSingle, isMulti, connections]);
    useSyncConnectionRoute(desired);

    if (routesSingle || !isMulti || !connections) return <>{children}</>;
    return (
        <ActiveConnectionProvider
            projectUuid={projectUuid}
            connections={connections}
        >
            <ActiveConnectionStoreSync
                isEditingSavedChart={isEditingSavedChart}
            />
            {children}
        </ActiveConnectionProvider>
    );
};
