import { createContext, useContextSelector } from 'use-context-selector';
import { type DashboardPageContextType } from './DashboardPageProvider';

export const DashboardPageContext = createContext<
    DashboardPageContextType | undefined
>(undefined);

export const useDashboardPageContext = <Selected>(
    selector: (value: DashboardPageContextType) => Selected,
) =>
    useContextSelector(DashboardPageContext, (context) => {
        if (context === undefined) {
            throw new Error(
                'useDashboardPageContext must be used within a DashboardPageProvider',
            );
        }

        return selector(context);
    });
