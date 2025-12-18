import { FeatureFlags, type Dashboard } from '@lightdash/common';
import { type FC } from 'react';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import DashboardInfoOverlayV1 from './DashboardInfoOverlayV1';
import DashboardInfoOverlayV2 from './DashboardInfoOverlayV2';

type DashboardInfoOverlayProps = {
    dashboard: Dashboard;
    projectUuid: string | undefined;
};

const DashboardInfoOverlay: FC<DashboardInfoOverlayProps> = (props) => {
    const isDashboardRedesignEnabled = useFeatureFlagEnabled(
        FeatureFlags.DashboardRedesign,
    );

    return isDashboardRedesignEnabled ? (
        <DashboardInfoOverlayV2 {...props} />
    ) : (
        <DashboardInfoOverlayV1 {...props} />
    );
};

export default DashboardInfoOverlay;
