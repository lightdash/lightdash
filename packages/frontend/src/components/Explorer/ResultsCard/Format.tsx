import { type Metric } from '@lightdash/common';
import { Menu } from '@mantine/core';
import { IconAdjustments } from '@tabler/icons-react';
import { type FC } from 'react';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';

type Props = {
    item: Metric;
};

const FormatMenuOptions: FC<Props> = ({ item }) => {
    const toggleFormatModal = useExplorerContext(
        (context) => context.actions.toggleFormatModal,
    );
    const { track } = useTracking();
    const onCreate = () => {
        toggleFormatModal({ metric: item });
        track({
            name: EventName.FORMAT_METRIC_BUTTON_CLICKED,
        });
    };

    return (
        <Menu.Item
            icon={<MantineIcon icon={IconAdjustments} />}
            onClick={onCreate}
        >
            Format
        </Menu.Item>
    );
};

export default FormatMenuOptions;
