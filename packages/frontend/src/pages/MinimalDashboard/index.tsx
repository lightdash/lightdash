import { type FC, type ReactNode } from 'react';
import { getMinimalDashboardTabPath } from '../../providers/Dashboard/dashboardPageUtils';
import DashboardProvider from '../../providers/Dashboard/DashboardProvider';
import { DashboardRouterProvider } from '../../providers/Dashboard/DashboardRouterProvider';
import { MinimalDashboardBody } from './MinimalDashboardBody';
import { MinimalDashboardContextInitializer } from './MinimalDashboardContextInitializer';
import {
    type MinimalDashboardShellComponent,
    type MinimalDashboardShellProps,
} from './minimalDashboardTypes';
import { DefaultMinimalDashboardShell } from './shells/DefaultMinimalDashboardShell';
import { useMinimalDashboardModel } from './useMinimalDashboardModel';

type MinimalDashboardViewProps = {
    dashboardContextBridge?: ReactNode;
    shell?: MinimalDashboardShellComponent;
    shellProps?: Omit<MinimalDashboardShellProps, 'model' | 'body'>;
    renderLayout?: (parts: { shell: ReactNode; body: ReactNode }) => ReactNode;
};

export const MinimalDashboardView: FC<MinimalDashboardViewProps> = ({
    dashboardContextBridge,
    shell: Shell = DefaultMinimalDashboardShell,
    shellProps,
    renderLayout,
}) => {
    const result = useMinimalDashboardModel();

    if (result.status === 'loading') {
        return <span>Loading...</span>;
    }

    if (result.status === 'error') {
        return <span>{result.error}</span>;
    }

    const { model } = result;
    const body = <MinimalDashboardBody model={model} />;
    const shell = <Shell model={model} {...shellProps} />;

    return (
        <DashboardProvider
            projectUuid={model.projectUuid}
            schedulerFilters={model.schedulerFilters}
            schedulerParameters={model.schedulerParameters}
            schedulerTabsSelected={model.schedulerTabsSelected}
            dateZoom={model.dateZoom}
            defaultInvalidateCache={true}
        >
            <MinimalDashboardContextInitializer model={model} />
            {dashboardContextBridge}
            {renderLayout ? (
                renderLayout({ shell, body })
            ) : (
                <>
                    {shell}
                    {body}
                </>
            )}
        </DashboardProvider>
    );
};

export const MinimalDashboard: FC = () => (
    <DashboardRouterProvider buildTabPath={getMinimalDashboardTabPath}>
        <MinimalDashboardView />
    </DashboardRouterProvider>
);

export { InteractiveDashboardShell } from './shells/InteractiveDashboardShell';
export type {
    MinimalDashboardShellComponent,
    MinimalDashboardShellProps,
} from './minimalDashboardTypes';
