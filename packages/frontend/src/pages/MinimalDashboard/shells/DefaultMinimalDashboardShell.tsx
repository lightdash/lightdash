import { type FC } from 'react';
import MinimalDashboardTabs from '../../../components/MinimalDashboardTabs';
import { type MinimalDashboardShellProps } from '../minimalDashboardTypes';

export const DefaultMinimalDashboardShell: FC<MinimalDashboardShellProps> = ({
    model,
}) => (
    <>
        {model.canNavigateBetweenTabs && (
            <MinimalDashboardTabs
                tabs={model.navigableTabs}
                activeTabId={model.activeTab?.uuid || null}
                onTabChange={model.onTabChange}
            />
        )}
    </>
);
