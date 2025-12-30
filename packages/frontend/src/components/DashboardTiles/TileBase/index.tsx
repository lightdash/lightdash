import { type Dashboard, FeatureFlags } from '@lightdash/common';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import TileBaseV1 from './TileBaseV1';
import TileBaseV2 from './TileBaseV2';
import { type TileBaseProps } from './types';

const TileBase = <T extends Dashboard['tiles'][number]>(
    props: TileBaseProps<T>,
) => {
    const isDashboardRedesignEnabled = useFeatureFlagEnabled(
        FeatureFlags.DashboardRedesign,
    );

    return isDashboardRedesignEnabled ? (
        <TileBaseV2 {...props} />
    ) : (
        <TileBaseV1 {...props} />
    );
};

export default TileBase;
