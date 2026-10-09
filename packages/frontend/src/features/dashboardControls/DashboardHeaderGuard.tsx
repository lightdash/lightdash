import { type FC, type PropsWithChildren } from 'react';
import classes from './DashboardHeaderGuard.module.css';
import { useControlsSidebarSelector } from './useControlsSidebar';

// The header is inert while the sidebar is open, so its Save and Cancel
// cannot race the sidebar's Done and Discard.
export const DashboardHeaderGuard: FC<PropsWithChildren> = ({ children }) => {
    const isSidebarOpen = useControlsSidebarSelector((c) => c.isSidebarOpen);
    return (
        <div className={classes.guard} inert={isSidebarOpen || undefined}>
            {children}
        </div>
    );
};
