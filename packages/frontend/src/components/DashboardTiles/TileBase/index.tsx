import { type Dashboard } from '@lightdash/common';
import { useDashboardUIPreference } from '../../../hooks/dashboard/useDashboardUIPreference';
import TileBaseV1 from './TileBaseV1';
import TileBaseV2 from './TileBaseV2';
import { type TileBaseProps } from './types';

const TileBase = <T extends Dashboard['tiles'][number]>(
    props: TileBaseProps<T>,
) => {
    const { isDashboardRedesignEnabled } = useDashboardUIPreference();

    return isDashboardRedesignEnabled ? (
        <TileBaseV2 {...props} />
    ) : (
        <TileBaseV1 {...props} />
    );
};

export default TileBase;
