import { type FC } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { type TotalsCellContextMenuProps } from '../common/Table/types';
import TotalsCellContextMenu from '../MetricQueryData/TotalsCellContextMenu';
import { useMetricQueryDataContext } from '../MetricQueryData/useMetricQueryDataContext';

// Dashboard totals menu: passes the active date zoom so underlying-data
// filters on a zoomed date dimension use the zoomed grain, matching
// DashboardCellContextMenu.
const DashboardTotalsCellContextMenu: FC<TotalsCellContextMenuProps> = (
    props,
) => {
    const dateZoomGranularity = useDashboardContext(
        (c) => c.dateZoomGranularity,
    );
    const { metricQuery } = useMetricQueryDataContext();

    const dateZoom =
        dateZoomGranularity && metricQuery?.metadata?.hasADateDimension
            ? {
                  granularity: dateZoomGranularity,
                  xAxisFieldId: `${metricQuery.metadata.hasADateDimension.table}_${metricQuery.metadata.hasADateDimension.name}`,
              }
            : undefined;

    return <TotalsCellContextMenu {...props} dateZoom={dateZoom} />;
};

export default DashboardTotalsCellContextMenu;
