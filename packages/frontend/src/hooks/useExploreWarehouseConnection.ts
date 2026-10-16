import {
    type ApiExploreResults,
    type Project,
    type WarehouseTypes,
    type WeekDay,
} from '@lightdash/common';
import { useExploreByProjectUuid } from './useExplore';
import { useProject } from './useProject';

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
): ExploreWarehouseConnection => {
    if (exploreConnection) {
        return {
            warehouseType: exploreConnection.warehouseType,
            startOfWeek: exploreConnection.startOfWeek,
        };
    }

    return {
        warehouseType: projectConnection?.type ?? null,
        startOfWeek: projectConnection?.startOfWeek ?? null,
    };
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

    return resolveExploreWarehouseConnection(
        explore?.warehouseConnection ?? null,
        project?.warehouseConnection ?? null,
    );
};
