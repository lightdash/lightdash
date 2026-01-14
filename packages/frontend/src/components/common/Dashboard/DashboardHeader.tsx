import { type FC } from 'react';
import { useDashboardUIPreference } from '../../../hooks/dashboard/useDashboardUIPreference';
import DashboardHeaderV1, {
    type DashboardHeaderProps,
} from './DashboardHeaderV1';
import DashboardHeaderV2 from './DashboardHeaderV2';

const DashboardHeader: FC<DashboardHeaderProps> = (props) => {
    const { isDashboardRedesignEnabled } = useDashboardUIPreference();

    return isDashboardRedesignEnabled ? (
        <DashboardHeaderV2 {...props} />
    ) : (
        <DashboardHeaderV1 {...props} />
    );
};

export default DashboardHeader;
