import { useUncontrolled } from '@mantine/hooks';
import { type PropsWithChildren, useCallback, useMemo } from 'react';
import {
    DashboardPageProvider,
    type DashboardPageStateAdapter,
} from './DashboardPageProvider';

type DashboardInMemoryProviderProps = PropsWithChildren<{
    projectUuid?: string;
    dashboardUuid?: string;
    tabUuid?: string | null;
    defaultTabUuid?: string | null;
    mode?: string;
    search?: string;
    defaultSearch?: string;
    onSearchChange?: (search: string) => void;
    onTabChange?: (tabUuid?: string) => void;
}>;

export const DashboardInMemoryProvider = (
    props: DashboardInMemoryProviderProps,
) => {
    const [tabUuidValue, setTabUuid] = useUncontrolled<string | null>({
        value: props.tabUuid,
        defaultValue: props.defaultTabUuid,
        finalValue: null,
        onChange: (nextTabUuid) => {
            props.onTabChange?.(nextTabUuid ?? undefined);
        },
    });
    const [search, setSearch] = useUncontrolled({
        value: props.search,
        defaultValue: props.defaultSearch,
        finalValue: '',
        onChange: props.onSearchChange,
    });

    const replaceSearch = useCallback(
        (nextSearch: string) => {
            setSearch(nextSearch);
        },
        [setSearch],
    );

    const switchToTab = useCallback(
        (nextTabUuid?: string) => {
            setTabUuid(nextTabUuid ?? null);
        },
        [setTabUuid],
    );

    const tabUuid = tabUuidValue ?? undefined;

    const adapter = useMemo<DashboardPageStateAdapter>(
        () => ({
            projectUuid: props.projectUuid,
            dashboardUuid: props.dashboardUuid,
            tabUuid,
            mode: props.mode,
            search,
            replaceSearch,
            switchToTab,
        }),
        [
            props.dashboardUuid,
            props.mode,
            props.projectUuid,
            replaceSearch,
            search,
            switchToTab,
            tabUuid,
        ],
    );

    return (
        <DashboardPageProvider adapter={adapter}>
            {props.children}
        </DashboardPageProvider>
    );
};
