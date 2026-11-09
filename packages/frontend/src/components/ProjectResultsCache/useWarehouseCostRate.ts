import { useProject } from '../../hooks/useProject';
import {
    getWarehouseCostRate,
    type WarehouseCostRate,
} from './warehouseCostEstimate';

export const useWarehouseCostRate = (
    projectUuid: string,
): WarehouseCostRate | null => {
    const { data: project } = useProject(projectUuid);
    const credentials = project?.warehouseConnection;
    return credentials ? getWarehouseCostRate(credentials) : null;
};
