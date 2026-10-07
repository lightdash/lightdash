import { type FC, type PropsWithChildren } from 'react';
import classes from './DashboardHeaderGuard.module.css';
import { useControlsSidebar } from './useControlsSidebar';

// The header is inert while the sidebar is open, so its Save and Cancel
// cannot race the sidebar's Apply and Cancel.
export const DashboardHeaderGuard: FC<PropsWithChildren> = ({ children }) => {
    const { isSidebarOpen } = useControlsSidebar();
    return (
        <div className={classes.guard} inert={isSidebarOpen || undefined}>
            {children}
        </div>
    );
};
