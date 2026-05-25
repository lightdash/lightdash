import { type PropsWithChildren, useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
    DashboardPageProvider,
    type DashboardPagePathArgs,
    type DashboardPageStateAdapter,
} from './DashboardPageProvider';

type DashboardRouterProviderProps = PropsWithChildren<{
    buildTabPath: (args: DashboardPagePathArgs) => string | undefined;
    projectUuid?: string;
    dashboardUuid?: string;
    tabUuid?: string;
    mode?: string;
}>;

export const DashboardRouterProvider = ({
    buildTabPath,
    projectUuid: projectUuidOverride,
    dashboardUuid: dashboardUuidOverride,
    tabUuid: tabUuidOverride,
    mode: modeOverride,
    children,
}: DashboardRouterProviderProps) => {
    const { pathname, search } = useLocation();
    const navigate = useNavigate();
    const params = useParams<{
        projectUuid?: string;
        dashboardUuid?: string;
        tabUuid?: string;
        mode?: string;
    }>();

    const projectUuid = projectUuidOverride ?? params.projectUuid;
    const dashboardUuid = dashboardUuidOverride ?? params.dashboardUuid;
    const tabUuid = tabUuidOverride ?? params.tabUuid;
    const mode = modeOverride ?? params.mode;

    const replaceSearch = useCallback(
        (nextSearch: string) => {
            void navigate(
                {
                    pathname,
                    search: nextSearch,
                },
                { replace: true },
            );
        },
        [navigate, pathname],
    );

    const switchToTab = useCallback(
        (nextTabUuid?: string) => {
            const nextPath = buildTabPath({
                projectUuid,
                dashboardUuid,
                mode,
                tabUuid: nextTabUuid,
            });

            if (!nextPath) return;

            void navigate(
                {
                    pathname: nextPath,
                    search,
                },
                { replace: true },
            );
        },
        [buildTabPath, dashboardUuid, mode, navigate, projectUuid, search],
    );

    const adapter = useMemo<DashboardPageStateAdapter>(
        () => ({
            projectUuid,
            dashboardUuid,
            tabUuid,
            mode,
            search,
            replaceSearch,
            switchToTab,
        }),
        [
            dashboardUuid,
            mode,
            projectUuid,
            replaceSearch,
            search,
            switchToTab,
            tabUuid,
        ],
    );

    return (
        <DashboardPageProvider adapter={adapter}>
            {children}
        </DashboardPageProvider>
    );
};
