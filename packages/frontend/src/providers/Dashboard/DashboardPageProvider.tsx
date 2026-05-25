import { type PropsWithChildren, useMemo } from 'react';
import { DashboardPageContext } from './useDashboardPageContext';

export type DashboardPagePathArgs = {
    projectUuid?: string;
    dashboardUuid?: string;
    mode?: string;
    tabUuid?: string;
};

export type DashboardPageStateAdapter = {
    projectUuid?: string;
    dashboardUuid?: string;
    tabUuid?: string;
    mode?: string;
    search: string;
    replaceSearch: (search: string) => void;
    switchToTab: (tabUuid?: string) => void;
};

export type DashboardPageContextType = DashboardPageStateAdapter & {
    isEditMode: boolean;
};

type DashboardPageProviderProps = PropsWithChildren<{
    adapter: DashboardPageStateAdapter;
}>;

export const DashboardPageProvider = ({
    adapter,
    children,
}: DashboardPageProviderProps) => {
    const value = useMemo(
        () => ({
            ...adapter,
            isEditMode: adapter.mode === 'edit',
        }),
        [adapter],
    );

    return (
        <DashboardPageContext.Provider value={value}>
            {children}
        </DashboardPageContext.Provider>
    );
};
