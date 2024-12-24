import { useContextSelector } from 'use-context-selector';
import DashboardContext from './context';
import { type DashboardContextType } from './types';

function useDashboardContext<Selected>(
    selector: (value: DashboardContextType) => Selected,
) {
    return useContextSelector(DashboardContext, (context) => {
        if (context === undefined) {
            throw new Error(
                'useDashboardContext must be used within a DashboardProvider',
            );
        }
        return selector(context);
    });
}

export default useDashboardContext;
