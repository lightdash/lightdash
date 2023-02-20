import { Colors } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import { IconInfoCircle } from '@tabler/icons-react';
import { FC, useMemo } from 'react';
import { useDashboards } from '../../hooks/dashboard/useDashboards';
import { useSavedCharts, useSpaces } from '../../hooks/useSpaces';
import { useApp } from '../../providers/AppProvider';
import ResourceView from '../common/ResourceView';
import {
    ResourceViewItemType,
    wrapResourceView,
} from '../common/ResourceView/resourceTypeUtils';
import { SortDirection } from '../common/ResourceView/ResourceViewList';

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
            enableSorting={false}
            defaultSort={{ updatedAt: SortDirection.DESC }}
            defaultColumnVisibility={{ space: false, type: false }}
            showCount={false}
            headerTitle={
                userCanUpdateProject ? 'Pinned items' : 'Pinned for you'
            }
            headerIcon={
                <IconInfoCircle
                    color={Colors.GRAY5}
                    size={17}
                    style={{
                        marginTop: '7px',
                    }}
                />
            }
            headerIconTooltipContent={
                userCanUpdateProject
                    ? 'Pin Spaces, Dashboards and Charts to the top of the homepage to guide your business users to the right content.'
                    : 'Your data team have pinned these items to help guide you towards the most relevant content!'
            }
        />
    ) : null;
};

export default PinnedItemsPanel;
