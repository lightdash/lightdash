import { type ComponentProps, type FC } from 'react';
import { DashboardFiltersBarSummary } from '../dashboardFilters/DashboardFiltersBarSummary';
import { useNamedDateZoomCount } from './useDateZoomBar';

type Props = Omit<
    ComponentProps<typeof DashboardFiltersBarSummary>,
    'dateZoomsCount' | 'withGroupMarker'
>;

const WithNamedZooms: FC<Props> = (props) => {
    const dateZoomsCount = useNamedDateZoomCount();
    return (
        <DashboardFiltersBarSummary
            {...props}
            dateZoomsCount={dateZoomsCount}
            // As the open controls bar: no funnel for a bar of mixed controls
            withGroupMarker={false}
        />
    );
};

/** The collapsed summary; with the controls on, it counts the named date zooms and has no funnel. */
export const DashboardControlsSummary: FC<
    Props & { isControlsEnabled: boolean }
> = ({ isControlsEnabled, ...props }) =>
    isControlsEnabled ? (
        <WithNamedZooms {...props} />
    ) : (
        <DashboardFiltersBarSummary {...props} />
    );
