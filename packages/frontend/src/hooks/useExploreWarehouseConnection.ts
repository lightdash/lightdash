import {
    FeatureFlags,
    type ApiExploreResults,
    type Project,
    type WarehouseTypes,
    type WeekDay,
} from '@lightdash/common';
import { useExploreByProjectUuid } from './useExplore';
import { useProject } from './useProject';
import { useServerFeatureFlag } from './useServerOrClientFeatureFlag';

type ExploreWarehouseConnection = {
    warehouseType: WarehouseTypes | null;
    startOfWeek: WeekDay | null;
};

export const resolveExploreWarehouseConnection = (
    exploreConnection: ApiExploreResults['warehouseConnection'] | null,
    projectConnection: Pick<
        NonNullable<Project['warehouseConnection']>,
        'type' | 'startOfWeek'
    > | null,
    mixedWarehouseConnectionsEnabled: boolean,
): ExploreWarehouseConnection => {
    if (exploreConnection) {
        return {
            warehouseType: exploreConnection.warehouseType,
            startOfWeek: mixedWarehouseConnectionsEnabled
                ? exploreConnection.startOfWeek
                : (projectConnection?.startOfWeek ?? null),
        };
    }

    return {
        warehouseType: projectConnection?.type ?? null,
        startOfWeek: projectConnection?.startOfWeek ?? null,
    };
};

export const useMixedWarehouseConnectionsEnabled = (): boolean => {
    const mixedWarehouseFlag = useServerFeatureFlag(
        FeatureFlags.MultiConnectionProjects,
    );
    return mixedWarehouseFlag.data?.enabled === true;
};

export const useExploreWarehouseConnection = (
    exploreName: string | null,
    projectUuid: string | undefined,
): ExploreWarehouseConnection => {
    const { data: explore } = useExploreByProjectUuid(
        exploreName ?? undefined,
        projectUuid,
        { enabled: false },
    );
    const { data: project } = useProject(projectUuid);
    const mixedWarehouseConnectionsEnabled =
        useMixedWarehouseConnectionsEnabled();

    return resolveExploreWarehouseConnection(
        explore?.warehouseConnection ?? null,
        project?.warehouseConnection ?? null,
        mixedWarehouseConnectionsEnabled,
    );
};
