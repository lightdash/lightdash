import { type FC, useEffect } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { type MinimalDashboardModel } from './minimalDashboardTypes';

type Props = {
    model: MinimalDashboardModel;
};

export const MinimalDashboardContextInitializer: FC<Props> = ({ model }) => {
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const setDashboardTiles = useDashboardContext((c) => c.setDashboardTiles);
    const setDashboardTabs = useDashboardContext((c) => c.setDashboardTabs);
    const setSavedParameters = useDashboardContext((c) => c.setSavedParameters);
    const isDashboardLoading = useDashboardContext((c) => c.isDashboardLoading);

    useEffect(() => {
        if (isDashboardLoading) return;
        if (dashboardTiles) return;

        setDashboardTiles(model.dashboard.tiles);
        setDashboardTabs(model.dashboard.tabs);
        setSavedParameters(model.dashboard.parameters ?? {});
    }, [
        dashboardTiles,
        isDashboardLoading,
        model.dashboard.parameters,
        model.dashboard.tabs,
        model.dashboard.tiles,
        setDashboardTabs,
        setDashboardTiles,
        setSavedParameters,
    ]);

    return null;
};
