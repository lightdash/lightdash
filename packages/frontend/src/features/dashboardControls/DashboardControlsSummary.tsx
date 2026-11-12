import { type ComponentProps, type FC } from 'react';
import { DashboardFiltersBarSummary } from '../dashboardFilters/DashboardFiltersBarSummary';
import { useNamedDateZoomCount } from './useDateZoomBar';

type Props = Omit<
    ComponentProps<typeof DashboardFiltersBarSummary>,
    'dateZoomsCount'
>;

const WithNamedZooms: FC<Props> = (props) => {
    const dateZoomsCount = useNamedDateZoomCount();
    return (
        <DashboardFiltersBarSummary
            {...props}
            dateZoomsCount={dateZoomsCount}
        />
    );
};

/** The collapsed summary; with the controls on, it counts the named date zooms. */
export const DashboardControlsSummary: FC<
    Props & { isControlsEnabled: boolean }
> = ({ isControlsEnabled, ...props }) =>
    isControlsEnabled ? (
        <WithNamedZooms {...props} />
    ) : (
        <DashboardFiltersBarSummary {...props} />
    );
