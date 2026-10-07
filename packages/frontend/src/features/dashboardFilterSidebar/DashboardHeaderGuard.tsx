import { type FC, type PropsWithChildren } from 'react';
import classes from './DashboardHeaderGuard.module.css';
import { useFilterSidebar } from './useFilterSidebar';

// The header is inert while the sidebar is open, so its Save and Cancel
// cannot race the sidebar's Apply and Cancel.
export const DashboardHeaderGuard: FC<PropsWithChildren> = ({ children }) => {
    const { isSidebarOpen } = useFilterSidebar();
    return (
        <div className={classes.guard} inert={isSidebarOpen || undefined}>
            {children}
        </div>
    );
};
