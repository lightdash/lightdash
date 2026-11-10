import { type UniqueIdentifier } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { type DashboardFilters } from '@lightdash/common';

export const moveFilterRule = (
    dashboardFilters: DashboardFilters,
    group: 'dimensions' | 'metrics',
    activeId: UniqueIdentifier,
    overId: UniqueIdentifier,
): DashboardFilters => {
    const oldIndex = dashboardFilters[group].findIndex(
        (item) => item.id === activeId,
    );
    const newIndex = dashboardFilters[group].findIndex(
        (item) => item.id === overId,
    );
    return {
        ...dashboardFilters,
        [group]: arrayMove(dashboardFilters[group], oldIndex, newIndex),
    };
};
