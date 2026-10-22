import {
    useWarehouseSignInExecution,
    useWarehouseSignInPreflightStore,
} from '../components/NavBar/warehouseSignInPreflight';
import { useExploreByProjectUuid } from './useExplore';

export const useExploreSignInExecutionContext = (
    projectUuid: string | undefined,
    tableId: string | undefined,
    candidate: boolean,
) => {
    const store = useWarehouseSignInPreflightStore();
    const { data: explore } = useExploreByProjectUuid(tableId, projectUuid, {
        enabled: !!store?.enabled && !!projectUuid && !!tableId && candidate,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
    });
    const ready = useWarehouseSignInExecution(
        projectUuid,
        explore?.warehouseConnection?.warehouseConnectionUuid,
        candidate,
    );
    return {
        ready,
        binding: explore?.warehouseConnection?.warehouseConnectionUuid,
    };
};

export const useExploreSignInExecution = (
    projectUuid: string | undefined,
    tableId: string | undefined,
    candidate: boolean,
) => useExploreSignInExecutionContext(projectUuid, tableId, candidate).ready;
