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

    const featuredDashboards = useMemo(() => {
        return dashboards
            .sort((a, b) => {
                return (
                    new Date(b.updatedAt).getTime() -
                    new Date(a.updatedAt).getTime()
                );
            })
            .slice(0, 5);
    }, [dashboards]);

    const featuredCharts = useMemo(() => {
        return savedCharts
            .sort((a, b) => {
                return (
                    new Date(b.updatedAt).getTime() -
                    new Date(a.updatedAt).getTime()
                );
            })
            .slice(0, 5);
    }, [savedCharts]);

    return (
        <>
            <ResourceList
                resourceIcon="control"
                resourceType="dashboard"
                resourceList={[...featuredDashboards, ...featuredCharts]}
                enableSorting={false}
                defaultSort={{ updatedAt: SortDirection.DESC }}
                defaultColumnVisibility={{ space: false }}
                showCount={false}
                getURL={({ uuid }) =>
                    `/projects/${projectUuid}/dashboards/${uuid}/view`
                }
                headerTitle="Recently updated"
            />
        </>
    );
};

export default RecentlyUpdatedPanel;
