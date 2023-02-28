import { subject } from '@casl/ability';
import { FC, useMemo } from 'react';
import { useDashboards } from '../../hooks/dashboard/useDashboards';
import { useSavedCharts, useSpaces } from '../../hooks/useSpaces';
import { useApp } from '../../providers/AppProvider';
import ResourceView, { ResourceViewType } from '../common/ResourceView';
import {
    ResourceViewItemType,
    wrapResourceView,
} from '../common/ResourceView/resourceTypeUtils';

interface Props {
    projectUuid: string;
    organizationUuid: string;
}

const PinnedItemsPanel: FC<Props> = ({ projectUuid, organizationUuid }) => {
    const { user } = useApp();
    const { data: dashboards = [] } = useDashboards(projectUuid);
    const { data: savedCharts = [] } = useSavedCharts(projectUuid);
    const { data: spaces = [] } = useSpaces(projectUuid);

    const userCanUpdateProject = user.data?.ability.can(
        'update',
        subject('Project', { organizationUuid, projectUuid }),
    );

    const pinnedItems = useMemo(() => {
        return [
            ...wrapResourceView(dashboards, ResourceViewItemType.DASHBOARD),
            ...wrapResourceView(savedCharts, ResourceViewItemType.CHART),
            ...wrapResourceView(spaces, ResourceViewItemType.SPACE),
        ].filter((item) => {
            return !!item.data.pinnedListUuid;
        });
    }, [dashboards, savedCharts, spaces]);

    return pinnedItems.length > 0 ? (
        <ResourceView
            items={pinnedItems}
            view={ResourceViewType.GRID}
            gridProps={{
                groups: [
                    [ResourceViewItemType.SPACE],
                    [
                        ResourceViewItemType.DASHBOARD,
                        ResourceViewItemType.CHART,
                    ],
                ],
            }}
            headerProps={{
                title: userCanUpdateProject ? 'Pinned items' : 'Pinned for you',
                description: userCanUpdateProject
                    ? 'Pin Spaces, Dashboards and Charts to the top of the homepage to guide your business users to the right content.'
                    : 'Your data team have pinned these items to help guide you towards the most relevant content!',
            }}
        />
    ) : null;
};

export default PinnedItemsPanel;
