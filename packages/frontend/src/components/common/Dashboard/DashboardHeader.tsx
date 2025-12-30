import { FeatureFlags } from '@lightdash/common';
import { type FC } from 'react';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import DashboardHeaderV1, {
    type DashboardHeaderProps,
} from './DashboardHeaderV1';
import DashboardHeaderV2 from './DashboardHeaderV2';

const DashboardHeader: FC<DashboardHeaderProps> = (props) => {
    const isDashboardRedesignEnabled = useFeatureFlagEnabled(
        FeatureFlags.DashboardRedesign,
    );

    return isDashboardRedesignEnabled ? (
        <DashboardHeaderV2 {...props} />
    ) : (
        <DashboardHeaderV1 {...props} />
    );
};

export default DashboardHeader;
