import { Space } from '@lightdash/common';
import { IconLayoutDashboard } from '@tabler/icons-react';
import React from 'react';
import ResourceView from '../common/ResourceView';
import { ResourceTypeIcon } from '../common/ResourceView/ResourceIcon';
import {
    ResourceViewItemType,
    wrapResourceView,
} from '../common/ResourceView/resourceTypeUtils';

interface Props {
    space: Space;
}

export const SpacePanel: React.FC<Props> = ({ space }) => {
    const dashboardsInSpace = space.dashboards;
    const chartsInSpace = space.queries;

    const allItems = [
        ...wrapResourceView(dashboardsInSpace, ResourceViewItemType.DASHBOARD),
        ...wrapResourceView(chartsInSpace, ResourceViewItemType.CHART),
    ];

    return (
        <ResourceView
            items={allItems}
            listProps={{
                defaultColumnVisibility: { space: false },
            }}
            tabs={[
                {
                    id: 'all-items',
                    name: 'All items',
                },
                {
                    id: 'dashboards',
                    icon: (
                        <ResourceTypeIcon
                            type={ResourceViewItemType.DASHBOARD}
                        />
                    ),
                    name: 'Dashboards',
                    filter: (item) =>
                        item.type === ResourceViewItemType.DASHBOARD,
                },
                {
                    id: 'charts',
                    icon: (
                        <ResourceTypeIcon type={ResourceViewItemType.CHART} />
                    ),
                    name: 'Charts',
                    filter: (item) => item.type === ResourceViewItemType.CHART,
                },
            ]}
            emptyStateProps={{
                icon: <IconLayoutDashboard size={30} />,
                title: 'No items added yet',
            }}
        />
    );
};

export default SpacePanel;
