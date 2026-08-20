import { FeatureFlags } from '@lightdash/common';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';

export const useIsChartGalleryEnabled = () =>
    useServerFeatureFlag(FeatureFlags.ExplorerChartGallery).data?.enabled ===
    true;
