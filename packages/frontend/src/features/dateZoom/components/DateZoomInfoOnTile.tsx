import { type FC } from 'react';
import { useDashboardUIPreference } from '../../../hooks/dashboard/useDashboardUIPreference';
import { DateZoomInfoOnTileV1 } from './DateZoomInfoOnTileV1';
import { DateZoomInfoOnTileV2 } from './DateZoomInfoOnTileV2';
import { type DateZoomInfoOnTileProps } from './types';

export const DateZoomInfoOnTile: FC<DateZoomInfoOnTileProps> = (props) => {
    const { isDashboardRedesignEnabled } = useDashboardUIPreference();

    return isDashboardRedesignEnabled ? (
        <DateZoomInfoOnTileV2 {...props} />
    ) : (
        <DateZoomInfoOnTileV1 {...props} />
    );
};
