import { type ComponentProps, type FC } from 'react';
import DashboardHeader from '../../components/common/Dashboard/DashboardHeader';
import classes from './DashboardHeaderGuard.module.css';
import { useControlsSidebarSelector } from './useControlsSidebar';

type Props = ComponentProps<typeof DashboardHeader>;

// While a filter is edited the whole header is inert, Save and Cancel
// included: Apply or Cancel in the rail ends the filter, then Save ends the
// dashboard. A viewer's filter leaves the dashboard as it is: nothing to lock
export const DashboardHeaderGuard: FC<Props> = (props) => {
    const isLocked = useControlsSidebarSelector(
        (c) => c.isSidebarOpen && !c.isViewer,
    );
    return (
        <div className={classes.guard} inert={isLocked || undefined}>
            <DashboardHeader {...props} />
        </div>
    );
};
