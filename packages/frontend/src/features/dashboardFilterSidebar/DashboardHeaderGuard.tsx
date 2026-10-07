import { type FC, type PropsWithChildren } from 'react';
import classes from './DashboardHeaderGuard.module.css';
import { useFilterSidebar } from './useFilterSidebar';

// The header is inert while a filter is edited, so its Save and Cancel cannot
// race the sidebar's Apply and Cancel. The parameters view is read only.
export const DashboardHeaderGuard: FC<PropsWithChildren> = ({ children }) => {
    const { editing } = useFilterSidebar();
    return (
        <div className={classes.guard} inert={editing !== null || undefined}>
            {children}
        </div>
    );
};
