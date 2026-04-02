import { useContextSelector } from 'use-context-selector';
import DashboardTileStatusContext from './tileStatusContext';
import { type DashboardTileStatusContextType } from './tileStatusTypes';

function useDashboardTileStatusContext<Selected>(
    selector: (value: DashboardTileStatusContextType) => Selected,
) {
    return useContextSelector(DashboardTileStatusContext, (context) => {
        if (context === undefined) {
            throw new Error(
                'useDashboardTileStatusContext must be used within a DashboardProvider',
            );
        }
        return selector(context);
    });
}

export default useDashboardTileStatusContext;
