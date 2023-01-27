import { FC, useMemo } from 'react';
import { useDashboards } from '../../../hooks/dashboard/useDashboards';
import { useSavedCharts } from '../../../hooks/useSpaces';
import ResourceList from '../../common/ResourceList';
import { SortDirection } from '../../common/ResourceList/ResourceTable';

interface Props {
    projectUuid: string;
}

const RecentlyUpdatedPanel: FC<Props> = ({ projectUuid }) => {
    const { data: dashboards = [] } = useDashboards(projectUuid);
    const { data: savedCharts = [] } = useSavedCharts(projectUuid);

    const recentItems = useMemo(() => {
        return [...dashboards, ...savedCharts]
            .sort((a, b) => {
                return (
                    new Date(b.updatedAt).getTime() -
                    new Date(a.updatedAt).getTime()
                );
            })
            .slice(0, 10);
    }, [dashboards, savedCharts]);

    return (
        <>
            <ResourceList
                data={recentItems}
                enableSorting={false}
                defaultSort={{ updatedAt: SortDirection.DESC }}
                defaultColumnVisibility={{ space: false }}
                showCount={false}
                headerTitle="Recently updated"
            />
        </>
    );
};

export default RecentlyUpdatedPanel;
