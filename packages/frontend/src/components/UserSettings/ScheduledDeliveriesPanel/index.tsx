import { type FC } from 'react';
import SchedulersView from '../../SchedulersView';

type UserScheduledDeliveriesPanelProps = Record<string, never>;

const UserScheduledDeliveriesPanel: FC<
    UserScheduledDeliveriesPanelProps
> = () => {
    return <SchedulersView isUserScope />;
};

export default UserScheduledDeliveriesPanel;
