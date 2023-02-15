import { Colors } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import { IconInfoCircle } from '@tabler/icons-react';
import { FC, useMemo } from 'react';
import { useDashboards } from '../../hooks/dashboard/useDashboards';
import { useSavedCharts } from '../../hooks/useSpaces';
import { useApp } from '../../providers/AppProvider';
import ResourceList from '../common/ResourceList';
import { SortDirection } from '../common/ResourceList/ResourceTable';
import {
    ResourceListType,
    wrapResourceList,
} from '../common/ResourceList/ResourceTypeUtils';

interface Props {
    projectUuid: string;
    organizationUuid: string;
}

const PinnedItemsPanel: FC<Props> = ({ projectUuid, organizationUuid }) => {
    const { data: dashboards = [] } = useDashboards(projectUuid);
    const { data: savedCharts = [] } = useSavedCharts(projectUuid);
    const { user } = useApp();

    const userCanUpdateProject = user.data?.ability.can(
        'update',
        subject('Project', { organizationUuid, projectUuid }),
    );

    const pinnedItems = useMemo(() => {
        return [
            ...wrapResourceList(dashboards, ResourceListType.DASHBOARD),
            ...wrapResourceList(savedCharts, ResourceListType.CHART),
        ].filter((item) => {
            return !!item.data.pinnedListUuid;
        });
    }, [dashboards, savedCharts]);

    return pinnedItems.length > 0 ? (
        <ResourceList
            items={pinnedItems}
            enableSorting={false}
            defaultSort={{ updatedAt: SortDirection.DESC }}
            defaultColumnVisibility={{ space: false }}
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
