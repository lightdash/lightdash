import { FC, useMemo } from 'react';
import { useDashboards } from '../../hooks/dashboard/useDashboards';
import { useSavedCharts } from '../../hooks/useSpaces';
import ResourceList from '../common/ResourceList';
import { SortDirection } from '../common/ResourceList/ResourceTable';
import {
    ResourceListType,
    wrapResourceList,
} from '../common/ResourceList/ResourceTypeUtils';

interface Props {
    projectUuid: string;
}

const PinnedItemsPanel: FC<Props> = ({ projectUuid }) => {
    const { data: dashboards = [] } = useDashboards(projectUuid);
    const { data: savedCharts = [] } = useSavedCharts(projectUuid);

    const pinnedItems = useMemo(() => {
        return [
            ...wrapResourceList(dashboards, ResourceListType.DASHBOARD),
            ...wrapResourceList(savedCharts, ResourceListType.CHART),
        ].filter((item) => {
            return item.data.pinnedListUuid ? item : null;
        });
    }, [dashboards, savedCharts]);

    return pinnedItems.length > 0 ? (
        <ResourceList
            items={pinnedItems}
            enableSorting={false}
            defaultSort={{ updatedAt: SortDirection.DESC }}
            defaultColumnVisibility={{ space: false }}
            showCount={false}
            headerTitle="Pinned items"
            renderEmptyState={() => <></>}
        />
    ) : null;
};

export default PinnedItemsPanel;
