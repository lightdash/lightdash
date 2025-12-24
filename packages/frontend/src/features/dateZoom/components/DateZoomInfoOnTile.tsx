import { FeatureFlags } from '@lightdash/common';
import { type FC } from 'react';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import { DateZoomInfoOnTileV1 } from './DateZoomInfoOnTileV1';
import { DateZoomInfoOnTileV2 } from './DateZoomInfoOnTileV2';
import { type DateZoomInfoOnTileProps } from './types';

export const DateZoomInfoOnTile: FC<DateZoomInfoOnTileProps> = (props) => {
    const isDashboardRedesignEnabled = useFeatureFlagEnabled(
        FeatureFlags.DashboardRedesign,
    );

    return isDashboardRedesignEnabled ? (
        <DateZoomInfoOnTileV2 {...props} />
    ) : (
        <DateZoomInfoOnTileV1 {...props} />
    );
};
