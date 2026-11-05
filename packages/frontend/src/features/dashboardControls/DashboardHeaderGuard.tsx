import { type ComponentProps, type FC } from 'react';
import DashboardHeader from '../../components/common/Dashboard/DashboardHeader';
import classes from './DashboardHeaderGuard.module.css';
import pillClasses from './FilterPills.module.css';
import { useIsControlEdited } from './useIsControlEdited';

type Props = ComponentProps<typeof DashboardHeader>;

// While a filter is edited the header is inert, Save and Cancel included:
// Apply or Cancel in the rail ends the filter, then Save ends the dashboard.
// A viewer's filter leaves the dashboard as it is: nothing to lock
export const DashboardHeaderGuard: FC<Props> = (props) => {
    // A filter or a parameter control, edited in edit mode
    const isLocked = useIsControlEdited(true);
    return (
        <div
            // The shared dimming of what is inert while a filter is edited
            className={`${classes.guard} ${pillClasses.inert}`}
            data-dashboard-header-guard
            inert={isLocked || undefined}
        >
            <DashboardHeader {...props} />
        </div>
    );
};
