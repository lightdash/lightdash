import { useContextSelector } from 'use-context-selector';
import { Context, DashboardContext } from '.';

export function useDashboardContext<Selected>(
    selector: (value: DashboardContext) => Selected,
) {
    return useContextSelector(Context, (context) => {
        if (context === undefined) {
            throw new Error(
                'useDashboardContext must be used within a DashboardProvider',
            );
        }
        return selector(context);
    });
}
